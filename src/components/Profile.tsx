import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Coins, Shield, User as UserIcon, Check, ShoppingBag, ArrowLeft, Star, Heart, Zap, Flame, Scroll, Play, Pause, Calendar, Clock, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { User, CosmeticItem, Policy, MatchSummary } from '../types';
import { FriendsList } from './FriendsList';
import { Inventory } from './Inventory';
import { cn, getProxiedUrl } from '../lib/utils';
import { getPolicyStyles, getVoteStyles, getFrameStyles, getRarity } from '../lib/cosmetics';
import { DEFAULT_ITEMS, PASS_ITEM_LEVELS } from '../constants';
import { getLevelFromXp, getXpForNextLevel, getXpInCurrentLevel } from '../lib/xp';

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
    ttsVoice: string;
    setTtsVoice: React.Dispatch<React.SetStateAction<string>>;
    ttsEngine: string;
    setTtsEngine: React.Dispatch<React.SetStateAction<string>>;
    isAiVoiceEnabled: boolean;
    setIsAiVoiceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    uiScaleSetting: number;
    setUiScaleSetting: React.Dispatch<React.SetStateAction<number>>;
    isLightMode: boolean;
    setIsLightMode: React.Dispatch<React.SetStateAction<boolean>>;
  };
  roomId?: string;
  onJoinRoom?: (roomId: string) => void;
  mode?: 'Casual' | 'Ranked';
}

