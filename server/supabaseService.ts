import { randomUUID } from "crypto";
import { supabase, isSupabaseConfigured } from "../src/lib/supabase.ts";

// In-memory fallback store (used when Supabase is not configured)
const users: Map<string, any> = new Map();

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapSupabaseToUser(data: any): any {
  if (!data) return null;
  return {
    ...data,
    avatarUrl:         data.avatar_url,
    ownedCosmetics:    data.owned_cosmetics,
    activeFrame:       data.active_frame,
    activePolicyStyle: data.active_policy,
    activeVotingStyle: data.active_vote,
    activeMusic:       data.active_music,
    activeSoundPack:   data.active_sound,
    activeBackground:  data.active_background,
    cabinetPoints:     data.cabinet_points,
    googleId:          data.google_id,
    discordId:         data.discord_id,
  };
}

function mapUserToSupabase(userData: any): any {
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
    google_id:        userData.googleId,
    discord_id:       userData.discordId,
    stats:            userData.stats,
  };
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getUser(username: string): Promise<any> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
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
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
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
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
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
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
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
// Write operations
// ---------------------------------------------------------------------------

export async function saveUser(userData: any): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from("users")
      .upsert(mapUserToSupabase(userData));
    if (error) {
      console.error("Supabase Save Error:", JSON.stringify(error, null, 2));
    }
  }
  users.set(userData.username, userData);
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
      liberalGames: 0,
      fascistGames: 0,
      hitlerGames:  0,
      kills:        0,
      deaths:       0,
      elo:          1000,
      points:       0,
    },
    cabinetPoints: 0,
    ownedCosmetics: ['music-ambient'],
    ...overrides,
  };
}
