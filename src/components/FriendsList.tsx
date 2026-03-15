import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { User } from '../types';
import { cn, getProxiedUrl } from '../lib/utils';
import { getFrameStyles } from '../lib/cosmetics';
import { getLevelFromXp } from '../lib/xp';
import {
  UserPlus, Users, Gamepad2, UserMinus, Search, Check,
  X, Clock, Trophy, ChevronRight,
} from 'lucide-react';

interface FriendsListProps {
  user: User;
  token: string;
  playSound: (sound: string) => void;
  roomId?: string;
  onJoinRoom?: (roomId: string) => void;
  mode?: 'Casual' | 'Ranked';
}

interface FriendWithStatus extends User {
  isOnline: boolean;
  currentRoomId?: string;
}

interface SearchResult extends User {
  isFriend: boolean;
}

const PlayerCard: React.FC<{
  player: User;
  isOnline?: boolean;
  statusLine?: React.ReactNode;
  actions: React.ReactNode;
}> = ({ player, isOnline, statusLine, actions }) => {
  const level = getLevelFromXp(player.stats?.xp ?? 0);
  return (
    <div className="flex items-center gap-3 p-3 bg-[#141414] rounded-2xl border border-[#222] hover:border-[#333] transition-colors">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-xl bg-[#222] border border-[#333] overflow-hidden relative">
          {player.avatarUrl
            ? <img src={getProxiedUrl(player.avatarUrl)} alt={player.username} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-[#555] text-sm font-mono">{player.username.charAt(0).toUpperCase()}</div>}
          {player.activeFrame && (
            <div className={cn('absolute inset-0 rounded-xl pointer-events-none', getFrameStyles(player.activeFrame))} />
          )}
        </div>
        {isOnline !== undefined && (
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#141414]',
            isOnline ? 'bg-emerald-500' : 'bg-[#444]'
          )} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-white truncate">{player.username}</span>
          <span className="text-[10px] font-mono text-[#555] shrink-0">Lv.{level}</span>
        </div>
        {statusLine ? (
          <div className="text-[10px] font-mono text-[#666] truncate mt-0.5">{statusLine}</div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <Trophy className="w-2.5 h-2.5 text-yellow-500/60" />
            <span className="text-[10px] font-mono text-[#555]">{player.stats?.elo ?? 1000} ELO</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">{actions}</div>
    </div>
  );
};

export const FriendsList: React.FC<FriendsListProps> = ({
  user, token, playSound, roomId, onJoinRoom, mode,
}) => {
  const [friends, setFriends] = useState<FriendWithStatus[]>([]);
  const [pending, setPending] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'friends' | 'search'>('friends');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = async () => {
    try {
      const [friendsRes, statusRes, pendingRes] = await Promise.all([
        fetch('/api/friends',         { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/friends/status',  { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/friends/pending', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      let friendsData: User[] = [];
      if (friendsRes.ok) { const d = await friendsRes.json(); friendsData = d.friends ?? []; }
      let onlineMap: Record<string, { isOnline: boolean; roomId?: string }> = {};
      if (statusRes.ok) { const d = await statusRes.json(); onlineMap = d.statuses ?? {}; }
      if (pendingRes.ok) { const d = await pendingRes.json(); setPending(d.pending ?? []); }
      setFriends(friendsData.map(f => ({
        ...f,
        isOnline: !!onlineMap[f.id]?.isOnline,
        currentRoomId: onlineMap[f.id]?.roomId,
      })));
    } catch (err) {
      console.error('Failed to fetch friends', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    socket.on('friendRequestAccepted', () => { fetchAll(); playSound('notification'); });
    socket.on('userStatusChanged', ({ userId, isOnline, roomId: fRoomId }: { userId: string; isOnline: boolean; roomId?: string }) => {
      setFriends(prev => prev.map(f =>
        f.id === userId ? { ...f, isOnline, currentRoomId: isOnline ? fRoomId : undefined } : f
      ));
    });
    return () => {
      socket.off('friendRequestAccepted');
      socket.off('userStatusChanged');
    };
  }, [token]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const d = await res.json(); setSearchResults(d.users ?? []); }
      } catch { /* non-critical */ }
      finally { setSearchLoading(false); }
    }, 350);
  }, [searchQuery, token]);

  const sendRequest = (targetId: string) => {
    playSound('click');
    socket.emit('sendFriendRequest', targetId);
    setSentRequests(prev => new Set(prev).add(targetId));
  };

  const acceptRequest = (fromUserId: string) => {
    playSound('click');
    socket.emit('acceptFriendRequest', fromUserId);
    setPending(prev => prev.filter(p => p.id !== fromUserId));
    setTimeout(fetchAll, 500);
  };

  const declineRequest = async (fromUserId: string) => {
    playSound('click');
    try {
      await fetch(`/api/friends/${fromUserId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setPending(prev => prev.filter(p => p.id !== fromUserId));
    } catch { /* non-critical */ }
  };

  const removeFriend = async (friendId: string) => {
    playSound('click');
    try {
      await fetch(`/api/friends/${friendId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch { /* non-critical */ }
  };

  const inviteFriend = async (friendId: string) => {
    playSound('click');
    try {
      await fetch(`/api/friends/invite/${friendId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId }),
      });
    } catch { /* non-critical */ }
  };

  const onlineFriends  = friends.filter(f => f.isOnline);
  const offlineFriends = friends.filter(f => !f.isOnline);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setActiveSection('search'); }}
            onFocus={() => { if (searchQuery.length >= 2) setActiveSection('search'); }}
            placeholder="Search players by username…"
            className="w-full bg-[#141414] border border-[#222] rounded-xl py-2.5 pl-9 pr-8 text-sm text-white placeholder-[#444] font-mono focus:outline-none focus:border-[#444] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setActiveSection('friends'); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchResults([]); setActiveSection('friends'); }}
            className="px-3 rounded-xl border border-[#222] bg-[#141414] text-[#666] text-xs font-mono uppercase tracking-widest hover:text-white transition-colors"
          >
            Friends
          </button>
        )}
      </div>

      {/* Search results */}
      {activeSection === 'search' && (
        <div className="space-y-2">
          {searchQuery.length < 2 ? (
            <p className="text-[#444] text-xs font-mono text-center py-6">Type at least 2 characters to search</p>
          ) : searchLoading ? (
            <p className="text-[#444] text-xs font-mono text-center py-6">Searching…</p>
          ) : searchResults.length === 0 ? (
            <p className="text-[#444] text-xs font-mono text-center py-6">No players found for "{searchQuery}"</p>
          ) : searchResults.map(result => {
            const alreadySent = sentRequests.has(result.id);
            return (
              <PlayerCard
                key={result.id}
                player={result}
                actions={
                  result.isFriend ? (
                    <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest px-2">Friends</span>
                  ) : alreadySent ? (
                    <span className="text-[10px] text-[#555] font-mono uppercase tracking-widest px-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Sent
                    </span>
                  ) : (
                    <button
                      onClick={() => sendRequest(result.id)}
                      className="p-2 rounded-lg bg-[#222] hover:bg-red-900/30 text-[#666] hover:text-red-400 transition-colors border border-[#333] hover:border-red-900/50"
                      title="Send friend request"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  )
                }
              />
            );
          })}
        </div>
      )}

      {/* Friends list */}
      {activeSection === 'friends' && (
        <div className="space-y-4">
          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#555] flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Pending Requests ({pending.length})
              </div>
              {pending.map(requester => (
                <PlayerCard
                  key={requester.id}
                  player={requester}
                  statusLine={<span className="text-yellow-400/80">Wants to be friends</span>}
                  actions={
                    <>
                      <button
                        onClick={() => declineRequest(requester.id)}
                        className="p-2 rounded-lg bg-[#222] hover:bg-red-900/20 text-[#666] hover:text-red-400 transition-colors border border-[#333]"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => acceptRequest(requester.id)}
                        className="p-2 rounded-lg bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 transition-colors border border-emerald-900/40"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-[#444] text-xs font-mono text-center py-8">Loading…</p>
          ) : friends.length === 0 && pending.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Users className="w-8 h-8 text-[#333] mx-auto" />
              <p className="text-[#444] text-xs font-mono">No friends yet.</p>
              <p className="text-[#333] text-xs">Search for players above or add someone from a game.</p>
            </div>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#555] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Online ({onlineFriends.length})
                  </div>
                  {onlineFriends.map(friend => {
                    const canJoin   = !!friend.currentRoomId && !!onJoinRoom;
                    const canInvite = !!roomId && mode !== 'Ranked';
                    return (
                      <PlayerCard
                        key={friend.id}
                        player={friend}
                        isOnline
                        statusLine={
                          friend.currentRoomId
                            ? <span className="text-emerald-400">In game · {friend.currentRoomId}</span>
                            : <span className="text-emerald-400">In lobby</span>
                        }
                        actions={
                          <>
                            {canJoin && (
                              <button
                                onClick={() => { playSound('click'); onJoinRoom!(friend.currentRoomId!); }}
                                className="p-2 rounded-lg bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 transition-colors border border-emerald-900/40"
                                title="Join their game"
                              >
                                <Gamepad2 className="w-4 h-4" />
                              </button>
                            )}
                            {canInvite && (
                              <button
                                onClick={() => inviteFriend(friend.id)}
                                className="p-2 rounded-lg bg-[#222] hover:bg-[#2a2a2a] text-[#666] hover:text-white transition-colors border border-[#333]"
                                title="Invite to your game"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => removeFriend(friend.id)}
                              className="p-2 rounded-lg bg-[#222] hover:bg-red-900/20 text-[#555] hover:text-red-400 transition-colors border border-[#333]"
                              title="Remove friend"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {offlineFriends.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#555] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#444]" />
                    Offline ({offlineFriends.length})
                  </div>
                  {offlineFriends.map(friend => (
                    <PlayerCard
                      key={friend.id}
                      player={friend}
                      isOnline={false}
                      actions={
                        <button
                          onClick={() => removeFriend(friend.id)}
                          className="p-2 rounded-lg bg-[#222] hover:bg-red-900/20 text-[#555] hover:text-red-400 transition-colors border border-[#333]"
                          title="Remove friend"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
