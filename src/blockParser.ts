/**
 * blockParser.ts — Bitcoin Core block file (.dat) and undo file parser.
 *
 * Handles XOR decoding, block header parsing, transaction parsing,
 * undo data parsing (prevout recovery), and merkle root verification.
 *
 * File formats:
 *   blk*.dat:  [magic(4)][size(4)][block_data(size)] repeated
 *   rev*.dat:  [magic(4)][size(4)][undo_data(size)][checksum(32)] repeated
 *   xor.dat:   8-byte XOR key (applied cyclically to blk/rev data)
 *
 * Undo data (CBlockUndo) format:
 *   CompactSize(numTxUndos)                  — one per non-coinbase tx
 *     CompactSize(numPrevouts)               — one per input in that tx
 *       varint_core(code)                    — height*2 + isCoinbase
 *       varint_core(compressedAmount)
 *       varint_core(nSize)                   — script compression type
 *       scriptData(nSize)
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseTransactionFromBuffer, BufferReader, doubleSha256, reverseBuffer, bufToReverseHex } from './txParser.js';
import { analyzeParsedTx, type AnalysisResult } from './analyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BlockHeader {
  version: number;
  prev_block_hash: string;
  merkle_root: string;
  merkle_root_valid: boolean;
  timestamp: number;
  bits: string;
  nonce: number;
  block_hash: string;
}

export interface CoinbaseInfo {
  bip34_height: number;
  coinbase_script_hex: string;
  total_output_sats: number;
}

export interface BlockReport {
  ok: true;
  mode: 'block';
  block_header: BlockHeader;
  tx_count: number;
  coinbase: CoinbaseInfo;
  transactions: AnalysisResult[];
  block_stats: {
    total_fees_sats: number;
    total_weight: number;
    avg_fee_rate_sat_vb: number;
    script_type_summary: Record<string, number>;
  };
}

export interface BlockError {
  ok: false;
  error: { code: string; message: string };
}

// ─── XOR Decode ──────────────────────────────────────────────────────────────

function xorDecode(data: Buffer, key: Buffer): Buffer {
  if (key.length === 0 || key.every(b => b === 0)) return data;
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

// ─── Merkle Root ─────────────────────────────────────────────────────────────

function computeMerkleRoot(txids: Buffer[]): Buffer {
  if (txids.length === 0) throw new Error('No transactions for merkle root');

  let level: Buffer[] = txids.map(id => Buffer.from(id));

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      const combined = Buffer.concat([left, right]);
      next.push(doubleSha256(combined));
    }
    level = next;
  }

  return level[0];
}

// ─── Bitcoin Core Varint/CompactSize ─────────────────────────────────────────

interface UndoPrevout {
  value_sats: number;
  script_pubkey_hex: string;
}

/**
 * CompactSize: standard Bitcoin vector length encoding.
 * Used for vector counts in CBlockUndo / CTxUndo serialization.
 */
function readCompactSize(reader: BufferReader): number {
  const first = reader.readUInt8();
  if (first < 253) return first;
  if (first === 253) return reader.readUInt16LE();
  if (first === 254) return reader.readUInt32LE();
  const val = reader.readUInt64LE();
  return Number(val);
}

/**
 * Bitcoin Core's "variable-length integer" (VARINT macro).
 * Different from CompactSize! Uses continuation-bit encoding:
 * each byte: bit7 = more bytes follow; bits 0-6 = data.
 * Used for height/code, compressed amount, nSize in undo data.
 */
function readVarIntCore(reader: BufferReader): number {
  let n = 0;
  while (true) {
    const b = reader.readUInt8();
    n = (n << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) {
      return n;
    }
    n++;
  }
}

/**
 * Decompress a Bitcoin Core compressed amount.
 */
function decompressAmount(x: number): number {
  if (x === 0) return 0;
  x--;
  let e = x % 10;
  x = Math.floor(x / 10);
  let n: number;
  if (e < 9) {
    const d = (x % 9) + 1;
    x = Math.floor(x / 9);
    n = x * 10 + d;
  } else {
    n = x + 1;
  }
  while (e > 0) {
    n *= 10;
    e--;
  }
  return n;
}

/**
 * Decompress a script based on Bitcoin Core's nSize convention.
 *
 * nSize 0: P2PKH → read 20 bytes, expand to OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
 * nSize 1: P2SH  → read 20 bytes, expand to OP_HASH160 <20> OP_EQUAL
 * nSize 2,3: Compressed P2PK → read 32 bytes, build 33-byte compressed pubkey, wrap in P2PK
 * nSize 4,5: Compressed P2PK → read 32 bytes, build 33-byte compressed pubkey (different prefix)
 * nSize >= 6: Raw script → read (nSize - 6) bytes directly
 */
