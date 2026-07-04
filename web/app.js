// Tab switching

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('tab-transaction').classList.toggle('hidden', tab !== 'transaction');
  document.getElementById('tab-block').classList.toggle('hidden', tab !== 'block');
  document.getElementById('results').innerHTML = '';
  updateWelcomeVisibility();
}

// Onboarding: Try sample (load + analyze)
async function trySampleTransaction() {
  loadSampleFixture();
  await analyzeTransaction();
  hideWelcome();
}

// Toggle advanced input panel
function toggleAdvancedInput() {
  const el = document.getElementById('advanced-input');
  const btn = event.target;
  el.classList.toggle('hidden');
  btn.textContent = el.classList.contains('hidden') ? 'I have transaction data' : 'Hide advanced input';
}

function hideWelcome() {
  const w = document.getElementById('welcome-section');
  if (w) w.classList.add('hidden');
}

function showWelcome() {
  const w = document.getElementById('welcome-section');
  if (w) w.classList.remove('hidden');
}

function updateWelcomeVisibility() {
  const results = document.getElementById('results');
  const hasContent = results && results.innerHTML.trim().length > 0;
  if (hasContent) hideWelcome();
  else if (document.querySelector('.tab[data-tab="transaction"]')?.classList.contains('active')) showWelcome();
}

function updateFileName(input, nameId) {
  const name = input.files[0] ? input.files[0].name : 'No file chosen';
  document.getElementById(nameId).textContent = name;
}

// Sample fixture

function loadSampleFixture() {
  const sample = {
    network: "mainnet",
    raw_tx: "02000000000101222222222222222222222222222222222222222222222222222222222222222201000000" +
            "00feffffff02102700000000000016001403030303030303030303030303030303030303038813000000" +
            "000000225120040404040404040404040404040404040404040404040404040404040404040402471e51" +
            "80f383a5dcf31ae239e5999f8e6bc8928cd7bbc6c47dc0c596703d009d141c49d1197302d0e4af7dad" +
            "5035654059faffed5bce60ffbe83a313b957168e894a497524e0a5b421b7934f06d9b55e5d766c1766" +
            "e4958d7fde1d6c81cdc0dd99e07d65ea8642d86b9000000000",
    prevouts: [{
      txid: "2222222222222222222222222222222222222222222222222222222222222222",
      vout: 1,
      value_sats: 20000,
      script_pubkey_hex: "00140505050505050505050505050505050505050505"
    }]
  };
  document.getElementById('fixture-input').value = JSON.stringify(sample, null, 2);
}

// Transaction analysis

async function analyzeTransaction() {
  const input = document.getElementById('fixture-input').value.trim();
  if (!input) return;

  let fixture;
  try {
    fixture = JSON.parse(input);
  } catch {
    showError('Invalid format', 'Please paste valid JSON. Try "Try with sample" above to see an example.');
    return;
  }

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    const data = await res.json();

    if (!data.ok) {
      showError(data.error.code, data.error.message);
      return;
    }

    window.__lastTx = data;
    window.__renderTarget = null;
    renderTransaction(data);
    hideWelcome();
  } catch (e) {
    showError('Network Error', e.message);
  }
}

// Block analysis

async function analyzeBlock() {
  const blkFile = document.getElementById('blk-file').files[0];
  const revFile = document.getElementById('rev-file').files[0];
  const xorFile = document.getElementById('xor-file').files[0];

  if (!blkFile || !revFile || !xorFile) {
    showError('Missing Files', 'Please select all three files (blk, rev, xor).');
    return;
  }

  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    const [blk, rev, xor] = await Promise.all([toBase64(blkFile), toBase64(revFile), toBase64(xorFile)]);
    const res = await fetch('/api/analyze_block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blk_data: blk, rev_data: rev, xor_data: xor }),
    });
    const data = await res.json();

    if (Array.isArray(data)) {
      renderBlockResults(data);
    } else if (!data.ok) {
      showError(data.error.code, data.error.message);
    } else {
      renderBlockResults([data]);
    }
  } catch (e) {
    showError('Analysis Error', e.message);
  }
}

