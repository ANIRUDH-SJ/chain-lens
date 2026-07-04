import { parseTransaction, type ParsedTransaction } from './txParser.js';
import { classifyOutput, classifyInput, addressFromScript, type OutputClassification, type InputScriptType } from './script.js';
import { disassemble, disassembleBuffer } from './scriptAsm.js';

// Types

export interface Prevout {
  txid: string;
  vout: number;
  value_sats: number;
  script_pubkey_hex: string;
}

export interface Fixture {
  network: string;
  raw_tx: string;
  prevouts: Prevout[];
}

export interface AnalysisResult {
  ok: true;
  network: string;
  segwit: boolean;
  txid: string;
  wtxid: string | null;
  version: number;
  locktime: number;
  size_bytes: number;
  weight: number;
  vbytes: number;
  total_input_sats: number;
  total_output_sats: number;
  fee_sats: number;
  fee_rate_sat_vb: number;
  rbf_signaling: boolean;
  locktime_type: 'none' | 'block_height' | 'unix_timestamp';
  locktime_value: number;
  segwit_savings: SegwitSavings | null;
  vin: VinEntry[];
  vout: VoutEntry[];
  warnings: { code: string }[];
}

export interface SegwitSavings {
  witness_bytes: number;
  non_witness_bytes: number;
  total_bytes: number;
  weight_actual: number;
  weight_if_legacy: number;
  savings_pct: number;
}

export interface VinEntry {
  txid: string;
  vout: number;
  sequence: number;
  script_sig_hex: string;
  script_asm: string;
  witness: string[];
  script_type: InputScriptType;
  address: string | null;
  prevout: {
    value_sats: number;
    script_pubkey_hex: string;
  };
  relative_timelock: RelativeTimelock;
  witness_script_asm?: string;
}

export interface VoutEntry {
  n: number;
  value_sats: number;
  script_pubkey_hex: string;
  script_asm: string;
  script_type: string;
  address: string | null;
  op_return_data_hex?: string;
  op_return_data_utf8?: string | null;
  op_return_protocol?: string;
}

export type RelativeTimelock =
  | { enabled: false }
  | { enabled: true; type: 'blocks'; value: number }
  | { enabled: true; type: 'time'; value: number };

export interface AnalysisError {
  ok: false;
  error: { code: string; message: string };
}

// Constants

const SEQUENCE_FINAL = 0xffffffff;
const SEQUENCE_RBF_MAX = 0xfffffffe;  // < this means RBF
const BIP68_DISABLE_FLAG = 0x80000000;
const BIP68_TYPE_FLAG = 0x00400000;    // bit 22: if set → time-based
const BIP68_VALUE_MASK = 0x0000ffff;
const LOCKTIME_THRESHOLD = 500000000;  // below = block height, above = unix timestamp

// Analyzer

/**
 * Analyze a single transaction from a fixture.
 * @throws on invalid fixture or transaction.
 */
export function analyzeTx(fixture: Fixture): AnalysisResult | AnalysisError {
  try {
    return doAnalyze(fixture);
  } catch (e: any) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TX',
        message: e.message || String(e),
      },
    };
  }
}

