import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scroll, X } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AssemblyLogProps {
  log: string[];
  isOpen: boolean;
  onClose: () => void;
  showDebug: boolean;
}

const getLogColor = (entry: string) => {
  if (entry.includes('DEBUG:')) return 'text-purple-400 border-purple-500';
  if (entry.includes('Civil') || entry.includes('Charter') || entry.includes('passed')) return 'text-blue-400 border-blue-900/30';
  if (entry.includes('State') || entry.includes('Overseer') || entry.includes('Supremacy') || entry.includes('failed')) return 'text-red-500 border-red-900/30';
  if (entry.includes('executed') || entry.includes('killed') || entry.includes('Eliminated')) return 'text-red-600 font-bold border-red-900/50';
  if (entry.includes('elected') || entry.includes('nominated')) return 'text-yellow-500 border-yellow-900/30';
  if (entry.includes('veto') || entry.includes('Veto')) return 'text-purple-400 border-purple-900/30';
  return 'text-[#aaa] border-[#333]';
};

export const AssemblyLog = ({ log, isOpen, onClose, showDebug }: AssemblyLogProps) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, log]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-[150] bg-[#1a1a1a] flex flex-col"
        >
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#222] shrink-0 bg-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <Scroll className="w-4 h-4 text-white" />
              <h3 className="font-thematic text-lg uppercase tracking-wider text-white">Assembly Log</h3>
            </div>
            <button onClick={onClose} className="p-2 text-[#666] hover:text-white transition-colors bg-[#222] rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar overscroll-contain bg-[#141414]">
            {log.filter(entry => showDebug || !entry.includes('DEBUG:')).map((entry, i) => {
              if (entry.startsWith('--- Round')) {
                return (
                  <div key={i} className="w-full py-6 flex items-center justify-center">
                    <div className="flex items-center gap-4">
                      <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#333]" />
                      <div className="px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center gap-2 shadow-xl">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-thematic uppercase tracking-[0.2em] text-white">
                          {entry.replace(/---/g, '').trim()}
                        </span>
                      </div>
                      <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#333]" />
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={cn(
                    'text-[11px] sm:text-xs leading-relaxed border-l-2 pl-4 py-2 transition-all hover:bg-white/5 rounded-r-lg',
                    getLogColor(entry)
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="text-[8px] font-mono opacity-30 uppercase tracking-widest">Event #{i + 1}</div>
                    <div className="h-[1px] flex-1 bg-white/5" />
                  </div>
                  <div className="font-medium tracking-wide text-inherit">{entry.replace(/ \(AI\)/g, '')}</div>
                </div>
              );
            })}
            <div ref={logEndRef} className="h-20" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