function decompressScript(reader: BufferReader, nSize: number): Buffer {
  if (nSize === 0) {
    const hash = reader.readBytes(20);
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), hash, Buffer.from([0x88, 0xac])]);
  }
  if (nSize === 1) {
    const hash = reader.readBytes(20);
    return Buffer.concat([Buffer.from([0xa9, 0x14]), hash, Buffer.from([0x87])]);
  }
  if (nSize === 2 || nSize === 3) {
    const pubkey = Buffer.alloc(33);
    pubkey[0] = nSize; // 0x02 or 0x03
    reader.readBytes(32).copy(pubkey, 1);
    return Buffer.concat([Buffer.from([0x21]), pubkey, Buffer.from([0xac])]);
  }
  if (nSize === 4 || nSize === 5) {
    const pubkey = Buffer.alloc(33);
    pubkey[0] = nSize - 2; // 0x02 or 0x03
    reader.readBytes(32).copy(pubkey, 1);
    return Buffer.concat([Buffer.from([0x21]), pubkey, Buffer.from([0xac])]);
  }
  // nSize >= 6: raw script
  return reader.readBytes(nSize - 6);
}

/**
 * Parse one block's undo record from the undo data.
 * The undo data is the raw CBlockUndo (after extracting from magic+size envelope).
 *
 * Format:
 *   CompactSize(numTxUndos)
 *     for each tx:
 *       CompactSize(numPrevouts)
 *         for each prevout (Coin):
 *           varint_core(code)         — height*2 + isCoinbase
 *           varint_core(version)      — dummy version byte (always 0, for compat)
 *           varint_core(amount)       — compressed amount
 *           varint_core(nSize) + data — compressed script
 */
function parseUndoRecord(undoData: Buffer): UndoPrevout[][] {
  const reader = new BufferReader(undoData);
  const numTxUndos = readCompactSize(reader);
  const result: UndoPrevout[][] = [];

  for (let t = 0; t < numTxUndos; t++) {
    const numPrevouts = readCompactSize(reader);
    const prevouts: UndoPrevout[] = [];

    for (let p = 0; p < numPrevouts; p++) {
      const code = readVarIntCore(reader);
      const height = code >>> 1;
      // Read dummy version varint (compatibility with older Bitcoin Core)
      if (height > 0) {
        readVarIntCore(reader); // discard nVersionDummy
      }
      const compressedAmount = readVarIntCore(reader);
      const valueSats = decompressAmount(compressedAmount);
      const nSize = readVarIntCore(reader);
      const scriptPubKey = decompressScript(reader, nSize);

      prevouts.push({
        value_sats: valueSats,
        script_pubkey_hex: scriptPubKey.toString('hex'),
      });
    }

    result.push(prevouts);
  }

  return result;
}

// ─── Block File Parser ───────────────────────────────────────────────────────

const MAINNET_MAGIC = 0xd9b4bef9;

interface RawBlockData {
  blockData: Buffer;
  headerBytes: Buffer;
  parsedTxs: ReturnType<typeof parseTransactionFromBuffer>['tx'][];
  txidBuffers: Buffer[];
  txCount: number;
  version: number;
  prevBlockHash: string;
  merkleRootHex: string;
  blockHash: string;
  timestamp: number;
  bitsHex: string;
  nonce: number;
}

interface RawUndoRecord {
  data: Buffer;
  txUndoCount: number;
}

