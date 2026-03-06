import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, MessageSquare, LogOut, User as UserIcon, Trophy, Coins, Settings } from 'lucide-react';
import { User, RoomInfo } from '../types';
import { cn } from '../lib/utils';

interface LobbyProps {
  user: User;
  onJoinRoom: (roomId: string, maxPlayers?: number, actionTimer?: number, mode?: 'Casual' | 'Ranked', isSpectator?: boolean) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ user, onJoinRoom, onLogout, onOpenProfile }) => {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [rejoinInfo, setRejoinInfo] = useState<{ canRejoin: boolean; roomId?: string; roomName?: string; mode?: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
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

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      onJoinRoom(newRoomName.trim(), maxPlayers, actionTimer, mode);
    }
  };

  return (
    <div className="min-h-screen bg-texture text-white font-sans flex flex-col">
      {/* Header */}
      <header className="h-20 border-b border-[#222] bg-[#1a1a1a]/50 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#141414] rounded-xl flex items-center justify-center border border-white/40 shrink-0 overflow-hidden">
            <img src="https://storage.googleapis.com/secretchancellor/SC.png" alt="Secret Chancellor Logo" className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-2xl font-thematic text-white tracking-wide leading-none truncate">Secret Chancellor</h1>
            <p className="text-[8px] sm:text-[10px] uppercase tracking-widest text-[#666] font-mono mt-0.5">Assembly Lobby</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-[#141414] border border-[#222] rounded-2xl">
            <div className="flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-xs font-mono text-yellow-500">{user.stats.elo} ELO</span>
            </div>
            <div className="w-px h-4 bg-[#222]" />
            <div className="flex items-center gap-2">
              <Coins className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-mono text-emerald-500">{user.stats.points} PTS</span>
            </div>
          </div>

          <button 
            onClick={onOpenProfile}
            className="flex items-center gap-3 group"
          >
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium group-hover:text-red-500 transition-colors">{user.username}</div>
              <div className="text-[9px] uppercase tracking-widest text-[#666] font-mono">View Profile</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center group-hover:border-red-900/50 transition-colors overflow-hidden relative">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-[#666]" />
              )}
              {user.activeFrame && (
                <div className="absolute inset-0 border-2 border-red-500 rounded-xl pointer-events-none" />
              )}
            </div>
          </button>

          <button 
            onClick={onLogout}
            className="p-2.5 text-[#444] hover:text-red-500 transition-colors bg-[#141414] border border-[#222] rounded-xl"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col gap-8">
        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-thematic text-white tracking-wide">Available Assemblies</h2>
            <p className="text-xs text-[#666] mt-1">Join an existing assembly or start your own.</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black px-8 py-3 rounded-2xl font-thematic text-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5"
          >
            <Plus className="w-5 h-5" />
            Start New Assembly
          </button>
        </div>

        {/* Rejoin Banner */}
        <AnimatePresence>
          {rejoinInfo?.canRejoin && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-900/20 border border-red-900/50 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-900/20 rounded-2xl flex items-center justify-center border border-red-500/30">
                  <LogOut className="w-6 h-6 text-red-500 rotate-180" />
                </div>
                <div>
                  <h3 className="text-lg font-serif italic text-white">Active Assembly Found</h3>
                  <p className="text-xs text-red-500/70 font-mono uppercase tracking-widest">You disconnected from: {rejoinInfo.roomName}</p>
                </div>
              </div>
              <button 
                onClick={() => onJoinRoom(rejoinInfo.roomId!)}
                className="w-full sm:w-auto bg-red-600 text-white px-8 py-3 rounded-xl font-thematic text-lg hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
              >
                Rejoin Game
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Room Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-[#1a1a1a] border border-[#222] rounded-3xl animate-pulse" />
            ))
          ) : rooms.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center bg-[#1a1a1a] border border-dashed border-[#222] rounded-3xl">
              <MessageSquare className="w-12 h-12 text-[#222] mb-4" />
              <p className="text-[#666] font-serif italic">No active rooms found.</p>
              <button 
                onClick={() => setIsCreating(true)}
                className="mt-4 text-xs text-red-500 font-mono uppercase tracking-widest hover:underline"
              >
                Be the first to create one
              </button>
            </div>
          ) : (
            rooms.map((room) => (
              <motion.button
                key={room.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4 }}
                onClick={() => onJoinRoom(room.id)}
                className="group relative bg-[#1a1a1a] border border-[#222] rounded-3xl p-6 text-left transition-all hover:border-red-900/50 hover:shadow-2xl hover:shadow-red-900/5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-[#141414] border border-[#222] rounded-2xl flex items-center justify-center group-hover:bg-red-900/10 group-hover:border-red-900/30 transition-colors">
                    <Users className="w-6 h-6 text-[#444] group-hover:text-red-500 transition-colors" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest border",
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

                <h3 className="text-lg font-serif italic mb-1 group-hover:text-white transition-colors">{room.name}</h3>
                
                {/* Player Avatars */}
                <div className="flex -space-x-2 mb-4 overflow-hidden">
                  {room.playerAvatars.slice(0, 5).map((avatar, idx) => (
                    <div key={idx} className="w-6 h-6 rounded-full border border-[#1a1a1a] bg-[#222] overflow-hidden">
                      <img src={avatar} alt="Player" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {room.playerAvatars.length > 5 && (
                    <div className="w-6 h-6 rounded-full border border-[#1a1a1a] bg-[#222] flex items-center justify-center text-[8px] font-mono text-[#666]">
                      +{room.playerAvatars.length - 5}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[#666] text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {room.playerCount}/{room.maxPlayers}
                  </div>
                  <div className="w-1 h-1 bg-[#333] rounded-full" />
                  <div>{room.phase.replace('_', ' ')}</div>
                </div>

                <div className="mt-4 flex gap-2 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinRoom(room.id);
                    }}
                    className="flex-1 py-1.5 bg-white text-black text-[9px] font-mono uppercase tracking-widest rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Join
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoinRoom(room.id, undefined, undefined, undefined, true);
                    }}
                    className="flex-1 py-1.5 bg-[#222] text-white text-[9px] font-mono uppercase tracking-widest rounded-lg border border-[#333] hover:bg-[#333] transition-colors"
                  >
                    Spectate
                  </button>
                </div>
              </motion.button>
            ))
          )}
        </div>
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
              className="relative w-full max-w-md bg-[#1a1a1a] border border-[#222] rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-serif italic mb-6">Establish New Assembly</h2>
              <form onSubmit={handleCreateRoom} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono ml-1">Room Name</label>
                  <input 
                    autoFocus
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full bg-[#141414] border border-[#222] rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-red-900/50 transition-colors"
                    placeholder="e.g. Berlin 1933"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono">Max Players</label>
                    <span className="text-xs font-mono text-red-500">{maxPlayers}</span>
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
                    <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono">Action Timer</label>
                    <span className="text-xs font-mono text-red-500">{actionTimer === 0 ? 'OFF' : `${actionTimer}s`}</span>
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
                  <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono ml-1">Game Mode</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setMode('Ranked')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border text-[10px] font-mono uppercase tracking-widest transition-all",
                        mode === 'Ranked' ? "bg-yellow-900/20 border-yellow-500 text-yellow-500" : "bg-[#141414] border-[#222] text-[#444]"
                      )}
                    >
                      Ranked
                    </button>
                    <button 
                      type="button"
                      onClick={() => setMode('Casual')}
                      className={cn(
                        "flex-1 py-2 rounded-xl border text-[10px] font-mono uppercase tracking-widest transition-all",
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
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-3 border border-[#222] text-[#666] font-serif italic rounded-xl hover:bg-[#222] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-white text-black font-serif italic rounded-xl hover:bg-gray-200 transition-colors"
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
