import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Coins, Shield, User as UserIcon, Check, ShoppingBag, ArrowLeft, Star, Heart, Zap, Flame, Scroll, Play, Pause } from 'lucide-react';
import { User, CosmeticItem, Policy } from '../types';
import { FriendsList } from './FriendsList';
import { Inventory } from './Inventory';
import { cn } from '../lib/utils';
import { getPolicyStyles, getVoteStyles, getFrameStyles } from '../lib/cosmetics';
import { DEFAULT_ITEMS, PASS_ITEM_LEVELS } from '../constants';

interface ProfileProps {
  user: User;
  onClose: () => void;
  onUpdateUser: (user: User) => void;
  token: string;
  playSound: (soundKey: string) => void;
  playMusic: (trackKey: string) => void;
  stopMusic: () => void;
  settings: {
    isMusicOn: boolean;
    setIsMusicOn: React.Dispatch<React.SetStateAction<boolean>>;
    isSoundOn: boolean;
    setIsSoundOn: React.Dispatch<React.SetStateAction<boolean>>;
    musicVolume: number;
    setMusicVolume: React.Dispatch<React.SetStateAction<number>>;
    soundVolume: number;
    setSoundVolume: React.Dispatch<React.SetStateAction<number>>;
    isFullscreen: boolean;
    setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  };
  roomId?: string;
  onJoinRoom?: (roomId: string) => void;
}

const SHOP_ITEMS: CosmeticItem[] = [
  // Frames
  { id: 'frame-red', name: 'Iron Vanguard', price: 500, type: 'frame', description: 'A standard State-faction border.' },
  { id: 'frame-gold', name: 'Golden Assembly', price: 1500, type: 'frame', description: 'For the most distinguished delegates.' },
  { id: 'frame-blue', name: 'Civil Guard', price: 500, type: 'frame', description: 'A standard Civil-faction border.' },
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
  { id: 'policy-blueprint', name: 'State Blueprint', price: 1500, type: 'policy', description: 'Technical drawings on blueprint paper.' },
  { id: 'policy-blood', name: 'Blood & Iron', price: 2000, type: 'policy', description: 'Industrial metal with crimson accents.' },

  // Voting Cards
  { id: 'vote-classic', name: 'Classic Ballot', price: 800, type: 'vote', description: 'Traditional paper ballots.' },
  { id: 'vote-wax', name: 'Wax Seal', price: 1800, type: 'vote', description: 'Official documents sealed with red wax.' },
  { id: 'vote-digital', name: 'Digital Consensus', price: 1500, type: 'vote', description: 'Holographic voting interface.' },
  { id: 'vote-ancient', name: 'Ancient Ostracon', price: 2500, type: 'vote', description: 'Pottery shards used in ancient democracy.' },

  // Music
  { id: 'music-ambient', name: 'Shadows Over Parliament', price: 0, type: 'music', description: 'Deep, atmospheric orchestral tension.' },
  { id: 'music-fog', name: 'Fog In The Alley', price: 1500, type: 'music', description: 'Mysterious and low-profile noir vibes.' },
  { id: 'music-tense', name: 'Final Countdown', price: 2500, type: 'music', description: 'High-stakes rhythmic tension for the endgame.' },
  { id: 'music-victory', name: 'Triumph of the New Age', price: 4000, type: 'music', description: 'A grand orchestral anthem for the victors.' },

  // Sound Packs
  { id: 'sound-retro', name: 'Retro 8-bit', price: 1500, type: 'sound', description: 'Classic arcade sound effects.' },
  { id: 'sound-industrial', name: 'Industrial Clang', price: 2500, type: 'sound', description: 'Heavy, metallic sound effects.' },
  
  // Backgrounds
  { id: 'bg-leather', name: 'Dark Leather', price: 1000, type: 'background', description: 'A sophisticated dark leather texture.', imageUrl: 'https://www.transparenttextures.com/patterns/dark-leather.png' },
  { id: 'bg-brushed', name: 'Brushed Metal', price: 1500, type: 'background', description: 'Cold, industrial brushed aluminum.', imageUrl: 'https://www.transparenttextures.com/patterns/brushed-alum.png' },
  { id: 'bg-diamonds', name: 'Diamond Plate', price: 1200, type: 'background', description: 'Reinforced steel diamond pattern.', imageUrl: 'https://www.transparenttextures.com/patterns/diagmonds-light.png' },
  { id: 'bg-wood', name: 'Dark Mahogany', price: 2000, type: 'background', description: 'Rich, polished dark wood grain.', imageUrl: 'https://www.transparenttextures.com/patterns/dark-wood.png' },
  { id: 'bg-paper', name: 'Aged Parchment', price: 1800, type: 'background', description: 'Weathered, historical paper texture.', imageUrl: 'https://www.transparenttextures.com/patterns/old-mathematics.png' },
  { id: 'bg-concrete', name: 'Urban Concrete', price: 1400, type: 'background', description: 'Rough, brutalist concrete wall.', imageUrl: 'https://www.transparenttextures.com/patterns/concrete-wall.png' },
  
  // Assembly Pass Rewards (Free Tier)
  { id: 'bg-pass-0', name: 'Season 0: Geometric Grid', price: 0, type: 'background', description: 'Exclusive Season 0 background.', imageUrl: 'https://www.transparenttextures.com/patterns/gplay.png' },
  { id: 'vote-pass-0', name: 'Season 0: Purple Rain', price: 0, type: 'vote', description: 'Exclusive Season 0 animated voting card.', imageUrl: 'https://www.transparenttextures.com/patterns/diagonal-striped-brick.png' },
  { id: 'music-pass-0', name: 'Season 0: Static Noise', price: 0, type: 'music', description: 'Exclusive Season 0 music track.', imageUrl: 'https://www.transparenttextures.com/patterns/noise-lines-small.png' },
  { id: 'frame-pass-0', name: 'Season 0: Purple Pill', price: 0, type: 'frame', description: 'Exclusive Season 0 animated avatar frame.', imageUrl: 'https://www.transparenttextures.com/patterns/circles-light.png' },
];