export function parseBlocks(
  blkPath: string,
  revPath: string,
  xorPath: string
): (BlockReport | BlockError)[] {
  let blkData: Buffer = readFileSync(blkPath);
  let revData: Buffer = readFileSync(revPath);
  const xorKey = readFileSync(xorPath);

  blkData = xorDecode(blkData, xorKey);
  revData = xorDecode(revData, xorKey);

  // Phase 1: Parse only the FIRST block from blk file
  const blkReader = new BufferReader(blkData);
  const rawBlocks: RawBlockData[] = [];

  if (blkReader.remaining >= 8) {
    const magic = blkReader.readUInt32LE();
    if (magic !== MAINNET_MAGIC) {
      return [{ ok: false, error: { code: 'INVALID_MAGIC', message: `Bad block magic: 0x${magic.toString(16)}` } }];
    }
    const blockSize = blkReader.readUInt32LE();
    const blockData = blkReader.readBytes(blockSize);
    const blockReader = new BufferReader(blockData);

    const headerBytes = blockReader.readBytes(80);
    const headerReader = new BufferReader(headerBytes);
    const version = headerReader.readInt32LE();
    const prevBlockHashBytes = headerReader.readBytes(32);
    const merkleRootBytes = headerReader.readBytes(32);
    const timestamp = headerReader.readUInt32LE();
    const bitsRaw = headerReader.readUInt32LE();
    const nonce = headerReader.readUInt32LE();

    const txCount = readCompactSize(blockReader);
    const parsedTxs: ReturnType<typeof parseTransactionFromBuffer>['tx'][] = [];
    const txidBuffers: Buffer[] = [];

    for (let i = 0; i < txCount; i++) {
      const { tx, bytesRead } = parseTransactionFromBuffer(blockData, blockReader.offset);
      blockReader.readBytes(bytesRead);
      parsedTxs.push(tx);
      txidBuffers.push(reverseBuffer(Buffer.from(tx.txid, 'hex')));
    }

    rawBlocks.push({
      blockData,
      headerBytes,
      parsedTxs,
      txidBuffers,
      txCount,
      version,
      prevBlockHash: bufToReverseHex(prevBlockHashBytes),
      merkleRootHex: bufToReverseHex(merkleRootBytes),
      blockHash: bufToReverseHex(doubleSha256(headerBytes)),
      timestamp,
      bitsHex: bitsRaw.toString(16).padStart(8, '0'),
      nonce,
    });
  }

  // Phase 2: Parse all undo records from rev file
  const revReader = new BufferReader(revData);
  const rawUndos: RawUndoRecord[] = [];

  while (revReader.remaining >= 8) {
    const magic = revReader.readUInt32LE();
    if (magic !== MAINNET_MAGIC) break;
    const size = revReader.readUInt32LE();
    const data = revReader.readBytes(size);
    // Skip 32-byte checksum
    if (revReader.remaining >= 32) revReader.readBytes(32);

    // Peek at the CompactSize to know numTxUndos
    const first = data[0];
    let txUndoCount: number;
    if (first < 253) txUndoCount = first;
    else if (first === 253) txUndoCount = data[1] | (data[2] << 8);
    else txUndoCount = data.readUInt32LE(1);
    rawUndos.push({ data, txUndoCount });
  }

  // Phase 3: Match blocks to undo records by non-coinbase tx count
  // Build multimap: nonCoinbaseTxCount → list of undo indices
  const undoByCount = new Map<number, number[]>();
  for (let i = 0; i < rawUndos.length; i++) {
    const count = rawUndos[i].txUndoCount;
    const list = undoByCount.get(count) || [];
    list.push(i);
    undoByCount.set(count, list);
  }

  const reports: (BlockReport | BlockError)[] = [];

  for (const block of rawBlocks) {
    try {
      const report = processBlock(block, rawUndos, undoByCount);
      reports.push(report);
    } catch (e: any) {
      reports.push({
        ok: false,
        error: { code: 'BLOCK_PARSE_ERROR', message: e.message || String(e) },
      });
    }
  }

  return reports;
}

