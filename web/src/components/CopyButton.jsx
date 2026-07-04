import { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';

export function CopyButton({ text, title = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="light" />}
      {copied ? 'Copied' : title}
    </button>
  );
}