// Error display

function showError(code, message) {
  document.getElementById('results').innerHTML = `
    <div class="error-box">
      <h3>Error: ${esc(code)}</h3>
      <p>${esc(message)}</p>
      <button class="btn" onclick="trySampleTransaction()" style="margin-top:12px">Try with sample transaction</button>
    </div>`;
}

// View mode: simple | detailed (stored in localStorage)
function getViewMode() {
  try {
    const m = localStorage.getItem('chainlens_view');
    return m === 'detailed' ? 'detailed' : 'simple';
  } catch { return 'simple'; }
}
function setViewMode(mode) {
  try { localStorage.setItem('chainlens_view', mode); } catch {}
}

// Render transaction (optional targetEl for block-mode expansion)

function renderTransaction(tx, targetEl) {
  const r = targetEl || document.getElementById('results');
  const viewMode = getViewMode();
  r.innerHTML = '';

  // View toggle
  r.innerHTML += `
  <div class="view-toggle-bar">
    <span class="view-toggle-label">View:</span>
    <button class="view-toggle-btn ${viewMode === 'simple' ? 'active' : ''}" onclick="setViewAndRerender('simple')">Simple</button>
    <button class="view-toggle-btn ${viewMode === 'detailed' ? 'active' : ''}" onclick="setViewAndRerender('detailed')">Detailed</button>
    <button class="btn-glossary" onclick="openGlossary()">Learn more</button>
  </div>`;

  // 1. Story: What Happened?
  r.innerHTML += renderStory(tx);

  // 2. Value Flow Diagram (before stats in simple view)
  r.innerHTML += renderFlowDiagram(tx);

  // 3. Key Stats (simplified in simple view)
  r.innerHTML += renderStats(tx, viewMode);

  // 4. Warnings
  if (tx.warnings && tx.warnings.length > 0) {
    r.innerHTML += renderWarnings(tx);
  }

  // Detailed-only sections
  if (viewMode === 'detailed') {
    if (tx.segwit_savings) r.innerHTML += renderSegwitSavings(tx);
    r.innerHTML += renderInputs(tx);
    r.innerHTML += renderOutputs(tx);
    r.innerHTML += renderTechDetails(tx);
  }
}

function setViewAndRerender(mode) {
  setViewMode(mode);
  if (window.__lastTx) {
    const target = window.__renderTarget || document.getElementById('results');
    renderTransaction(window.__lastTx, target);
  }
}