export const Profile: React.FC<ProfileProps> = ({ user, onClose, onUpdateUser, token, playSound, playMusic, stopMusic, settings, roomId, onJoinRoom }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'shop' | 'settings' | 'pass' | 'friends' | 'inventory'>('stats');
  const [shopCategory, setShopCategory] = useState<'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background'>('frame');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  
  const playPreview = (item: CosmeticItem) => {
    if (playingItemId === item.id) {
      setPlayingItemId(null);
      // Stop preview, resume background music
      stopMusic();
      playMusic(user.activeMusic || 'music-ambient');
      return;
    }
    
    // Stop background music, play preview
    stopMusic();
    setPlayingItemId(item.id);
    
    if (item.type === 'sound') {
      // Play sound pack sequence
      const soundKeys = ['click', 'death', 'election_passed'];
      soundKeys.forEach((soundKey, index) => {
        setTimeout(() => playSound(soundKey, item.id), index * 1000);
      });
      setTimeout(() => setPlayingItemId(null), soundKeys.length * 1000);
    } else if (item.type === 'music') {
      playMusic(item.id);
    }
  };
  
  // Settings props destructuring
  const { isMusicOn, setIsMusicOn, isSoundOn, setIsSoundOn, musicVolume, setMusicVolume, soundVolume, setSoundVolume, isFullscreen, setIsFullscreen } = settings;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

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

  const handleEquip = async (type: 'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background', itemId: string | undefined) => {
    console.log('handleEquip called', type, itemId);
    setIsLoading(true);
    setError('');
    try {
      const body: any = {};
      if (type === 'frame') body.frameId = itemId || null;
      if (type === 'policy') body.policyStyle = itemId || null;
      if (type === 'vote') body.votingStyle = itemId || null;
      if (type === 'music') body.music = itemId === 'music-ambient' ? null : (itemId || null);
      if (type === 'sound') body.soundPack = itemId || null;
      if (type === 'background') body.backgroundId = itemId || null;

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
                <span className="text-sm font-mono text-emerald-500">{user.stats.points} IP</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#222] rounded-xl border border-[#333]">
                <Zap className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-mono text-purple-500">{(user.cabinetPoints ?? 0)} CP</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="absolute top-6 right-6 p-2 text-[#444] hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-[#222]">
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('stats');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-[#222]",
              activeTab === 'stats' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Stats
            {activeTab === 'stats' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('inventory');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-[#222]",
              activeTab === 'inventory' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Inventory
            {activeTab === 'inventory' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('friends');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-b border-[#222]",
              activeTab === 'friends' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Friends
            {activeTab === 'friends' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('pass');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-[#222]",
              activeTab === 'pass' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Pass
            {activeTab === 'pass' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('shop');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-[#222]",
              activeTab === 'shop' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Shop
            {activeTab === 'shop' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => {
              playSound('click');
              setActiveTab('settings');
            }}
            className={cn(
              "py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-b border-[#222]",
              activeTab === 'settings' ? "text-white" : "text-[#444] hover:text-[#666]"
            )}
          >
            Settings
            {activeTab === 'settings' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'stats' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <StatCard label="Games Played" value={user.stats.gamesPlayed} icon={<Shield className="w-4 h-4" />} />
              <StatCard label="Win Rate" value={`${winRate}%`} icon={<Trophy className="w-4 h-4" />} />
              <StatCard label="Total Wins" value={user.stats.wins} icon={<Check className="w-4 h-4" />} />
              <StatCard label="Civil Games" value={user.stats.civilGames} icon={<Star className="w-4 h-4" />} />
              <StatCard label="State Games" value={user.stats.stateGames} icon={<Flame className="w-4 h-4" />} />
              <StatCard label="Overseer Games" value={user.stats.overseerGames} icon={<Shield className="w-4 h-4" />} />
              <StatCard label="Kills" value={user.stats.kills} icon={<Zap className="w-4 h-4 text-yellow-500" />} />
              <StatCard label="Deaths" value={user.stats.deaths} icon={<Heart className="w-4 h-4 text-red-500" />} />
            </div>
          ) : activeTab === 'friends' ? (
            <FriendsList user={user} token={token} playSound={playSound} roomId={roomId} onJoinRoom={onJoinRoom} />
          ) : activeTab === 'pass' ? (
            <div className="relative max-w-2xl mx-auto py-8">
              {/* Assembly Pass Banner */}
              <div className="mb-8 p-4 bg-[#222] border border-[#333] rounded-2xl text-center">
                <h3 className="text-xl font-thematic text-white tracking-widest uppercase">Assembly Pass</h3>
                <p className="text-[10px] font-mono text-[#666] uppercase tracking-widest mt-1">Season 0</p>
              </div>

              {/* Headers */}
              <div className="flex justify-between items-center mb-8 px-4">
                <span className="text-[10px] font-mono text-white bg-[#333] px-3 py-1 rounded-full">Free Tier</span>
                <span className="text-[10px] font-mono text-purple-500 bg-purple-900/20 px-3 py-1 rounded-full border border-purple-900/50">Premium Tier</span>
              </div>

              {/* Center Line */}
              <div className="absolute left-1/2 top-40 bottom-0 w-0.5 bg-[#222] -translate-x-1/2">
                <div className="w-full bg-yellow-500 transition-all duration-500" style={{ height: `${Math.min(100, Math.max(0, ((Math.floor(user.stats.gamesPlayed / 5)) / 10) * 100))}%` }} />
              </div>
              
              <div className="space-y-12">
                {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(level => {
                  const isFree = level % 10 === 0; // Only show rewards every 10 levels for Free Tier
                  const currentLevel = Math.floor(user.stats.gamesPlayed / 5) + 1;
                  const isUnlocked = currentLevel >= level;
                  const item = isFree ? SHOP_ITEMS.find(i => (level === 10 && i.id === 'bg-pass-0') || (level === 20 && i.id === 'vote-pass-0') || (level === 40 && i.id === 'music-pass-0') || (level === 50 && i.id === 'frame-pass-0')) : null;

                  return (
                    <div key={level} className="relative flex items-center justify-center">
                      {/* Level Marker */}
                      <div className={cn(
                        "absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#1a1a1a] border-2 flex items-center justify-center text-[10px] font-mono z-10 transition-colors",
                        isUnlocked ? "border-yellow-500 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]" : "border-[#333] text-[#666]"
                      )}>
                        {level}
                      </div>

                      {/* Free Tier Node */}
                      <div className={cn("w-1/2 pr-8 text-right", !isFree && "opacity-0 pointer-events-none")}>
                        {isFree && (
                          <div className={cn("inline-block p-4 rounded-2xl border border-[#222] bg-[#141414]", isUnlocked ? "border-red-900/50" : "opacity-50")}>
                            <div className="flex items-center justify-end gap-4">
                              <div className="text-right">
                                <div className="text-xs text-white font-medium mb-1">{level === 30 ? '500 Cabinet Points' : item?.name || 'Reward'}</div>
                                <div className="text-[10px] text-[#666] uppercase tracking-widest">Free Tier</div>
                              </div>
                              {level === 30 ? (
                                <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center">
                                  <Zap className="w-6 h-6 text-purple-500" />
                                </div>
                              ) : item && (
                                <div className="relative w-10 h-10">
                                  <div className="w-10 h-10 rounded-lg bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden">
                                    {item.type === 'music' ? (
                                      <button onClick={() => playPreview(item)} className="w-full h-full flex items-center justify-center">
                                        {playingItemId === item.id ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white" />}
                                      </button>
                                    ) : item.type === 'frame' ? (
                                      <>
                                        {user.avatarUrl ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-[#444]" />}
                                      </>
                                    ) : item.type === 'policy' ? (
                                      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-0.5", getPolicyStyles(item.id, 'Civil'))}>
                                        <Scroll className="w-4 h-4" />
                                      </div>
                                    ) : item.type === 'vote' ? (
                                      <div className={cn("relative w-full h-full flex flex-col items-center justify-center gap-0.5 overflow-hidden", getVoteStyles(item.id, 'Aye'))}>
                                        {item.id === 'vote-pass-0' && (
                                          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-lg">
                                            <div className="absolute inset-0 animate-purple-rain bg-purple-500/50" />
                                          </div>
                                        )}
                                        <span className="text-xs font-thematic uppercase">AYE!</span>
                                      </div>
                                    ) : item.type === 'background' ? (
                                      <div className="w-full h-full bg-[#141414] flex items-center justify-center">
                                        <div className="w-full h-full opacity-50" style={{ backgroundImage: `url("${item.imageUrl}")` }} />
                                      </div>
                                    ) : (
                                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    )}
                                  </div>
                                  {item.type === 'frame' && (
                                    <div className={cn(
                                      "absolute inset-0 border-2 rounded-lg pointer-events-none",
                                      getFrameStyles(item.id)
                                    )} />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Premium Tier Node */}
                      <div className="w-1/2 pl-8 text-left">
                        <div className={cn("inline-block p-4 rounded-2xl border border-[#222] bg-[#141414] opacity-50 grayscale cursor-not-allowed")}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center text-[10px] text-[#666]">PREM</div>
                            <div className="text-left">
                              <div className="text-xs text-white font-medium mb-1">Premium Reward</div>
                              <div className="text-[10px] text-purple-500 uppercase tracking-widest">Premium Tier (Unavailable)</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeTab === 'inventory' ? (
            <Inventory 
              user={user} 
              onUpdateUser={onUpdateUser} 
              token={token} 
              playSound={playSound} 
              handleEquip={handleEquip} 
              items={SHOP_ITEMS}
              playPreview={playPreview}
              playingItemId={playingItemId}
            />
          ) : activeTab === 'shop' ? (
            <div className="space-y-8">
              {error && (
                <div className="text-red-500 text-xs text-center font-mono bg-red-900/10 py-3 rounded-xl border border-red-900/20">
                  {error}
                </div>
              )}

              {/* Shop Categories */}
              <div className="flex flex-col gap-2 w-full max-w-lg mx-auto mb-8">
                {/* Row 1 */}
                <div className="flex gap-1 sm:gap-2 p-1 bg-[#141414] rounded-2xl border border-[#222]">
                  {[
                    { id: 'frame', label: 'Frames' },
                    { id: 'policy', label: 'Directives' },
                    { id: 'vote', label: 'Votes' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        playSound('click');
                        setShopCategory(cat.id as any);
                      }}
                      className={cn(
                        "flex-1 px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono uppercase tracking-widest transition-all whitespace-nowrap",
                        shopCategory === cat.id ? "bg-red-900 text-white" : "text-[#444] hover:text-[#666]"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                {/* Row 2 */}
                <div className="flex gap-1 sm:gap-2 p-1 bg-[#141414] rounded-2xl border border-[#222]">
                  {[
                    { id: 'music', label: 'Music' },
                    { id: 'sound', label: 'Sounds' },
                    { id: 'background', label: 'Backgrounds' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        playSound('click');
                        setShopCategory(cat.id as any);
                      }}
                      className={cn(
                        "flex-1 px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono uppercase tracking-widest transition-all whitespace-nowrap",
                        shopCategory === cat.id ? "bg-red-900 text-white" : "text-[#444] hover:text-[#666]"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredItems.map((item) => {
                  const isPassItem = !!PASS_ITEM_LEVELS[item.id];
                  const isUnlocked = isPassItem ? (Math.floor(user.stats.gamesPlayed / 5) + 1 >= PASS_ITEM_LEVELS[item.id]) : false;
                  const isOwned = user.ownedCosmetics.includes(item.id) || item.id === 'music-ambient' || isUnlocked;
                  const isEquipped = 
                    (item.type === 'frame' && user.activeFrame === item.id) ||
                    (item.type === 'policy' && user.activePolicyStyle === item.id) ||
                    (item.type === 'vote' && user.activeVotingStyle === item.id) ||
                    (item.type === 'music' && (user.activeMusic === item.id || (!user.activeMusic && item.id === 'music-ambient'))) ||
                    (item.type === 'sound' && user.activeSoundPack === item.id) ||
                    (item.type === 'background' && user.activeBackground === item.id);
                  
                  return (
                    <div key={item.id} className="bg-[#141414] border border-[#222] rounded-3xl p-6 flex flex-col items-center text-center group">
                      <div className="relative w-20 h-20 mb-4">
                        <div className="w-20 h-20 rounded-2xl bg-[#222] border border-[#333] flex items-center justify-center overflow-hidden">
                          {item.type === 'frame' ? (
                            user.avatarUrl ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-[#444]" />
                          ) : item.type === 'music' || item.type === 'sound' ? (
                            <button onClick={() => playPreview(item)} className="w-full h-full flex items-center justify-center">
                              {playingItemId === item.id ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white" />}
                            </button>
                          ) : item.type === 'policy' ? (
                            <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getPolicyStyles(item.id, 'Civil'))}>
                              <Scroll className="w-8 h-8" />
                              <span className="text-[8px] font-mono uppercase">Civil</span>
                            </div>
                          ) : item.type === 'vote' ? (
                            <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getVoteStyles(item.id, 'Aye'))}>
                              <span className="text-lg font-thematic uppercase">AYE!</span>
                              <span className="text-[8px] font-mono uppercase">YES</span>
                            </div>
                          ) : item.type === 'background' ? (
                            <div className="w-full h-full bg-[#141414] flex items-center justify-center">
                              <div className="w-full h-full opacity-50" style={{ backgroundImage: `url("${item.imageUrl}")` }} />
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                              <span className="text-[8px] font-mono uppercase">{item.type}</span>
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
                      <p className="text-[10px] text-[#666] font-mono uppercase mb-2">{item.type === 'policy' ? 'Directive Style' : `${item.type} Style`}</p>
                      <p className="text-[10px] text-[#444] font-sans mb-4 line-clamp-2">{item.description}</p>
                      
                      {isOwned ? (
                        <button 
                          disabled
                          className="w-full py-2 bg-[#222] text-[#666] rounded-xl text-[10px] font-mono uppercase tracking-widest border border-[#333] cursor-not-allowed"
                        >
                          Owned
                        </button>
                      ) : item.price === 0 ? (
                        <button 
                          disabled
                          className="w-full py-2 bg-[#222] text-[#666] rounded-xl text-[10px] font-mono uppercase tracking-widest border border-[#333] cursor-not-allowed"
                        >
                          Locked (Pass)
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            playSound('click');
                            handleBuy(item);
                          }}
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
          ) : (
            <div className="space-y-6 max-w-md mx-auto">
              <div className="flex items-center justify-between p-4 bg-[#141414] border border-[#222] rounded-2xl">
                <span className="text-sm font-mono text-white">Music</span>
                <button onClick={() => setIsMusicOn(!isMusicOn)} className={cn("w-12 h-6 rounded-full transition-all relative", isMusicOn ? "bg-red-900" : "bg-[#333]")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isMusicOn ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-[#141414] border border-[#222] rounded-2xl">
                <span className="text-sm font-mono text-white">Sound Effects</span>
                <button onClick={() => setIsSoundOn(!isSoundOn)} className={cn("w-12 h-6 rounded-full transition-all relative", isSoundOn ? "bg-red-900" : "bg-[#333]")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isSoundOn ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="p-4 bg-[#141414] border border-[#222] rounded-2xl space-y-2">
                <span className="text-sm font-mono text-white">Music Volume</span>
                <input type="range" min="0" max="100" value={musicVolume} onChange={(e) => setMusicVolume(parseInt(e.target.value))} className="w-full accent-red-900" />
              </div>
              <div className="p-4 bg-[#141414] border border-[#222] rounded-2xl space-y-2">
                <span className="text-sm font-mono text-white">Sound Effects Volume</span>
                <input type="range" min="0" max="100" value={soundVolume} onChange={(e) => setSoundVolume(parseInt(e.target.value))} className="w-full accent-red-900" />
              </div>
              <div className="flex items-center justify-between p-4 bg-[#141414] border border-[#222] rounded-2xl">
                <span className="text-sm font-mono text-white">Fullscreen</span>
                <button onClick={toggleFullscreen} className={cn("w-12 h-6 rounded-full transition-all relative", isFullscreen ? "bg-red-900" : "bg-[#333]")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isFullscreen ? "left-7" : "left-1")} />
                </button>
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
