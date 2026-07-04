import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeTx, type Fixture } from '../src/analyzer.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    return;
  }
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
    res.status(200).json(result);
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: e?.message || String(e) },
    });
  }
}
