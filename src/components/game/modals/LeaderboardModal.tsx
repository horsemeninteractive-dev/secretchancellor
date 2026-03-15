import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Trophy } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { User } from '../../../types';

interface LeaderboardModalProps {
  user: User;
  onClose: () => void;
}

export const LeaderboardModal = ({ user, onClose }: LeaderboardModalProps) => {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ELO' | 'Win%' | 'Games'>('ELO');

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => {
        setLeaderboard(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const sortedData = [...leaderboard].sort((a, b) => {
    if (activeTab === 'ELO') {
      return (b.stats.elo || 0) - (a.stats.elo || 0);
    } else if (activeTab === 'Win%') {
      const winRateA = (a.stats.gamesPlayed || 0) > 0 ? (a.stats.wins || 0) / a.stats.gamesPlayed : 0;
      const winRateB = (b.stats.gamesPlayed || 0) > 0 ? (b.stats.wins || 0) / b.stats.gamesPlayed : 0;
      return winRateB - winRateA;
    } else {
      return (b.stats.gamesPlayed || 0) - (a.stats.gamesPlayed || 0);
    }
  });

  const currentUserRank = sortedData.findIndex(u => u.id === user.id) + 1;
  const currentUserData = sortedData.find(u => u.id === user.id);

  const getRankDisplay = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="fixed inset-0 bg-backdrop flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-default rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-thematic text-primary flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Ranked Leaderboard
          </h2>
          <button onClick={onClose} className="p-2 text-muted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 mb-6 border-b border-default">
          <button 
            onClick={() => setActiveTab('ELO')} 
            className={cn("pb-2 border-b-2 font-mono text-sm uppercase tracking-widest transition-colors", activeTab === 'ELO' ? "border-yellow-500 text-primary" : "border-transparent text-muted")}
          >
            ELO
          </button>
          <button 
            onClick={() => setActiveTab('Win%')} 
            className={cn("pb-2 border-b-2 font-mono text-sm uppercase tracking-widest transition-colors", activeTab === 'Win%' ? "border-emerald-500 text-primary" : "border-transparent text-muted")}
          >
            Win%
          </button>
          <button 
            onClick={() => setActiveTab('Games')} 
            className={cn("pb-2 border-b-2 font-mono text-sm uppercase tracking-widest transition-colors", activeTab === 'Games' ? "border-blue-500 text-primary" : "border-transparent text-muted")}
          >
            Games
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 mb-6">
          {loading ? (
            <div className="text-center text-muted py-10">Loading...</div>
          ) : (
            <div className="flex items-center gap-4 px-3 text-[10px] uppercase tracking-widest text-muted font-mono mb-2">
              <div className="w-8 text-center">#</div>
              <div className="flex-1">Name</div>
              <div className="text-right w-16">{activeTab}</div>
            </div>
          )}
          {sortedData.map((u, i) => {
            const wins = u.stats.wins || 0;
            const games = u.stats.gamesPlayed || 0;
            const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : '0.0';
            const displayName = u.username.length > 15 ? `${u.username.substring(0, 15)}...` : u.username;
            
            let statValue: string | number = u.stats.elo;
            if (activeTab === 'Win%') statValue = `${winRate}%`;
            else if (activeTab === 'Games') statValue = u.stats.gamesPlayed || 0;

            let statColor = "text-yellow-500";
            if (activeTab === 'Win%') statColor = "text-emerald-500";
            else if (activeTab === 'Games') statColor = "text-blue-500";

            return (
              <div key={u.id} className={cn("flex items-center gap-4 p-3 rounded-xl border", u.id === user.id ? "bg-red-900/10 border-red-900/50" : "bg-card border-default")}>
                <div className="w-8 text-center font-mono text-muted shrink-0">{getRankDisplay(i)}</div>
                <div className="flex-1 font-medium text-primary truncate" title={u.username}>{displayName}</div>
                <div className={cn("font-mono text-right w-16 shrink-0", statColor)}>
                  {statValue}
                </div>
              </div>
            );
          })}
        </div>
        
        {currentUserData && (
          <div className="pt-4 border-t border-default">
            <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-2">Your Rank</div>
            <div className="flex items-center gap-4 p-3 bg-card rounded-xl border border-red-900/50">
              <div className="w-8 text-center font-mono text-muted shrink-0">#{currentUserRank}</div>
              <div className="flex-1 font-medium text-primary truncate">{currentUserData.username}</div>
              <div className={cn("font-mono text-right w-16 shrink-0", activeTab === 'ELO' ? "text-yellow-500" : activeTab === 'Win%' ? "text-emerald-500" : "text-blue-500")}>
                {activeTab === 'ELO' ? currentUserData.stats.elo : activeTab === 'Win%' ? `${((currentUserData.stats.wins || 0) / (currentUserData.stats.gamesPlayed || 1) * 100).toFixed(1)}%` : currentUserData.stats.gamesPlayed || 0}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
