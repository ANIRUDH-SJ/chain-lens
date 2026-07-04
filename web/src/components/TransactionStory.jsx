import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretDown,
  CaretUp,
  ArrowsLeftRight,
  CurrencyCircleDollar,
  ChartBar,
  Warning,
  Lock,
  ClockCounterClockwise,
  ArrowRight,
  ArrowDown,
  CheckCircle,
  XCircle
} from '@phosphor-icons/react';
import {
  formatSats,
  formatSatsShort,
  scriptLabel,
  scriptLabelFriendly,
  scriptIcon,
  truncAddr,
  truncTxid,
  copyToClipboard,
} from '../utils';
import { CopyButton } from './CopyButton';
import { Tooltip } from './Tooltip';

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };

function Headline({ tx }) {
  const firstOutput = tx.vout.find((v) => v.script_type !== 'op_return');
  const amount = firstOutput ? formatSatsShort(firstOutput.value_sats) : formatSatsShort(tx.total_output_sats);
  const summary =
    tx.vin.length === 1 && tx.vout.length === 1
      ? `Sent ${amount} and paid ${formatSats(tx.fee_sats)} in fees`
      : `Moved ${formatSats(tx.total_input_sats)} from ${tx.vin.length} source(s) to ${tx.vout.length} destination(s). Fee: ${formatSats(tx.fee_sats)}`;

  return (
    <motion.div
      className="glass-card p-8 text-center mb-8 bg-gradient-to-b from-indigo-500/5 to-transparent"
      {...fadeUp}
    >
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium uppercase tracking-wide flex items-center gap-1">
          <CheckCircle weight="fill" /> Confirmed
        </span>
      </div>
      
      <div className="text-slate-400 text-sm mb-4 flex items-center justify-center gap-2">
        <Tooltip text="A unique fingerprint for this payment">
          <span className="text-slate-500">Transaction ID</span>
        </Tooltip>
        <span className="font-mono text-slate-300 bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
          {truncTxid(tx.txid)}
        </span>
        <CopyButton text={tx.txid} title="Copy" />
      </div>

      <h1 className="text-2xl md:text-3xl font-light text-slate-100 mb-2 tracking-tight leading-relaxed">
        {summary}
      </h1>
      <p className="text-slate-500 text-xs uppercase tracking-wider mt-4">
        Analyzed at {new Date().toLocaleString()}
      </p>
    </motion.div>
  );
}

