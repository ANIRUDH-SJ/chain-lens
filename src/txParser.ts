import { createHash } from 'crypto';

// Types

export interface ParsedInput {
  txid: string;        // 64-char hex, reversed (display order)
  vout: number;
  scriptSig: Buffer;
  sequence: number;
  witness: Buffer[];   // empty array for legacy
}

export interface ParsedOutput {
  value: bigint;       // satoshis (can exceed 32-bit)
  scriptPubKey: Buffer;
}

export interface ParsedTransaction {
  version: number;
  inputs: ParsedInput[];
  outputs: ParsedOutput[];
  locktime: number;
  segwit: boolean;
  txid: string;        // 64-char hex
  wtxid: string | null; // null for non-segwit
  sizeBytes: number;   // total serialized size
  weight: number;
  vbytes: number;
  witnessBytes: number;
  nonWitnessBytes: number;
  rawHex: string;
}

// Buffer Reader

class BufferReader {
  private buf: Buffer;
  private pos: number;

  constructor(buf: Buffer) {
    this.buf = buf;
    this.pos = 0;
  }

  get offset(): number { return this.pos; }
  get remaining(): number { return this.buf.length - this.pos; }

  readBytes(n: number): Buffer {
    if (this.pos + n > this.buf.length) {
      throw new Error(`Unexpected end of data: need ${n} bytes at offset ${this.pos}, have ${this.remaining}`);
    }
    const slice = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return Buffer.from(slice);
  }

  readUInt8(): number {
    return this.readBytes(1).readUInt8(0);
  }

  readUInt16LE(): number {
    return this.readBytes(2).readUInt16LE(0);
  }

  readUInt32LE(): number {
    return this.readBytes(4).readUInt32LE(0);
  }

  readInt32LE(): number {
    return this.readBytes(4).readInt32LE(0);
  }

  readUInt64LE(): bigint {
    const bytes = this.readBytes(8);
    return bytes.readBigUInt64LE(0);
  }

  readVarInt(): number {
    const first = this.readUInt8();
    if (first < 0xfd) return first;
    if (first === 0xfd) return this.readUInt16LE();
    if (first === 0xfe) return this.readUInt32LE();
    // 0xff — 8-byte, but tx counts won't exceed 32-bit in practice
    const val = this.readUInt64LE();
    return Number(val);
  }

  readVarBytes(): Buffer {
    const len = this.readVarInt();
    return this.readBytes(len);
  }
}

// Helpers

function doubleSha256(data: Buffer): Buffer {
  const h1 = createHash('sha256').update(data).digest();
  return createHash('sha256').update(h1).digest();
}

function reverseBuffer(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[buf.length - 1 - i];
  }
  return out;
}

export function bufToReverseHex(buf: Buffer): string {
  return reverseBuffer(buf).toString('hex');
}

// Varint encoding (for serialization)

function encodeVarInt(n: number): Buffer {
  if (n < 0xfd) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(n, 0);
    return buf;
  } else if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf.writeUInt8(0xfd, 0);
    buf.writeUInt16LE(n, 1);
    return buf;
  } else if (n <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf.writeUInt8(0xfe, 0);
    buf.writeUInt32LE(n, 1);
    return buf;
  } else {
    const buf = Buffer.alloc(9);
    buf.writeUInt8(0xff, 0);
    buf.writeBigUInt64LE(BigInt(n), 1);
    return buf;
  }
}

// Serialization (for txid/wtxid computation)

