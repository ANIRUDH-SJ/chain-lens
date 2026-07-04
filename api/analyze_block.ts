import type { VercelRequest, VercelResponse } from '@vercel/node';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { gunzipSync } from 'zlib';
import { parseBlocks } from '../src/blockParser.js';

// Note: Vercel limits request bodies to ~4.5MB, so very large raw block files
// may exceed the platform limit. The single-transaction /api/analyze endpoint is
// the primary demo path.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    return;
  }
  try {
    const { blk_data, rev_data, xor_data } = req.body || {};
    if (!blk_data || !rev_data || !xor_data) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing blk_data, rev_data, or xor_data (base64)' },
      });
      return;
    }

    const dir = join(tmpdir(), `chainlens-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const blkPath = join(dir, 'blk.dat');
    const revPath = join(dir, 'rev.dat');
    const xorPath = join(dir, 'xor.dat');

    const decompressIfGzip = (buf: Buffer): Buffer =>
      buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;

    writeFileSync(blkPath, decompressIfGzip(Buffer.from(blk_data, 'base64')));
    writeFileSync(revPath, decompressIfGzip(Buffer.from(rev_data, 'base64')));
    writeFileSync(xorPath, Buffer.from(xor_data, 'base64'));

    const reports = parseBlocks(blkPath, revPath, xorPath);

    try { unlinkSync(blkPath); unlinkSync(revPath); unlinkSync(xorPath); } catch {}

    res.status(200).json(reports);
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: e?.message || String(e) },
    });
  }
}
