import React from 'react';
import { MessageSquare, LogOut, BookOpen, Scale, Eye, Mic, MicOff, User as UserIcon } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { GameState, Player, Role, PrivateInfo } from '../../types';
import { OverseerIcon } from '../icons';
import { getFrameStyles } from '../../lib/cosmetics';
import { cn, getProxiedUrl } from '../../lib/utils';

interface GameHeaderProps {
  gameState: GameState;
  me: Player | undefined;
  socketId: string | undefined;
  user: { username: string; avatarUrl?: string; activeFrame?: string } | null;
  privateInfo: PrivateInfo | null;
  hasNewMessages: boolean;
  tick: number; // forces re-render for timer
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onOpenDossier: () => void;
  onOpenProfile: () => void;
  onLeaveRoom: () => void;
  playSound: (key: string) => void;
}

export const GameHeader = ({
  gameState, me, socketId, user, privateInfo,
  hasNewMessages, tick,
  onOpenChat, onOpenHistory, onOpenDossier, onOpenProfile, onLeaveRoom,
  playSound,
}: GameHeaderProps) => {
  const timerRemaining = gameState.actionTimerEnd
    ? Math.max(0, Math.ceil((gameState.actionTimerEnd - Date.now()) / 1000))
    : null;

  return (
    <header className="h-[8vh] sm:h-[10vh] border-b border-[#222] bg-[#1a1a1a] px-[2vw] sm:px-[4vw] flex items-center justify-between shrink-0 shadow-lg z-10">
      <div className="flex items-center gap-[1vw] sm:gap-[2vw]">
        <div className="w-[4vh] h-[4vh] sm:w-[5vh] sm:h-[5vh] bg-[#141414] rounded-xl flex items-center justify-center border border-white/40 shrink-0 overflow-hidden">
          <img
            src={getProxiedUrl("https://storage.googleapis.com/secretchancellor/SC.png")}
            alt="The Assembly Logo"
            className="w-full h-full object-contain p-1"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="font-thematic text-responsive-sm sm:text-responsive-xl text-white tracking-wide leading-none truncate">The Assembly</div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
            <span className="text-responsive-xs font-mono text-[#444] uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate">
              {gameState.roomId}
            </span>
            <span className="text-responsive-xs font-mono text-red-500/50 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 shrink-0">
              <div className="w-1 h-1 rounded-full bg-red-500/50" />
              R{gameState.round}
            </span>
            {timerRemaining !== null && (
              <span className="text-responsive-xs font-mono text-yellow-500 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 ml-1 sm:ml-2 shrink-0">
                <div className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse" />
                {timerRemaining}s
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-[1vw] sm:gap-[2vw]">
        {/* Chat */}
        <Tooltip content="Open Chat">
          <button
            onClick={() => { playSound('click'); onOpenChat(); }}
            className="p-[1vh] sm:p-[1.2vh] rounded-xl border border-[#333] bg-[#222] text-[#666] hover:text-white transition-all relative"
          >
            <MessageSquare className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh]" />
            {hasNewMessages && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full border border-[#1a1a1a]" />
            )}
          </button>
        </Tooltip>

        {/* History */}
        {gameState.roundHistory && gameState.roundHistory.length > 0 && (
          <Tooltip content="Round History">
            <button
              onClick={() => { playSound('click'); onOpenHistory(); }}
              className="p-[1vh] sm:p-[1.2vh] rounded-xl border border-[#333] bg-[#222] text-[#666] hover:text-white transition-all relative"
            >
              <BookOpen className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh]" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-500 rounded-full border border-[#1a1a1a] flex items-center justify-center">
                <span className="text-[7px] font-bold text-black leading-none">{gameState.roundHistory.length}</span>
              </span>
            </button>
          </Tooltip>
        )}

        {/* Dossier */}
        {gameState.phase !== 'Lobby' && (
          <Tooltip content="Your Dossier">
            <button
              onClick={() => { playSound('click'); onOpenDossier(); }}
              className={cn(
                'p-[1vh] sm:p-[1.2vh] rounded-xl border transition-all',
                privateInfo
                  ? privateInfo.role === 'Civil'
                    ? 'border-blue-900/50 bg-blue-900/20'
                    : 'border-red-900/50 bg-red-900/20'
                  : 'border-[#333] bg-[#222]'
              )}
            >
              {privateInfo?.role === 'Civil' ? (
                <Scale className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh] text-blue-400" />
              ) : privateInfo?.role === 'Overseer' ? (
                <OverseerIcon className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh] text-red-500" />
              ) : (
                <Eye className={cn('w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh]', privateInfo ? 'text-red-500' : 'text-[#666]')} />
              )}
            </button>
          </Tooltip>
        )}

        {/* Profile */}
        <Tooltip content="My Profile">
          <button
            onClick={() => { playSound('click'); onOpenProfile(); }}
            className="w-[4vh] h-[4vh] sm:w-[5vh] sm:h-[5vh] rounded-xl bg-[#222] border border-[#333] flex items-center justify-center hover:border-red-900/50 transition-colors relative shrink-0"
          >
            {user?.avatarUrl
              ? <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover rounded-xl" />
              : <UserIcon className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh] text-[#666]" />}
            {user?.activeFrame && (
              <div className={cn('absolute inset-0 rounded-xl pointer-events-none', getFrameStyles(user.activeFrame))} />
            )}
          </button>
        </Tooltip>

        <div className="w-[1px] h-[2.5vh] sm:h-[3vh] bg-[#222] mx-0.5 sm:mx-1" />

        {/* Leave */}
        <Tooltip content="Leave Assembly">
          <button
            onClick={onLeaveRoom}
            className="p-[1vh] sm:p-[1.2vh] text-[#444] hover:text-red-500 transition-colors bg-[#141414] border border-[#222] rounded-xl"
          >
            <LogOut className="w-[1.8vh] h-[1.8vh] sm:w-[2vh] sm:h-[2vh]" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