function serializeTx(tx: { version: number; inputs: ParsedInput[]; outputs: ParsedOutput[]; locktime: number }, withWitness: boolean): Buffer {
  const parts: Buffer[] = [];

  // version (4 bytes LE)
  const ver = Buffer.alloc(4);
  ver.writeInt32LE(tx.version, 0);
  parts.push(ver);

  if (withWitness) {
    parts.push(Buffer.from([0x00, 0x01])); // marker + flag
  }

  // inputs
  parts.push(encodeVarInt(tx.inputs.length));
  for (const inp of tx.inputs) {
    parts.push(reverseBuffer(Buffer.from(inp.txid, 'hex'))); // txid in internal byte order
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(inp.vout, 0);
    parts.push(voutBuf);
    parts.push(encodeVarInt(inp.scriptSig.length));
    parts.push(inp.scriptSig);
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(inp.sequence, 0);
    parts.push(seqBuf);
  }

  // outputs
  parts.push(encodeVarInt(tx.outputs.length));
  for (const out of tx.outputs) {
    const valBuf = Buffer.alloc(8);
    valBuf.writeBigUInt64LE(out.value, 0);
    parts.push(valBuf);
    parts.push(encodeVarInt(out.scriptPubKey.length));
    parts.push(out.scriptPubKey);
  }

  // witness
  if (withWitness) {
    for (const inp of tx.inputs) {
      parts.push(encodeVarInt(inp.witness.length));
      for (const item of inp.witness) {
        parts.push(encodeVarInt(item.length));
        parts.push(item);
      }
    }
  }

  // locktime
  const ltBuf = Buffer.alloc(4);
  ltBuf.writeUInt32LE(tx.locktime, 0);
  parts.push(ltBuf);

  return Buffer.concat(parts);
}

// Main parser

export function parseTransaction(rawHex: string): ParsedTransaction {
  const rawBuf = Buffer.from(rawHex, 'hex');
  const reader = new BufferReader(rawBuf);

  const version = reader.readInt32LE();

  // Detect segwit: peek at next two bytes for marker (0x00) + flag (0x01)
  let segwit = false;
  const markerPos = reader.offset;
  const marker = reader.readUInt8();
  if (marker === 0x00) {
    const flag = reader.readUInt8();
    if (flag === 0x01) {
      segwit = true;
    } else {
      throw new Error('Invalid segwit flag byte');
    }
  } else {
    // Not segwit — the byte we read is the start of the input count varint
    // We need to re-parse from markerPos
    // Re-create reader at the right position
    // Actually, we read one byte that's the varint prefix; we need to handle it
    // The cleanest approach: re-parse from raw buffer
  }

  // Re-parse with known format
  const reader2 = new BufferReader(rawBuf);
  reader2.readBytes(4); // version

  if (segwit) {
    reader2.readBytes(2); // marker + flag
  }

  // inputs
  const inputCount = reader2.readVarInt();
  const inputs: ParsedInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const hashBytes = reader2.readBytes(32);
    const txid = bufToReverseHex(hashBytes);
    const vout = reader2.readUInt32LE();
    const scriptSig = reader2.readVarBytes();
    const sequence = reader2.readUInt32LE();
    inputs.push({ txid, vout, scriptSig, sequence, witness: [] });
  }

  // outputs
  const outputCount = reader2.readVarInt();
  const outputs: ParsedOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const value = reader2.readUInt64LE();
    const scriptPubKey = reader2.readVarBytes();
    outputs.push({ value, scriptPubKey });
  }

  // witness (if segwit)
  if (segwit) {
    for (let i = 0; i < inputCount; i++) {
      const stackSize = reader2.readVarInt();
      const items: Buffer[] = [];
      for (let j = 0; j < stackSize; j++) {
        items.push(reader2.readVarBytes());
      }
      inputs[i].witness = items;
    }
  }

  const locktime = reader2.readUInt32LE();

  if (reader2.remaining !== 0) {
    throw new Error(`Unexpected trailing bytes: ${reader2.remaining} bytes remaining`);
  }

  // Compute txid (always without witness)
  const txNoWitness = serializeTx({ version, inputs, outputs, locktime }, false);
  const txidBuf = doubleSha256(txNoWitness);
  const txid = reverseBuffer(txidBuf).toString('hex');

  // Compute wtxid (with witness if segwit, else null)
  let wtxid: string | null = null;
  if (segwit) {
    const txWithWitness = serializeTx({ version, inputs, outputs, locktime }, true);
    const wtxidBuf = doubleSha256(txWithWitness);
    wtxid = reverseBuffer(wtxidBuf).toString('hex');
  }

  // Size calculations
  const sizeBytes = rawBuf.length;

  // Compute weight per BIP141:
  // weight = base_size * 3 + total_size
  // base_size = size of tx serialized without witness
  // total_size = size of tx as serialized (with witness if present)
  const baseSize = txNoWitness.length;
  const totalSize = sizeBytes;
  const weight = baseSize * 3 + totalSize;
  const vbytes = Math.ceil(weight / 4);

  // Witness vs non-witness bytes
  const witnessBytes = segwit ? totalSize - baseSize : 0;
  const nonWitnessBytes = baseSize;

  return {
    version,
    inputs,
    outputs,
    locktime,
    segwit,
    txid,
    wtxid,
    sizeBytes,
    weight,
    vbytes,
    witnessBytes,
    nonWitnessBytes,
    rawHex,
  };
}

