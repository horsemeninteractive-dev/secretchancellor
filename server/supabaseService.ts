import { randomUUID } from "crypto";
import { supabase, isSupabaseConfigured } from "../src/lib/supabase.ts";
import { supabaseAdmin, isSupabaseAdminConfigured } from "./supabaseAdmin.ts";
import { User, UserInternal } from "../src/types.ts";

// Use admin client if available, fallback to regular client
const db = isSupabaseAdminConfigured ? supabaseAdmin : supabase;
const isConfigured = isSupabaseAdminConfigured || isSupabaseConfigured;

// In-memory fallback store (used when Supabase is not configured)
const users: Map<string, UserInternal> = new Map();

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapSupabaseToUser(data: any): UserInternal {
  if (!data) return null as any;
  
  // Migrate old stats keys if they exist
  const stats = data.stats || {};
  if (stats.liberalGames !== undefined && (stats.civilGames === undefined || stats.civilGames === null)) {
    stats.civilGames = stats.liberalGames;
    delete stats.liberalGames;
  }
  if (stats.fascistGames !== undefined && (stats.stateGames === undefined || stats.stateGames === null)) {
    stats.stateGames = stats.fascistGames;
    delete stats.fascistGames;
  }
  if (stats.hitlerGames !== undefined && (stats.overseerGames === undefined || stats.overseerGames === null)) {
    stats.overseerGames = stats.hitlerGames;
    delete stats.hitlerGames;
  }

  return {
    ...data,
    stats,
    createdAt:         data.created_at,
    avatarUrl:         data.avatar_url,
    ownedCosmetics:    data.owned_cosmetics,
    activeFrame:       data.active_frame,
    activePolicyStyle: data.active_policy,
    activeVotingStyle: data.active_vote,
    activeMusic:       data.active_music,
    activeSoundPack:   data.active_sound,
    activeBackground:  data.active_background,
    cabinetPoints:     data.cabinet_points,
    claimedRewards:    data.claimed_rewards || [],
    googleId:          data.google_id,
    discordId:         data.discord_id,
  };
}

function mapUserToSupabase(userData: UserInternal): any {
  return {
    id:               userData.id,
    username:         userData.username,
    password:         userData.password,
    avatar_url:       userData.avatarUrl,
    owned_cosmetics:  userData.ownedCosmetics,
    active_frame:     userData.activeFrame,
    active_policy:    userData.activePolicyStyle,
    active_vote:      userData.activeVotingStyle,
    active_music:     userData.activeMusic,
    active_sound:     userData.activeSoundPack,
    active_background:userData.activeBackground,
    cabinet_points:   userData.cabinetPoints,
    claimed_rewards:  userData.claimedRewards,
    google_id:        userData.googleId,
    discord_id:       userData.discordId,
    stats:            userData.stats,
  };
}

export async function getLeaderboard(): Promise<any[]> {
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .order("stats->elo", { ascending: false })
      .limit(50);
    if (error) return [];
    return data.map(mapSupabaseToUser);
  }
  return Array.from(users.values())
    .sort((a, b) => b.stats.elo - a.stats.elo)
    .slice(0, 50);
}

export async function getGlobalStats(): Promise<{ civilWins: number; stateWins: number }> {
  if (isConfigured) {
    const { data, error } = await db
      .from("global_stats")
      .select("civil_wins, state_wins")
      .eq("id", 1)
      .single();
    if (error || !data) return { civilWins: 0, stateWins: 0 };
    return { civilWins: data.civil_wins, stateWins: data.state_wins };
  }
  return { civilWins: 0, stateWins: 0 };
}

