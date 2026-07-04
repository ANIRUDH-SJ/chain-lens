import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cube, CaretDown, CaretUp, Gift } from '@phosphor-icons/react';
import { formatSats, scriptLabel, truncTxid } from '../utils';
import { TransactionStory } from './TransactionStory';
import { CopyButton } from './CopyButton';

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };

export function BlockResults({ blocks }) {
  return (
    <>
      {blocks.map((block, blockIdx) => {
        if (!block.ok) {
          return (
            <div
              key={blockIdx}
              className="glass-card p-6 border-red-500/30 mb-8"
            >
              <h3 className="text-red-400 font-medium">{block.error?.code}</h3>
              <p className="text-slate-400 text-sm">{block.error?.message}</p>
            </div>
          );
        }

        const minedAt = new Date(block.block_header.timestamp * 1000).toLocaleString();

        return (
          <motion.div key={blockIdx} {...fadeUp}>
            {/* Block Overview Card */}
            <div className="glass-card p-8 mb-8">
              <h2 className="text-lg font-medium text-slate-300 mb-6 flex items-center gap-2">
                <Cube size={20} weight="light" />
                Block Overview
              </h2>
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <span className="font-mono text-sm text-slate-500">
                  {truncTxid(block.block_header.block_hash)}
                </span>
                <CopyButton text={block.block_header.block_hash} title="Copy hash" />
              </div>
              <p className="text-slate-400 mb-6">
                Block #{block.coinbase.bip34_height} • {block.tx_count} payments • Mined at {minedAt}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/50">
                  <div className="text-xs text-slate-500 uppercase">Total Fees</div>
                  <div className="flex items-center gap-1 text-lg font-medium text-amber-400" title={formatSats(block.block_stats.total_fees_sats)}>
                    <span className="truncate">
                      {formatSats(block.block_stats.total_fees_sats).split(' ').slice(0, -1).join(' ')}
                    </span>
                    <span className="shrink-0">
                      {formatSats(block.block_stats.total_fees_sats).split(' ').pop()}
                    </span>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/50">
                  <div className="text-xs text-slate-500 uppercase">Avg Fee Rate</div>
                  <div className="text-lg font-medium">{block.block_stats.avg_fee_rate_sat_vb} sat/vB</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/50">
                  <div className="text-xs text-slate-500 uppercase">Total Weight</div>
                  <div className="text-lg font-medium">{block.block_stats.total_weight} WU</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/50">
                  <div className="text-xs text-slate-500 uppercase">Integrity</div>
                  <div
                    className={`text-lg font-medium ${
                      block.block_header.merkle_root_valid ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {block.block_header.merkle_root_valid ? '✓ Verified' : '✗ Invalid'}
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-sm text-slate-500 uppercase mb-3">Script Type Breakdown</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(block.block_stats.script_type_summary).map(([type, count]) => (
                    <span
                      key={type}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-sm"
                    >
                      {scriptLabel(type)}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div className="mb-8">
              <h2 className="text-lg font-medium text-slate-300 mb-4">
                Transactions ({block.tx_count})
              </h2>
              <div className="space-y-2">
                {block.transactions.map((tx, i) => (
                  <BlockTxItem key={i} tx={tx} index={i} />
                ))}
              </div>
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

function BlockTxItem({ tx, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-card overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-3">
          {index === 0 ? (
            <span className="text-amber-400" title="Block reward">
              <Gift size={20} weight="light" />
            </span>
          ) : (
            <span className="text-slate-600">#{index}</span>
          )}
          <span className="font-mono text-sm text-slate-400">
            {index === 0 ? 'Coinbase' : truncTxid(tx.txid)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-amber-400 text-sm">{formatSats(tx.fee_sats)} fee</span>
          <span className="text-slate-500 text-sm">
            {tx.vin.length} in → {tx.vout.length} out
          </span>
          {expanded ? <CaretUp size={20} /> : <CaretDown size={20} />}
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="border-t border-slate-700"
          >
            <div className="p-6 bg-slate-900/30">
              <TransactionStory tx={tx} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
