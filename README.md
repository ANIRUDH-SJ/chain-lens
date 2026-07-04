# Chain Lens

**🔗 Live demo — [chain-lens-ten.vercel.app](https://chain-lens-ten.vercel.app)**

A from-scratch **Bitcoin transaction & block analyzer**. It deserializes raw Bitcoin
transactions (and raw `blk*.dat` block files) with no dependency on a full node or any
external API, produces a precise, machine-checkable JSON report, and ships a React web
visualizer that explains a transaction to non-technical users with diagrams and plain language.

Everything — the wire-format parsing, script classification, address derivation, fee/weight
accounting — is implemented directly against the Bitcoin serialization spec in TypeScript.

## Features

- **Full transaction deserialization** — version, inputs, outputs, SegWit witness data, and
  locktime, parsed byte-by-byte from raw hex.
- **Accurate accounting** — computes `txid` and `wtxid`, total in/out, fees, weight units, and
  virtual bytes (vbytes) using the SegWit weight formula.
- **Script classification & address derivation** — recognizes P2PKH, P2SH, P2WPKH, P2WSH, and
  P2TR scripts and derives the corresponding Base58Check / Bech32 / Bech32m addresses.
- **Policy signals** — detects RBF (BIP-125) signaling, absolute/relative timelocks, and emits
  warnings for unusual or malformed constructions.
- **Raw block-file parsing** — reads Bitcoin Core `blk*.dat` / `rev*.dat` files (XOR-decoded with
  `xor.dat`), parses 80-byte headers and all contained transactions, recomputes and verifies the
  merkle root, and decodes the coinbase (including BIP-34 block height).
- **Web visualizer** — a React UI that turns the JSON report into an annotated, human-friendly
  breakdown with a built-in glossary and PDF export.

## Tech stack

TypeScript · Node.js · Express (JSON API) · React + Vite · `bs58check` · `bech32`

## Architecture

```
src/
  txParser.ts    # raw transaction wire-format deserialization (legacy + SegWit)
  script.ts      # scriptPubKey / scriptSig decoding
  scriptAsm.ts   # opcode disassembly to human-readable ASM
  analyzer.ts    # accounting, classification, address derivation, report assembly
  blockParser.ts # raw blk*.dat / rev*.dat parsing, merkle verification, coinbase decode
  cli.ts         # CLI entrypoint (single-tx and --block modes)
  server.ts      # Express API backing the web UI
web/             # React + Vite transaction visualizer
```

## Usage

```bash
./setup.sh                      # install deps + build the web UI

# Single-transaction mode — prints the JSON report and writes out/<txid>.json
./cli.sh <input.json>

# Block mode — parses raw block files
./cli.sh --block <blk.dat> <rev.dat> <xor.dat>

# Web visualizer (defaults to http://127.0.0.1:3000, honors $PORT)
./web.sh
```

Single-transaction input is a JSON object with the raw transaction hex and the prevouts it
spends:

```json
{
  "network": "mainnet",
  "raw_tx": "0200000001...",
  "prevouts": [
    { "txid": "11...aa", "vout": 0, "value_sats": 123456, "script_pubkey_hex": "0014..." }
  ]
}
```

The analyzer does **not** validate signatures or execute scripts — it focuses on parsing,
accounting, and classification.

## Notes

Signature validation and full script execution are intentionally out of scope; the goal is a
fast, dependency-light analyzer for understanding transaction structure and economics.
