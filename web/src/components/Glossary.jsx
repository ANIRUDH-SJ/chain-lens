import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { GLOSSARY_TERMS, GLOSSARY } from '../utils';

const allTerms = [
  ...GLOSSARY_TERMS,
  ...Object.entries(GLOSSARY).map(([term, def]) => ({ term, def })),
];

const uniqueTerms = Array.from(
  new Map(allTerms.map((t) => [t.term, t])).values()
).sort((a, b) => a.term.localeCompare(b.term));

export function Glossary({ open, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="glossary-title"
    >
      <div className="glass-card max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 id="glossary-title" className="text-lg font-medium text-slate-200">
            Glossary
          </h2>
          <button
            type="button"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={24} weight="light" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <dl className="space-y-4">
            {uniqueTerms.map(({ term, def }) => (
              <div key={term}>
                <dt className="font-medium text-blue-400 mb-1">{term}</dt>
                <dd className="text-sm text-slate-500 leading-relaxed">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
