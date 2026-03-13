import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, X, Scale, Eye } from 'lucide-react';
import { GameState } from '../../../types';
import { cn } from '../../../lib/utils';

interface RoundHistoryProps {
  gameState: GameState;
  isOpen: boolean;
  onClose: () => void;
}

export const RoundHistory = ({ gameState, isOpen, onClose }: RoundHistoryProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-0 z-[150] bg-[#141414] flex flex-col"
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#222] shrink-0 bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-white" />
            <h3 className="font-thematic text-lg uppercase tracking-wider text-white">Round History</h3>
          </div>
          <button onClick={onClose} className="p-2 text-[#666] hover:text-white transition-colors bg-[#222] rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar overscroll-contain">
          {(!gameState.roundHistory || gameState.roundHistory.length === 0) ? (
            <div className="flex items-center justify-center h-32 text-[#444] font-mono text-xs uppercase tracking-widest">
              No governments formed yet
            </div>
          ) : [...gameState.roundHistory].reverse().map((entry, i) => {
            const isFailed = entry.failed;
            return (
              <div key={i} className={cn(
                'rounded-2xl border overflow-hidden',
                isFailed
                  ? 'border-[#333] bg-[#141414]'
                  : entry.policy === 'Civil' ? 'border-blue-900/40 bg-blue-900/5' : 'border-red-900/40 bg-red-900/5'
              )}>
                {/* Header */}
                <div className={cn(
                  'px-4 py-2 flex items-center justify-between',
                  isFailed ? 'bg-[#1a1a1a]' : entry.policy === 'Civil' ? 'bg-blue-900/20' : 'bg-red-900/20'
                )}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#444]">Round {entry.round}</span>
                    {entry.chaos && (
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-orange-900/30 border border-orange-500/30 text-orange-400 uppercase tracking-widest">Chaos</span>
                    )}
                    {isFailed && (
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-[#222] border border-[#333] text-[#666] uppercase tracking-widest">
                        {entry.failReason === 'veto' ? 'Vetoed' : 'Rejected'}
                      </span>
                    )}
                  </div>
                  {isFailed ? (
                    <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[#555]">
                      <X className="w-3 h-3" /> No policy
                    </div>
                  ) : (
                    <div className={cn(
                      'flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest font-bold',
                      entry.policy === 'Civil' ? 'text-blue-400' : 'text-red-500'
                    )}>
                      {entry.policy === 'Civil' ? <Scale className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {entry.policy === 'Civil' ? 'Civil' : 'State'}
                    </div>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  {/* Government */}
                  <div className="flex items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-yellow-900/20 border border-yellow-500/20 text-yellow-500 font-mono text-[8px] uppercase">Pres</span>
                      <span className="text-white/80">{entry.presidentName.replace(' (AI)', '')}</span>
                    </div>
                    <div className="text-[#333]">×</div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-900/20 border border-blue-500/20 text-blue-400 font-mono text-[8px] uppercase">Chan</span>
                      <span className="text-white/80">{entry.chancellorName.replace(' (AI)', '')}</span>
                    </div>
                  </div>

                  {/* Declarations */}
                  {!isFailed && (entry.presDeclaration || entry.chanDeclaration) && (
                    <div className="flex gap-2">
                      {entry.presDeclaration && (
                        <div className="flex-1 p-2 rounded-lg bg-[#1a1a1a] border border-[#222] text-[9px] font-mono space-y-1">
                          <div className="text-yellow-500 uppercase tracking-widest">President</div>
                          <div>
                            <span className="text-[#555]">Drew </span>
                            <span className="text-blue-400">{entry.presDeclaration.drewCiv}C</span>
                            <span className="text-[#444] mx-0.5">/</span>
                            <span className="text-red-500">{entry.presDeclaration.drewSta}S</span>
                          </div>
                          <div>
                            <span className="text-[#555]">Passed </span>
                            <span className="text-blue-400">{entry.presDeclaration.civ}C</span>
                            <span className="text-[#444] mx-0.5">/</span>
                            <span className="text-red-500">{entry.presDeclaration.sta}S</span>
                          </div>
                        </div>
                      )}
                      {entry.chanDeclaration && (
                        <div className="flex-1 p-2 rounded-lg bg-[#1a1a1a] border border-[#222] text-[9px] font-mono space-y-1">
                          <div className="text-blue-400 uppercase tracking-widest">Chancellor</div>
                          <div className="text-[#555] text-[8px]">&nbsp;</div>
                          <div>
                            <span className="text-[#555]">Received </span>
                            <span className="text-blue-400">{entry.chanDeclaration.civ}C</span>
                            <span className="text-[#444] mx-0.5">/</span>
                            <span className="text-red-500">{entry.chanDeclaration.sta}S</span>
                            {entry.presDeclaration && entry.chanDeclaration &&
                              entry.presDeclaration.sta !== entry.chanDeclaration.sta && (
                                <span className="ml-1.5 text-orange-400 font-bold" title="Stories don't match">⚠</span>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Votes */}
                  {entry.votes.length > 0 && (
                    <div>
                      <div className="text-[8px] font-mono text-[#444] uppercase tracking-widest mb-1.5">Votes</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.votes.map((v, vi) => (
                          <div key={vi} className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono border',
                            v.vote === 'Aye'
                              ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400'
                              : 'bg-red-900/20 border-red-500/30 text-red-400'
                          )}>
                            <span>{v.playerName.replace(' (AI)', '')}</span>
                            <span className="font-bold">{v.vote}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isFailed && entry.executiveAction && (
                    <div className="text-[8px] font-mono text-orange-400/70 uppercase tracking-widest">
                      Executive: {entry.executiveAction}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);
