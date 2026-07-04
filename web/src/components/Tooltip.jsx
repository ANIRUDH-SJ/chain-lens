import { useState } from 'react';

export function Tooltip({ children, text, term }) {
  const [show, setShow] = useState(false);
  // Optional: if you had a global glossary map attached to window
  const def = term && typeof window !== 'undefined' && window.__GLOSSARY?.[term];
  const displayText = def || text;

  if (!displayText) return children;

  return (
    <span
      className="relative inline-block group"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span 
        className="border-b border-dashed border-slate-500/50 cursor-help group-hover:border-indigo-400 group-hover:text-indigo-300 transition-colors" 
        tabIndex={0}
      >
        {children}
      </span>
      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] sm:max-w-xs px-3 py-2 text-xs sm:text-sm bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-xl shadow-black/50 z-50 text-slate-200 pointer-events-none"
          role="tooltip"
        >
          {displayText}
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/90 border-r border-b border-slate-700/50 rotate-45" />
        </span>
      )}
    </span>
  );
}