export async function incrementGlobalWin(faction: 'Civil' | 'State'): Promise<void> {
  if (isConfigured) {
    const column = faction === 'Civil' ? 'civil_wins' : 'state_wins';
    const { data, error } = await db
      .from("global_stats")
      .select(column)
      .eq("id", 1)
      .single();
    
    if (data) {
        await db
          .from("global_stats")
          .update({ [column]: data[column] + 1 })
          .eq("id", 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getUser(username: string): Promise<any> {
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("username", username)
      .single();
    if (error) return null;
    return mapSupabaseToUser(data);
  }
  return users.get(username) ?? null;
}

export async function getUserById(id: string): Promise<any> {
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return mapSupabaseToUser(data);
  }
  for (const u of users.values()) {
    if (u.id === id) return u;
  }
  return null;
}

export async function getUserByGoogleId(googleId: string): Promise<any> {
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("google_id", googleId)
      .single();
    if (error) return null;
    return mapSupabaseToUser(data);
  }
  for (const u of users.values()) {
    if (u.googleId === googleId) return u;
  }
  return null;
}

export async function getUserByDiscordId(discordId: string): Promise<any> {
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .eq("discord_id", discordId)
      .single();
    if (error) return null;
    return mapSupabaseToUser(data);
  }
  for (const u of users.values()) {
    if (u.discordId === discordId) return u;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Friends operations
// ---------------------------------------------------------------------------

export async function getFriends(userId: string): Promise<any[]> {
  if (isConfigured) {
    const { data, error } = await db
      .from("friends")
      .select("*, user_id_1, user_id_2")
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .eq("status", "accepted");
    if (error) return [];
    
    const friendIds = data.map(f => f.user_id_1 === userId ? f.user_id_2 : f.user_id_1);
    const { data: friendsData, error: friendsError } = await db
      .from("users")
      .select("*")
      .in("id", friendIds);
    if (friendsError) return [];
    return friendsData.map(mapSupabaseToUser);
  }
  return []; // In-memory fallback not implemented for friends yet
}

export async function sendFriendRequest(userId1: string, userId2: string): Promise<void> {
  if (isConfigured) {
    await db
      .from("friends")
      .insert({ user_id_1: userId1, user_id_2: userId2, status: 'pending' });
  }
}

export async function acceptFriendRequest(userId1: string, userId2: string): Promise<void> {
  if (isConfigured) {
    await db
      .from("friends")
      .update({ status: 'accepted' })
      .or(`and(user_id_1.eq.${userId1},user_id_2.eq.${userId2}),and(user_id_1.eq.${userId2},user_id_2.eq.${userId1})`);
  }
}

export async function isFriend(userId1: string, userId2: string): Promise<boolean> {
  if (isConfigured) {
    const { data, error } = await db
      .from("friends")
      .select("*")
      .or(`and(user_id_1.eq.${userId1},user_id_2.eq.${userId2}),and(user_id_1.eq.${userId2},user_id_2.eq.${userId1})`)
      .eq("status", "accepted")
      .single();
    return !error && !!data;
  }
  return false;
}

export async function removeFriend(userId1: string, userId2: string): Promise<void> {
  if (isConfigured) {
    await db
      .from("friends")
      .delete()
      .or(`and(user_id_1.eq.${userId1},user_id_2.eq.${userId2}),and(user_id_1.eq.${userId2},user_id_2.eq.${userId1})`);
  }
}


export async function searchUsers(query: string, currentUserId: string, limit = 10): Promise<any[]> {
  if (!query.trim() || query.length < 2) return [];
  if (isConfigured) {
    const { data, error } = await db
      .from("users")
      .select("*")
      .ilike("username", `%${query}%`)
      .neq("id", currentUserId)
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapSupabaseToUser);
  }
  // In-memory fallback
  return Array.from(users.values())
    .filter(u => u.id !== currentUserId && u.username.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);
}

export async function getPendingFriendRequests(userId: string): Promise<any[]> {
  if (isConfigured) {
    // Requests where userId is the recipient (user_id_2) and status is pending
    const { data, error } = await db
      .from("friends")
      .select("user_id_1")
      .eq("user_id_2", userId)
      .eq("status", "pending");
    if (error || !data || data.length === 0) return [];
    const senderIds = data.map((r: any) => r.user_id_1);
    const { data: senders, error: sendersError } = await db
      .from("users")
      .select("*")
      .in("id", senderIds);
    if (sendersError) return [];
    return senders.map(mapSupabaseToUser);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

export async function saveUser(userData: any): Promise<void> {
  if (isConfigured) {
    const { error } = await db
      .from("users")
      .upsert(mapUserToSupabase(userData));
    if (error) {
      console.error("Supabase Save Error:", JSON.stringify(error, null, 2));
    }
  } else {
    users.set(userData.username, userData);
  }
}

// ---------------------------------------------------------------------------
// Match history
// ---------------------------------------------------------------------------

// In-memory fallback for match history (keyed by userId)
const matchHistoryStore: Map<string, any[]> = new Map();

export async function saveMatchResult(match: any): Promise<void> {
  if (isConfigured) {
    const { error } = await db.from("match_history").insert({
      id:               match.id,
      user_id:          match.userId,
      played_at:        match.playedAt,
      room_name:        match.roomName,
      mode:             match.mode,
      player_count:     match.playerCount,
      role:             match.role,
      won:              match.won,
      win_reason:       match.winReason,
      rounds:           match.rounds,
      civil_directives: match.civilDirectives,
      state_directives: match.stateDirectives,
      agenda_id:        match.agendaId ?? null,
      agenda_name:      match.agendaName ?? null,
      agenda_completed: match.agendaCompleted,
      xp_earned:        match.xpEarned,
      ip_earned:        match.ipEarned,
    });
    if (error) console.error("Match history save error:", error.message);
  } else {
    const existing = matchHistoryStore.get(match.userId) ?? [];
    existing.unshift(match);
    matchHistoryStore.set(match.userId, existing.slice(0, 50));
  }
}

export async function getMatchHistory(userId: string, limit = 20): Promise<any[]> {
  if (isConfigured) {
    const { data, error } = await db
      .from("match_history")
      .select("*")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(r => ({
      id:               r.id,
      userId:           r.user_id,
      playedAt:         r.played_at,
      roomName:         r.room_name,
      mode:             r.mode,
      playerCount:      r.player_count,
      role:             r.role,
      won:              r.won,
      winReason:        r.win_reason,
      rounds:           r.rounds,
      civilDirectives:  r.civil_directives,
      stateDirectives:  r.state_directives,
      agendaId:         r.agenda_id,
      agendaName:       r.agenda_name,
      agendaCompleted:  r.agenda_completed,
      xpEarned:         r.xp_earned,
      ipEarned:         r.ip_earned,
    }));
  }
  return (matchHistoryStore.get(userId) ?? []).slice(0, limit);
}

// ---------------------------------------------------------------------------
// New-user factory — shared by register, Google OAuth, Discord OAuth
// ---------------------------------------------------------------------------

export function makeNewUser(overrides: Partial<any> = {}): any {
  return {
    id: randomUUID(),
    username: "",
    avatarUrl: undefined,
    stats: {
      gamesPlayed:  0,
      wins:         0,
      losses:       0,
      civilGames:   0,
      stateGames:   0,
      overseerGames:0,
      kills:        0,
      deaths:       0,
      elo:          1000,
      points:       0,
      xp:           0,
      agendasCompleted: 0,
    },
    cabinetPoints: 0,
    claimedRewards: [],
    ownedCosmetics: ['music-ambient'],
    ...overrides,
  };
}
