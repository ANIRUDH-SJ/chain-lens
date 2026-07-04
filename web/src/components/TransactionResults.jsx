import { useState } from 'react';
import {
  formatSats,
  scriptLabel,
  scriptLabelFriendly,
  truncAddr,
} from '../utils';
import { CopyButton } from './CopyButton';

function TechToggle({ children, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="tech-toggle"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}
        role="button"
        tabIndex={0}
      >
        {open ? 'Hide technical details ▲' : `${label} ▼`}
      </div>
      <div className={`tech-details ${open ? 'open' : ''}`}>{children}</div>
    </>
  );
}

export function ViewToggle({ viewMode, onViewChange, onGlossary }) {
  return (
    <div className="view-toggle-bar">
      <span className="view-toggle-label">View:</span>
      <button
        type="button"
        className={`view-toggle-btn ${viewMode === 'simple' ? 'active' : ''}`}
        onClick={() => onViewChange('simple')}
      >
        Simple
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${viewMode === 'detailed' ? 'active' : ''}`}
        onClick={() => onViewChange('detailed')}
      >
        Detailed
      </button>
      <button type="button" className="btn-glossary" onClick={onGlossary}>
        Learn more
      </button>
    </div>
  );
}

export function StorySection({ tx }) {
  const inputDesc =
    tx.vin.length === 1
      ? `1 source (${scriptLabelFriendly(tx.vin[0].script_type)})`
      : `${tx.vin.length} sources`;
  const outputDesc =
    tx.vout.length === 1 ? '1 destination' : `${tx.vout.length} destinations`;

  return (
    <div className="result-section">
      <h2>📖 What Happened?</h2>
      <p className="section-desc">A plain-English summary of this transaction</p>
      <div className="content">
        <div className="story-card">
          <h3>Transaction Overview</h3>
          <p>
            This transaction takes Bitcoin from <span className="value">{inputDesc}</span> and
            sends it to <span className="value">{outputDesc}</span>. It moves{' '}
            <span className="value">{formatSats(tx.total_input_sats)}</span> of Bitcoin.
          </p>
        </div>
        <div className="story-card">
          <h3>Fee Paid to Miners</h3>
          <p>
            The sender paid <span className="value">{formatSats(tx.fee_sats)}</span> in fees (fee
            rate: <span className="value">{tx.fee_rate_sat_vb} sat/vB</span>). Miners include
            transactions with higher fees first, so this transaction was likely confirmed quickly.
            The fee goes to the miner who confirms the transaction.
          </p>
        </div>
        <div className="story-card">
          <h3>Transaction Size</h3>
          <p>
            This transaction is <span className="value">{tx.size_bytes} bytes</span>.
            {tx.segwit ? (
              <>
                It uses <span className="tooltip" data-tip="Efficient format — lower fees">
                  SegWit
                </span>
                , which reduces the effective size and fees.
              </>
            ) : (
              'It uses the legacy format.'
            )}
          </p>
        </div>
        {tx.rbf_signaling && (
          <div className="story-card">
            <h3>⚠️ Replaceable</h3>
            <p>
              This transaction is{' '}
              <span className="tooltip" data-tip="Replaceable — sender can bump fee before confirmation">
                replaceable
              </span>
              . The sender can replace it with a higher-fee version before it&apos;s confirmed.
            </p>
          </div>
        )}
        {tx.locktime_type !== 'none' && (
          <div className="story-card">
            <h3>🔒 Time-Locked</h3>
            <p>
              This transaction is locked until{' '}
              <span className="value">
                {tx.locktime_type === 'block_height'
                  ? `block ${tx.locktime_value}`
                  : new Date(tx.locktime_value * 1000).toLocaleString()}
              </span>
              . It cannot be included in a block before then.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function FlowDiagram({ tx }) {
  return (
    <div className="result-section">
      <h2>💰 Value Flow</h2>
      <p className="section-desc">
        Where Bitcoin came from and where it went. Money flows from left (sources) to right
        (destinations).
      </p>
      <div className="content">
        <div className="flow-diagram">
          <div className="flow-col">
            <h4>
              <span className="tooltip" data-tip="Where the money came from">
                Where the money came from
              </span>{' '}
              ({formatSats(tx.total_input_sats)})
            </h4>
            {tx.vin.map((v, i) => (
              <div key={i} className="flow-item input">
                <div
                  className="type-badge tooltip"
                  data-tip={scriptLabelFriendly(v.script_type)}
                >
                  {scriptLabel(v.script_type)}
                </div>
                <div className="amount">{formatSats(v.prevout.value_sats)}</div>
                <div className="address-row">
                  <span className="address">{truncAddr(v.address)}</span>
                  {v.address && <CopyButton text={v.address} title="Copy" />}
                </div>
              </div>
            ))}
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-col">
            <h4>
              <span className="tooltip" data-tip="Where the money went">
                Where the money went
              </span>{' '}
              ({formatSats(tx.total_output_sats)})
            </h4>
            {tx.vout.map((v, i) => (
              <div
                key={i}
                className={`flow-item output ${v.script_type === 'op_return' ? 'op-return' : ''}`}
              >
                <div
                  className="type-badge tooltip"
                  data-tip={scriptLabelFriendly(v.script_type)}
                >
                  {scriptLabel(v.script_type)}
                </div>
                <div className="amount">
                  {v.script_type === 'op_return' ? '—' : formatSats(v.value_sats)}
                </div>
                {v.script_type === 'op_return' ? (
                  <div className="address op-return-label">
                    Data (not Bitcoin): {v.op_return_data_utf8 ?? '(binary data)'}
                  </div>
                ) : (
                  <div className="address-row">
                    <span className="address">{truncAddr(v.address)}</span>
                    {v.address && <CopyButton text={v.address} title="Copy" />}
                  </div>
                )}
              </div>
            ))}
            <div className="flow-item fee">
              <div className="type-badge">Miner Fee</div>
              <div className="amount">{formatSats(tx.fee_sats)}</div>
              <div className="address">Goes to the miner who confirms this transaction</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsGrid({ tx, viewMode }) {
  const simpleStats = (
    <>
      <div className="stat-card">
        <div className="label">Total Moved</div>
        <div className="val">{formatSats(tx.total_input_sats)}</div>
      </div>
      <div className="stat-card">
        <div className="label">Fee Paid</div>
        <div className="val" style={{ color: 'var(--orange)' }}>
          {formatSats(tx.fee_sats)}
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Fee Rate</div>
        <div className="val">{tx.fee_rate_sat_vb} sat/vB</div>
      </div>
      <div className="stat-card">
        <div className="label">Sources</div>
        <div className="val" style={{ color: 'var(--blue)' }}>
          {tx.vin.length}
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Destinations</div>
        <div className="val" style={{ color: 'var(--green)' }}>
          {tx.vout.length}
        </div>
      </div>
    </>
  );

  const fullStats = (
    <>
      {simpleStats}
      <div className="stat-card">
        <div className="label">Transaction ID</div>
        <div
          className="val"
          style={{
            fontSize: '0.7rem',
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {tx.txid}
          <CopyButton text={tx.txid} title="Copy" />
        </div>
      </div>
      <div className="stat-card">
        <div className="label">Size</div>
        <div className="val">{tx.vbytes} vB</div>
      </div>
      <div className="stat-card">
        <div className="label">Weight</div>
        <div className="val">{tx.weight} WU</div>
      </div>
      <div className="stat-card">
        <div className="label">Format</div>
        <div
          className="val"
          style={{ color: tx.segwit ? 'var(--green)' : 'var(--text2)' }}
        >
          {tx.segwit ? 'SegWit (efficient)' : 'Legacy'}
        </div>
      </div>
    </>
  );

  return (
    <div className="result-section">
      <h2>📊 Key Metrics</h2>
      <p className="section-desc">Numbers that matter</p>
      <div className="content">
        <div className="stats-grid">{viewMode === 'simple' ? simpleStats : fullStats}</div>
      </div>
    </div>
  );
}

const WARNING_DESCS = {
  HIGH_FEE: 'Unusually high fee — double-check before sending',
  DUST_OUTPUT: 'Very small output — may be unspendable',
  RBF_SIGNALING: 'Transaction can be replaced with higher fee',
  UNKNOWN_OUTPUT_SCRIPT: 'Non-standard output type',
};

export function Warnings({ tx }) {
  if (!tx.warnings?.length) return null;
  return (
    <div className="result-section">
      <h2>⚠️ Warnings</h2>
      <div className="content">
        {tx.warnings.map((w) => (
          <div key={w.code} className={`warning-item ${w.code}`}>
            {WARNING_DESCS[w.code] || w.code}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SegwitSavings({ tx }) {
  const s = tx.segwit_savings;
  if (!s) return null;
  const pct = s.savings_pct;
  const actualPct = Math.round((s.weight_actual / s.weight_if_legacy) * 100);

  return (
    <div className="result-section">
      <h2>💾 SegWit Discount</h2>
      <div className="content">
        <p style={{ marginBottom: '12px', color: 'var(--text2)' }}>
          <span className="tooltip" data-tip="SegWit (Segregated Witness) separates signature data from transaction data, giving it a 75% discount on weight.">
            SegWit
          </span>{' '}
          reduces this transaction&apos;s effective weight by{' '}
          <strong style={{ color: 'var(--green)' }}>{pct}%</strong>.
        </p>
        <div className="savings-bar">
          <div className="bar-label">
            <span>Actual weight: {s.weight_actual} WU</span>
            <span>Legacy equivalent: {s.weight_if_legacy} WU</span>
          </div>
          <div className="bar-container">
            <div className="bar-fill bar-actual" style={{ width: `${actualPct}%` }}>
              {actualPct}%
            </div>
          </div>
        </div>
        <div className="stats-grid" style={{ marginTop: '16px' }}>
          <div className="stat-card">
            <div className="label">Witness Data</div>
            <div className="val">{s.witness_bytes} bytes</div>
          </div>
          <div className="stat-card">
            <div className="label">Non-Witness Data</div>
            <div className="val">{s.non_witness_bytes} bytes</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Size</div>
            <div className="val">{s.total_bytes} bytes</div>
          </div>
          <div className="stat-card">
            <div className="label">Savings</div>
            <div className="val" style={{ color: 'var(--green)' }}>
              {pct}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InputsDetail({ tx }) {
  return (
    <div className="result-section">
      <h2>📥 Inputs ({tx.vin.length})</h2>
      <div className="content">
        {tx.vin.map((v, i) => {
          const rl = v.relative_timelock;
          const rlText = rl.enabled
            ? `${rl.type === 'blocks' ? rl.value + ' blocks' : rl.value + ' seconds'}`
            : 'Disabled';

          return (
            <div key={i} className="story-card">
              <h3>Input #{i}</h3>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td>Type</td>
                    <td>
                      <span className="type-badge">{scriptLabel(v.script_type)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Value</td>
                    <td>
                      <strong>{formatSats(v.prevout.value_sats)}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Address</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                      {v.address || 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td>Spent From</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {v.txid}:{v.vout}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="tooltip" data-tip="The sequence number controls RBF signaling and relative timelocks.">
                        Sequence
                      </span>
                    </td>
                    <td>0x{v.sequence.toString(16).toUpperCase().padStart(8, '0')} ({v.sequence})</td>
                  </tr>
                  <tr>
                    <td>
                      <span className="tooltip" data-tip="BIP68 relative timelocks lock an input until a certain number of blocks or seconds have passed.">
                        Relative Timelock
                      </span>
                    </td>
                    <td>{rlText}</td>
                  </tr>
                  {v.witness.length > 0 && (
                    <tr>
                      <td>Witness Items</td>
                      <td>{v.witness.length}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <TechToggle label="Show technical details">
                <strong>scriptSig (hex):</strong> {v.script_sig_hex || '(empty)'}
                <br />
                <strong>scriptSig (asm):</strong> {v.script_asm || '(empty)'}
                <br />
                {v.witness.length > 0 && (
                  <>
                    <strong>Witness:</strong>
                    <br />
                    {v.witness.map((w, j) => (
                      <span key={j}>
                        {'  '}[{j}] {w || '(empty)'}
                        <br />
                      </span>
                    ))}
                  </>
                )}
                {v.witness_script_asm && (
                  <>
                    <strong>Witness Script (asm):</strong> {v.witness_script_asm}
                    <br />
                  </>
                )}
                <strong>Prevout scriptPubKey:</strong> {v.prevout.script_pubkey_hex}
              </TechToggle>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OutputsDetail({ tx }) {
  return (
    <div className="result-section">
      <h2>📤 Outputs ({tx.vout.length})</h2>
      <div className="content">
        {tx.vout.map((v) => (
          <div key={v.n} className="story-card">
            <h3>Output #{v.n}</h3>
            <table className="detail-table">
              <tbody>
                <tr>
                  <td>Type</td>
                  <td>
                    <span className="type-badge">{scriptLabel(v.script_type)}</span>
                  </td>
                </tr>
                <tr>
                  <td>Value</td>
                  <td>
                    <strong>{formatSats(v.value_sats)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Address</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    {v.address || 'N/A'}
                  </td>
                </tr>
                {v.script_type === 'op_return' && (
                  <>
                    <tr>
                      <td>OP_RETURN Data (hex)</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {v.op_return_data_hex || '(empty)'}
                      </td>
                    </tr>
                    <tr>
                      <td>OP_RETURN Data (text)</td>
                      <td>{v.op_return_data_utf8 !== null ? v.op_return_data_utf8 : '(non-UTF8 binary)'}</td>
                    </tr>
                    <tr>
                      <td>Protocol</td>
                      <td>{v.op_return_protocol}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            <TechToggle label="Show technical details">
              <strong>scriptPubKey (hex):</strong> {v.script_pubkey_hex}
              <br />
              <strong>scriptPubKey (asm):</strong> {v.script_asm}
            </TechToggle>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TechDetails({ tx }) {
  return (
    <div className="result-section">
      <h2>🔧 Full Technical Details</h2>
      <div className="content">
        <table className="detail-table">
          <tbody>
            <tr>
              <td>TXID</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {tx.txid}
                <CopyButton text={tx.txid} title="Copy" />
              </td>
            </tr>
            <tr>
              <td>
                <span className="tooltip" data-tip="The witness transaction ID includes witness data in the hash.">
                  WTXID
                </span>
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                {tx.wtxid || 'null (legacy)'}
              </td>
            </tr>
            <tr>
              <td>Version</td>
              <td>{tx.version}</td>
            </tr>
            <tr>
              <td>Locktime</td>
              <td>
                {tx.locktime_value} ({tx.locktime_type})
              </td>
            </tr>
            <tr>
              <td>Size (bytes)</td>
              <td>{tx.size_bytes}</td>
            </tr>
            <tr>
              <td>Weight (WU)</td>
              <td>{tx.weight}</td>
            </tr>
            <tr>
              <td>Virtual Bytes</td>
              <td>{tx.vbytes}</td>
            </tr>
            <tr>
              <td>SegWit</td>
              <td>{tx.segwit ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td>RBF Signaling</td>
              <td>{tx.rbf_signaling ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td>Network</td>
              <td>{tx.network}</td>
            </tr>
          </tbody>
        </table>
        <TechToggle label="Show raw JSON">
          <pre>{JSON.stringify(tx, null, 2)}</pre>
        </TechToggle>
      </div>
    </div>
  );
}
