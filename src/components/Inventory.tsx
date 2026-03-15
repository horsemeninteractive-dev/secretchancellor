import React, { useState } from 'react';
import { cn, getProxiedUrl } from '../lib/utils';
import { CosmeticItem, User } from '../types';
import { Play, Pause, User as UserIcon, Scroll } from 'lucide-react';
import { getPolicyStyles, getVoteStyles, getFrameStyles, getRarity } from '../lib/cosmetics';
import { DEFAULT_ITEMS, PASS_ITEM_LEVELS } from '../constants';

interface InventoryProps {
  user: User;
  onUpdateUser: (user: User) => void;
  token: string;
  playSound: (soundKey: string) => void;
  handleEquip: (type: 'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background', itemId: string | undefined) => void;
  items: CosmeticItem[];
  playPreview: (item: CosmeticItem) => void;
  playingItemId: string | null;
}

export const Inventory: React.FC<InventoryProps> = ({ user, handleEquip, playSound, items, playPreview, playingItemId }) => {
  const [category, setCategory] = useState<'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background'>('frame');
  const typeItems = DEFAULT_ITEMS.filter(item => {
    if (item.type !== category) return false;
    
    // Always show defaults
    if (item.id.endsWith('-default')) return true;
    
    // Show owned or unlocked items
    const isOwned = user.ownedCosmetics.includes(item.id) || item.id === 'music-ambient';
    const isPassItem = !!PASS_ITEM_LEVELS[item.id];
    const isUnlocked = isPassItem ? (Math.floor(user.stats.gamesPlayed / 5) + 1 >= PASS_ITEM_LEVELS[item.id]) : false;
    
    return isOwned || isUnlocked;
  });
  
  const categories: { id: 'frame' | 'policy' | 'vote' | 'music' | 'sound' | 'background', label: string }[] = [
    { id: 'frame', label: 'Frames' },
    { id: 'policy', label: 'Directives' },
    { id: 'vote', label: 'Votes' },
    { id: 'music', label: 'Music' },
    { id: 'sound', label: 'Sounds' },
    { id: 'background', label: 'Backgrounds' }
  ];

  return (
    <div className="space-y-8">
      {/* Categories */}
      <div className="flex flex-col gap-2 w-full max-w-lg mx-auto mb-8">
        {/* Row 1 */}
        <div className="flex gap-1 sm:gap-2 p-1 bg-elevated rounded-2xl border border-subtle">
          {categories.slice(0, 3).map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                playSound('click');
                setCategory(cat.id);
              }}
              className={cn(
                "flex-1 px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono uppercase tracking-widest transition-all whitespace-nowrap",
                category === cat.id ? "bg-red-900 text-white" : "text-ghost hover:text-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {/* Row 2 */}
        <div className="flex gap-1 sm:gap-2 p-1 bg-elevated rounded-2xl border border-subtle">
          {categories.slice(3, 6).map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                playSound('click');
                setCategory(cat.id);
              }}
              className={cn(
                "flex-1 px-3 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono uppercase tracking-widest transition-all whitespace-nowrap",
                category === cat.id ? "bg-red-900 text-white" : "text-ghost hover:text-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {typeItems.map(item => {
          const isEquipped = 
            (item.type === 'frame' && (user.activeFrame === item.id || (!user.activeFrame && item.id === 'frame-default'))) ||
            (item.type === 'policy' && (user.activePolicyStyle === item.id || (!user.activePolicyStyle && item.id === 'policy-default'))) ||
            (item.type === 'vote' && (user.activeVotingStyle === item.id || (!user.activeVotingStyle && item.id === 'vote-default'))) ||
            (item.type === 'music' && (user.activeMusic === item.id || (!user.activeMusic && item.id === 'music-default'))) ||
            (item.type === 'sound' && (user.activeSoundPack === item.id || (!user.activeSoundPack && item.id === 'sound-default'))) ||
            (item.type === 'background' && (user.activeBackground === item.id || (!user.activeBackground && item.id === 'background-default')));

          return (
            <div key={item.id} className="bg-elevated border border-subtle rounded-3xl p-6 flex flex-col items-center text-center">
              <div className="relative w-20 h-20 rounded-2xl bg-card border border-default mb-4 flex items-center justify-center">
                  {item.type === 'music' ? (
                      <button onClick={() => playPreview(item)} className="w-full h-full flex items-center justify-center">
                          {playingItemId === item.id ? <Pause className="w-8 h-8 text-primary" /> : <Play className="w-8 h-8 text-primary" />}
                      </button>
                  ) : item.type === 'frame' ? (
                      <>
                        {user.avatarUrl ? <img src={getProxiedUrl(user.avatarUrl)} alt={user.username} className="w-full h-full object-cover" /> : <UserIcon className="w-10 h-10 text-ghost" />}
                        <div className={cn(
                          "absolute inset-0 border-4 rounded-2xl pointer-events-none",
                          getFrameStyles(item.id)
                        )} />
                      </>
                  ) : item.type === 'policy' ? (
                      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getPolicyStyles(item.id, 'Civil'))}>
                          <Scroll className="w-8 h-8" />
                      </div>
                  ) : item.type === 'vote' ? (
                      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", getVoteStyles(item.id, 'Aye'))}>
                          <span className="text-lg font-thematic uppercase">AYE!</span>
                          <span className="text-[8px] font-mono uppercase">YES</span>
                      </div>
                  ) : item.imageUrl ? (
                      <img src={getProxiedUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                      <div className="text-[8px] font-mono uppercase">{item.type}</div>
                  )}
              </div>
              <h4 className="font-serif italic text-lg mb-1 text-primary">{item.name}</h4>
              <p className="text-[10px] text-muted font-mono uppercase mb-1">{item.type === 'policy' ? 'Directive Style' : item.type}</p>
              <p className={cn("text-[9px] font-mono uppercase mb-4", getRarity(item.price).color)}>{getRarity(item.price).name}</p>
              <button 
                onClick={() => {
                  playSound('click');
                  handleEquip(item.type, item.id.endsWith('-default') ? undefined : item.id);
                }}
                disabled={isEquipped}
                className={cn(
                  "w-full py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all",
                  isEquipped ? "bg-emerald-900/20 text-emerald-500 border border-emerald-900/50" : "bg-card text-white hover:bg-subtle"
                )}
              >
                {isEquipped ? 'Equipped' : 'Equip'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