const GLOSSARY_TERMS = [
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

function openGlossary() {
  const modal = document.getElementById('glossary-modal');
  const body = document.getElementById('glossary-body');
  if (body) {
    body.innerHTML = '<dl class="glossary-list">' + GLOSSARY_TERMS.map(t =>
      `<div class="glossary-term"><dt>${esc(t.term)}</dt><dd>${esc(t.def)}</dd></div>`
    ).join('') + '</dl>';
  }
  if (modal) modal.classList.add('open');
}

function closeGlossary() {
  const modal = document.getElementById('glossary-modal');
  if (modal) modal.classList.remove('open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeGlossary();
});

// Story section (plain-language for non-technical users)

function renderStory(tx) {
  const inputDesc = tx.vin.length === 1
    ? `1 source (${scriptLabelFriendly(tx.vin[0].script_type)})`
    : `${tx.vin.length} sources`;
  const outputDesc = tx.vout.length === 1
    ? '1 destination'
    : `${tx.vout.length} destinations`;

  return `
  <div class="result-section">
    <h2>&#x1f4d6; What Happened?</h2>
    <p class="section-desc">A plain-English summary of this transaction</p>
    <div class="content">
      <div class="story-card">
        <h3>Transaction Overview</h3>
        <p>This transaction takes Bitcoin from <span class="value">${inputDesc}</span>
           and sends it to <span class="value">${outputDesc}</span>.
           It moves <span class="value">${formatSats(tx.total_input_sats)}</span> of Bitcoin.</p>
      </div>
      <div class="story-card">
        <h3>Fee Paid to Miners</h3>
        <p>The sender paid <span class="value">${formatSats(tx.fee_sats)}</span> in fees
           (fee rate: <span class="value">${tx.fee_rate_sat_vb} sat/vB</span>).
           Miners include transactions with higher fees first, so this transaction was likely confirmed quickly.
           The fee goes to the miner who confirms the transaction.</p>
      </div>
      <div class="story-card">
        <h3>Transaction Size</h3>
        <p>This transaction is <span class="value">${tx.size_bytes} bytes</span>.
           ${tx.segwit ? 'It uses <span class="tooltip" data-tip="Efficient format — lower fees" data-glossary="segwit">SegWit</span>, which reduces the effective size and fees.' : 'It uses the legacy format.'}</p>
      </div>
      ${tx.rbf_signaling ? `
      <div class="story-card">
        <h3>&#x26a0;&#xfe0f; Replaceable</h3>
        <p>This transaction is <span class="tooltip" data-tip="Replaceable — sender can bump fee before confirmation" data-glossary="rbf">replaceable</span>.
           The sender can replace it with a higher-fee version before it's confirmed.</p>
      </div>` : ''}
      ${tx.locktime_type !== 'none' ? `
      <div class="story-card">
        <h3>&#x1f512; Time-Locked</h3>
        <p>This transaction is locked until <span class="value">${tx.locktime_type === 'block_height' ? `block ${tx.locktime_value}` : new Date(tx.locktime_value * 1000).toLocaleString()}</span>.
           It cannot be included in a block before then.</p>
      </div>` : ''}
    </div>
  </div>`;
}

// Stats grid (simple = 5 cards, detailed = full)

function renderStats(tx, viewMode) {
  const simpleStats = `
    <div class="stat-card">
      <div class="label">Total Moved</div>
      <div class="val">${formatSats(tx.total_input_sats)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Fee Paid</div>
      <div class="val" style="color:var(--orange)">${formatSats(tx.fee_sats)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Fee Rate</div>
      <div class="val">${tx.fee_rate_sat_vb} sat/vB</div>
    </div>
    <div class="stat-card">
      <div class="label">Sources</div>
      <div class="val" style="color:var(--blue)">${tx.vin.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Destinations</div>
      <div class="val" style="color:var(--green)">${tx.vout.length}</div>
    </div>`;

  const fullStats = simpleStats + `
    <div class="stat-card">
      <div class="label">Transaction ID</div>
      <div class="val" style="font-size:0.7rem;word-break:break-all;font-family:monospace;display:flex;align-items:center;flex-wrap:wrap;gap:6px">
        ${tx.txid}
        <button class="btn-copy" data-copy="${esc(tx.txid)}" onclick="copyFromDataAttr(this)" title="Copy TXID">Copy</button>
      </div>
    </div>
    <div class="stat-card">
      <div class="label">Size</div>
      <div class="val">${tx.vbytes} vB</div>
    </div>
    <div class="stat-card">
      <div class="label">Weight</div>
      <div class="val">${tx.weight} WU</div>
    </div>
    <div class="stat-card">
      <div class="label">Format</div>
      <div class="val" style="color:${tx.segwit ? 'var(--green)' : 'var(--text2)'}">${tx.segwit ? 'SegWit (efficient)' : 'Legacy'}</div>
    </div>`;

  return `
  <div class="result-section">
    <h2>&#x1f4ca; Key Metrics</h2>
    <p class="section-desc">Numbers that matter</p>
    <div class="content">
      <div class="stats-grid">
        ${viewMode === 'simple' ? simpleStats : fullStats}
      </div>
    </div>
  </div>`;
}

// Warnings (plain-language messages)

function renderWarnings(tx) {
  const friendlyDescs = {
    HIGH_FEE: 'Unusually high fee — double-check before sending',
    DUST_OUTPUT: 'Very small output — may be unspendable',
    RBF_SIGNALING: 'Transaction can be replaced with higher fee',
    UNKNOWN_OUTPUT_SCRIPT: 'Non-standard output type',
  };

  return `
  <div class="result-section">
    <h2>&#x26a0;&#xfe0f; Warnings</h2>
    <div class="content">
      ${tx.warnings.map(w => `
        <div class="warning-item ${w.code}">
          ${friendlyDescs[w.code] || w.code}
        </div>`).join('')}
    </div>
  </div>`;
}

// Value flow diagram

function renderFlowDiagram(tx) {
  const inputs = tx.vin.map((v, i) => {
    const addr = v.address || '';
    return `
    <div class="flow-item input">
      <div class="type-badge tooltip" data-tip="${esc(scriptLabelFriendly(v.script_type))}">${scriptLabel(v.script_type)}</div>
      <div class="amount">${formatSats(v.prevout.value_sats)}</div>
      <div class="address-row">
        <span class="address">${addr ? truncAddr(addr) : 'Unknown'}</span>
        ${addr ? `<button class="btn-copy" data-copy="${esc(addr)}" onclick="copyFromDataAttr(this)" title="Copy address">Copy</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const outputs = tx.vout.map(v => {
    const isOpReturn = v.script_type === 'op_return';
    const addr = v.address || '';
    return `
    <div class="flow-item output ${isOpReturn ? 'op-return' : ''}">
      <div class="type-badge tooltip" data-tip="${esc(scriptLabelFriendly(v.script_type))}">${scriptLabel(v.script_type)}</div>
      <div class="amount">${isOpReturn ? '—' : formatSats(v.value_sats)}</div>
      ${isOpReturn
        ? `<div class="address op-return-label">Data (not Bitcoin): ${v.op_return_data_utf8 ? esc(v.op_return_data_utf8) : '(binary data)'}</div>`
        : `<div class="address-row"><span class="address">${addr ? truncAddr(addr) : 'Unknown'}</span>${addr ? `<button class="btn-copy" data-copy="${esc(addr)}" onclick="copyFromDataAttr(this)" title="Copy address">Copy</button>` : ''}</div>`
      }
    </div>`;
  }).join('');

  return `
  <div class="result-section">
    <h2>&#x1f4b8; Value Flow</h2>
    <p class="section-desc">Where Bitcoin came from and where it went. Money flows from left (sources) to right (destinations).</p>
    <div class="content">
      <div class="flow-diagram">
        <div class="flow-col">
          <h4><span class="tooltip" data-tip="Where the money came from">Where the money came from</span> (${formatSats(tx.total_input_sats)})</h4>
          ${inputs}
        </div>
        <div class="flow-arrow">&#x2192;</div>
        <div class="flow-col">
          <h4><span class="tooltip" data-tip="Where the money went">Where the money went</span> (${formatSats(tx.total_output_sats)})</h4>
          ${outputs}
          <div class="flow-item fee">
            <div class="type-badge">Miner Fee</div>
            <div class="amount">${formatSats(tx.fee_sats)}</div>
            <div class="address">Goes to the miner who confirms this transaction</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// SegWit savings

function renderSegwitSavings(tx) {
  const s = tx.segwit_savings;
  const pct = s.savings_pct;
  const actualPct = Math.round((s.weight_actual / s.weight_if_legacy) * 100);

  return `
  <div class="result-section">
    <h2>&#x1f4be; SegWit Discount</h2>
    <div class="content">
      <p style="margin-bottom:12px;color:var(--text2)">
        <span class="tooltip" data-tip="SegWit (Segregated Witness) separates signature data from transaction data, giving it a 75% discount on weight. This means SegWit transactions pay lower fees for the same functionality.">SegWit</span>
        reduces this transaction's effective weight by <strong style="color:var(--green)">${pct}%</strong>.
      </p>
      <div class="savings-bar">
        <div class="bar-label">
          <span>Actual weight: ${s.weight_actual} WU</span>
          <span>Legacy equivalent: ${s.weight_if_legacy} WU</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill bar-actual" style="width:${actualPct}%">${actualPct}%</div>
        </div>
      </div>
      <div class="stats-grid" style="margin-top:16px">
        <div class="stat-card">
          <div class="label">Witness Data</div>
          <div class="val">${s.witness_bytes} bytes</div>
        </div>
        <div class="stat-card">
          <div class="label">Non-Witness Data</div>
          <div class="val">${s.non_witness_bytes} bytes</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Size</div>
          <div class="val">${s.total_bytes} bytes</div>
        </div>
        <div class="stat-card">
          <div class="label">Savings</div>
          <div class="val" style="color:var(--green)">${pct}%</div>
        </div>
      </div>
    </div>
  </div>`;
}

// Inputs detail

function renderInputs(tx) {
  const rows = tx.vin.map((v, i) => {
    const rl = v.relative_timelock;
    const rlText = rl.enabled
      ? `${rl.type === 'blocks' ? rl.value + ' blocks' : rl.value + ' seconds'}`
      : 'Disabled';

    return `
    <div class="story-card">
      <h3>Input #${i}</h3>
      <table class="detail-table">
        <tr><td>Type</td><td><span class="type-badge">${scriptLabel(v.script_type)}</span></td></tr>
        <tr><td>Value</td><td><strong>${formatSats(v.prevout.value_sats)}</strong></td></tr>
        <tr><td>Address</td><td style="font-family:monospace;font-size:0.8rem;word-break:break-all">${v.address || 'N/A'}</td></tr>
        <tr><td>Spent From</td><td style="font-family:monospace;font-size:0.75rem;word-break:break-all">${v.txid}:${v.vout}</td></tr>
        <tr><td><span class="tooltip" data-tip="The sequence number controls RBF signaling and relative timelocks. Values below 0xFFFFFFFE signal RBF.">Sequence</span></td><td>0x${v.sequence.toString(16).toUpperCase().padStart(8,'0')} (${v.sequence})</td></tr>
        <tr><td><span class="tooltip" data-tip="BIP68 relative timelocks lock an input until a certain number of blocks or seconds have passed since the referenced output was confirmed.">Relative Timelock</span></td><td>${rlText}</td></tr>
        ${v.witness.length > 0 ? `<tr><td>Witness Items</td><td>${v.witness.length}</td></tr>` : ''}
      </table>
      <div class="tech-toggle" onclick="toggleTech(this)">Show technical details &#x25BC;</div>
      <div class="tech-details">
        <strong>scriptSig (hex):</strong> ${v.script_sig_hex || '(empty)'}<br>
        <strong>scriptSig (asm):</strong> ${v.script_asm || '(empty)'}<br>
        ${v.witness.length > 0 ? `<strong>Witness:</strong><br>${v.witness.map((w,j) => `  [${j}] ${w || '(empty)'}`).join('<br>')}<br>` : ''}
        ${v.witness_script_asm ? `<strong>Witness Script (asm):</strong> ${v.witness_script_asm}<br>` : ''}
        <strong>Prevout scriptPubKey:</strong> ${v.prevout.script_pubkey_hex}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="result-section">
    <h2>&#x1f4e5; Inputs (${tx.vin.length})</h2>
    <div class="content">${rows}</div>
  </div>`;
}

// Outputs detail

function renderOutputs(tx) {
  const rows = tx.vout.map(v => {
    let extra = '';
    if (v.script_type === 'op_return') {
      extra = `
        <tr><td>OP_RETURN Data (hex)</td><td style="font-family:monospace;font-size:0.75rem">${v.op_return_data_hex || '(empty)'}</td></tr>
        <tr><td>OP_RETURN Data (text)</td><td>${v.op_return_data_utf8 !== null ? esc(v.op_return_data_utf8) : '(non-UTF8 binary)'}</td></tr>
        <tr><td>Protocol</td><td>${v.op_return_protocol}</td></tr>`;
    }

    return `
    <div class="story-card">
      <h3>Output #${v.n}</h3>
      <table class="detail-table">
        <tr><td>Type</td><td><span class="type-badge">${scriptLabel(v.script_type)}</span></td></tr>
        <tr><td>Value</td><td><strong>${formatSats(v.value_sats)}</strong></td></tr>
        <tr><td>Address</td><td style="font-family:monospace;font-size:0.8rem;word-break:break-all">${v.address || 'N/A'}</td></tr>
        ${extra}
      </table>
      <div class="tech-toggle" onclick="toggleTech(this)">Show technical details &#x25BC;</div>
      <div class="tech-details">
        <strong>scriptPubKey (hex):</strong> ${v.script_pubkey_hex}<br>
        <strong>scriptPubKey (asm):</strong> ${v.script_asm}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="result-section">
    <h2>&#x1f4e4; Outputs (${tx.vout.length})</h2>
    <div class="content">${rows}</div>
  </div>`;
}

// Technical details

function renderTechDetails(tx) {
  return `
  <div class="result-section">
    <h2>&#x1f527; Full Technical Details</h2>
    <div class="content">
      <table class="detail-table">
        <tr><td>TXID</td><td style="font-family:monospace;font-size:0.8rem;word-break:break-all">
          ${tx.txid}
          <button class="btn-copy" data-copy="${esc(tx.txid)}" onclick="copyFromDataAttr(this)" title="Copy TXID">Copy</button>
        </td></tr>
        <tr><td><span class="tooltip" data-tip="The witness transaction ID includes witness data in the hash. For legacy transactions, this is null.">WTXID</span></td><td style="font-family:monospace;font-size:0.8rem;word-break:break-all">${tx.wtxid || 'null (legacy)'}</td></tr>
        <tr><td>Version</td><td>${tx.version}</td></tr>
        <tr><td>Locktime</td><td>${tx.locktime_value} (${tx.locktime_type})</td></tr>
        <tr><td>Size (bytes)</td><td>${tx.size_bytes}</td></tr>
        <tr><td>Weight (WU)</td><td>${tx.weight}</td></tr>
        <tr><td>Virtual Bytes</td><td>${tx.vbytes}</td></tr>
        <tr><td>SegWit</td><td>${tx.segwit ? 'Yes' : 'No'}</td></tr>
        <tr><td>RBF Signaling</td><td>${tx.rbf_signaling ? 'Yes' : 'No'}</td></tr>
        <tr><td>Network</td><td>${tx.network}</td></tr>
      </table>
      <div class="tech-toggle" onclick="toggleTech(this)">Show raw JSON &#x25BC;</div>
      <div class="tech-details"><pre>${esc(JSON.stringify(tx, null, 2))}</pre></div>
    </div>
  </div>`;
}

// Block results

function renderBlockResults(blocks) {
  const r = document.getElementById('results');
  r.innerHTML = '';
  window.__renderTarget = null;

  for (const block of blocks) {
    if (!block.ok) {
      r.innerHTML += `<div class="error-box"><h3>${esc(block.error.code)}</h3><p>${esc(block.error.message)}</p></div>`;
      continue;
    }

    const minedAt = new Date(block.block_header.timestamp * 1000).toLocaleString();
    r.innerHTML += `
    <div class="block-summary-card">
      <p>This block contains <strong>${block.tx_count}</strong> transactions and collected <strong>${formatSats(block.block_stats.total_fees_sats)}</strong> in fees. Mined at <strong>${minedAt}</strong>.</p>
    </div>
    <div class="result-section block-overview">
      <h2>&#x1f9f1; Block Overview</h2>
      <div class="content">
        <div class="stats-grid">
          <div class="stat-card"><div class="label">Block Hash</div><div class="val" style="font-size:0.6rem;word-break:break-all;font-family:monospace">${block.block_header.block_hash}</div></div>
          <div class="stat-card"><div class="label">Transactions</div><div class="val">${block.tx_count}</div></div>
          <div class="stat-card"><div class="label">Total Fees</div><div class="val" style="color:var(--orange)">${formatSats(block.block_stats.total_fees_sats)}</div></div>
          <div class="stat-card"><div class="label">Avg Fee Rate</div><div class="val">${block.block_stats.avg_fee_rate_sat_vb} sat/vB</div></div>
          <div class="stat-card"><div class="label">Total Weight</div><div class="val">${block.block_stats.total_weight} WU</div></div>
          <div class="stat-card"><div class="label">BIP34 Height</div><div class="val">${block.coinbase.bip34_height}</div></div>
          <div class="stat-card"><div class="label">Timestamp</div><div class="val" style="font-size:0.8rem">${new Date(block.block_header.timestamp * 1000).toISOString()}</div></div>
          <div class="stat-card"><div class="label">Merkle Valid</div><div class="val" style="color:${block.block_header.merkle_root_valid ? 'var(--green)' : 'var(--red)'}">${block.block_header.merkle_root_valid ? 'Yes' : 'No'}</div></div>
        </div>

        <h3 style="margin-top:20px;margin-bottom:12px">Script Type Summary</h3>
        <div class="stats-grid">
          ${Object.entries(block.block_stats.script_type_summary).map(([type, count]) =>
            `<div class="stat-card"><div class="label">${scriptLabel(type)}</div><div class="val">${count}</div></div>`
          ).join('')}
        </div>
      </div>
    </div>

    <div class="result-section">
      <h2>&#x1f4dc; Transactions (${block.tx_count})</h2>
      <div class="content" id="block-tx-list">
        ${block.transactions.map((tx, i) => `
          <div class="tx-list-item" onclick="toggleBlockTx(${i})">
            <span class="txid-short">${i === 0 ? '(coinbase) ' : ''}${tx.txid.slice(0, 16)}...${tx.txid.slice(-8)}</span>
            <span>${formatSats(tx.fee_sats)} fee</span>
          </div>
          <div class="tx-expanded" id="block-tx-${i}">
            <div id="block-tx-content-${i}"></div>
          </div>
        `).join('')}
      </div>
    </div>`;

    // Store block data for expansion
    window.__blockTxs = block.transactions;
  }
}

function toggleBlockTx(index) {
  const el = document.getElementById(`block-tx-${index}`);
  const contentEl = document.getElementById(`block-tx-content-${index}`);

  if (el.classList.contains('open')) {
    el.classList.remove('open');
    return;
  }

  if (!contentEl.innerHTML) {
    const tx = window.__blockTxs[index];
    window.__lastTx = tx;
    window.__renderTarget = contentEl;
    renderTransaction(tx, contentEl);
  }

  el.classList.add('open');
}

// Helpers

function formatSats(sats) {
  if (sats >= 100000000) return (sats / 100000000).toFixed(8) + ' BTC';
  return sats.toLocaleString() + ' sats';
}

function scriptLabel(type) {
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

function scriptLabelFriendly(type) {
  const friendly = {
    p2pkh: 'Standard address (starts with 1)',
    p2sh: 'Multisig / script address (starts with 3)',
    p2wpkh: 'SegWit address (starts with bc1)',
    p2wsh: 'SegWit multisig (starts with bc1)',
    p2tr: 'Modern address (Taproot)',
    op_return: 'Data storage (not spendable)',
    unknown: 'Unknown type',
    'p2sh-p2wpkh': 'Wrapped SegWit (starts with 3)',
    'p2sh-p2wsh': 'Wrapped SegWit multisig',
    p2tr_keypath: 'Taproot (single key)',
    p2tr_scriptpath: 'Taproot (script)',
  };
  return friendly[type] || scriptLabel(type);
}

function truncAddr(addr) {
  if (addr.length <= 20) return addr;
  return addr.slice(0, 12) + '...' + addr.slice(-8);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = 'Copied!';
      setTimeout(() => { btnEl.textContent = orig; }, 1500);
    }
  });
}

function copyFromDataAttr(btnEl) {
  const text = btnEl.getAttribute('data-copy');
  if (text) copyToClipboard(text, btnEl);
}

function toggleTech(el) {
  const details = el.nextElementSibling;
  details.classList.toggle('open');
  el.textContent = details.classList.contains('open') ? 'Hide technical details \u25B2' : 'Show technical details \u25BC';
}
