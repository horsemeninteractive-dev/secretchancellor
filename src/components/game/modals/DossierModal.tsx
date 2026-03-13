import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye, Scale } from 'lucide-react';
import { Role, PrivateInfo, TitleRole } from '../../../types';
import { OverseerIcon } from '../../icons';
import { cn } from '../../../lib/utils';

interface DossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  privateInfo: PrivateInfo | null;
}

const TITLE_ROLE_DESCRIPTIONS: Record<TitleRole, string> = {
  Assassin: "Eliminate a player from the game.",
  Strategist: "Draw an extra policy (4 total) when you are President.",
  Broker: "Force a re-nomination if the current one is unfavorable.",
  Handler: "Swap the next two players in the presidential order.",
  Auditor: "Inspect the discarded policies.",
  Interdictor: "Detain a player for one round, preventing them from being nominated or voting.",
};

export const DossierModal = ({ isOpen, onClose, privateInfo }: DossierModalProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <div className="max-w-sm w-full bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl max-h-[95vh] flex flex-col">
          <div className="p-[3vh] space-y-[2vh] flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-responsive-xs uppercase tracking-[0.2em] text-[#666] font-mono">Your Secret Dossier</h3>
              <button onClick={onClose} className="text-[#444] hover:text-white">
                <X className="w-[2.5vh] h-[2.5vh]" />
              </button>
            </div>

            {privateInfo ? (
              <div className="space-y-[2vh] flex-1 flex flex-col min-h-0">
                <div className={cn(
                  'p-[2vh] rounded-2xl border-2 text-center space-y-[1vh] shrink-0',
                  privateInfo.role === 'Civil' ? 'bg-blue-900/10 border-blue-500/30' : 'bg-red-900/10 border-red-500/30'
                )}>
                  <div className="text-responsive-xs text-[#888] uppercase tracking-[0.2em] font-mono">Secret Identity</div>
                  <div className="flex justify-center">
                    {privateInfo.role === 'Civil'
                      ? <Scale className="w-[6vh] h-[6vh] text-blue-400" />
                      : privateInfo.role === 'Overseer'
                        ? <OverseerIcon className="w-[6vh] h-[6vh] text-red-500" />
                        : <Eye className="w-[6vh] h-[6vh] text-red-500" />}
                  </div>
                  <div className={cn(
                    'text-responsive-2xl font-thematic tracking-wide uppercase',
                    privateInfo.role === 'Civil' ? 'text-blue-400' : 'text-red-500'
                  )}>
                    {privateInfo.role === 'Civil' ? 'CIVIL' : privateInfo.role === 'Overseer' ? 'OVERSEER' : 'STATE'}
                  </div>
                  <div className="text-responsive-xs text-[#666] italic leading-tight">
                    {privateInfo.role === 'Civil'
                      ? 'Defend the Charter. The Crisis must not consume the Secretariat.'
                      : privateInfo.role === 'Overseer'
                        ? 'Ascend to the Chancellorship. State Supremacy awaits.'
                        : 'Enact State directives. Elevate the Overseer to power.'}
                  </div>
                </div>

                <div className="space-y-[1vh] shrink-0">
                  <div className="text-responsive-xs uppercase tracking-widest text-[#666] border-b border-[#222] pb-1">Title Role</div>
                  <div className="bg-[#222] p-[1.5vh] rounded-xl">
                    {privateInfo.titleRole ? (
                      <div className="space-y-0.5">
                        <div className="text-responsive-sm font-bold text-white uppercase tracking-wider">{privateInfo.titleRole}</div>
                        <div className="text-responsive-xs text-[#888] leading-tight">{TITLE_ROLE_DESCRIPTIONS[privateInfo.titleRole]}</div>
                      </div>
                    ) : (
                      <div className="text-responsive-sm text-[#666] italic">No title role assigned.</div>
                    )}
                  </div>
                </div>

                {privateInfo.stateAgents && (
                  <div className="space-y-[1vh] flex-1 min-h-0 flex flex-col">
                    <div className="text-responsive-xs uppercase tracking-widest text-[#666] border-b border-[#222] pb-1 shrink-0">State Faction</div>
                    <div className="space-y-1 overflow-hidden">
                      {privateInfo.stateAgents.map(f => (
                        <div key={f.id} className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            {f.role === 'Overseer'
                              ? <OverseerIcon className="w-[1.8vh] h-[1.8vh] text-red-500" />
                              : <Eye className="w-[1.8vh] h-[1.8vh] text-red-500" />}
                            <span className="text-responsive-sm text-[#aaa] truncate max-w-[120px]">{f.name}</span>
                          </div>
                          <span className={cn(
                            'text-[8px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0',
                            f.role === 'Overseer'
                              ? 'bg-red-900/40 text-red-500 border border-red-900/50'
                              : 'bg-[#222] text-[#666]'
                          )}>
                            {f.role === 'Overseer' ? 'Overseer' : 'State'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[15vh] flex items-center justify-center text-[#444] italic text-responsive-sm">
                Awaiting role assignment...
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-[1.2vh] bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-responsive-sm font-serif italic shrink-0"
            >
              Close Dossier
            </button>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);
