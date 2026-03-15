import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye, Scale, Target, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Role, PrivateInfo, TitleRole, AgendaStatus } from '../../../types';
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

const AgendaStatusBadge = ({ status }: { status: AgendaStatus }) => {
  if (status === 'completed') return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono uppercase tracking-widest shrink-0">
      <CheckCircle className="w-3 h-3" />
      <span>Complete</span>
    </div>
  );
  if (status === 'failed') return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-900/30 border border-red-500/40 text-red-400 text-[10px] font-mono uppercase tracking-widest shrink-0">
      <XCircle className="w-3 h-3" />
      <span>Failed</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-subtle border border-strong text-tertiary text-[10px] font-mono uppercase tracking-widest shrink-0">
      <Clock className="w-3 h-3" />
      <span>Active</span>
    </div>
  );
};

export const DossierModal = ({ isOpen, onClose, privateInfo }: DossierModalProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-[100] bg-backdrop backdrop-blur-sm flex items-center justify-center p-6"
      >
        <div className="max-w-sm w-full bg-surface border border-default rounded-3xl overflow-hidden shadow-2xl max-h-[95vh] flex flex-col">
          <div className="p-[3vh] space-y-[2vh] flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-responsive-xs uppercase tracking-[0.2em] text-muted font-mono">Your Secret Dossier</h3>
              <button onClick={onClose} className="text-ghost hover:text-white">
                <X className="w-[2.5vh] h-[2.5vh]" />
              </button>
            </div>

            {privateInfo ? (
              <div className="space-y-[2vh] flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar pr-1">
                {/* Role card */}
                <div className={cn(
                  'p-[2vh] rounded-2xl border-2 text-center space-y-[1vh] shrink-0',
                  privateInfo.role === 'Civil' ? 'bg-blue-900/10 border-blue-500/30' : 'bg-red-900/10 border-red-500/30'
                )}>
                  <div className="text-responsive-xs text-tertiary uppercase tracking-[0.2em] font-mono">Secret Identity</div>
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
                  <div className="text-responsive-xs text-muted italic leading-tight">
                    {privateInfo.role === 'Civil'
                      ? 'Defend the Charter. The Crisis must not consume the Secretariat.'
                      : privateInfo.role === 'Overseer'
                        ? 'Ascend to the Chancellorship. State Supremacy awaits.'
                        : 'Enact State directives. Elevate the Overseer to power.'}
                  </div>
                </div>

                {/* Personal Agenda */}
                <div className="space-y-[1vh] shrink-0">
                  <div className="text-responsive-xs uppercase tracking-widest text-muted border-b border-subtle pb-1">Personal Agenda</div>
                  <div className={cn(
                    'p-[1.5vh] rounded-xl border',
                    privateInfo.personalAgenda?.status === 'completed'
                      ? 'bg-emerald-900/10 border-emerald-500/20'
                      : privateInfo.personalAgenda?.status === 'failed'
                        ? 'bg-red-900/10 border-red-500/20'
                        : 'bg-card border-default'
                  )}>
                    {privateInfo.personalAgenda ? (
                      <div className="space-y-[1vh]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Target className={cn(
                              'w-[2vh] h-[2vh] shrink-0 mt-0.5',
                              privateInfo.personalAgenda.status === 'completed' ? 'text-emerald-400'
                              : privateInfo.personalAgenda.status === 'failed' ? 'text-red-400'
                              : 'text-tertiary'
                            )} />
                            <span className="text-responsive-sm font-bold text-primary uppercase tracking-wider">
                              {privateInfo.personalAgenda.name}
                            </span>
                          </div>
                          <AgendaStatusBadge status={privateInfo.personalAgenda.status} />
                        </div>
                        <p className="text-responsive-xs text-tertiary leading-relaxed pl-[2.5vh]">
                          {privateInfo.personalAgenda.description}
                        </p>
                        {privateInfo.personalAgenda.status === 'unresolved' && (
                          <p className="text-[10px] text-faint italic pl-[2.5vh]">
                            Completing this awards bonus XP and IP equal to a faction win.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-responsive-sm text-muted italic">No agenda assigned.</div>
                    )}
                  </div>
                </div>

                {/* Title Role */}
                <div className="space-y-[1vh] shrink-0">
                  <div className="text-responsive-xs uppercase tracking-widest text-muted border-b border-subtle pb-1">Title Role</div>
                  <div className="bg-card p-[1.5vh] rounded-xl">
                    {privateInfo.titleRole ? (
                      <div className="space-y-0.5">
                        <div className="text-responsive-sm font-bold text-primary uppercase tracking-wider">{privateInfo.titleRole}</div>
                        <div className="text-responsive-xs text-tertiary leading-tight">{TITLE_ROLE_DESCRIPTIONS[privateInfo.titleRole]}</div>
                      </div>
                    ) : (
                      <div className="text-responsive-sm text-muted italic">No title role assigned.</div>
                    )}
                  </div>
                </div>

                {/* State faction */}
                {privateInfo.stateAgents && (
                  <div className="space-y-[1vh] shrink-0">
                    <div className="text-responsive-xs uppercase tracking-widest text-muted border-b border-subtle pb-1">State Faction</div>
                    <div className="space-y-1">
                      {privateInfo.stateAgents.map(f => (
                        <div key={f.id} className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            {f.role === 'Overseer'
                              ? <OverseerIcon className="w-[1.8vh] h-[1.8vh] text-red-500" />
                              : <Eye className="w-[1.8vh] h-[1.8vh] text-red-500" />}
                            <span className="text-responsive-sm text-secondary truncate max-w-[120px]">{f.name}</span>
                          </div>
                          <span className={cn(
                            'text-[8px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0',
                            f.role === 'Overseer'
                              ? 'bg-red-900/40 text-red-500 border border-red-900/50'
                              : 'bg-card text-muted'
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
              <div className="h-[15vh] flex items-center justify-center text-ghost italic text-responsive-sm">
                Awaiting role assignment...
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-[1.2vh] bg-card text-primary rounded-xl hover:bg-subtle transition-all text-responsive-sm font-serif italic shrink-0"
            >
              Close Dossier
            </button>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);