function processBlock(
  block: RawBlockData,
  rawUndos: RawUndoRecord[],
  undoByCount: Map<number, number[]>
): BlockReport | BlockError {
  const { parsedTxs, txidBuffers, txCount } = block;

  // Verify merkle root
  const computedMerkleRoot = computeMerkleRoot(txidBuffers);
  const computedMerkleHex = bufToReverseHex(computedMerkleRoot);
  const merkleValid = computedMerkleHex === block.merkleRootHex;

  if (!merkleValid) {
    return {
      ok: false,
      error: {
        code: 'MERKLE_ROOT_MISMATCH',
        message: `Computed merkle root ${computedMerkleHex} does not match header ${block.merkleRootHex}`,
      },
    };
  }

  // Find matching undo record
  const nonCoinbaseCount = txCount - 1;
  const candidates = undoByCount.get(nonCoinbaseCount);
  if (!candidates || candidates.length === 0) {
    return {
      ok: false,
      error: {
        code: 'UNDO_NOT_FOUND',
        message: `No undo record found with ${nonCoinbaseCount} tx entries`,
      },
    };
  }

  // Try each candidate undo record
  let undoPrevouts: UndoPrevout[][] | null = null;
  let matchedIdx = -1;

  for (const idx of candidates) {
    try {
      const parsed = parseUndoRecord(rawUndos[idx].data);
      if (parsed.length !== nonCoinbaseCount) continue;

      // Verify input counts match
      const nonCoinbaseTxs = parsedTxs.slice(1);
      let allMatch = true;
      for (let t = 0; t < nonCoinbaseTxs.length; t++) {
        if (parsed[t].length !== nonCoinbaseTxs[t].inputs.length) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        undoPrevouts = parsed;
        matchedIdx = idx;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!undoPrevouts || matchedIdx < 0) {
    return {
      ok: false,
      error: {
        code: 'UNDO_MATCH_FAILED',
        message: `Could not match undo record for block with ${nonCoinbaseCount} non-coinbase txs`,
      },
    };
  }

  // Remove matched undo from candidates so it's not reused
  const cList = undoByCount.get(nonCoinbaseCount)!;
  const pos = cList.indexOf(matchedIdx);
  if (pos >= 0) cList.splice(pos, 1);

  // Coinbase
  const coinbaseTx = parsedTxs[0];
  const coinbaseInput = coinbaseTx.inputs[0];
  const coinbaseScriptHex = coinbaseInput.scriptSig.toString('hex');
  let bip34Height = 0;

  if (coinbaseInput.scriptSig.length >= 1) {
    const heightLen = coinbaseInput.scriptSig[0];
    if (heightLen >= 1 && heightLen <= 4 && coinbaseInput.scriptSig.length > heightLen) {
      let h = 0;
      for (let i = 0; i < heightLen; i++) {
        h |= coinbaseInput.scriptSig[1 + i] << (8 * i);
      }
      bip34Height = h;
    }
  }

  const coinbaseTotalOutput = coinbaseTx.outputs.reduce((sum, o) => sum + Number(o.value), 0);

  // Analyze all transactions
  const nonCoinbaseTxs = parsedTxs.slice(1);
  const transactions: AnalysisResult[] = [];
  const scriptTypeSummary: Record<string, number> = {};
  let totalFees = 0;
  let totalWeight = 0;

  // Coinbase (no fee)
  const coinbaseAnalysis = analyzeParsedTx(coinbaseTx, [], 'mainnet');
  coinbaseAnalysis.total_input_sats = 0;
  coinbaseAnalysis.fee_sats = 0;
  coinbaseAnalysis.fee_rate_sat_vb = 0;
  transactions.push(coinbaseAnalysis);
  totalWeight += coinbaseTx.weight;
  for (const v of coinbaseAnalysis.vout) {
    scriptTypeSummary[v.script_type] = (scriptTypeSummary[v.script_type] || 0) + 1;
  }

  // Non-coinbase
  for (let t = 0; t < nonCoinbaseTxs.length; t++) {
    const tx = nonCoinbaseTxs[t];
    // Bitcoin Core stores prevouts in REVERSE input order; reverse to match inputs
    const prevouts = [...undoPrevouts[t]].reverse();
    const analysis = analyzeParsedTx(tx, prevouts, 'mainnet');
    transactions.push(analysis);
    totalFees += analysis.fee_sats;
    totalWeight += tx.weight;

    for (const v of analysis.vout) {
      scriptTypeSummary[v.script_type] = (scriptTypeSummary[v.script_type] || 0) + 1;
    }
  }

  const totalVbytes = transactions.slice(1).reduce((sum, tx) => sum + tx.vbytes, 0);
  const avgFeeRate = totalVbytes > 0
    ? Math.round((totalFees / totalVbytes) * 100) / 100
    : 0;

  return {
    ok: true,
    mode: 'block',
    block_header: {
      version: block.version,
      prev_block_hash: block.prevBlockHash,
      merkle_root: block.merkleRootHex,
      merkle_root_valid: merkleValid,
      timestamp: block.timestamp,
      bits: block.bitsHex,
      nonce: block.nonce,
      block_hash: block.blockHash,
    },
    tx_count: block.txCount,
    coinbase: {
      bip34_height: bip34Height,
      coinbase_script_hex: coinbaseScriptHex,
      total_output_sats: coinbaseTotalOutput,
    },
    transactions,
    block_stats: {
      total_fees_sats: totalFees,
      total_weight: totalWeight,
      avg_fee_rate_sat_vb: avgFeeRate,
      script_type_summary: scriptTypeSummary,
    },
  };
}

export { readCompactSize, readVarIntCore, decompressAmount, decompressScript, xorDecode };
