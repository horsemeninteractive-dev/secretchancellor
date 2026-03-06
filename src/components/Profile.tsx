import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Coins, Shield, User as UserIcon, Check, ShoppingBag, ArrowLeft, Star, Heart, Zap, Flame, Scroll } from 'lucide-react';
import { User, CosmeticItem, Policy } from '../types';
import { cn } from '../lib/utils';
import { getPolicyStyles, getVoteStyles, getFrameStyles } from '../lib/cosmetics';

interface ProfileProps {
  user: User;
  onClose: () => void;
  onUpdateUser: (user: User) => void;
  token: string;
}

const SHOP_ITEMS: CosmeticItem[] = [
  // Frames
  { id: 'frame-red', name: 'Crimson Order', price: 500, type: 'frame', description: 'A standard fascist-themed border.' },
  { id: 'frame-gold', name: 'Golden Assembly', price: 1500, type: 'frame', description: 'For the most distinguished delegates.' },
  { id: 'frame-blue', name: 'Liberal Guard', price: 500, type: 'frame', description: 'A standard liberal-themed border.' },
  { id: 'frame-rainbow', name: 'Spectrum Delegate', price: 3000, type: 'frame', description: 'A vibrant, shifting spectrum of colors.' },
  { id: 'frame-neon', name: 'Neon Resistance', price: 2000, type: 'frame', description: 'Glows with the energy of the underground.' },
  { id: 'frame-shadow', name: 'Shadow Cabal', price: 1000, type: 'frame', description: 'A dark, brooding frame for the secretive.' },
  
  // Decorative Frames (Discord-like)
  { id: 'frame-thorns', name: 'Crown of Thorns', price: 2500, type: 'frame', description: 'Intricate thorny vines wrapping around your avatar.' },
  { id: 'frame-cyber', name: 'Cybernetic Link', price: 3500, type: 'frame', description: 'High-tech circuitry and glowing data streams.' },
  { id: 'frame-inferno', name: 'Eternal Inferno', price: 4000, type: 'frame', description: 'Animated flames licking the edges of your profile.' },
  { id: 'frame-glitch', name: 'System Glitch', price: 3000, type: 'frame', description: 'Digital artifacts and chromatic aberration.' },
  { id: 'frame-royal', name: 'Royal Crest', price: 5000, type: 'frame', description: 'Ornate silver and sapphire decorations.' },

  // Policy Cards
  { id: 'policy-vintage', name: 'Vintage Press', price: 1200, type: 'policy', description: 'A classic, weathered newspaper aesthetic.' },
  { id: 'policy-modern', name: 'Modern Minimal', price: 1000, type: 'policy', description: 'Clean lines and bold typography.' },
  { id: 'policy-blueprint', name: 'Statist Blueprint', price: 1500, type: 'policy', description: 'Technical drawings on blueprint paper.' },
  { id: 'policy-blood', name: 'Blood & Iron', price: 2000, type: 'policy', description: 'Industrial metal with crimson accents.' },

  // Voting Cards
  { id: 'vote-classic', name: 'Classic Ballot', price: 800, type: 'vote', description: 'Traditional paper ballots.' },
  { id: 'vote-wax', name: 'Wax Seal', price: 1800, type: 'vote', description: 'Official documents sealed with red wax.' },
  { id: 'vote-digital', name: 'Digital Consensus', price: 1500, type: 'vote', description: 'Holographic voting interface.' },
  { id: 'vote-ancient', name: 'Ancient Ostracon', price: 2500, type: 'vote', description: 'Pottery shards used in ancient democracy.' },
];

