import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, Eye, Check } from 'lucide-react';
import { socket } from '../../socket';
import { GameState, Player } from '../../types';
import { getFrameStyles, getVoteStyles } from '../../lib/cosmetics';
import { cn, getProxiedUrl } from '../../lib/utils';

const VideoPlayer = React.memo(({ stream, isMe }: { stream: MediaStream, isMe: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline muted={isMe} className="absolute inset-0 w-full h-full object-cover rounded-xl" />;
});

interface PlayerGridProps {
  gameState: GameState;
  me: Player | undefined;
  speakingPlayers: Record<string, boolean>;
  playSound: (key: string) => void;
  token: string;
  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  isVideoActive: boolean;
}

export const PlayerGrid = ({ gameState, me, speakingPlayers, playSound, token, selectedPlayerId, setSelectedPlayerId, localStream, remoteStreams, isVideoActive }: PlayerGridProps) => {
  const isPresidentialCandidate = me?.isPresidentialCandidate;
  const isPresident = me?.isPresident;
  const isManyPlayers = gameState.players.length > 6;

  return (
    <div className="flex-1 p-[1vh] sm:p-[1.5vh] min-h-0 overflow-hidden">
      <div className={cn(
        'grid gap-[1vh] sm:gap-[1.5vh] h-full grid-cols-2',
        gameState.players.length <= 6 ? 'grid-rows-3' :
        gameState.players.length <= 8 ? 'grid-rows-4' : 'grid-rows-5',
        'sm:grid-cols-5 sm:grid-rows-2'
      )}>
        {gameState.players.map((p, index) => {
          if (!p) return null;
          const prevVote = gameState.previousVotes?.[p.id];
          const isMe = p.id === socket.id;
          const stream = isMe ? (isVideoActive ? localStream : null) : remoteStreams[p.id];
          
          return (
            <motion.div
              key={p.id}
              animate={{ scale: speakingPlayers[p.id] ? 1.05 : 1 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => { 
                e.stopPropagation();
                playSound('click'); 
                if (p.userId) {
                  setSelectedPlayerId(p.userId);
                }
              }}
              className={cn(
                'relative p-[0.5vh] sm:p-[1vh] rounded-xl border transition-all duration-300 flex flex-col items-center justify-center min-h-0 cursor-pointer overflow-hidden',
                p.isAlive ? 'bg-[#1a1a1a]/80 backdrop-blur-sm border-[#222]' : 'bg-[#111]/50 border-transparent opacity-50 grayscale',
                p.isPresidentialCandidate && 'border-yellow-500/50 ring-1 ring-yellow-500/20',
                p.isChancellorCandidate && 'border-blue-500/50 ring-1 ring-blue-500/20',
                p.isPresident && 'bg-yellow-900/20 border-yellow-500 shadow-lg shadow-yellow-500/10',
                p.isChancellor && 'bg-blue-900/20 border-blue-500 shadow-lg shadow-blue-500/10'
              )}
            >
              {speakingPlayers[p.id] && (
                <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[inset_0_0_20px_rgba(16,185,129,0.4)] border border-emerald-500/50 z-20" />
              )}

              <motion.div
                animate={{ rotateY: prevVote ? 180 : 0 }}
                transition={{ 
                  duration: 0.6, 
                  type: 'spring', 
                  stiffness: 260, 
                  damping: 20,
                  delay: gameState.phase === 'Voting_Reveal' ? index * 0.2 : 0 
                }}
                className="w-full h-full relative preserve-3d"
              >
                {/* Front: Player info */}
                <div className="absolute inset-0 flex flex-col items-center justify-center backface-hidden">
                  {stream && isVideoActive && <VideoPlayer stream={stream} isMe={isMe} />}
                  
                  <div className={cn(
                    'flex min-h-0 overflow-hidden z-10 w-full h-full',
                    stream && isVideoActive 
                      ? 'flex-row justify-between items-end p-2' 
                      : 'flex-col items-center justify-center text-center'
                  )}>
                    <div className={cn(
                      'relative shrink-0 p-1',
                      stream && isVideoActive && 'hidden'
                    )}>
                      <div className={cn(
                        'bg-[#222] flex items-center justify-center relative',
                        !p.activeFrame && 'border border-[#333]',
                        isManyPlayers ? 'w-6 h-6 sm:w-12 sm:h-12 rounded-lg' : 'w-10 h-10 sm:w-12 sm:h-12 rounded-xl'
                      )}>
                        {p.avatarUrl
                          ? <img src={getProxiedUrl(p.avatarUrl)} alt={p.name} className={cn("w-full h-full object-cover", isManyPlayers ? 'rounded-lg' : 'rounded-xl')} />
                          : <Users className={cn('text-[#666]', isManyPlayers ? 'w-3 h-3 sm:w-6 sm:h-6' : 'w-5 h-5 sm:w-6 sm:h-6')} />}
                        {p.activeFrame && (
                          <div className={cn('absolute inset-0 pointer-events-none', isManyPlayers ? 'rounded-lg' : 'rounded-xl', getFrameStyles(p.activeFrame))} />
                        )}
                        {!p.isAlive && (
                          <div className={cn("absolute inset-0 flex items-center justify-center bg-black/40", isManyPlayers ? 'rounded-lg' : 'rounded-xl')}>
                            <Eye className={cn('text-red-600 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]', isManyPlayers ? 'w-4 h-4 sm:w-8 sm:h-8' : 'w-6 h-6 sm:w-8 sm:h-8')} />
                          </div>
                        )}
                        {(gameState.phase === 'Voting' || gameState.phase === 'Voting_Reveal') && p.vote && (
                          <div className={cn("sm:hidden absolute inset-0 flex items-center justify-center bg-green-500/40 backdrop-blur-[1px]", isManyPlayers ? 'rounded-lg' : 'rounded-xl')}>
                            <Check className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
                          </div>
                        )}
                      </div>

                      {/* Mobile role badges */}
                      <div className="sm:hidden absolute top-0 -right-1 flex flex-col gap-0.5 z-10">
                        {(p.isPresident || p.isPresidentialCandidate) && (
                          <div className="w-3 h-3 bg-yellow-500 rounded-sm border border-[#1a1a1a] flex items-center justify-center shadow-sm">
                            <span className="text-[7px] font-bold text-black leading-none">P</span>
                          </div>
                        )}
                        {(p.isChancellor || p.isChancellorCandidate) && (
                          <div className="w-3 h-3 bg-blue-500 rounded-sm border border-[#1a1a1a] flex items-center justify-center shadow-sm">
                            <span className="text-[7px] font-bold text-white leading-none">C</span>
                          </div>
                        )}
                      </div>

                      {p.activeFrame && (
                        <div className={cn(
                          'absolute -inset-1 pointer-events-none',
                          isManyPlayers ? 'rounded-lg' : 'rounded-xl',
                          p.activeFrame === 'frame-red' && 'border-red-500',
                          p.activeFrame === 'frame-gold' && 'border-yellow-500',
                          p.activeFrame === 'frame-blue' && 'border-blue-500',
                          p.activeFrame === 'frame-rainbow' && 'border-purple-500',
                          p.activeFrame === 'frame-neon' && 'border-emerald-500',
                          p.activeFrame === 'frame-shadow' && 'border-gray-500'
                        )} />
                      )}
                    </div>

                    <div className={cn(
                      'font-thematic tracking-wide truncate px-1 leading-tight',
                      stream && isVideoActive ? 'text-[7px] sm:text-[9px] bg-black/50 rounded px-1' : 'text-[9px] sm:text-[11px]',
                      p.isAlive ? 'text-white/90' : 'text-[#444]'
                    )}>
                      {p.name.replace(' (AI)', '')} {p.id === socket.id && '(You)'}
                    </div>

                    {/* Badges */}
                    <div className={cn(
                      'flex flex-wrap gap-0.5 sm:gap-1 shrink-0',
                      stream && isVideoActive ? 'justify-end' : 'justify-center hidden sm:flex'
                    )}>
                      {gameState.detainedPlayerId === p.id && (
                        <span className="px-1 sm:px-2 py-0.5 bg-purple-900/40 text-purple-500 font-mono uppercase rounded border border-purple-900/50 text-[7px] sm:text-[9px]">Detained</span>
                      )}
                      {(p.isPresident || p.isPresidentialCandidate) && (
                        <span className="px-1 sm:px-2 py-0.5 bg-yellow-900/40 text-yellow-500 font-mono uppercase rounded border border-yellow-900/50 text-[7px] sm:text-[9px]">
                          {p.isPresident ? 'President' : 'Candidate'}
                        </span>
                      )}
                      {(p.isChancellor || p.isChancellorCandidate) && (
                        <span className="px-1 sm:px-2 py-0.5 bg-blue-900/40 text-blue-500 font-mono uppercase rounded border border-blue-900/50 text-[7px] sm:text-[9px]">
                          {p.isChancellor ? 'Chancellor' : 'Nominated'}
                        </span>
                      )}
                      {!p.isAlive && (
                        <span className="px-1 sm:px-2 py-0.5 bg-red-900/20 text-red-500 font-mono uppercase rounded border border-red-900/50 text-[7px] sm:text-[9px]">Eliminated</span>
                      )}
                    </div>

                    {/* Mobile badges */}
                    <div className={cn("sm:hidden flex flex-wrap gap-0.5 mt-0.5 justify-center", stream && isVideoActive && 'hidden')}>
                      {!p.isAlive && (
                        <span className="px-1 py-0.5 bg-red-900/20 text-red-500 font-mono uppercase rounded text-[6px]">Dead</span>
                      )}
                      {gameState.detainedPlayerId === p.id && (
                        <span className="px-1 py-0.5 bg-purple-900/20 text-purple-500 font-mono uppercase rounded text-[6px]">Detained</span>
                      )}
                      {(p.isPresident || p.isPresidentialCandidate) && (
                        <span className="px-1 py-0.5 bg-yellow-900/20 text-yellow-500 font-mono uppercase rounded text-[6px]">
                          {p.isPresident ? 'Pres' : 'Cand'}
                        </span>
                      )}
                      {(p.isChancellor || p.isChancellorCandidate) && (
                        <span className="px-1 py-0.5 bg-blue-900/20 text-blue-500 font-mono uppercase rounded text-[6px]">
                          {p.isChancellor ? 'Chan' : 'Nom'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Back: Vote reveal */}
                <div className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center backface-hidden rotate-y-180 rounded-xl border-2 overflow-hidden',
                  getVoteStyles(p.activeVotingStyle, prevVote)
                )}>
                  {p.activeVotingStyle === 'vote-pass-0' && (
                    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
                      <div className="absolute inset-0 animate-purple-rain bg-purple-500/50" />
                    </div>
                  )}
                  <div className="text-2xl font-thematic uppercase tracking-widest leading-none">{prevVote}</div>
                  <div className="text-[8px] font-mono uppercase mt-1">({prevVote === 'Aye' ? 'YES' : 'NO'})</div>
                </div>
              </motion.div>

              {/* Nominate overlay */}
              {gameState.phase === 'Nominate_Chancellor' && isPresidentialCandidate && p.id !== socket.id && p.isAlive && (() => {
                const aliveCount = gameState.players.filter(pl => pl.isAlive).length;
                const isEligible = !p.wasChancellor && !(aliveCount > 5 && p.wasPresident) && p.id !== gameState.detainedPlayerId && p.id !== gameState.rejectedChancellorId;
                if (p.id === gameState.rejectedChancellorId) {
                  console.log(`DEBUG: Player ${p.name} (id: ${p.id}) is rejected chancellor (id: ${gameState.rejectedChancellorId}), isEligible: ${isEligible}`);
                } else if (gameState.rejectedChancellorId) {
                  console.log(`DEBUG: Player ${p.name} (id: ${p.id}) is NOT rejected chancellor (id: ${gameState.rejectedChancellorId}), isEligible: ${isEligible}`);
                }
                if (!isEligible) return null;
                return (
                  <button
                    onClick={() => { playSound('click'); socket.emit('nominateChancellor', p.id); }}
                    className="absolute inset-0 bg-blue-900/80 rounded-xl flex items-center justify-center font-thematic tracking-wide text-white text-[12px] uppercase"
                  >
                    Nominate
                  </button>
                );
              })()}

              {/* Assassin action overlay */}
              {gameState.phase === 'Assassin_Action' && gameState.titlePrompt?.playerId === socket.id && p.id !== socket.id && p.isAlive && (
                <button
                  onClick={() => { playSound('click'); socket.emit('useTitleAbility', { use: true, targetId: p.id }); }}
                  className="absolute inset-0 bg-red-900/80 rounded-xl flex items-center justify-center font-serif italic text-white text-[9px] text-center px-1"
                >
                  Execute
                </button>
              )}

              {/* Executive action overlay */}
              {gameState.phase === 'Executive_Action' && isPresident && p.id !== socket.id && p.isAlive && (
                <button
                  onClick={() => { playSound('click'); socket.emit('performExecutiveAction', p.id); }}
                  className="absolute inset-0 bg-red-900/80 rounded-xl flex items-center justify-center font-serif italic text-white text-[9px] text-center px-1"
                >
                  {gameState.currentExecutiveAction}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
