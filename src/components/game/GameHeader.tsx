import React from 'react';
import { MessageSquare, LogOut, BookOpen, Scale, Eye, Mic, MicOff, User as UserIcon } from 'lucide-react';
import { GameState, Player, Role } from '../../types';
import { OverseerIcon } from '../icons';
import { getFrameStyles } from '../../lib/cosmetics';
import { cn } from '../../lib/utils';

interface GameHeaderProps {
  gameState: GameState;
  me: Player | undefined;
  socketId: string | undefined;
  user: { username: string; avatarUrl?: string; activeFrame?: string } | null;
  privateInfo: { role: Role; stateAgents?: { id: string; name: string; role: Role }[] } | null;
  isVoiceActive: boolean;
  hasNewMessages: boolean;
  tick: number; // forces re-render for timer
  onToggleVoice: () => void;
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onOpenDossier: () => void;
  onOpenProfile: () => void;
  onLeaveRoom: () => void;
  playSound: (key: string) => void;
}

export const GameHeader = ({
  gameState, me, socketId, user, privateInfo,
  isVoiceActive, hasNewMessages, tick,
  onToggleVoice, onOpenChat, onOpenHistory, onOpenDossier, onOpenProfile, onLeaveRoom,
  playSound,
}: GameHeaderProps) => {
  const timerRemaining = gameState.actionTimerEnd
    ? Math.max(0, Math.ceil((gameState.actionTimerEnd - Date.now()) / 1000))
    : null;

  return (
    <header className="h-16 sm:h-20 border-b border-[#222] bg-[#1a1a1a] px-3 sm:px-6 flex items-center justify-between shrink-0 shadow-lg z-10">
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#141414] rounded-xl flex items-center justify-center border border-white/40 shrink-0 overflow-hidden">
          <img
            src="https://storage.googleapis.com/secretchancellor/SC.png"
            alt="The Assembly Logo"
            className="w-full h-full object-contain p-1"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="font-thematic text-sm sm:text-2xl text-white tracking-wide leading-none truncate">The Assembly</div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
            <span className="text-[8px] sm:text-[9px] font-mono text-[#444] uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate">
              {gameState.roomId}
            </span>
            <span className="text-[8px] sm:text-[9px] font-mono text-red-500/50 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 shrink-0">
              <div className="w-1 h-1 rounded-full bg-red-500/50" />
              R{gameState.round}
            </span>
            {timerRemaining !== null && (
              <span className="text-[8px] sm:text-[9px] font-mono text-yellow-500 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 ml-1 sm:ml-2 shrink-0">
                <div className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse" />
                {timerRemaining}s
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-4">
        {/* Voice */}
        <button
          onClick={onToggleVoice}
          disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
          className={cn(
            'p-2 sm:p-2.5 rounded-xl border transition-all',
            isVoiceActive
              ? 'border-red-500 bg-red-900/20 text-red-500'
              : 'border-[#333] bg-[#222] text-[#444] hover:text-white',
            !me?.isAlive && gameState.phase !== 'GameOver' && 'opacity-30 grayscale cursor-not-allowed'
          )}
        >
          {isVoiceActive ? <Mic className="w-3.5 h-3.5 sm:w-4 h-4" /> : <MicOff className="w-3.5 h-3.5 sm:w-4 h-4" />}
        </button>

        {/* Chat */}
        <button
          onClick={() => { playSound('click'); onOpenChat(); }}
          className="p-2 sm:p-2.5 rounded-xl border border-[#333] bg-[#222] text-[#666] hover:text-white transition-all relative"
        >
          <MessageSquare className="w-3.5 h-3.5 sm:w-4 h-4" />
          {hasNewMessages && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full border border-[#1a1a1a]" />
          )}
        </button>

        {/* History */}
        {gameState.roundHistory && gameState.roundHistory.length > 0 && (
          <button
            onClick={() => { playSound('click'); onOpenHistory(); }}
            className="p-2 sm:p-2.5 rounded-xl border border-[#333] bg-[#222] text-[#666] hover:text-white transition-all relative"
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-500 rounded-full border border-[#1a1a1a] flex items-center justify-center">
              <span className="text-[7px] font-bold text-black leading-none">{gameState.roundHistory.length}</span>
            </span>
          </button>
        )}

        {/* Dossier */}
        {gameState.phase !== 'Lobby' && (
          <button
            onClick={() => { playSound('click'); onOpenDossier(); }}
            className={cn(
              'p-2 sm:p-2.5 rounded-xl border transition-all',
              privateInfo
                ? privateInfo.role === 'Civil'
                  ? 'border-blue-900/50 bg-blue-900/20'
                  : 'border-red-900/50 bg-red-900/20'
                : 'border-[#333] bg-[#222]'
            )}
          >
            {privateInfo?.role === 'Civil' ? (
              <Scale className="w-3.5 h-3.5 sm:w-4 h-4 text-blue-400" />
            ) : privateInfo?.role === 'Overseer' ? (
              <OverseerIcon className="w-3.5 h-3.5 sm:w-4 h-4 text-red-500" />
            ) : (
              <Eye className={cn('w-3.5 h-3.5 sm:w-4 h-4', privateInfo ? 'text-red-500' : 'text-[#666]')} />
            )}
          </button>
        )}

        {/* Profile */}
        <button
          onClick={() => { playSound('click'); onOpenProfile(); }}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center hover:border-red-900/50 transition-colors overflow-hidden relative shrink-0"
        >
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            : <UserIcon className="w-3.5 h-3.5 sm:w-4 h-4 text-[#666]" />}
          {user?.activeFrame && (
            <div className={cn('absolute inset-0 rounded-xl pointer-events-none', getFrameStyles(user.activeFrame))} />
          )}
        </button>

        <div className="w-[1px] h-5 sm:h-6 bg-[#222] mx-0.5 sm:mx-1" />

        {/* Leave */}
        <button
          onClick={onLeaveRoom}
          className="p-2 sm:p-2.5 text-[#444] hover:text-red-500 transition-colors bg-[#141414] border border-[#222] rounded-xl"
        >
          <LogOut className="w-3.5 h-3.5 sm:w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
