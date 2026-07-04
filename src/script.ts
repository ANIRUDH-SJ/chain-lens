import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';

// Output Script Types

export type OutputScriptType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'op_return' | 'unknown';

export interface OutputClassification {
  scriptType: OutputScriptType;
  address: string | null;
  opReturnDataHex?: string;
  opReturnDataUtf8?: string | null;
  opReturnProtocol?: string;
}

/**
 * Classify an output scriptPubKey and derive its address.
 *
 * Pattern matching:
 *   P2PKH:  OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG  → 76 a9 14 [20] 88 ac
 *   P2SH:   OP_HASH160 <20 bytes> OP_EQUAL                            → a9 14 [20] 87
 *   P2WPKH: OP_0 <20 bytes>                                           → 00 14 [20]
 *   P2WSH:  OP_0 <32 bytes>                                           → 00 20 [32]
 *   P2TR:   OP_1 <32 bytes>                                           → 51 20 [32]
 *   OP_RETURN: OP_RETURN ...                                           → 6a ...
 */
export function classifyOutput(scriptPubKey: Buffer): OutputClassification {
  const len = scriptPubKey.length;

  // P2PKH: 76 a9 14 <20> 88 ac (25 bytes total)
  if (len === 25 && scriptPubKey[0] === 0x76 && scriptPubKey[1] === 0xa9 &&
      scriptPubKey[2] === 0x14 && scriptPubKey[23] === 0x88 && scriptPubKey[24] === 0xac) {
    const hash = scriptPubKey.subarray(3, 23);
    return { scriptType: 'p2pkh', address: encodeBase58Check(0x00, hash) };
  }

  // P2SH: a9 14 <20> 87 (23 bytes total)
  if (len === 23 && scriptPubKey[0] === 0xa9 && scriptPubKey[1] === 0x14 && scriptPubKey[22] === 0x87) {
    const hash = scriptPubKey.subarray(2, 22);
    return { scriptType: 'p2sh', address: encodeBase58Check(0x05, hash) };
  }

  // P2WPKH: 00 14 <20> (22 bytes total)
  if (len === 22 && scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x14) {
    const hash = scriptPubKey.subarray(2, 22);
    return { scriptType: 'p2wpkh', address: encodeBech32('bc', 0, hash) };
  }

  // P2WSH: 00 20 <32> (34 bytes total)
  if (len === 34 && scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x20) {
    const hash = scriptPubKey.subarray(2, 34);
    return { scriptType: 'p2wsh', address: encodeBech32('bc', 0, hash) };
  }

  // P2TR: 51 20 <32> (34 bytes total)
  if (len === 34 && scriptPubKey[0] === 0x51 && scriptPubKey[1] === 0x20) {
    const key = scriptPubKey.subarray(2, 34);
    return { scriptType: 'p2tr', address: encodeBech32m('bc', 1, key) };
  }

  // OP_RETURN: 6a ...
  if (len >= 1 && scriptPubKey[0] === 0x6a) {
    const result = parseOpReturn(scriptPubKey);
    return result;
  }

  return { scriptType: 'unknown', address: null };
}

// Input Script Types

export type InputScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2sh-p2wsh' | 'p2wpkh' | 'p2wsh' | 'p2tr_keypath' | 'p2tr_scriptpath' | 'unknown';

/**
 * Classify an input's spend type based on the prevout scriptPubKey and witness data.
 *
 * Logic:
 * - P2TR (prevout 51 20 [32]):
 *     - 1 witness item → keypath
 *     - >1 witness items, last item starts with 0xc0 or 0xc1 → scriptpath
 * - P2WPKH (prevout 00 14 [20]): witness present → p2wpkh
 * - P2WSH (prevout 00 20 [32]): witness present → p2wsh
 * - P2SH (prevout a9 14 [20] 87): check scriptSig for nested SegWit
 *     - If scriptSig pushes a P2WPKH redeemScript (00 14 [20]) → p2sh-p2wpkh
 *     - If scriptSig pushes a P2WSH redeemScript (00 20 [32]) → p2sh-p2wsh
 * - P2PKH (prevout 76 a9 14 [20] 88 ac): p2pkh
 * - else: unknown
 */
export function classifyInput(prevoutScript: Buffer, scriptSig: Buffer, witness: Buffer[]): InputScriptType {
  const prevType = classifyOutput(prevoutScript).scriptType;

  if (prevType === 'p2tr') {
    if (witness.length === 1) {
      return 'p2tr_keypath';
    }
    if (witness.length > 1) {
      const lastItem = witness[witness.length - 1];
      if (lastItem.length > 0 && (lastItem[0] === 0xc0 || lastItem[0] === 0xc1)) {
        return 'p2tr_scriptpath';
      }
      // Annex case: second-to-last is control block
      if (witness.length > 2) {
        const secondLast = witness[witness.length - 2];
        if (secondLast.length > 0 && (secondLast[0] === 0xc0 || secondLast[0] === 0xc1)) {
          return 'p2tr_scriptpath';
        }
      }
    }
    return 'p2tr_keypath';
  }

  if (prevType === 'p2wpkh') {
    return 'p2wpkh';
  }

  if (prevType === 'p2wsh') {
    return 'p2wsh';
  }

  if (prevType === 'p2sh') {
    // Check for nested SegWit by examining scriptSig
    // For P2SH-P2WPKH, scriptSig is a single push of the redeemScript: 0014<20-byte-hash>
    // For P2SH-P2WSH, scriptSig is a single push of the redeemScript: 0020<32-byte-hash>
    if (scriptSig.length > 0 && witness.length > 0) {
      // Extract the redeemScript from scriptSig (it's a single push)
      const redeemScript = extractSinglePush(scriptSig);
      if (redeemScript) {
        if (redeemScript.length === 22 && redeemScript[0] === 0x00 && redeemScript[1] === 0x14) {
          return 'p2sh-p2wpkh';
        }
        if (redeemScript.length === 34 && redeemScript[0] === 0x00 && redeemScript[1] === 0x20) {
          return 'p2sh-p2wsh';
        }
      }
    }
    return 'unknown';
  }

  if (prevType === 'p2pkh') {
    return 'p2pkh';
  }

  return 'unknown';
}

