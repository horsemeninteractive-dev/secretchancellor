import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'motion/react';
import { X, Trophy, User as UserIcon, UserPlus, UserMinus, Shield, Check, Zap } from 'lucide-react';
import { User } from '../../../types';
import { cn } from '../../../lib/utils';
import { getFrameStyles } from '../../../lib/cosmetics';
import { socket } from '../../../socket';

interface PlayerProfileModalProps {
  userId: string;
  token: string;
  onClose: () => void;
  playSound: (sound: string) => void;
  onSendFriendRequest: (userId: string) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({ userId, token, onClose, playSound, onSendFriendRequest }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`/api/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.user) {
            setUser(data.user);
            setIsFriend(!!data.isFriend);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();

    socket.on('friendRequestAccepted', (data: { fromUserId: string }) => {
      if (data.fromUserId === userId) {
        setIsFriend(true);
        setIsPending(false);
      }
    });

    return () => {
      socket.off('friendRequestAccepted');
    };
  }, [userId, token]);

  const toggleFriend = async () => {
    playSound('click');
    try {
      if (isFriend) {
        await fetch(`/api/friends/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsFriend(false);
      } else {
        onSendFriendRequest(userId);
        setIsPending(true);
      }
    } catch (err) {
      console.error("Failed to toggle friend", err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="text-white font-mono">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="text-white font-mono">Failed to load profile.</div>
        <button onClick={onClose} className="ml-4 text-white underline">Close</button>
      </div>
    );
  }

  const winRate = user.stats.gamesPlayed > 0 
    ? Math.round((user.stats.wins / user.stats.gamesPlayed) * 100) 
    : 0;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-[#1a1a1a] border border-[#222] rounded-[2rem] overflow-hidden shadow-2xl text-white"
      >
        {/* Header - Matching Profile.tsx */}
        <div className="p-6 bg-[#141414] border-b border-[#222] flex flex-col items-center gap-4">
          <button onClick={onClose} className="absolute top-6 right-6 text-[#444] hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>

          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden relative">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-10 h-10 text-[#444]" />
              )}
              {user.activeFrame && (
                <div className={cn(
                  "absolute inset-0 border-4 rounded-3xl pointer-events-none",
                  getFrameStyles(user.activeFrame)
                )} />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-red-900 border border-red-500 text-white text-[8px] font-mono px-2 py-0.5 rounded-lg shadow-lg">
              LVL {Math.floor(user.stats.gamesPlayed / 5) + 1}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-thematic text-white tracking-wide mb-2">{user.username}</h2>
            <div className="flex justify-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#222] rounded-lg border border-[#333]">
                <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-xs font-mono text-yellow-500">{user.stats.elo} ELO</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Wins" value={user.stats.wins} icon={<Trophy className="w-3 h-3" />} />
            <StatCard label="Played" value={user.stats.gamesPlayed} icon={<Shield className="w-3 h-3" />} />
            <StatCard label="Win Rate" value={`${winRate}%`} icon={<Check className="w-3 h-3" />} />
            <StatCard label="Kills" icon={<Zap className="w-3 h-3 text-yellow-500" />} value={user.stats.kills} />
          </div>

          <button 
            onClick={toggleFriend}
            disabled={isPending}
            className={cn(
              "w-full py-3 rounded-xl font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all border",
              isFriend 
                ? "bg-[#222] text-white border-[#333] hover:bg-[#333]" 
                : "bg-red-900 text-white border-red-700 hover:bg-red-800"
            )}
          >
            {isFriend ? <><UserMinus size={14} /> Remove Friend</> : isPending ? "Request Sent" : <><UserPlus size={14} /> Add Friend</>}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
  <div className="bg-[#141414] p-3 rounded-xl border border-[#222] flex flex-col gap-1">
    <div className="flex items-center gap-1.5 text-[#444]">
      {icon}
      <div className="text-[9px] uppercase tracking-wider font-mono">{label}</div>
    </div>
    <div className="text-lg font-serif italic text-white leading-none">{value}</div>
  </div>
);