/**
 * Parse a transaction from a Buffer (used in block parsing).
 * Returns the parsed transaction and the number of bytes consumed.
 */
export function parseTransactionFromBuffer(buf: Buffer, offset: number = 0): { tx: ParsedTransaction; bytesRead: number } {
  const reader = new BufferReader(buf.subarray(offset));
  const startOffset = 0;

  const version = reader.readInt32LE();

  let segwit = false;
  const marker = reader.readUInt8();
  if (marker === 0x00) {
    const flag = reader.readUInt8();
    if (flag === 0x01) {
      segwit = true;
    } else {
      throw new Error('Invalid segwit flag byte');
    }
  }

  // Re-parse properly
  const reader2 = new BufferReader(buf.subarray(offset));
  reader2.readBytes(4); // version
  if (segwit) {
    reader2.readBytes(2); // marker + flag
  }

  const inputCount = reader2.readVarInt();
  const inputs: ParsedInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const hashBytes = reader2.readBytes(32);
    const txid = bufToReverseHex(hashBytes);
    const vout = reader2.readUInt32LE();
    const scriptSig = reader2.readVarBytes();
    const sequence = reader2.readUInt32LE();
    inputs.push({ txid, vout, scriptSig, sequence, witness: [] });
  }

  const outputCount = reader2.readVarInt();
  const outputs: ParsedOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const value = reader2.readUInt64LE();
    const scriptPubKey = reader2.readVarBytes();
    outputs.push({ value, scriptPubKey });
  }

  if (segwit) {
    for (let i = 0; i < inputCount; i++) {
      const stackSize = reader2.readVarInt();
      const items: Buffer[] = [];
      for (let j = 0; j < stackSize; j++) {
        items.push(reader2.readVarBytes());
      }
      inputs[i].witness = items;
    }
  }

  const locktime = reader2.readUInt32LE();
  const bytesRead = reader2.offset;

  const rawSlice = buf.subarray(offset, offset + bytesRead);
  const rawHex = rawSlice.toString('hex');

  const txNoWitness = serializeTx({ version, inputs, outputs, locktime }, false);
  const txidBuf = doubleSha256(txNoWitness);
  const txid = reverseBuffer(txidBuf).toString('hex');

  let wtxid: string | null = null;
  if (segwit) {
    const txWithWitness = serializeTx({ version, inputs, outputs, locktime }, true);
    const wtxidBuf = doubleSha256(txWithWitness);
    wtxid = reverseBuffer(wtxidBuf).toString('hex');
  }

  const sizeBytes = bytesRead;
  const baseSize = txNoWitness.length;
  const totalSize = sizeBytes;
  const weight = baseSize * 3 + totalSize;
  const vbytes = Math.ceil(weight / 4);
  const witnessBytes2 = segwit ? totalSize - baseSize : 0;

  return {
    tx: {
      version,
      inputs,
      outputs,
      locktime,
      segwit,
      txid,
      wtxid,
      sizeBytes,
      weight,
      vbytes,
      witnessBytes: witnessBytes2,
      nonWitnessBytes: baseSize,
      rawHex,
    },
    bytesRead,
  };
}

export { BufferReader, doubleSha256, reverseBuffer, encodeVarInt };
