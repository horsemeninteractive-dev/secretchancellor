import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scroll, Target, CheckCircle, XCircle } from 'lucide-react';
import { GameState, Player, PrivateInfo } from '../../../types';
import { cn, getProxiedUrl } from '../../../lib/utils';
import { OverseerIcon } from '../../icons';

interface GameOverModalProps {
  gameState: GameState;
  privateInfo: PrivateInfo | null;
  myId: string | undefined;
  onPlayAgain: () => void;
  onLeave: () => void;
  onOpenLog: () => void;
}

export const GameOverModal = ({ gameState, privateInfo, myId, onPlayAgain, onLeave, onOpenLog }: GameOverModalProps) => {
  const agenda = privateInfo?.personalAgenda;
  const agendaCompleted = agenda?.status === 'completed';
  const agendaFailed    = agenda?.status === 'failed';

  return (
    <AnimatePresence>
      {gameState.phase === 'GameOver' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute inset-0 z-[50] bg-backdrop backdrop-blur-md flex items-center justify-center p-4 pb-16"
        >
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            className="max-w-md w-full bg-surface border border-default rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-full"
          >
            {/* Win banner */}
            <div className={cn(
              'p-[3vh] text-center border-b border-subtle',
              gameState.winner === 'Civil' ? 'bg-blue-900/20' : gameState.winner === 'State' ? 'bg-red-900/20' : 'bg-surface'
            )}>
              <div className={cn(
                'text-responsive-2xl font-thematic tracking-widest uppercase mb-1',
                gameState.winner === 'Civil' ? 'text-blue-400' : gameState.winner === 'State' ? 'text-red-500' : 'text-muted'
              )}>
                {gameState.winner === 'Civil'
                  ? gameState.winReason || 'Charter Restored'
                  : gameState.winner === 'State'
                    ? gameState.winReason || 'State Supremacy'
                    : 'Inconclusive'}
              </div>
              <p className="text-responsive-xs text-muted font-mono uppercase tracking-[0.2em]">
                {gameState.winner === 'Civil'
                  ? 'The Charter has been defended.'
                  : gameState.winner === 'State'
                    ? 'The Secretariat has fallen to the State.'
                    : 'The Assembly has collapsed due to a disconnection.'}
              </p>
            </div>

            <div className="p-[3vh] space-y-[2vh] overflow-hidden flex flex-col">
              <button
                onClick={onOpenLog}
                className="w-full py-[1vh] bg-card text-tertiary border border-default rounded-xl hover:bg-hover hover:text-white transition-all font-mono text-responsive-xs uppercase tracking-widest flex items-center justify-center gap-2 shrink-0"
              >
                <Scroll className="w-[2vh] h-[2vh]" />
                View Assembly Log
              </button>

              {/* Personal Agenda result */}
              {agenda && (
                <div className={cn(
                  'rounded-xl border p-[1.5vh] shrink-0',
                  agendaCompleted ? 'bg-emerald-900/15 border-emerald-500/30' :
                  agendaFailed    ? 'bg-red-900/15 border-red-500/20' :
                                    'bg-card border-default'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Target className={cn(
                        'w-[2vh] h-[2vh] shrink-0 mt-0.5',
                        agendaCompleted ? 'text-emerald-400' : agendaFailed ? 'text-red-400' : 'text-muted'
                      )} />
                      <div className="min-w-0">
                        <div className="text-responsive-xs uppercase tracking-widest text-muted font-mono mb-0.5">Personal Agenda</div>
                        <div className="text-responsive-sm font-bold text-primary uppercase tracking-wide">{agenda.name}</div>
                        <div className="text-responsive-xs text-tertiary leading-tight mt-0.5">{agenda.description}</div>
                      </div>
                    </div>
                    <div className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-full shrink-0 text-[10px] font-mono uppercase tracking-widest border',
                      agendaCompleted ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-400' :
                      agendaFailed    ? 'bg-red-900/30 border-red-500/40 text-red-400' :
                                        'bg-subtle border-strong text-tertiary'
                    )}>
                      {agendaCompleted
                        ? <><CheckCircle className="w-3 h-3" /><span>Complete</span></>
                        : agendaFailed
                          ? <><XCircle className="w-3 h-3" /><span>Failed</span></>
                          : <span>—</span>}
                    </div>
                  </div>
                  {agendaCompleted && (
                    <div className="mt-[1vh] pl-[2.5vh] text-[10px] text-emerald-400/70 font-mono">
                      +100 XP · Bonus IP awarded
                    </div>
                  )}
                </div>
              )}

              {/* Identity reveal */}
              <div className="space-y-[2vh] flex-1 overflow-hidden flex flex-col">
                <div className="text-responsive-xs uppercase tracking-[0.2em] text-ghost font-mono border-b border-subtle pb-2 flex justify-between shrink-0">
                  <span>Final Identity Reveal</span>
                  <span>Secret Identity</span>
                </div>
                <div className="space-y-[1vh] overflow-y-auto custom-scrollbar pr-2">
                  {gameState.players.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-[1vh] border-b border-subtle/30">
                      <div className="flex items-center gap-3">
                        <div className="w-[4vh] h-[4vh] rounded-full bg-card flex items-center justify-center text-responsive-xs text-muted font-mono overflow-hidden border border-default">
                          {p.avatarUrl
                            ? <img src={getProxiedUrl(p.avatarUrl)} alt={p.name} className="w-full h-full object-cover" />
                            : p.name.charAt(0)}
                        </div>
                        <span className="text-responsive-sm text-primary font-medium">{p.name.replace(' (AI)', '')}</span>
                      </div>
                      <div className={cn(
                        'px-3 py-1 rounded-lg border text-responsive-xs font-mono uppercase tracking-widest',
                        p.role === 'Civil' ? 'bg-blue-900/20 border-blue-500/30 text-blue-400' :
                        p.role === 'State' ? 'bg-red-900/20 border-red-500/30 text-red-500' :
                        'bg-red-900/40 border-red-500 text-red-400 font-bold'
                      )}>
                        {p.role === 'Civil' ? 'Civil' : p.role === 'State' ? 'State' : 'The Overseer'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onPlayAgain}
                  className="flex-1 py-[1.5vh] btn-primary rounded-xl hover:bg-subtle transition-all font-thematic text-responsive-sm uppercase tracking-widest"
                >
                  Play Again
                </button>
                <button
                  onClick={onLeave}
                  className="flex-1 py-[1.5vh] bg-card text-primary rounded-xl hover:bg-subtle transition-all font-thematic text-responsive-sm uppercase tracking-widest border border-default"
                >
                  Lobby
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

