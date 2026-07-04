import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { analyzeTx, type Fixture } from './analyzer.js';
import { parseBlocks } from './blockParser.js';

function errorJson(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const err = errorJson('INVALID_ARGS', 'Usage: cli.sh <fixture.json> or cli.sh --block <blk> <rev> <xor>');
    console.log(err);
    process.exit(1);
  }

  // Ensure out/ directory exists
  if (!existsSync('out')) {
    mkdirSync('out', { recursive: true });
  }

  // Block mode
  if (args[0] === '--block') {
    if (args.length < 4) {
      const err = errorJson('INVALID_ARGS', 'Block mode requires: --block <blk.dat> <rev.dat> <xor.dat>');
      console.log(err);
      process.exit(1);
    }

    const [, blkPath, revPath, xorPath] = args;

    // Check files exist
    for (const f of [blkPath, revPath, xorPath]) {
      if (!existsSync(f)) {
        const err = errorJson('FILE_NOT_FOUND', `File not found: ${f}`);
        console.log(err);
        process.exit(1);
      }
    }

    try {
      const reports = parseBlocks(blkPath, revPath, xorPath);

      for (const report of reports) {
        if (report.ok) {
          const blockHash = report.block_header.block_hash;
          const outPath = `out/${blockHash}.json`;
          writeFileSync(outPath, JSON.stringify(report, null, 2));
        } else {
          // Write error to stdout and exit
          console.log(JSON.stringify(report));
          process.exit(1);
        }
      }

      process.exit(0);
    } catch (e: any) {
      const err = errorJson('BLOCK_PARSE_ERROR', e.message || String(e));
      console.log(err);
      process.exit(1);
    }
  }

  // Single-transaction mode
  const fixturePath = args[0];

  if (!existsSync(fixturePath)) {
    const err = errorJson('FILE_NOT_FOUND', `Fixture file not found: ${fixturePath}`);
    console.log(err);
    process.exit(1);
  }

  let fixture: Fixture;
  try {
    const raw = readFileSync(fixturePath, 'utf-8');
    fixture = JSON.parse(raw) as Fixture;
  } catch (e: any) {
    const err = errorJson('INVALID_FIXTURE', `Failed to parse fixture JSON: ${e.message}`);
    console.log(err);
    process.exit(1);
  }

  const result = analyzeTx(fixture);

  const jsonStr = JSON.stringify(result, null, 2);

  if (result.ok) {
    const txid = result.txid;
    writeFileSync(`out/${txid}.json`, jsonStr);
    console.log(jsonStr);
    process.exit(0);
  } else {
    console.log(jsonStr);
    process.exit(1);
  }
}

main();
