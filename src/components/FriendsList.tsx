import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { User } from '../types';
import { cn } from '../lib/utils';
import { UserPlus, Check, UserCheck, Users, Gamepad2, UserMinus } from 'lucide-react';

interface FriendsListProps {
  user: User;
  token: string;
  playSound: (sound: string) => void;
  roomId?: string;
}

export const FriendsList: React.FC<FriendsListProps> = ({ user, token, playSound, roomId }) => {
  const [friends, setFriends] = useState<User[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const inviteFriend = async (friendId: string) => {
    playSound('click');
    try {
      await fetch(`/api/friends/invite/${friendId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ roomId })
      });
    } catch (err) {
      console.error("Failed to invite friend", err);
    }
  };

  const removeFriend = async (friendId: string) => {
    playSound('click');
    try {
      await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err) {
      console.error("Failed to remove friend", err);
    }
  };

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const response = await fetch('/api/friends', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setFriends(data.friends);
        }
      } catch (err) {
        console.error("Failed to fetch friends", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFriends();

    socket.on('friendRequestReceived', () => {
      fetchFriends();
      playSound('notification');
    });
    socket.on('friendRequestAccepted', () => {
      fetchFriends();
      playSound('notification');
    });
    socket.on('userStatusChanged', ({ userId, isOnline }) => {
      setOnlineFriends(prev => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    return () => {
      socket.off('friendRequestReceived');
      socket.off('friendRequestAccepted');
      socket.off('userStatusChanged');
    };
  }, [token, playSound]);

  return (
    <div className="bg-[#1a1a1a] border border-[#222] rounded-3xl p-6 shadow-2xl text-white">
      <h3 className="text-xl font-thematic uppercase tracking-widest mb-4 flex items-center gap-2">
        <Users size={20} /> Friends
      </h3>
      {loading ? (
        <p className="text-gray-500 font-mono text-sm">Loading...</p>
      ) : friends.length === 0 ? (
        <p className="text-gray-500 font-mono text-sm">No friends yet.</p>
      ) : (
        <div className="space-y-2">
          {friends.map(friend => (
            <div key={friend.id} className="flex items-center justify-between bg-[#141414] p-3 rounded-xl border border-[#222]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={friend.avatarUrl || 'https://storage.googleapis.com/secretchancellor/SC.png'} alt={friend.username} className="w-8 h-8 rounded-full" />
                  <div className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#141414]", onlineFriends.has(friend.id) ? "bg-emerald-500" : "bg-gray-500")} />
                </div>
                <span className="font-mono text-sm">{friend.username}</span>
              </div>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-[#222] rounded-lg" onClick={() => playSound('click')}>
                  <Gamepad2 size={16} />
                </button>
                <button className="p-2 hover:bg-[#222] rounded-lg" onClick={() => inviteFriend(friend.id)}>
                  <UserPlus size={16} />
                </button>
                <button className="p-2 hover:bg-red-900/20 text-red-500 rounded-lg" onClick={() => removeFriend(friend.id)}>
                  <UserMinus size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