export const Profile: React.FC<ProfileProps> = ({ user, onClose, onUpdateUser, token, playSound, playMusic, stopMusic, settings, roomId, onJoinRoom, mode }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'shop' | 'settings' | 'pass' | 'friends' | 'inventory' | 'history'>('stats');
  const [shopCategory, setShopCategory] = useState<'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background'>('frame');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
      }
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    
    // Retry for mobile browsers
    for (let i = 1; i <= 5; i++) {
      setTimeout(loadVoices, i * 500);
    }
  }, []);
  
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
  const { 
    isMusicOn, setIsMusicOn, 
    isSoundOn, setIsSoundOn, 
    musicVolume, setMusicVolume, 
    soundVolume, setSoundVolume, 
    isFullscreen, setIsFullscreen, 
    ttsVoice, setTtsVoice, 
    ttsEngine, setTtsEngine,
    isAiVoiceEnabled, setIsAiVoiceEnabled,
    uiScaleSetting, setUiScaleSetting,
    isLightMode, setIsLightMode,
  } = settings;

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

  // Fetch match history when tab is opened
  useEffect(() => {
    if (activeTab !== 'history' || matchHistory.length > 0) return;
    setHistoryLoading(true);
    fetch(`/api/match-history/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (data.history) setMatchHistory(data.history); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [activeTab]);

  const winRate = user.stats.gamesPlayed > 0 
    ? Math.round((user.stats.wins / user.stats.gamesPlayed) * 100) 
    : 0;

  const filteredItems = DEFAULT_ITEMS.filter(item => 
    item.type === shopCategory && 
    !PASS_ITEM_LEVELS[item.id] && 
    !item.id.endsWith('-default')
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-backdrop-heavy backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-4xl bg-surface border border-subtle rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 bg-elevated border-b border-subtle flex flex-col sm:flex-row items-center gap-8">
          <div className="relative">
            <div className="w-28 h-28 rounded-3xl bg-card border border-default flex items-center justify-center relative">
              <div className="w-24 h-24 rounded-3xl overflow-hidden">
                {user.avatarUrl ? (
                  <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-12 h-12 text-ghost" />
                )}
              </div>
              {user.activeFrame && (
                <div className={cn(
                  "absolute inset-2 border-4 rounded-3xl pointer-events-none",
                  getFrameStyles(user.activeFrame)
                )} />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-red-900 border border-red-500 text-white text-[10px] font-mono px-2 py-1 rounded-lg shadow-lg">
              LVL {getLevelFromXp(user.stats.xp)}
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-4xl font-thematic text-primary tracking-wide mb-2">{user.username}</h2>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-xl border border-default">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-mono text-yellow-500">{user.stats.elo} ELO</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-xl border border-default">
                  <Coins className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-mono text-emerald-500">{user.stats.points} IP</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-xl border border-default">
                  <Zap className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-mono text-purple-500">{(user.cabinetPoints ?? 0)} CP</span>
                </div>
              </div>
              <div className="w-full max-w-sm">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>XP</span>
                  <span>{getXpInCurrentLevel(user.stats.xp)} / {getXpForNextLevel(getLevelFromXp(user.stats.xp))}</span>
                </div>
                <div className="h-2 bg-card rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-600" 
                    style={{ width: `${Math.min(100, (getXpInCurrentLevel(user.stats.xp) / getXpForNextLevel(getLevelFromXp(user.stats.xp))) * 100)}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="absolute top-6 right-6 p-2 text-ghost hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-subtle">
          <button 
            onClick={() => { playSound('click'); setActiveTab('stats'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-subtle", activeTab === 'stats' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Stats
            {activeTab === 'stats' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('inventory'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-subtle", activeTab === 'inventory' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Inventory
            {activeTab === 'inventory' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('friends'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-b border-subtle", activeTab === 'friends' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Friends
            {activeTab === 'friends' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('pass'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-subtle", activeTab === 'pass' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Pass
            {activeTab === 'pass' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('shop'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-r border-b border-subtle", activeTab === 'shop' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Shop
            {activeTab === 'shop' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('settings'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative border-b border-subtle", activeTab === 'settings' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Settings
            {activeTab === 'settings' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
          </button>
          <button 
            onClick={() => { playSound('click'); setActiveTab('history'); }}
            className={cn("py-4 text-xs font-mono uppercase tracking-widest transition-all relative col-span-3 border-b border-subtle", activeTab === 'history' ? "text-primary" : "text-ghost hover:text-muted")}
          >
            Match History
            {activeTab === 'history' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
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
              <StatCard label="Agendas Completed" value={user.stats.agendasCompleted || 0} icon={<Scroll className="w-4 h-4 text-emerald-500" />} />
              {user.createdAt && (
                <StatCard label="Account Created" value={new Date(user.createdAt).toLocaleDateString()} icon={<Calendar className="w-4 h-4 text-blue-500" />} />
              )}
            </div>
          ) : activeTab === 'friends' ? (
            <FriendsList user={user} token={token} playSound={playSound} roomId={roomId} onJoinRoom={onJoinRoom} mode={mode} />
          ) : activeTab === 'pass' ? (
            <div className="relative max-w-2xl mx-auto py-8">
              {/* Assembly Pass Banner */}
              <div className="mb-8 p-4 bg-card border border-default rounded-2xl text-center">
                <h3 className="text-xl font-thematic text-primary tracking-widest uppercase">Assembly Pass</h3>
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest mt-1">Season 0</p>
              </div>

              {/* Headers */}
              <div className="flex justify-between items-center mb-8 px-4">
                <span className="text-[10px] font-mono text-primary bg-subtle px-3 py-1 rounded-full">Free Tier</span>
                <span className="text-[10px] font-mono text-purple-500 bg-purple-900/20 px-3 py-1 rounded-full border border-purple-900/50">Premium Tier</span>
              </div>

              {/* Center Line */}
              <div className="absolute left-1/2 top-40 bottom-0 w-0.5 bg-card -translate-x-1/2">
                <div className="w-full bg-yellow-500 transition-all duration-500" style={{ height: `${Math.min(100, Math.max(0, ((Math.floor(user.stats.gamesPlayed / 5)) / 10) * 100))}%` }} />
              </div>
              
              <div className="space-y-12">
                {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(level => {
                  const isFree = level % 10 === 0; // Only show rewards every 10 levels for Free Tier
                  const currentLevel = Math.floor(user.stats.gamesPlayed / 5) + 1;
                  const isUnlocked = currentLevel >= level;
                  const item = isFree ? DEFAULT_ITEMS.find(i => (level === 10 && i.id === 'bg-pass-0') || (level === 20 && i.id === 'vote-pass-0') || (level === 40 && i.id === 'music-pass-0') || (level === 50 && i.id === 'frame-pass-0')) : null;

                  return (
                    <div key={level} className="relative flex items-center justify-center">
                      {/* Level Marker */}
                      <div className={cn(
                        "absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface border-2 flex items-center justify-center text-[10px] font-mono z-10 transition-colors",
                        isUnlocked ? "border-yellow-500 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]" : "border-default text-muted"
                      )}>
                        {level}
                      </div>

                      {/* Free Tier Node */}
                      <div className={cn("w-1/2 pr-8 text-right", !isFree && "opacity-0 pointer-events-none")}>
                        {isFree && (
                          <div className={cn("inline-block p-4 rounded-2xl border border-subtle bg-elevated", isUnlocked ? "border-red-900/50" : "opacity-50")}>
                            <div className="flex items-center justify-end gap-4">
                              <div className="text-right">
                                <div className="text-xs text-primary font-medium mb-1">{level === 30 ? '500 Cabinet Points' : item?.name || 'Reward'}</div>
                                  {item && <div className={cn("text-[9px] font-mono uppercase mb-1", getRarity(item.price).color)}>{getRarity(item.price).name}</div>}
                                <div className="text-[10px] text-muted uppercase tracking-widest">Free Tier</div>
                              </div>
                              {level === 30 ? (
                                <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
                                  <Zap className="w-6 h-6 text-purple-500" />
                                </div>
                              ) : item && (
                                <div className="relative w-10 h-10">
                                  <div className="w-10 h-10 rounded-lg bg-card border border-default flex items-center justify-center overflow-hidden">
                                    {item.type === 'music' ? (
                                      <button onClick={() => playPreview(item)} className="w-full h-full flex items-center justify-center">
                                        {playingItemId === item.id ? <Pause className="w-5 h-5 text-primary" /> : <Play className="w-5 h-5 text-primary" />}
                                      </button>
                                    ) : item.type === 'frame' ? (
                                      <>
                                        {user.avatarUrl ? <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-ghost" />}
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
                                      <div className="w-full h-full bg-elevated flex items-center justify-center">
                                        <div className="w-full h-full opacity-50" style={{ backgroundImage: `url("${getProxiedUrl(item.imageUrl!)}")` }} />
                                      </div>
                                    ) : (
                                      <img src={getProxiedUrl(item.imageUrl!)} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                        <div className={cn("inline-block p-4 rounded-2xl border border-subtle bg-elevated opacity-50 grayscale cursor-not-allowed")}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center text-[10px] text-muted">PREM</div>
                            <div className="text-left">
                              <div className="text-xs text-primary font-medium mb-1">Premium Reward</div>
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
              items={DEFAULT_ITEMS}
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
                <div className="flex gap-1 sm:gap-2 p-1 bg-elevated rounded-2xl border border-subtle">
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
                        shopCategory === cat.id ? "bg-red-900 text-white" : "text-ghost hover:text-muted"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                {/* Row 2 */}
                <div className="flex gap-1 sm:gap-2 p-1 bg-elevated rounded-2xl border border-subtle">
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
                        shopCategory === cat.id ? "bg-red-900 text-white" : "text-ghost hover:text-muted"
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
                    <div key={item.id} className="bg-elevated border border-subtle rounded-3xl p-6 flex flex-col items-center text-center group">
                      <div className="relative w-20 h-20 mb-4">
                        <div className="w-20 h-20 rounded-2xl bg-card border border-default flex items-center justify-center">
                          {item.type === 'frame' ? (
                            user.avatarUrl ? <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-ghost" />
                          ) : item.type === 'music' || item.type === 'sound' ? (
                            <button onClick={() => playPreview(item)} className="w-full h-full flex items-center justify-center">
                              {playingItemId === item.id ? <Pause className="w-8 h-8 text-primary" /> : <Play className="w-8 h-8 text-primary" />}
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
                            <div className="w-full h-full bg-elevated flex items-center justify-center">
                              <div className="w-full h-full opacity-50" style={{ backgroundImage: `url("${getProxiedUrl(item.imageUrl!)}")` }} />
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
                      <h4 className="font-serif italic text-lg mb-1 text-primary">{item.name}</h4>
                      <p className="text-[10px] text-muted font-mono uppercase mb-1">{item.type === 'policy' ? 'Directive Style' : `${item.type} Style`}</p>
                      <p className={cn("text-[9px] font-mono uppercase mb-2", getRarity(item.price).color)}>{getRarity(item.price).name}</p>
                      <p className="text-[10px] text-ghost font-sans mb-4 line-clamp-2">{item.description}</p>
                      
                      {isOwned ? (
                        <button 
                          disabled
                          className="w-full py-2 bg-card text-muted rounded-xl text-[10px] font-mono uppercase tracking-widest border border-default cursor-not-allowed"
                        >
                          Owned
                        </button>
                      ) : item.price === 0 ? (
                        <button 
                          disabled
                          className="w-full py-2 bg-card text-muted rounded-xl text-[10px] font-mono uppercase tracking-widest border border-default cursor-not-allowed"
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
          ) : activeTab === 'settings' ? (
            <div className="space-y-6 max-w-md mx-auto">
              <div className="flex items-center justify-between p-4 bg-elevated border border-subtle rounded-2xl">
                <div>
                  <span className="text-sm font-mono text-primary">Light Mode</span>
                  <p className="text-[10px] font-mono text-muted uppercase mt-0.5">Switches the app to a light colour scheme</p>
                </div>
                <button onClick={() => setIsLightMode(!isLightMode)} className={cn("w-12 h-6 rounded-full transition-all relative shrink-0", isLightMode ? "bg-yellow-500" : "bg-subtle")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isLightMode ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-elevated border border-subtle rounded-2xl">
                <span className="text-sm font-mono text-primary">AI Voice Chat</span>
                <button onClick={() => setIsAiVoiceEnabled(!isAiVoiceEnabled)} className={cn("w-12 h-6 rounded-full transition-all relative", isAiVoiceEnabled ? "bg-emerald-900" : "bg-subtle")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isAiVoiceEnabled ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-elevated border border-subtle rounded-2xl">
                <span className="text-sm font-mono text-primary">Music</span>
                <button onClick={() => setIsMusicOn(!isMusicOn)} className={cn("w-12 h-6 rounded-full transition-all relative", isMusicOn ? "bg-red-900" : "bg-subtle")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isMusicOn ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="flex items-center justify-between p-4 bg-elevated border border-subtle rounded-2xl">
                <span className="text-sm font-mono text-primary">Sound Effects</span>
                <button onClick={() => setIsSoundOn(!isSoundOn)} className={cn("w-12 h-6 rounded-full transition-all relative", isSoundOn ? "bg-red-900" : "bg-subtle")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isSoundOn ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="p-4 bg-elevated border border-subtle rounded-2xl space-y-2">
                <span className="text-sm font-mono text-primary">Music Volume</span>
                <input type="range" min="0" max="100" value={musicVolume} onChange={(e) => setMusicVolume(parseInt(e.target.value))} className="w-full accent-red-900" />
              </div>
              <div className="p-4 bg-elevated border border-subtle rounded-2xl space-y-2">
                <span className="text-sm font-mono text-primary">Sound Effects Volume</span>
                <input type="range" min="0" max="100" value={soundVolume} onChange={(e) => setSoundVolume(parseInt(e.target.value))} className="w-full accent-red-900" />
              </div>
              <div className="p-4 bg-elevated border border-subtle rounded-2xl space-y-2">
                <span className="text-sm font-mono text-primary">TTS Engine</span>
                <select 
                  value={ttsEngine} 
                  onChange={(e) => setTtsEngine(e.target.value)}
                  className="w-full bg-card text-primary p-2 rounded-xl text-sm font-mono border border-default"
                >
                  <option value="browser">Browser (Free, Offline)</option>
                  <option value="gemini">Gemini (High Quality, Free Tier)</option>
                </select>
                <p className="text-[10px] font-mono text-ghost uppercase">
                  {ttsEngine === 'gemini' 
                    ? 'Uses Gemini 2.5 Flash for professional voices. Requires internet.' 
                    : 'Uses your device\'s built-in voices. Works offline.'}
                </p>
              </div>
              <div className="p-4 bg-elevated border border-subtle rounded-2xl space-y-2">
                <span className="text-sm font-mono text-primary">TTS Voice</span>
                <select 
                  value={ttsVoice} 
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="w-full bg-card text-primary p-2 rounded-xl text-sm font-mono border border-default"
                >
                  <option value="">Default</option>
                  {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between p-4 bg-elevated border border-subtle rounded-2xl">
                <span className="text-sm font-mono text-primary">Fullscreen</span>
                <button onClick={toggleFullscreen} className={cn("w-12 h-6 rounded-full transition-all relative", isFullscreen ? "bg-red-900" : "bg-subtle")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isFullscreen ? "left-7" : "left-1")} />
                </button>
              </div>
              <div className="p-4 bg-elevated border border-subtle rounded-2xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-primary">UI Scale</span>
                  <span className="text-xs font-mono text-muted">{Math.round(uiScaleSetting * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="1.5" 
                  step="0.05"
                  value={uiScaleSetting} 
                  onChange={(e) => setUiScaleSetting(parseFloat(e.target.value))} 
                  className="w-full accent-red-900" 
                />
                <p className="text-[10px] font-mono text-ghost uppercase">Adjusts the overall size of the interface</p>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            <div className="space-y-3">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16 text-ghost font-mono text-xs uppercase tracking-widest">
                  Loading match history...
                </div>
              ) : matchHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Clock className="w-10 h-10 text-whisper" />
                  <p className="text-ghost font-mono text-xs uppercase tracking-widest">No matches recorded yet</p>
                  <p className="text-whisper text-xs italic">Your game history will appear here after your first game.</p>
                </div>
              ) : matchHistory.map((match) => {
                const isExpanded = expandedMatch === match.id;
                const date = new Date(match.playedAt);
                const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={match.id}
                    className={cn(
                      'rounded-2xl border overflow-hidden transition-colors',
                      match.won ? 'border-emerald-900/40 bg-emerald-900/5' : 'border-red-900/30 bg-red-900/5'
                    )}
                  >
                    {/* Match summary row */}
                    <button
                      onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                      className="w-full flex items-center gap-4 p-4 text-left"
                    >
                      {/* Win/loss indicator */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-thematic text-xs uppercase tracking-widest',
                        match.won ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40' : 'bg-red-900/30 text-red-400 border border-red-700/40'
                      )}>
                        {match.won ? 'W' : 'L'}
                      </div>

                      {/* Core info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'text-xs font-mono uppercase tracking-widest px-2 py-0.5 rounded border',
                            match.role === 'Civil' ? 'text-blue-400 bg-blue-900/20 border-blue-900/40'
                            : match.role === 'Overseer' ? 'text-red-500 bg-red-900/30 border-red-700/50 font-bold'
                            : 'text-red-400 bg-red-900/20 border-red-900/40'
                          )}>
                            {match.role}
                          </span>
                          <span className={cn(
                            'text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border',
                            match.mode === 'Ranked' ? 'text-yellow-500 bg-yellow-900/10 border-yellow-900/30' : 'text-blue-400 bg-blue-900/10 border-blue-900/30'
                          )}>
                            {match.mode}
                          </span>
                          <span className="text-faint text-xs font-mono">{match.playerCount}p · R{match.rounds}</span>
                        </div>
                        <div className="text-muted text-xs mt-0.5 truncate">
                          {match.winReason || (match.won ? 'Victory' : 'Defeat')}
                        </div>
                      </div>

                      {/* Rewards */}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-emerald-400 text-xs font-mono">+{match.xpEarned} XP</span>
                        <span className="text-yellow-400 text-xs font-mono">+{match.ipEarned} IP</span>
                      </div>

                      {/* Expand chevron */}
                      <div className="text-faint ml-1 shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Expanded details */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                            {/* Policy track */}
                            <div className="flex gap-4">
                              <div className="flex-1 bg-surface rounded-xl p-3 border border-subtle">
                                <div className="text-faint text-[10px] font-mono uppercase tracking-widest mb-1">Civil Track</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex gap-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <div key={i} className={cn('w-5 h-5 rounded border', i < match.civilDirectives ? 'bg-blue-600 border-blue-500' : 'bg-card border-default')} />
                                    ))}
                                  </div>
                                  <span className="text-blue-400 text-xs font-mono">{match.civilDirectives}/5</span>
                                </div>
                              </div>
                              <div className="flex-1 bg-surface rounded-xl p-3 border border-subtle">
                                <div className="text-faint text-[10px] font-mono uppercase tracking-widest mb-1">State Track</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex gap-1">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                      <div key={i} className={cn('w-4 h-5 rounded border', i < match.stateDirectives ? 'bg-red-700 border-red-600' : 'bg-card border-default')} />
                                    ))}
                                  </div>
                                  <span className="text-red-400 text-xs font-mono">{match.stateDirectives}/6</span>
                                </div>
                              </div>
                            </div>

                            {/* Personal agenda */}
                            {match.agendaName && (
                              <div className={cn(
                                'rounded-xl p-3 border flex items-center gap-3',
                                match.agendaCompleted ? 'bg-emerald-900/10 border-emerald-700/30' : 'bg-surface border-subtle'
                              )}>
                                <Target className={cn('w-4 h-4 shrink-0', match.agendaCompleted ? 'text-emerald-400' : 'text-faint')} />
                                <div className="min-w-0">
                                  <div className="text-faint text-[10px] font-mono uppercase tracking-widest">Personal Agenda</div>
                                  <div className={cn('text-xs font-medium', match.agendaCompleted ? 'text-emerald-400' : 'text-tertiary')}>
                                    {match.agendaName} — {match.agendaCompleted ? 'Completed' : 'Failed'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Date/time */}
                            <div className="text-ghost text-[10px] font-mono text-right">
                              {dateStr} at {timeStr}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <div className="bg-elevated border border-subtle rounded-3xl p-6 flex flex-col gap-2">
    <div className="flex items-center gap-2 text-ghost">
      {icon}
      <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-2xl font-serif italic text-primary">{value}</div>
  </div>
);