export const Profile: React.FC<ProfileProps> = ({ user, onClose, onUpdateUser, token }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'shop'>('stats');
  const [shopCategory, setShopCategory] = useState<'frame' | 'policy' | 'vote'>('frame');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBuy = async (item: CosmeticItem) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ itemId: item.id, price: item.price }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onUpdateUser(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEquip = async (type: 'frame' | 'policy' | 'vote', itemId: string | undefined) => {
    setIsLoading(true);
    setError('');
    try {
      const body: any = {};
      if (type === 'frame') body.frameId = itemId;
      if (type === 'policy') body.policyStyle = itemId;
      if (type === 'vote') body.votingStyle = itemId;

      const response = await fetch('/api/profile/frame', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onUpdateUser(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const winRate = user.stats.gamesPlayed > 0 
    ? Math.round((user.stats.wins / user.stats.gamesPlayed) * 100) 
    : 0;

  const filteredItems = SHOP_ITEMS.filter(item => item.type === shopCategory);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
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
        className="relative w-full max-w-4xl bg-[#1a1a1a] border border-[#222] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 bg-[#141414] border-b border-[#222] flex flex-col sm:flex-row items-center gap-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden relative">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-12 h-12 text-[#444]" />
              )}
              {user.activeFrame && (
                <div className={cn(
                  "absolute inset-0 border-4 rounded-3xl pointer-events-none",
                  getFrameStyles(user.activeFrame)
                )} />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-red-900 border border-red-500 text-white text-[10px] font-mono px-2 py-1 rounded-lg shadow-lg">
              LVL {Math.floor(user.stats.gamesPlayed / 5) + 1}
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-4xl font-thematic text-white tracking-wide mb-2">{user.username}</h2>
            <div className="flex flex-wrap justify-center sm:justify-start gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#222] rounded-xl border border-[#333]">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-mono text-yellow-500">{user.stats.elo} ELO</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#222] rounded-xl border border-[#333]">
                <Coins className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-mono text-emerald-500">{user.stats.points} PTS</span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-[#444] hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#222]">
          <button 
            onClick={() => setActiveTab('stats')}
            className={cn(
              "flex-1 py-4 text-xs font-mono uppercase tracking-widest transition-all relative",
              activeTab === 'stats' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Statistics
            {activeTab === 'stats' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => setActiveTab('shop')}
            className={cn(
              "flex-1 py-4 text-xs font-mono uppercase tracking-widest transition-all relative",
              activeTab === 'shop' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Cosmetic Shop
            {activeTab === 'shop' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'stats' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <StatCard label="Games Played" value={user.stats.gamesPlayed} icon={<Shield className="w-4 h-4" />} />
              <StatCard label="Win Rate" value={`${winRate}%`} icon={<Trophy className="w-4 h-4" />} />
              <StatCard label="Total Wins" value={user.stats.wins} icon={<Check className="w-4 h-4" />} />
              <StatCard label="Liberal Games" value={user.stats.liberalGames} icon={<Star className="w-4 h-4" />} />
              <StatCard label="Fascist Games" value={user.stats.fascistGames} icon={<Flame className="w-4 h-4" />} />
              <StatCard label="Hitler Games" value={user.stats.hitlerGames} icon={<Shield className="w-4 h-4" />} />
              <StatCard label="Kills" value={user.stats.kills} icon={<Zap className="w-4 h-4 text-yellow-500" />} />
              <StatCard label="Deaths" value={user.stats.deaths} icon={<Heart className="w-4 h-4 text-red-500" />} />
            </div>
          ) : (
            <div className="space-y-8">
              {error && (
                <div className="text-red-500 text-xs text-center font-mono bg-red-900/10 py-3 rounded-xl border border-red-900/20">
                  {error}
                </div>
              )}

              {/* Shop Categories */}
              <div className="flex gap-2 p-1 bg-[#141414] rounded-2xl border border-[#222] w-fit mx-auto mb-8">
                {(['frame', 'policy', 'vote'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setShopCategory(cat)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                      shopCategory === cat ? "bg-red-900 text-white" : "text-[#444] hover:text-[#666]"
                    )}
                  >
                    {cat}s
                  </button>
                ))}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Default Item */}
                <div className="bg-[#141414] border border-[#222] rounded-3xl p-6 flex flex-col items-center text-center group">
                  <div className="w-20 h-20 rounded-2xl bg-[#222] border border-[#333] mb-4 flex items-center justify-center overflow-hidden">
                    {shopCategory === 'frame' ? (
                      user.avatarUrl ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-[#444]" />
                    ) : shopCategory === 'policy' ? (
                      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getPolicyStyles(undefined, 'Liberal'))}>
                        <Scroll className="w-8 h-8" />
                        <span className="text-[8px] font-mono uppercase">Liberal</span>
                      </div>
                    ) : (
                      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getVoteStyles(undefined, 'Ja'))}>
                        <span className="text-lg font-thematic uppercase">Ja!</span>
                        <span className="text-[8px] font-mono uppercase">YES</span>
                      </div>
                    )}
                  </div>
                  <h4 className="font-serif italic text-lg mb-1 text-white">Default {shopCategory}</h4>
                  <p className="text-[10px] text-[#666] font-mono uppercase mb-4">Standard Issue</p>
                  <button 
                    onClick={() => handleEquip(shopCategory, null as any)}
                    disabled={
                      (shopCategory === 'frame' && !user.activeFrame) ||
                      (shopCategory === 'policy' && !user.activePolicyStyle) ||
                      (shopCategory === 'vote' && !user.activeVotingStyle)
                    }
                    className={cn(
                      "w-full py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                      ((shopCategory === 'frame' && !user.activeFrame) ||
                       (shopCategory === 'policy' && !user.activePolicyStyle) ||
                       (shopCategory === 'vote' && !user.activeVotingStyle)) ? "bg-emerald-900/20 text-emerald-500 border border-emerald-900/50" : "bg-[#222] text-white hover:bg-[#333]"
                    )}
                  >
                    {((shopCategory === 'frame' && !user.activeFrame) ||
                      (shopCategory === 'policy' && !user.activePolicyStyle) ||
                      (shopCategory === 'vote' && !user.activeVotingStyle)) ? 'Equipped' : 'Equip'}
                  </button>
                </div>

                {filteredItems.map((item) => {
                  const isOwned = user.ownedCosmetics.includes(item.id);
                  const isEquipped = 
                    (item.type === 'frame' && user.activeFrame === item.id) ||
                    (item.type === 'policy' && user.activePolicyStyle === item.id) ||
                    (item.type === 'vote' && user.activeVotingStyle === item.id);
                  
                  return (
                    <div key={item.id} className="bg-[#141414] border border-[#222] rounded-3xl p-6 flex flex-col items-center text-center group">
                      <div className="relative w-20 h-20 mb-4">
                        <div className="w-20 h-20 rounded-2xl bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden">
                          {item.type === 'frame' ? (
                            user.avatarUrl ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-[#444]" />
                          ) : item.type === 'policy' ? (
                            <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getPolicyStyles(item.id, 'Liberal'))}>
                              <Scroll className="w-8 h-8" />
                              <span className="text-[8px] font-mono uppercase">Liberal</span>
                            </div>
                          ) : (
                            <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getVoteStyles(item.id, 'Ja'))}>
                              <span className="text-lg font-thematic uppercase">Ja!</span>
                              <span className="text-[8px] font-mono uppercase">YES</span>
                            </div>
                          )}
                        </div>
                        {item.type === 'frame' && (
                          <div className={cn(
                            "absolute inset-0 border-4 rounded-2xl pointer-events-none",
                            getFrameStyles(item.id)
                          )} />
                        )}
                      </div>
                      <h4 className="font-serif italic text-lg mb-1 text-white">{item.name}</h4>
                      <p className="text-[10px] text-[#666] font-mono uppercase mb-2">{item.type} Style</p>
                      <p className="text-[10px] text-[#444] font-sans mb-4 line-clamp-2">{item.description}</p>
                      
                      {isOwned ? (
                        <button 
                          onClick={() => handleEquip(item.type as any, item.id)}
                          disabled={isEquipped}
                          className={cn(
                            "w-full py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                            isEquipped ? "bg-emerald-900/20 text-emerald-500 border border-emerald-900/50" : "bg-[#222] text-white hover:bg-[#333]"
                          )}
                        >
                          {isEquipped ? 'Equipped' : 'Equip'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleBuy(item)}
                          disabled={user.stats.points < item.price || isLoading}
                          className="w-full py-2 bg-red-900 text-white rounded-xl text-[10px] font-mono uppercase tracking-widest hover:bg-red-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Coins className="w-3 h-3" />
                          {item.price} PTS
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <div className="bg-[#141414] border border-[#222] rounded-3xl p-6 flex flex-col gap-2">
    <div className="flex items-center gap-2 text-[#444]">
      {icon}
      <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-2xl font-serif italic text-white">{value}</div>
  </div>
);
