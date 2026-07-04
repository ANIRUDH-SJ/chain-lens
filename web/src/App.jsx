import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlass,
  Cube,
  FileCode,
  Upload,
  SpinnerGap,
  CaretRight,
  BookOpen,
  ArrowLeft,
  GithubLogo,
  CheckCircle,
  XCircle,
  Code
} from '@phosphor-icons/react';
import { Toaster } from 'react-hot-toast';
import { analyzeTransaction, analyzeBlock, fileToBase64 } from './api';
import { SAMPLE_FIXTURE } from './utils';
import { exportTransactionPdf } from './exportPdf';
import { Glossary } from './components/Glossary';
import { TransactionStory } from './components/TransactionStory';
import { BlockResults } from './components/BlockResults';
import toast from 'react-hot-toast';

export default function App() {
  const [activeTab, setActiveTab] = useState('transaction');
  const [showInput, setShowInput] = useState(false);
  const [fixtureInput, setFixtureInput] = useState('');
  const [blkFileName, setBlkFileName] = useState(null);
  const [revFileName, setRevFileName] = useState(null);
  const [xorFileName, setXorFileName] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);
  const [txResult, setTxResult] = useState(null);
  const [blockResults, setBlockResults] = useState(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const blkFileRef = useRef(null);
  const revFileRef = useRef(null);
  const xorFileRef = useRef(null);

  // Clear results when switching tabs, but stay in input mode if active
  useEffect(() => {
    setTxResult(null);
    setBlockResults(null);
    setError(null);
    // Removed setShowInput(false) to prevent jumping back to home
  }, [activeTab]);

  const hasResults = txResult || (blockResults && blockResults.length > 0);

  const prefillSample = useCallback(() => {
    setActiveTab('transaction');
    setFixtureInput(JSON.stringify(SAMPLE_FIXTURE, null, 2));
    setShowInput(true);
    toast.success('Sample transaction loaded! Click "Analyze" to continue.');
  }, []);

  const prefillSampleBlock = useCallback(() => {
    setActiveTab('block');
    setBlkFileName('blk00000.dat (Sample)');
    setRevFileName('rev00000.dat (Sample)');
    setXorFileName('xor.dat (Sample)');
    setShowInput(true);
    toast.success('Sample block files loaded! Click "Parse Block Files" to continue.');
  }, []);

  const handleAnalyzeTx = useCallback(async () => {
    if (!fixtureInput.trim()) {
      toast.error('Please paste some JSON first');
      return;
    }

    setError(null);
    setBlockResults(null);
    setLoading(true);
    setLoadingStep('Parsing transaction...');

    try {
      let fixture;
      try {
        fixture = JSON.parse(fixtureInput.trim());
      } catch {
        throw new Error('Invalid JSON format. Please check your input.');
      }
      
      // Artificial delay for better UX feel
      await new Promise((r) => setTimeout(r, 600));

      const data = await analyzeTransaction(fixture);
      if (data.ok === false) {
        throw new Error(data.error.message || 'Analysis failed');
      }

      setTxResult(data);
      setShowInput(false);
      toast.success('Transaction analyzed successfully');
    } catch (e) {
      setError({ code: 'Analysis Error', message: e.message });
      setTxResult(null);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [fixtureInput]);

  const handleAnalyzeBlock = useCallback(async () => {
    // Check for sample mode
    if (blkFileName?.includes('(Sample)')) {
      setError(null);
      setTxResult(null);
      setLoading(true);
      setLoadingStep('Fetching sample block data...');
      
      try {
        await new Promise((r) => setTimeout(r, 800)); // UX delay
        const res = await fetch('/sample-block.json');
        if (!res.ok) throw new Error('Failed to load sample block data');
        const data = await res.json();
        
        const results = Array.isArray(data) ? data : [data];
        setBlockResults(results);
        setShowInput(false);
        toast.success('Sample block parsed successfully');
      } catch (e) {
        setError({ code: 'Sample Error', message: e.message });
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
      return;
    }

    const blkFile = blkFileRef.current?.files?.[0];
    const revFile = revFileRef.current?.files?.[0];
    const xorFile = xorFileRef.current?.files?.[0];

    if (!blkFile || !revFile || !xorFile) {
      toast.error('Please select all three block files');
      return;
    }

    setError(null);
    setTxResult(null);
    setLoading(true);
    setLoadingStep('Reading block files...');

    try {
      const [blk, rev, xor] = await Promise.all([
        fileToBase64(blkFile),
        fileToBase64(revFile),
        fileToBase64(xorFile),
      ]);
      
      setLoadingStep('Verifying Merkle root...');
      await new Promise((r) => setTimeout(r, 500)); // UX delay

      const data = await analyzeBlock(blk, rev, xor);
      
      if (data.ok === false) {
        throw new Error(data.error.message || 'Block analysis failed');
      }

      const results = Array.isArray(data) ? data : [data];
      setBlockResults(results);
      setShowInput(false);
      toast.success('Block parsed successfully');
    } catch (e) {
      setError({ code: 'Block Error', message: e.message });
      setBlockResults(null);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [blkFileName]);

  const resetView = () => {
    setTxResult(null);
    setBlockResults(null);
    setError(null);
    setShowInput(false);
    setFixtureInput('');
    setBlkFileName(null);
    setRevFileName(null);
    setXorFileName(null);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-indigo-500/30">
      <Toaster 
        position="top-center" 
        toastOptions={{
          className: 'glass-card text-sm',
          style: { background: 'rgba(15, 23, 42, 0.9)', color: '#fff', backdropFilter: 'blur(10px)', border: '1px solid rgba(51, 65, 85, 0.5)' }
        }} 
      />

      {/* Navigation */}
      <header className="fixed top-0 w-full z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer group" 
            onClick={resetView}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all">
              <MagnifyingGlass weight="bold" className="text-white" />
            </div>
            <span className="text-lg font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Chain Lens
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setGlossaryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <BookOpen size={18} />
              <span>Glossary</span>
            </button>
            <a
              href="https://github.com/ANIRUDH-SJ/chain-lens"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <GithubLogo size={20} />
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Loading Overlay */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm"
              >
                <SpinnerGap size={48} className="text-indigo-500 animate-spin mb-4" />
                <p className="text-slate-300 font-medium animate-pulse">{loadingStep}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero / Input State */}
          <AnimatePresence mode="wait">
            {!hasResults && !loading && (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center min-h-[60vh] text-center"
              >
                {!showInput ? (
                  <>
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="mb-8 relative"
                    >
                      <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 blur-xl rounded-full" />
                      <h1 className="relative text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-400">
                        Bitcoin, Demystified.
                      </h1>
                      <p className="relative text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
                        Understand complex transactions in plain English. No jargon, just clear insights.
                      </p>
                    </motion.div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm mx-auto">
                      <button
                        onClick={prefillSample}
                        className="btn-primary w-full flex items-center justify-center gap-2 group"
                      >
                        See Live Demo
                        <CaretRight weight="bold" className="group-hover:translate-x-1 transition-transform" />
                      </button>
                      <button
                        onClick={() => { setShowInput(true); setFixtureInput(''); }}
                        className="btn-secondary w-full"
                      >
                        Analyze Your Own
                      </button>
                    </div>
                  </>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-3xl mx-auto"
                  >
                    <div className="glass-card overflow-hidden shadow-2xl shadow-indigo-500/10">
                      {/* Tab Header */}
                      <div className="flex items-center border-b border-slate-700/50 bg-slate-900/50">
                        <button
                          className={`flex-1 py-4 text-sm font-medium transition-all relative ${
                            activeTab === 'transaction' 
                              ? 'text-indigo-400' 
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                          }`}
                          onClick={() => setActiveTab('transaction')}
                        >
                          Transaction Analysis
                          {activeTab === 'transaction' && (
                            <motion.div 
                              layoutId="activeTab"
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" 
                            />
                          )}
                        </button>
                        <div className="w-px h-6 bg-slate-700/50" />
                        <button
                          className={`flex-1 py-4 text-sm font-medium transition-all relative ${
                            activeTab === 'block' 
                              ? 'text-indigo-400' 
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                          }`}
                          onClick={() => setActiveTab('block')}
                        >
                          Block Analysis
                          {activeTab === 'block' && (
                            <motion.div 
                              layoutId="activeTab"
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" 
                            />
                          )}
                        </button>
                      </div>

                      <div className="p-8 text-left">
                        {activeTab === 'transaction' ? (
                          <div className="space-y-6">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                  <Code size={18} className="text-indigo-400" />
                                  Paste Transaction JSON
                                </label>
                                <button 
                                  onClick={prefillSample} 
                                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                                >
                                  Load Sample Data
                                </button>
                              </div>
                              <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                                <textarea
                                  value={fixtureInput}
                                  onChange={(e) => setFixtureInput(e.target.value)}
                                  placeholder='Paste your raw transaction JSON here...'
                                  className="relative w-full min-h-[250px] bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 font-mono text-xs sm:text-sm leading-relaxed focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all resize-y custom-scrollbar"
                                />
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                Supports raw transaction format with inputs and outputs.
                              </p>
                            </div>
                            
                            <div className="flex gap-4 pt-2">
                              <button
                                onClick={() => setShowInput(false)}
                                className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleAnalyzeTx}
                                className="flex-1 btn-primary flex items-center justify-center gap-2"
                              >
                                <MagnifyingGlass weight="bold" />
                                Analyze Transaction
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-8">
                             <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex justify-between items-center">
                                <p className="text-sm text-indigo-200">
                                  <strong>Note:</strong> Requires raw block files from Bitcoin Core.
                                </p>
                                <button 
                                  onClick={prefillSampleBlock}
                                  className="text-xs px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors font-medium"
                                >
                                  Load Sample Files
                                </button>
                             </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {[
                                { ref: blkFileRef, name: blkFileName, setName: setBlkFileName, label: 'blk*.dat', desc: 'Block Data', icon: <Cube size={32} weight="light" /> },
                                { ref: revFileRef, name: revFileName, setName: setRevFileName, label: 'rev*.dat', desc: 'Undo Data', icon: <ArrowLeft size={32} weight="light" /> },
                                { ref: xorFileRef, name: xorFileName, setName: setXorFileName, label: 'xor.dat', desc: 'XOR Key', icon: <FileCode size={32} weight="light" /> },
                              ].map((file) => (
                                <label
                                  key={file.label}
                                  className={`
                                    relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 group
                                    ${file.name 
                                      ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
                                      : 'border-slate-700 hover:border-indigo-400/50 hover:bg-slate-800/50'
                                    }
                                  `}
                                >
                                  <div className={`mb-4 transition-transform group-hover:scale-110 duration-300 ${file.name ? 'text-indigo-400' : 'text-slate-500 group-hover:text-indigo-400'}`}>
                                    {file.name ? <CheckCircle size={40} weight="fill" className="text-emerald-400" /> : file.icon}
                                  </div>
                                  <span className="text-base font-medium text-slate-200">{file.label}</span>
                                  <span className="text-xs text-slate-500 mt-1 mb-2">{file.desc}</span>
                                  
                                  {file.name && (
                                    <span className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-emerald-400 font-mono px-2 truncate">
                                      {file.name}
                                    </span>
                                  )}
                                  
                                  <input
                                    ref={file.ref}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => file.setName(e.target.files[0]?.name)}
                                  />
                                </label>
                              ))}
                            </div>
                            
                            <div className="flex gap-4 pt-4 border-t border-slate-800">
                              <button
                                onClick={() => setShowInput(false)}
                                className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleAnalyzeBlock}
                                className="flex-1 btn-primary flex items-center justify-center gap-2"
                              >
                                <Cube weight="bold" />
                                Parse Block Files
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results State */}
          {hasResults && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="pb-20"
            >
              <div className="mb-8 flex items-center justify-between">
                <button
                  onClick={resetView}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                  <ArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                  Back to Search
                </button>
                {txResult && (
                  <button
                    onClick={() => { exportTransactionPdf(txResult); toast.success('PDF Exported'); }}
                    className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Download Report
                  </button>
                )}
              </div>

              {error && (
                <div className="glass-card p-6 mb-8 border-red-500/20 bg-red-500/5 flex items-start gap-4">
                  <XCircle size={24} className="text-red-400 shrink-0" />
                  <div>
                    <h3 className="text-red-400 font-medium mb-1">Analysis Failed</h3>
                    <p className="text-slate-400 text-sm">{error.message}</p>
                  </div>
                </div>
              )}

              {txResult && <TransactionStory tx={txResult} />}
              {blockResults && <BlockResults blocks={blockResults} />}
            </motion.div>
          )}
        </div>
      </main>
      
      <Glossary open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
    </div>
  );
}
