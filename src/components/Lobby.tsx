import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, MessageSquare, LogOut, User as UserIcon, Trophy, Coins, Settings, Zap } from 'lucide-react';
import { User, RoomInfo } from '../types';
import { cn, getProxiedUrl } from '../lib/utils';
import { getFrameStyles } from '../lib/cosmetics';
import { LeaderboardModal } from './game/modals/LeaderboardModal';

interface LobbyProps {
  user: User;
  onJoinRoom: (roomId: string, maxPlayers?: number, actionTimer?: number, mode?: 'Casual' | 'Ranked', isSpectator?: boolean) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  playSound: (soundKey: string) => void;
}

import { getBackgroundTexture } from '../lib/cosmetics';

export const Lobby: React.FC<LobbyProps> = ({ user, onJoinRoom, onLogout, onOpenProfile, playSound }) => {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [rejoinInfo, setRejoinInfo] = useState<{ canRejoin: boolean; roomId?: string; roomName?: string; mode?: string } | null>(null);
  const [globalStats, setGlobalStats] = useState<{ civilWins: number; stateWins: number }>({ civilWins: 0, stateWins: 0 });
  const [isCreating, setIsCreating] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [actionTimer, setActionTimer] = useState(60);
  const [mode, setMode] = useState<'Casual' | 'Ranked'>('Ranked');
  const [isLoading, setIsLoading] = useState(true);

  const fetchRooms = async () => {
    try {
      const response = await fetch('/api/rooms');
      const data = await response.json();
      setRooms(data);
      
      // Check for rejoin info
      const rejoinResponse = await fetch(`/api/rejoin-info?userId=${user.id}`);
      const rejoinData = await rejoinResponse.json();
      setRejoinInfo(rejoinData);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const response = await fetch('/api/global-stats');
      const data = await response.json();
      setGlobalStats(data);
    } catch (err) {
      console.error('Failed to fetch global stats', err);
    }
  };

  useEffect(() => {
    fetchRooms();
    fetchGlobalStats();
    const interval = setInterval(() => {
      fetchRooms();
      fetchGlobalStats();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      onJoinRoom(newRoomName.trim(), maxPlayers, actionTimer, mode);
    }
  };

  return (
    <div 
      className="flex-1 w-full bg-texture text-white font-sans flex flex-col"
      style={{ 
        backgroundImage: `radial-gradient(circle at 50% 50%, rgba(20, 20, 20, 0.5) 0%, rgba(10, 10, 10, 0.8) 100%), url("${getProxiedUrl(getBackgroundTexture(user.activeBackground))}")` 
      }}
    >
      {/* Header */}
      <header className="h-[8vh] sm:h-[10vh] border-b border-[#222] bg-[#1a1a1a]/50 backdrop-blur-xl px-[4vw] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-[1vw] sm:gap-[2vw] min-w-0 flex-1">
          <div className="w-[4vh] h-[4vh] sm:w-[5vh] sm:h-[5vh] bg-[#141414] rounded-xl flex items-center justify-center border border-white/40 shrink-0 overflow-hidden">
            <img src={getProxiedUrl("https://storage.googleapis.com/secretchancellor/SC.png")} alt="The Assembly Logo" className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-responsive-sm sm:text-responsive-xl font-thematic text-white tracking-wide leading-none truncate">The Assembly</h1>
              <span className="text-[8px] font-mono text-red-500/60 border border-red-900/40 rounded px-1 py-0.5 leading-none shrink-0">v0.9.2</span>
            </div>
            <p className="text-responsive-xs uppercase tracking-widest text-[#666] font-mono mt-0.5">Assembly Lobby</p>
          </div>
        </div>

        {/* Centered Stats */}
        <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-4 px-4 py-2 bg-[#141414] border border-[#222] rounded-2xl">
          <div className="flex items-center gap-2">
            <Trophy className="w-[1.8vh] h-[1.8vh] text-yellow-500" />
            <span className="text-responsive-xs font-mono text-yellow-500">{user.stats.elo} ELO</span>
          </div>
          <div className="w-px h-4 bg-[#222]" />
          <div className="flex items-center gap-2">
            <Coins className="w-[1.8vh] h-[1.8vh] text-emerald-500" />
            <span className="text-responsive-xs font-mono text-emerald-500">{user.stats.points} PTS</span>
          </div>
          <div className="w-px h-4 bg-[#222]" />
          <div className="flex items-center gap-2">
            <Zap className="w-[1.8vh] h-[1.8vh] text-purple-500" />
            <span className="text-responsive-xs font-mono text-purple-500">{user.cabinetPoints} CP</span>
          </div>
        </div>

        <div className="flex items-center gap-[2vw] sm:gap-[3vw] flex-1 justify-end">
          <button 
            onClick={() => {
              playSound('click');
              onOpenProfile();
            }}
            className="flex items-center gap-3 group"
          >
            <div className="text-right hidden sm:block">
              <div className="text-responsive-xs font-medium group-hover:text-red-500 transition-colors">{user.username}</div>
              <div className="text-responsive-xs uppercase tracking-widest text-[#666] font-mono">View Profile</div>
            </div>
            <div className="w-[4vh] h-[4vh] sm:w-[5vh] sm:h-[5vh] rounded-xl bg-[#222] border border-[#333] flex items-center justify-center group-hover:border-red-900/50 transition-colors relative">
              {user.avatarUrl ? (
                <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <UserIcon className="w-[2vh] h-[2vh] text-[#666]" />
              )}
              {user.activeFrame && (
                <div className={cn("absolute inset-0 rounded-xl pointer-events-none", getFrameStyles(user.activeFrame))} />
              )}
            </div>
          </button>

          <button 
            onClick={() => {
              playSound('click');
              setIsLeaderboardOpen(true);
            }}
            className="w-[4vh] h-[4vh] sm:w-[5vh] sm:h-[5vh] rounded-xl bg-[#222] border border-[#333] flex items-center justify-center hover:border-yellow-900/50 transition-colors"
          >
            <Trophy className="w-[2vh] h-[2vh] text-yellow-500" />
          </button>

          <button 
            onClick={() => {
              playSound('click');
              onLogout();
            }}
            className="p-[1vh] sm:p-[1.2vh] text-[#444] hover:text-red-500 transition-colors bg-[#141414] border border-[#222] rounded-xl"
          >
            <LogOut className="w-[2vh] h-[2vh]" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-[4vw] flex flex-col gap-[4vh]">
        {/* Actions (Header/Text) & Swing Meter */}
        <div className="flex flex-col lg:flex-row items-stretch gap-4">
          <div className="bg-[#1a1a1a] border border-[#222] rounded-3xl p-[2vh] flex flex-col justify-center text-center lg:text-left">
            <h2 className="text-responsive-2xl sm:text-responsive-3xl font-thematic text-white tracking-wide">Available Assemblies</h2>
            <p className="text-responsive-xs text-[#666] mt-1">Join an existing session or convene your own.</p>
          </div>

          {/* Swing Meter */}
          <div className="flex-1 bg-[#1a1a1a] border border-[#222] rounded-3xl p-[2vh] flex flex-col justify-center">
              <div className="flex items-center justify-between text-responsive-xs font-mono uppercase tracking-widest mb-2">
                  <span className="text-blue-500">Civil</span>
                  <span className="font-thematic text-responsive-xl">
                      <span className="text-blue-500">{globalStats.civilWins}</span>
                      <span className="text-white mx-2">v</span>
                      <span className="text-red-500">{globalStats.stateWins}</span>
                  </span>
                  <span className="text-red-500">State</span>
              </div>
              <div className="w-full h-3 bg-[#141414] rounded-full overflow-hidden flex">
                  <div className="bg-blue-600 h-full" style={{ width: `${(globalStats.civilWins / (globalStats.civilWins + globalStats.stateWins || 1)) * 100}%` }}></div>
                  <div className="bg-red-600 h-full" style={{ width: `${(globalStats.stateWins / (globalStats.civilWins + globalStats.stateWins || 1)) * 100}%` }}></div>
              </div>
          </div>
        </div>

        {/* Start New Assembly Button */}
        <button 
          onClick={() => {
            playSound('click');
            setIsCreating(true);
          }}
          className="w-full flex items-center justify-center gap-2 bg-white text-black px-[4vw] py-[1.5vh] rounded-2xl font-thematic text-responsive-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5"
        >
          <Plus className="w-[2vh] h-[2vh]" />
          Start New Assembly
        </button>

        {/* Rejoin Banner */}
        <AnimatePresence>
          {rejoinInfo?.canRejoin && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-900/20 border border-red-900/50 rounded-3xl p-[2vh] flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-[6vh] h-[6vh] bg-red-900/20 rounded-2xl flex items-center justify-center border border-red-500/30">
                  <LogOut className="w-[3vh] h-[3vh] text-red-500 rotate-180" />
                </div>
                <div>
                  <h3 className="text-responsive-sm font-serif italic text-white">Active Assembly Found</h3>
                  <p className="text-responsive-xs text-red-500/70 font-mono uppercase tracking-widest">You disconnected from: {rejoinInfo.roomName}</p>
                </div>
              </div>
              <button 
                onClick={() => onJoinRoom(rejoinInfo.roomId!)}
                className="w-full sm:w-auto bg-red-600 text-white px-[4vw] py-[1.2vh] rounded-xl font-thematic text-responsive-sm hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
              >
                Rejoin Game
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Room Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[2vh]">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[20vh] bg-[#1a1a1a] border border-[#222] rounded-3xl animate-pulse" />
            ))
          ) : rooms.length === 0 ? (
            <div className="col-span-full py-[10vh] flex flex-col items-center justify-center text-center bg-[#1a1a1a] border border-dashed border-[#222] rounded-3xl">
              <MessageSquare className="w-[6vh] h-[6vh] text-[#222] mb-4" />
              <p className="text-responsive-sm text-[#666] font-serif italic">No active rooms found.</p>
              <button 
                onClick={() => setIsCreating(true)}
                className="mt-4 text-responsive-xs text-red-500 font-mono uppercase tracking-widest hover:underline"
              >
                Be the first to create one
              </button>
            </div>
          ) : (
            rooms.map((room) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4 }}
                onClick={() => {
                  playSound('click');
                  onJoinRoom(room.id);
                }}
                className="group relative bg-[#1a1a1a] border border-[#222] rounded-3xl p-[2vh] text-left transition-all hover:border-red-900/50 hover:shadow-2xl hover:shadow-red-900/5 cursor-pointer"
              >
                <div className="flex items-start justify-between mb-[2vh]">
                  <div className="w-[6vh] h-[6vh] bg-[#141414] border border-[#222] rounded-2xl flex items-center justify-center group-hover:bg-red-900/10 group-hover:border-red-900/30 transition-colors">
                    <Users className="w-[3vh] h-[3vh] text-[#444] group-hover:text-red-500 transition-colors" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-responsive-xs font-mono uppercase tracking-widest border",
                      room.phase === 'Lobby' ? "bg-emerald-900/10 border-emerald-900/30 text-emerald-500" : "bg-red-900/10 border-red-900/30 text-red-500"
                    )}>
                      {room.phase === 'Lobby' ? 'Recruiting' : 'In Progress'}
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-[7px] font-mono uppercase tracking-widest border",
                      room.mode === 'Ranked' ? "bg-yellow-900/10 border-yellow-900/30 text-yellow-500" : "bg-blue-900/10 border-blue-900/30 text-blue-400"
                    )}>
                      {room.mode}
                    </div>
                  </div>
                </div>

                <h3 className="text-responsive-sm font-serif italic mb-1 group-hover:text-white transition-colors">{room.name}</h3>
                
                {/* Player Avatars */}
                <div className="flex -space-x-2 mb-[2vh] overflow-hidden">
                  {room.playerAvatars.slice(0, 5).map((avatar, idx) => (
                    <div key={idx} className="w-[3vh] h-[3vh] rounded-full border border-[#1a1a1a] bg-[#222] overflow-hidden">
                      <img src={getProxiedUrl(avatar)} alt="Player" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {room.playerAvatars.length > 5 && (
                    <div className="w-[3vh] h-[3vh] rounded-full border border-[#1a1a1a] bg-[#222] flex items-center justify-center text-[8px] font-mono text-[#666]">
                      +{room.playerAvatars.length - 5}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[#666] text-responsive-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-[1.5vh] h-[1.5vh]" />
                    {room.playerCount}/{room.maxPlayers}
                  </div>
                  <div className="w-1 h-1 bg-[#333] rounded-full" />
                  <div>{room.phase.replace('_', ' ')}</div>
                </div>

                <div className="mt-[2vh] flex gap-2 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinRoom(room.id);
                    }}
                    className="flex-1 py-[1vh] bg-white text-black text-responsive-xs font-mono uppercase tracking-widest rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Join
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinRoom(room.id, undefined, undefined, undefined, true);
                    }}
                    className="flex-1 py-[1vh] bg-[#222] text-white text-responsive-xs font-mono uppercase tracking-widest rounded-lg border border-[#333] hover:bg-[#333] transition-colors"
                  >
                    Spectate
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {isLeaderboardOpen && (
          <LeaderboardModal user={user} onClose={() => setIsLeaderboardOpen(false)} />
        )}
      </main>

      {/* Create Room Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#1a1a1a] border border-[#222] rounded-3xl p-[4vh] shadow-2xl"
            >
              <h2 className="text-responsive-xl font-serif italic mb-[3vh]">Establish New Assembly</h2>
              <form onSubmit={handleCreateRoom} className="space-y-[2vh]">
                <div className="space-y-2">
                  <label className="text-responsive-xs uppercase tracking-widest text-[#444] font-mono ml-1">Room Name</label>
                  <input 
                    autoFocus
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-[#141414] border border-[#222] rounded-xl py-[1.2vh] px-4 text-responsive-sm text-white focus:outline-none focus:border-red-900/50 transition-colors"
                    placeholder="e.g. Berlin 1933"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-responsive-xs uppercase tracking-widest text-[#444] font-mono">Max Players</label>
                    <span className="text-responsive-sm font-mono text-red-500">{maxPlayers}</span>
                  </div>
                  <input 
                    type="range"
                    min="5"
                    max="10"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#222] rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between text-[8px] text-[#444] font-mono uppercase tracking-tighter">
                    <span>5 Players</span>
                    <span>10 Players</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-responsive-xs uppercase tracking-widest text-[#444] font-mono">Action Timer</label>
                    <span className="text-responsive-sm font-mono text-red-500">{actionTimer === 0 ? 'OFF' : `${actionTimer}s`}</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="120"
                    step="15"
                    value={actionTimer}
                    onChange={(e) => setActionTimer(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#222] rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <div className="flex justify-between text-[8px] text-[#444] font-mono uppercase tracking-tighter">
                    <span>OFF</span>
                    <span>120s</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-responsive-xs uppercase tracking-widest text-[#444] font-mono ml-1">Game Mode</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setMode('Ranked')}
                      className={cn(
                        "flex-1 py-[1vh] rounded-xl border text-responsive-xs font-mono uppercase tracking-widest transition-all",
                        mode === 'Ranked' ? "bg-yellow-900/20 border-yellow-500 text-yellow-500" : "bg-[#141414] border-[#222] text-[#444]"
                      )}
                    >
                      Ranked
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMode('Casual')}
                      className={cn(
                        "flex-1 py-[1vh] rounded-xl border text-responsive-xs font-mono uppercase tracking-widest transition-all",
                        mode === 'Casual' ? "bg-blue-900/20 border-blue-500 text-blue-400" : "bg-[#141414] border-[#222] text-[#444]"
                      )}
                    >
                      Casual
                    </button>
                  </div>
                  <p className="text-[8px] text-[#444] italic ml-1">
                    {mode === 'Ranked' ? 'ELO and full points awarded.' : 'No ELO changes, reduced points.'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      playSound('click');
                      setIsCreating(false);
                    }}
                    className="flex-1 py-[1.2vh] border border-[#222] text-responsive-xs text-[#666] font-serif italic rounded-xl hover:bg-[#222] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-[1.2vh] bg-white text-black text-responsive-xs font-serif italic rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Create Room
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
