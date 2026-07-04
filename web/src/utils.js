export function formatSats(sats) {
  if (sats >= 100000000) return (sats / 100000000).toFixed(8) + ' BTC';
  return sats.toLocaleString() + ' sats';
}

export function formatSatsShort(sats) {
  if (sats >= 100000000) return (sats / 100000000).toFixed(4) + ' BTC';
  return sats.toLocaleString() + ' sats';
}

export function scriptLabel(type) {
  const labels = {
    p2pkh: 'P2PKH',
    p2sh: 'P2SH',
    p2wpkh: 'P2WPKH',
    p2wsh: 'P2WSH',
    p2tr: 'Taproot',
    op_return: 'OP_RETURN',
    unknown: 'Unknown',
    'p2sh-p2wpkh': 'P2SH-P2WPKH',
    'p2sh-p2wsh': 'P2SH-P2WSH',
    p2tr_keypath: 'Taproot (Key)',
    p2tr_scriptpath: 'Taproot (Script)',
  };
  return labels[type] || type;
}

export function scriptLabelFriendly(type) {
  const friendly = {
    p2pkh: 'Legacy wallet',
    p2sh: 'Multisig / script wallet',
    p2wpkh: 'SegWit wallet',
    p2wsh: 'SegWit multisig',
    p2tr: 'Taproot wallet',
    op_return: 'Data storage',
    unknown: 'Unknown type',
    'p2sh-p2wpkh': 'Wrapped SegWit',
    'p2sh-p2wsh': 'Wrapped SegWit multisig',
    p2tr_keypath: 'Taproot (single key)',
    p2tr_scriptpath: 'Taproot (script)',
  };
  return friendly[type] || scriptLabel(type);
}

export function scriptIcon(type) {
  if (type === 'p2tr' || type?.startsWith('p2tr')) return '⚡';
  if (type === 'op_return') return '📝';
  if (type?.includes('segwit') || type?.includes('p2w')) return '✨';
  return '📦';
}

export function truncAddr(addr) {
  if (!addr || addr.length <= 20) return addr || 'Unknown';
  return addr.slice(0, 10) + '...' + addr.slice(-6);
}

export function truncTxid(txid) {
  if (!txid || txid.length < 20) return txid || '';
  return txid.slice(0, 12) + '...' + txid.slice(-8);
}

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text);
}

export const SAMPLE_FIXTURE = {
  network: 'mainnet',
  raw_tx:
    '02000000000101222222222222222222222222222222222222222222222222222222222222222201000000' +
    '00feffffff02102700000000000016001403030303030303030303030303030303030303038813000000' +
    '000000225120040404040404040404040404040404040404040404040404040404040404040402471e51' +
    '80f383a5dcf31ae239e5999f8e6bc8928cd7bbc6c47dc0c596703d009d141c49d1197302d0e4af7dad' +
    '5035654059faffed5bce60ffbe83a313b957168e894a497524e0a5b421b7934f06d9b55e5d766c1766' +
    'e4958d7fde1d6c81cdc0dd99e07d65ea8642d86b9000000000',
  prevouts: [
    {
      txid: '2222222222222222222222222222222222222222222222222222222222222222',
      vout: 1,
      value_sats: 20000,
      script_pubkey_hex: '00140505050505050505050505050505050505050505',
    },
  ],
};

export const GLOSSARY = {
  txid: 'Transaction ID — a unique fingerprint for this payment, like a tracking number',
  wtxid: 'Witness Transaction ID — includes signature data in the fingerprint',
  SegWit: 'Segregated Witness — a newer format that makes transactions cheaper',
  Taproot: 'The latest Bitcoin wallet technology, offers privacy and flexibility',
  P2PKH: 'Pay to Public Key Hash — the original Bitcoin address format (starts with 1)',
  P2SH: 'Pay to Script Hash — supports advanced features (starts with 3)',
  P2WPKH: 'Native SegWit single-signature wallet (starts with bc1q, short)',
  P2WSH: 'Native SegWit multisig or scripted wallet (starts with bc1q, long)',
  P2TR: 'Taproot address — newest format (starts with bc1p)',
  OP_RETURN: 'Data storage — embeds non-payment info in the blockchain',
  sats: 'Satoshis — the smallest unit of Bitcoin (100 million sats = 1 BTC)',
  vbyte: 'Virtual byte — how transaction size is measured for fees',
  weight: 'A metric that gives witness data a discount in size calculations',
  RBF: 'Replace-By-Fee — allows updating this transaction with a higher fee',
  locktime: 'A rule preventing this transaction from being mined until a certain time or block',
  sequence: 'A number that can enable timelocks or RBF signaling',
  scriptSig: "The unlocking key — proves you're allowed to spend the input",
  scriptPubKey: 'The locking rule — defines who can spend this output',
  witness: 'Signature data stored separately (SegWit only)',
  prevout: 'Previous output — the coin being spent by this transaction',
  coinbase: "The first transaction in a block — the miner's reward",
  merkle_root: 'A cryptographic summary of all transactions in a block',
};

export const GLOSSARY_TERMS = [
  { term: 'Inputs', def: 'Where the money came from. Each input references Bitcoin received in a previous transaction.' },
  { term: 'Outputs', def: 'Where the money went. Each output sends Bitcoin to an address or stores data.' },
  { term: 'Fee', def: 'The amount paid to miners to include your transaction in a block. Higher fees usually mean faster confirmation.' },
  { term: 'Fee rate (sat/vB)', def: 'Fee per virtual byte. Miners prioritize transactions with higher fee rates.' },
  { term: 'SegWit', def: 'An efficient transaction format that reduces fees by separating signature data. Addresses starting with bc1 use SegWit.' },
  { term: 'RBF (Replace-By-Fee)', def: 'Replaceable transactions can be replaced with a higher-fee version before confirmation. Useful if your transaction is stuck.' },
  { term: 'P2PKH', def: 'Standard address format (starts with 1). The original Bitcoin address type.' },
  { term: 'P2WPKH', def: 'SegWit address (starts with bc1). Lower fees than legacy addresses.' },
  { term: 'Taproot', def: 'Modern address type with privacy and efficiency improvements. Also starts with bc1.' },
  { term: 'OP_RETURN', def: 'A special output that stores data on the blockchain. It does not send spendable Bitcoin.' },
  { term: 'Transaction ID (TXID)', def: 'A unique identifier for a transaction, like a fingerprint.' },
  { term: 'Virtual bytes (vB)', def: 'The effective size used to calculate fees. Smaller transactions cost less.' },
];