function ValueFlowDiagram({ tx }) {
  return (
    <motion.section className="mb-8" {...fadeUp}>
      <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
        <ArrowsLeftRight size={20} className="text-indigo-400" />
        Value Flow
      </h2>
      <p className="text-slate-500 text-sm mb-6">
        Money flows from left (sources) to right (destinations). Fees go to miners who process the transaction.
      </p>

      <div className="flex flex-col lg:flex-row items-stretch gap-6">
        {/* Inputs */}
        <div className="flex-1 glass-card p-6">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Money coming from
          </h3>
          <div className="space-y-3">
            {tx.vin.map((v, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-slate-950/30 border-l-4 border-indigo-500 hover:bg-slate-900/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg opacity-80">{scriptIcon(v.script_type)}</span>
                  <span className="text-xs font-medium text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                    {scriptLabelFriendly(v.script_type)}
                  </span>
                </div>
                <div className="text-lg font-medium text-slate-100 mb-1">
                  {formatSats(v.prevout.value_sats)}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                  {truncAddr(v.address)}
                  {v.address && <CopyButton text={v.address} title="Copy" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flow Indicator */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="glass-card p-4 text-center border-amber-500/20 bg-amber-500/5 min-w-[120px]">
            <Tooltip text="Fees go to miners who process this transaction">
              <span className="text-xs font-medium text-amber-500 uppercase tracking-wide">Miner Fee</span>
            </Tooltip>
            <div className="text-lg font-semibold text-amber-400 mt-1">
              {formatSats(tx.fee_sats)}
            </div>
          </div>
          <div className="text-slate-600 my-4 flex justify-center">
            <ArrowDown size={24} className="lg:hidden animate-bounce" />
            <ArrowRight size={24} className="hidden lg:block animate-pulse" />
          </div>
        </div>

        {/* Outputs */}
        <div className="flex-1 glass-card p-6">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Money going to
          </h3>
          <div className="space-y-3">
            {tx.vout.map((v, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border-l-4 transition-colors ${
                  v.script_type === 'op_return'
                    ? 'bg-slate-950/30 border-pink-500 hover:bg-slate-900/50'
                    : 'bg-slate-950/30 border-emerald-500 hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg opacity-80">
                    {v.script_type === 'op_return' ? '📝' : scriptIcon(v.script_type)}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    v.script_type === 'op_return' 
                      ? 'text-pink-300 bg-pink-500/10' 
                      : 'text-emerald-300 bg-emerald-500/10'
                  }`}>
                    {v.script_type === 'op_return'
                      ? 'Data storage'
                      : scriptLabelFriendly(v.script_type)}
                  </span>
                </div>
                <div className="text-lg font-medium text-slate-100 mb-1">
                  {v.script_type === 'op_return' ? '—' : formatSats(v.value_sats)}
                </div>
                {v.script_type === 'op_return' ? (
                  <div className="text-sm text-slate-500 italic font-mono bg-slate-900/50 p-2 rounded border border-slate-800/50">
                    {v.op_return_data_utf8 || '(binary data)'}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                    {truncAddr(v.address)}
                    {v.address && <CopyButton text={v.address} title="Copy" />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function TheCosts({ tx }) {
  const hasHighFee = tx.warnings?.some((w) => w.code === 'HIGH_FEE');
  const feeLevel = hasHighFee ? 'high' : tx.fee_rate_sat_vb > 50 ? 'above' : 'average';

  return (
    <motion.section className="mb-8" {...fadeUp}>
      <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
        <CurrencyCircleDollar size={20} className="text-amber-400" />
        The Costs
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 flex flex-col justify-between">
          <Tooltip text="The amount paid to miners to include your transaction">
            <span className="text-sm text-slate-500 font-medium uppercase tracking-wider">Total Fee</span>
          </Tooltip>
          <div className="text-3xl font-light text-amber-400 mt-2">
            {formatSats(tx.fee_sats)}
          </div>
        </div>
        <div className="glass-card p-6 flex flex-col justify-between">
          <Tooltip text="Fee per virtual byte — miners prioritize higher fee rates">
            <span className="text-sm text-slate-500 font-medium uppercase tracking-wider">Fee Rate</span>
          </Tooltip>
          <div className="text-3xl font-light text-slate-100 mt-2">
            {tx.fee_rate_sat_vb} <span className="text-sm text-slate-500">sats/vB</span>
          </div>
        </div>
      </div>
      
      <div className="mt-6 glass-card p-6">
        <div className="flex justify-between text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">
          <span>Low Priority</span>
          <span>Standard</span>
          <span>High Priority</span>
        </div>
        <div className="h-3 bg-slate-900 rounded-full overflow-hidden flex relative">
          <div className="w-1/3 border-r border-slate-800 bg-slate-800/30" />
          <div className="w-1/3 border-r border-slate-800 bg-slate-800/30" />
          <div className="w-1/3 bg-slate-800/30" />
          
          {/* Indicator */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: feeLevel === 'high' ? '100%' : feeLevel === 'above' ? '66%' : '33%' }}
            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${
              feeLevel === 'high' ? 'bg-amber-500' : feeLevel === 'above' ? 'bg-emerald-500/70' : 'bg-emerald-500'
            }`}
          />
        </div>
        <p className="text-sm text-slate-400 mt-3 flex items-center gap-2">
          This fee is considered 
          <span
            className={`font-medium px-2 py-0.5 rounded ${
              feeLevel === 'high' ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'
            }`}
          >
            {feeLevel.toUpperCase()}
          </span>
          for current network conditions.
        </p>
      </div>

      {hasHighFee && (
        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <Warning size={24} className="text-amber-400 shrink-0" />
          <p className="text-amber-200 text-sm">
            <strong>Heads up:</strong> This transaction paid an unusually high fee. This might be intentional for fast confirmation, or a wallet misconfiguration.
          </p>
        </div>
      )}
    </motion.section>
  );
}

function SizeAndEfficiency({ tx }) {
  if (!tx.segwit_savings) {
    return (
      <motion.section className="mb-8" {...fadeUp}>
        <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
          <ChartBar size={20} className="text-indigo-400" />
          Transaction Size
        </h2>
        <div className="glass-card p-6">
          <p className="text-slate-400">
            Size: <span className="text-slate-200 font-mono">{tx.size_bytes} bytes</span> • Weight: <span className="text-slate-200 font-mono">{tx.weight} units</span>
          </p>
          <p className="text-slate-500 text-sm mt-2">Legacy format (no SegWit savings)</p>
        </div>
      </motion.section>
    );
  }

  const s = tx.segwit_savings;
  const pct = Math.round(s.savings_pct);
  const actualPct = Math.round((s.weight_actual / s.weight_if_legacy) * 100);

  return (
    <motion.section className="mb-8" {...fadeUp}>
      <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
        <ChartBar size={20} className="text-indigo-400" />
        Size & Efficiency
      </h2>
      <div className="glass-card p-6">
        <p className="text-slate-400 mb-6 leading-relaxed">
          ✨ This transaction used <strong>SegWit</strong> optimization and saved{' '}
          <span className="text-emerald-400 font-medium px-1.5 py-0.5 bg-emerald-500/10 rounded">{pct}%</span> on fees compared to
          old-style transactions.
        </p>
        
        <div className="space-y-4 mb-6">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-500">Efficiency</span>
              <span className="text-emerald-400 font-medium">{100 - actualPct}% Saved</span>
            </div>
            <div className="h-4 bg-slate-900 rounded-full overflow-hidden relative border border-slate-800">
              <div className="absolute inset-0 bg-slate-800/50 w-full" />
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: `${actualPct}%` }}
                className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full transition-all duration-1000"
              />
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>Actual Weight: {s.weight_actual} WU</span>
              <span>Legacy Equivalent: {s.weight_if_legacy} WU</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900/30 p-4 rounded-xl border border-slate-800/50">
          <div>
            <span className="text-slate-500 block text-xs uppercase mb-1">Witness Data</span>
            <div className="font-mono text-slate-300">{s.witness_bytes} bytes</div>
          </div>
          <div>
            <span className="text-slate-500 block text-xs uppercase mb-1">Non-witness</span>
            <div className="font-mono text-slate-300">{s.non_witness_bytes} bytes</div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function SpecialFeatures({ tx }) {
  const features = [];
  if (tx.rbf_signaling) {
    features.push({
      icon: <ClockCounterClockwise size={24} weight="light" />,
      title: 'Replaceable (RBF)',
      desc: 'This transaction can be "bumped" with a higher fee if it gets stuck.',
    });
  }
  if (tx.locktime_type !== 'none') {
    features.push({
      icon: <Lock size={24} weight="light" />,
      title: 'Time-locked',
      desc:
        tx.locktime_type === 'block_height'
          ? `Cannot be mined until block height ${tx.locktime_value}`
          : `Cannot be mined until ${new Date(tx.locktime_value * 1000).toLocaleString()}`,
    });
  }
  if (features.length === 0) return null;

  return (
    <motion.section className="mb-8" {...fadeUp}>
      <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
        <Lock size={20} className="text-indigo-400" />
        Special Features
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((f, i) => (
          <div key={i} className="glass-card p-5 flex items-start gap-4 hover:bg-slate-800/40 transition-colors">
            <span className="text-indigo-400 p-2 bg-indigo-500/10 rounded-lg">{f.icon}</span>
            <div>
              <div className="font-medium text-slate-200 mb-1">{f.title}</div>
              <div className="text-sm text-slate-400 leading-snug">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

const WARNING_CONFIG = {
  HIGH_FEE: {
    icon: '💸',
    title: 'Expensive fee detected',
    color: 'amber',
    what: 'This transaction paid a higher-than-usual fee.',
    worry: 'Might be intentional for fast confirmation. Double-check before sending.',
  },
  DUST_OUTPUT: {
    icon: '⚠️',
    title: 'Tiny output detected',
    color: 'amber',
    what: 'An output has less than 546 satoshis (dust limit).',
    worry: 'This might cost more to spend than it\'s worth in the future.',
  },
  UNKNOWN_OUTPUT_SCRIPT: {
    icon: '❓',
    title: 'Unrecognized output type',
    color: 'red',
    what: 'An output uses a non-standard script type.',
    worry: 'Proceed with caution. Some wallets may not support it.',
  },
  RBF_SIGNALING: {
    icon: '🔄',
    title: 'Replaceable transaction',
    color: 'blue',
    what: 'This transaction can be replaced with a higher-fee version.',
    worry: 'Normal for many wallets. Useful if your transaction is stuck.',
  },
};

function WarningsSectionFixed({ tx }) {
  const [expanded, setExpanded] = useState({});
  if (!tx.warnings?.length) return null;

  return (
    <motion.section className="mb-8" {...fadeUp}>
      <h2 className="text-lg font-medium text-slate-300 mb-4 flex items-center gap-2">
        <Warning size={20} className="text-amber-400" />
        Warnings & Risks
      </h2>
      <div className="space-y-3">
        {tx.warnings.map((w) => {
          const config = WARNING_CONFIG[w.code] || {
            icon: '⚠️',
            title: w.code,
            color: 'slate',
            what: 'See technical details for more.',
            worry: 'Review before proceeding.',
          };
          const isExpanded = expanded[w.code];
          return (
            <div
              key={w.code}
              className={`glass-card p-4 cursor-pointer transition-all ${
                config.color === 'amber'
                  ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                  : config.color === 'red'
                    ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
                    : config.color === 'blue'
                      ? 'border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10'
                      : ''
              }`}
              onClick={() => setExpanded((s) => ({ ...s, [w.code]: !s[w.code] }))}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{config.icon}</span>
                  <span className={`font-medium ${
                    config.color === 'amber' ? 'text-amber-200' : 
                    config.color === 'red' ? 'text-red-200' : 'text-slate-200'
                  }`}>{config.title}</span>
                </div>
                {isExpanded ? <CaretUp size={20} className="text-slate-500" /> : <CaretDown size={20} className="text-slate-500" />}
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 pt-4 border-t border-slate-700/50 space-y-2 text-sm text-slate-400"
                  >
                    <p><strong>What this means:</strong> {config.what}</p>
                    <p><strong>Should I worry?</strong> {config.worry}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function TechnicalDetails({ tx }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.section className="mb-8" {...fadeUp}>
      <button
        type="button"
        className="w-full glass-card p-4 flex items-center justify-between text-left hover:bg-slate-800/60 transition-colors group"
        onClick={() => setOpen(!open)}
      >
        <span className="text-slate-400 group-hover:text-slate-200 transition-colors text-sm font-medium">
          Show technical details (JSON)
        </span>
        {open ? <CaretUp size={20} className="text-slate-500" /> : <CaretDown size={20} className="text-slate-500" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 glass-card p-0 overflow-hidden bg-slate-950/50"
          >
            <div className="flex justify-end p-2 border-b border-slate-800/50">
               <CopyButton text={JSON.stringify(tx, null, 2)} title="Copy JSON" />
            </div>
            <pre className="text-xs text-slate-500 font-mono overflow-x-auto max-h-96 overflow-y-auto p-4 custom-scrollbar">
              {JSON.stringify(tx, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export function TransactionStory({ tx }) {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <Headline tx={tx} />
      <ValueFlowDiagram tx={tx} />
      <TheCosts tx={tx} />
      <SizeAndEfficiency tx={tx} />
      <SpecialFeatures tx={tx} />
      <WarningsSectionFixed tx={tx} />
      <TechnicalDetails tx={tx} />
    </div>
  );
}
