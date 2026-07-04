import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import { analyzeTx, type Fixture } from './analyzer.js';
import { parseBlocks } from './blockParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '300mb' }));
app.use(express.urlencoded({ extended: true, limit: '300mb' }));

// Health endpoint

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Single-transaction analysis

app.post('/api/analyze', (req, res) => {
  try {
    const fixture = req.body as Fixture;
    if (!fixture || !fixture.raw_tx) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing raw_tx in request body' },
      });
      return;
    }

    const result = analyzeTx(fixture);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: e.message || String(e) },
    });
  }
});

// Block analysis (accepts JSON with base64-encoded files)

app.post('/api/analyze_block', (req, res) => {
  try {
    const { blk_data, rev_data, xor_data } = req.body;

    if (!blk_data || !rev_data || !xor_data) {
      res.status(400).json({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing blk_data, rev_data, or xor_data (base64)' },
      });
      return;
    }

    // Write temp files
    const tmpDir = join(ROOT, '.tmp_block');
    mkdirSync(tmpDir, { recursive: true });

    const blkPath = join(tmpDir, 'blk.dat');
    const revPath = join(tmpDir, 'rev.dat');
    const xorPath = join(tmpDir, 'xor.dat');

    const decompressIfGzip = (buf: Buffer): Buffer => {
      if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        return gunzipSync(buf);
      }
      return buf;
    };
    const blkBuf = decompressIfGzip(Buffer.from(blk_data, 'base64'));
    const revBuf = decompressIfGzip(Buffer.from(rev_data, 'base64'));
    const xorBuf = Buffer.from(xor_data, 'base64');
    writeFileSync(blkPath, blkBuf);
    writeFileSync(revPath, revBuf);
    writeFileSync(xorPath, xorBuf);

    const reports = parseBlocks(blkPath, revPath, xorPath);

    // Cleanup
    try { unlinkSync(blkPath); } catch {}
    try { unlinkSync(revPath); } catch {}
    try { unlinkSync(xorPath); } catch {}

    res.json(reports);
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: e.message || String(e) },
    });
  }
});

// Serve frontend (React build output in web/dist)
const webDist = join(ROOT, 'web', 'dist');
const webFallback = existsSync(webDist)
  ? join(webDist, 'index.html')
  : join(ROOT, 'web', 'index.html');
const webStatic = existsSync(webDist) ? webDist : join(ROOT, 'web');

app.use(express.static(webStatic));

// Fallback for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(webFallback);
});

// Start

app.listen(PORT, '0.0.0.0', () => {
  console.log(`http://127.0.0.1:${PORT}`);
});