function doAnalyze(fixture: Fixture): AnalysisResult {
  const { network, raw_tx, prevouts } = fixture;

  if (!raw_tx || typeof raw_tx !== 'string') {
    throw new Error('Missing or invalid raw_tx');
  }
  if (!Array.isArray(prevouts)) {
    throw new Error('Missing or invalid prevouts array');
  }

  // Parse the raw transaction
  const parsed = parseTransaction(raw_tx);

  // Build prevout map: "txid:vout" → Prevout
  const prevoutMap = new Map<string, Prevout>();
  for (const p of prevouts) {
    const key = `${p.txid}:${p.vout}`;
    if (prevoutMap.has(key)) {
      throw new Error(`Duplicate prevout: ${key}`);
    }
    prevoutMap.set(key, p);
  }

  // Match prevouts to inputs
  const matchedPrevouts: Prevout[] = [];
  for (const input of parsed.inputs) {
    const key = `${input.txid}:${input.vout}`;
    const prevout = prevoutMap.get(key);
    if (!prevout) {
      throw new Error(`Missing prevout for input ${key}`);
    }
    matchedPrevouts.push(prevout);
  }

  // Check for extra prevouts that don't match any input
  if (prevouts.length !== parsed.inputs.length) {
    throw new Error(`Prevout count (${prevouts.length}) does not match input count (${parsed.inputs.length})`);
  }

  // Compute totals
  let totalInputSats = 0;
  let totalOutputSats = 0;

  for (const p of matchedPrevouts) {
    totalInputSats += p.value_sats;
  }
  for (const out of parsed.outputs) {
    totalOutputSats += Number(out.value);
  }

  const feeSats = totalInputSats - totalOutputSats;
  if (feeSats < 0) {
    throw new Error('Fee is negative (outputs exceed inputs)');
  }

  const feeRateSatVb = parsed.vbytes > 0
    ? Math.round((feeSats / parsed.vbytes) * 100) / 100
    : 0;

  // RBF signaling: any input with sequence < 0xFFFFFFFE
  const rbfSignaling = parsed.inputs.some(inp => inp.sequence < SEQUENCE_RBF_MAX);

  // Locktime
  let locktimeType: 'none' | 'block_height' | 'unix_timestamp';
  if (parsed.locktime === 0) {
    locktimeType = 'none';
  } else if (parsed.locktime < LOCKTIME_THRESHOLD) {
    locktimeType = 'block_height';
  } else {
    locktimeType = 'unix_timestamp';
  }

  // Build vin
  const vin: VinEntry[] = parsed.inputs.map((input, i) => {
    const prevout = matchedPrevouts[i];
    const prevoutScriptBuf = Buffer.from(prevout.script_pubkey_hex, 'hex');

    const inputType = classifyInput(prevoutScriptBuf, input.scriptSig, input.witness);
    const address = addressFromScript(prevoutScriptBuf);

    const witnessHexStrings = input.witness.map(w => w.toString('hex'));

    const relTimelock = computeRelativeTimelock(input.sequence);

    const entry: VinEntry = {
      txid: input.txid,
      vout: input.vout,
      sequence: input.sequence,
      script_sig_hex: input.scriptSig.toString('hex'),
      script_asm: disassembleBuffer(input.scriptSig),
      witness: parsed.segwit ? witnessHexStrings : [],
      script_type: inputType,
      address,
      prevout: {
        value_sats: prevout.value_sats,
        script_pubkey_hex: prevout.script_pubkey_hex,
      },
      relative_timelock: relTimelock,
    };

    // For p2wsh and p2sh-p2wsh, add witness_script_asm (last witness item)
    if ((inputType === 'p2wsh' || inputType === 'p2sh-p2wsh') && input.witness.length > 0) {
      const witnessScript = input.witness[input.witness.length - 1];
      entry.witness_script_asm = disassembleBuffer(witnessScript);
    }

    return entry;
  });

  // Build vout
  const vout: VoutEntry[] = parsed.outputs.map((output, i) => {
    const classification = classifyOutput(output.scriptPubKey);

    const entry: VoutEntry = {
      n: i,
      value_sats: Number(output.value),
      script_pubkey_hex: output.scriptPubKey.toString('hex'),
      script_asm: disassembleBuffer(output.scriptPubKey),
      script_type: classification.scriptType,
      address: classification.address,
    };

    if (classification.scriptType === 'op_return') {
      entry.op_return_data_hex = classification.opReturnDataHex || '';
      entry.op_return_data_utf8 = classification.opReturnDataUtf8 !== undefined ? classification.opReturnDataUtf8 : null;
      entry.op_return_protocol = classification.opReturnProtocol || 'unknown';
    }

    return entry;
  });

  // SegWit savings
  let segwitSavings: SegwitSavings | null = null;
  if (parsed.segwit) {
    const weightIfLegacy = parsed.nonWitnessBytes * 4;
    const savingsPct = weightIfLegacy > 0
      ? Math.round((1 - parsed.weight / weightIfLegacy) * 10000) / 100
      : 0;

    segwitSavings = {
      witness_bytes: parsed.witnessBytes,
      non_witness_bytes: parsed.nonWitnessBytes,
      total_bytes: parsed.sizeBytes,
      weight_actual: parsed.weight,
      weight_if_legacy: weightIfLegacy,
      savings_pct: savingsPct,
    };
  }

  // Warnings
  const warnings: { code: string }[] = [];

  if (feeSats > 1_000_000 || feeRateSatVb > 200) {
    warnings.push({ code: 'HIGH_FEE' });
  }

  const hasDust = vout.some(v => v.script_type !== 'op_return' && v.value_sats < 546);
  if (hasDust) {
    warnings.push({ code: 'DUST_OUTPUT' });
  }

  const hasUnknownScript = vout.some(v => v.script_type === 'unknown');
  if (hasUnknownScript) {
    warnings.push({ code: 'UNKNOWN_OUTPUT_SCRIPT' });
  }

  if (rbfSignaling) {
    warnings.push({ code: 'RBF_SIGNALING' });
  }

  return {
    ok: true,
    network,
    segwit: parsed.segwit,
    txid: parsed.txid,
    wtxid: parsed.wtxid,
    version: parsed.version,
    locktime: parsed.locktime,
    size_bytes: parsed.sizeBytes,
    weight: parsed.weight,
    vbytes: parsed.vbytes,
    total_input_sats: totalInputSats,
    total_output_sats: totalOutputSats,
    fee_sats: feeSats,
    fee_rate_sat_vb: feeRateSatVb,
    rbf_signaling: rbfSignaling,
    locktime_type: locktimeType,
    locktime_value: parsed.locktime,
    segwit_savings: segwitSavings,
    vin,
    vout,
    warnings,
  };
}