/**
 * Extract a single push from a script (e.g., the redeemScript in P2SH scriptSig).
 */
function extractSinglePush(script: Buffer): Buffer | null {
  if (script.length === 0) return null;
  const firstByte = script[0];

  if (firstByte >= 0x01 && firstByte <= 0x4b) {
    // Direct push
    const pushLen = firstByte;
    if (script.length === 1 + pushLen) {
      return script.subarray(1, 1 + pushLen);
    }
  } else if (firstByte === 0x4c) {
    // OP_PUSHDATA1
    if (script.length < 2) return null;
    const pushLen = script[1];
    if (script.length === 2 + pushLen) {
      return script.subarray(2, 2 + pushLen);
    }
  } else if (firstByte === 0x4d) {
    // OP_PUSHDATA2
    if (script.length < 3) return null;
    const pushLen = script.readUInt16LE(1);
    if (script.length === 3 + pushLen) {
      return script.subarray(3, 3 + pushLen);
    }
  }

  return null;
}

// OP_RETURN Parsing

function parseOpReturn(script: Buffer): OutputClassification {
  // script[0] is 0x6a (OP_RETURN)
  // Parse all push operations after OP_RETURN and concatenate data
  let pos = 1;
  const dataChunks: Buffer[] = [];

  while (pos < script.length) {
    const opcode = script[pos];
    pos++;

    if (opcode >= 0x01 && opcode <= 0x4b) {
      // Direct push of opcode bytes
      const pushLen = opcode;
      if (pos + pushLen > script.length) break;
      dataChunks.push(script.subarray(pos, pos + pushLen));
      pos += pushLen;
    } else if (opcode === 0x4c) {
      // OP_PUSHDATA1: next 1 byte is length
      if (pos >= script.length) break;
      const pushLen = script[pos];
      pos++;
      if (pos + pushLen > script.length) break;
      dataChunks.push(script.subarray(pos, pos + pushLen));
      pos += pushLen;
    } else if (opcode === 0x4d) {
      // OP_PUSHDATA2: next 2 bytes are length (LE)
      if (pos + 2 > script.length) break;
      const pushLen = script.readUInt16LE(pos);
      pos += 2;
      if (pos + pushLen > script.length) break;
      dataChunks.push(script.subarray(pos, pos + pushLen));
      pos += pushLen;
    } else if (opcode === 0x4e) {
      // OP_PUSHDATA4: next 4 bytes are length (LE)
      if (pos + 4 > script.length) break;
      const pushLen = script.readUInt32LE(pos);
      pos += 4;
      if (pos + pushLen > script.length) break;
      dataChunks.push(script.subarray(pos, pos + pushLen));
      pos += pushLen;
    } else if (opcode === 0x00) {
      // OP_0 pushes empty data
      dataChunks.push(Buffer.alloc(0));
    } else {
      // Other opcodes (OP_1..OP_16, etc.) — stop parsing data pushes
      // Actually per spec we just collect data pushes; non-push opcodes end data
      break;
    }
  }

  const dataHex = Buffer.concat(dataChunks).toString('hex');

  // UTF-8 decode
  let dataUtf8: string | null = null;
  try {
    const dataBuf = Buffer.from(dataHex, 'hex');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(dataBuf);
    dataUtf8 = decoded;
  } catch {
    dataUtf8 = null;
  }

  // Protocol detection
  let protocol = 'unknown';
  if (dataHex.startsWith('6f6d6e69')) {
    protocol = 'omni';
  } else if (dataHex.startsWith('0109f91102')) {
    protocol = 'opentimestamps';
  }

  return {
    scriptType: 'op_return',
    address: null,
    opReturnDataHex: dataHex,
    opReturnDataUtf8: dataUtf8,
    opReturnProtocol: protocol,
  };
}

// Address Encoding

function encodeBase58Check(version: number, hash: Buffer): string {
  const payload = Buffer.alloc(1 + hash.length);
  payload[0] = version;
  hash.copy(payload, 1);
  return bs58check.encode(payload);
}

function encodeBech32(hrp: string, witnessVersion: number, data: Buffer): string {
  const words = bech32.toWords(data);
  words.unshift(witnessVersion);
  return bech32.encode(hrp, words);
}

function encodeBech32m(hrp: string, witnessVersion: number, data: Buffer): string {
  const words = bech32m.toWords(data);
  words.unshift(witnessVersion);
  return bech32m.encode(hrp, words);
}

/**
 * Derive the address from a prevout scriptPubKey (for input addresses).
 */
export function addressFromScript(scriptPubKey: Buffer): string | null {
  const classification = classifyOutput(scriptPubKey);
  return classification.address;
}