// BIP68 Relative Timelock

function computeRelativeTimelock(sequence: number): RelativeTimelock {
  // If bit 31 is set, relative timelock is disabled
  if ((sequence & BIP68_DISABLE_FLAG) !== 0) {
    return { enabled: false };
  }

  // Also, if sequence is 0xFFFFFFFF, it's final (not BIP68)
  if (sequence === SEQUENCE_FINAL) {
    return { enabled: false };
  }

  const value = sequence & BIP68_VALUE_MASK;

  if ((sequence & BIP68_TYPE_FLAG) !== 0) {
    // Time-based: value * 512 seconds
    return { enabled: true, type: 'time', value: value * 512 };
  } else {
    // Block-based
    return { enabled: true, type: 'blocks', value };
  }
}

/**
 * Analyze a parsed transaction with prevouts already matched (for block mode).
 */
export function analyzeParsedTx(
  parsed: ParsedTransaction,
  matchedPrevouts: { value_sats: number; script_pubkey_hex: string }[],
  network: string = 'mainnet'
): AnalysisResult {
  let totalInputSats = 0;
  let totalOutputSats = 0;

  for (const p of matchedPrevouts) {
    totalInputSats += p.value_sats;
  }
  for (const out of parsed.outputs) {
    totalOutputSats += Number(out.value);
  }

  const feeSats = totalInputSats - totalOutputSats;
  const feeRateSatVb = parsed.vbytes > 0
    ? Math.round((feeSats / parsed.vbytes) * 100) / 100
    : 0;

  const rbfSignaling = parsed.inputs.some(inp => inp.sequence < SEQUENCE_RBF_MAX);

  let locktimeType: 'none' | 'block_height' | 'unix_timestamp';
  if (parsed.locktime === 0) {
    locktimeType = 'none';
  } else if (parsed.locktime < LOCKTIME_THRESHOLD) {
    locktimeType = 'block_height';
  } else {
    locktimeType = 'unix_timestamp';
  }

  const vin: VinEntry[] = parsed.inputs.map((input, i) => {
    const prevout = matchedPrevouts[i];
    const witnessHexStrings = input.witness.map(w => w.toString('hex'));
    const relTimelock = computeRelativeTimelock(input.sequence);

    // Handle coinbase or missing prevout
    if (!prevout) {
      const entry: VinEntry = {
        txid: input.txid,
        vout: input.vout,
        sequence: input.sequence,
        script_sig_hex: input.scriptSig.toString('hex'),
        script_asm: disassembleBuffer(input.scriptSig),
        witness: parsed.segwit ? witnessHexStrings : [],
        script_type: 'unknown',
        address: null,
        prevout: {
          value_sats: 0,
          script_pubkey_hex: '',
        },
        relative_timelock: relTimelock,
      };
      return entry;
    }

    const prevoutScriptBuf = Buffer.from(prevout.script_pubkey_hex, 'hex');
    const inputType = classifyInput(prevoutScriptBuf, input.scriptSig, input.witness);
    const address = addressFromScript(prevoutScriptBuf);

    const entry: VinEntry = {
      txid: input.txid,
      vout: input.vout,
      sequence: input.sequence,
      script_sig_hex: input.scriptSig.toString('hex'),
      script_asm: disassembleBuffer(input.scriptSig),
      witness: parsed.segwit ? witnessHexStrings : [],
      script_type: inputType,
      address,
      prevout: {
        value_sats: prevout.value_sats,
        script_pubkey_hex: prevout.script_pubkey_hex,
      },
      relative_timelock: relTimelock,
    };

    if ((inputType === 'p2wsh' || inputType === 'p2sh-p2wsh') && input.witness.length > 0) {
      const witnessScript = input.witness[input.witness.length - 1];
      entry.witness_script_asm = disassembleBuffer(witnessScript);
    }

    return entry;
  });

  const vout: VoutEntry[] = parsed.outputs.map((output, i) => {
    const classification = classifyOutput(output.scriptPubKey);
    const entry: VoutEntry = {
      n: i,
      value_sats: Number(output.value),
      script_pubkey_hex: output.scriptPubKey.toString('hex'),
      script_asm: disassembleBuffer(output.scriptPubKey),
      script_type: classification.scriptType,
      address: classification.address,
    };

    if (classification.scriptType === 'op_return') {
      entry.op_return_data_hex = classification.opReturnDataHex || '';
      entry.op_return_data_utf8 = classification.opReturnDataUtf8 !== undefined ? classification.opReturnDataUtf8 : null;
      entry.op_return_protocol = classification.opReturnProtocol || 'unknown';
    }

    return entry;
  });

  let segwitSavings: SegwitSavings | null = null;
  if (parsed.segwit) {
    const weightIfLegacy = parsed.nonWitnessBytes * 4;
    const savingsPct = weightIfLegacy > 0
      ? Math.round((1 - parsed.weight / weightIfLegacy) * 10000) / 100
      : 0;

    segwitSavings = {
      witness_bytes: parsed.witnessBytes,
      non_witness_bytes: parsed.nonWitnessBytes,
      total_bytes: parsed.sizeBytes,
      weight_actual: parsed.weight,
      weight_if_legacy: weightIfLegacy,
      savings_pct: savingsPct,
    };
  }

  const warnings: { code: string }[] = [];
  if (feeSats > 1_000_000 || feeRateSatVb > 200) {
    warnings.push({ code: 'HIGH_FEE' });
  }
  if (vout.some(v => v.script_type !== 'op_return' && v.value_sats < 546)) {
    warnings.push({ code: 'DUST_OUTPUT' });
  }
  if (vout.some(v => v.script_type === 'unknown')) {
    warnings.push({ code: 'UNKNOWN_OUTPUT_SCRIPT' });
  }
  if (rbfSignaling) {
    warnings.push({ code: 'RBF_SIGNALING' });
  }

  return {
    ok: true,
    network,
    segwit: parsed.segwit,
    txid: parsed.txid,
    wtxid: parsed.wtxid,
    version: parsed.version,
    locktime: parsed.locktime,
    size_bytes: parsed.sizeBytes,
    weight: parsed.weight,
    vbytes: parsed.vbytes,
    total_input_sats: totalInputSats,
    total_output_sats: totalOutputSats,
    fee_sats: feeSats,
    fee_rate_sat_vb: feeRateSatVb,
    rbf_signaling: rbfSignaling,
    locktime_type: locktimeType,
    locktime_value: parsed.locktime,
    segwit_savings: segwitSavings,
    vin,
    vout,
    warnings,
  };
}
