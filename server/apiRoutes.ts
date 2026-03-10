import { Express, Request, Response } from "express";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { GameState, RoomInfo } from "../src/types.ts";
import {
  getUser,
  getUserById,
  getUserByGoogleId,
  getUserByDiscordId,
  saveUser,
  makeNewUser,
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  isFriend,
  removeFriend,
} from "./supabaseService.ts";

const JWT_SECRET = process.env.JWT_SECRET || "secret-overseer-secret-key";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAppUrl(req?: Request): string {
  if (req?.query?.origin) return req.query.origin as string;
  if (req?.query?.state) {
    try {
      const stateData = JSON.parse(decodeURIComponent(req.query.state as string));
      if (stateData.origin) return stateData.origin;
    } catch (_) {}
  }
  if (!process.env.APP_URL) {
    console.warn("WARNING: APP_URL environment variable is not set. OAuth redirects may fail in production.");
  }
  return process.env.APP_URL || "http://localhost:3000";
}

function oauthSuccessPage(user: any, token: string): string {
  return `
    <html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(user)}, token: '${token}' }, '*');
        window.close();
      } else {
        const userEncoded = encodeURIComponent(JSON.stringify(${JSON.stringify(user)}));
        window.location.href = '/?token=${token}&user=' + userEncoded;
      }
    </script><p>Authentication successful. Redirecting...</p></body></html>
  `;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerRoutes(
  app: Express,
  io: Server,
  rooms: Map<string, GameState>,
  userSockets: Map<string, string>
): void {

  // ── Version endpoint ────────────────────────────────────────────────────────
  app.get("/version", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ version: process.env.APP_VERSION || "dev" });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/register", async (req: Request, res: Response) => {
    const { username, password, avatarUrl } = req.body;
    if (await getUser(username)) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = makeNewUser({ id: randomUUID(), username, avatarUrl, password: hashedPassword });
    await saveUser(newUser);
    const token = jwt.sign({ username }, JWT_SECRET);
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ user: userWithoutPassword, token });
  });

  app.post("/api/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = await getUser(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ username }, JWT_SECRET);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  });

  app.get("/api/me", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────

  app.get("/api/auth/google/url", (req: Request, res: Response) => {
    const origin = getAppUrl(req);
    const state  = encodeURIComponent(JSON.stringify({ origin }));
    const clientId = process.env.GOOGLE_CLIENT_ID;
    console.log("Google Client ID:", clientId);
    if (!clientId) {
        console.error("GOOGLE_CLIENT_ID is not set!");
        return res.status(500).json({ error: "Google OAuth not configured" });
    }
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  `${origin}/auth/google/callback`,
      response_type: "code",
      scope:         "openid profile email",
      access_type:   "offline",
      prompt:        "consent",
      state,
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req: Request, res: Response) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");
    try {
      const origin      = getAppUrl(req);
      const redirectUri = `${origin}/auth/google/callback`;
      const tokenRes    = await axios.post("https://oauth2.googleapis.com/token", {
        code, redirect_uri: redirectUri, grant_type: "authorization_code",
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      });
      const userRes    = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      const googleUser = userRes.data;
      const fallback   = `google_${googleUser.sub}`;

      let user = await getUserByGoogleId(googleUser.sub);
      if (!user) {
        let username = googleUser.name || fallback;
        if (await getUser(username)) username = fallback;
        user = makeNewUser({ id: randomUUID(), username, avatarUrl: googleUser.picture, googleId: googleUser.sub });
        await saveUser(user);
      } else {
        user.avatarUrl = googleUser.picture;
        await saveUser(user);
      }

      const token = jwt.sign({ username: user.username }, JWT_SECRET);
      res.send(oauthSuccessPage(user, token));
    } catch (err: any) {
      console.error("Google OAuth Error:", err.response?.data || err.message);
      res.status(500).send("Authentication failed");
    }
  });

  // ── Discord OAuth ─────────────────────────────────────────────────────────

  async function handleDiscordAuth(code: string, origin: string) {
      const redirectUri = `${origin}/auth/discord/callback`;
      const tokenRes    = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id:     process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          grant_type:    "authorization_code",
          code:          code as string,
          redirect_uri:  redirectUri,
        })
      );
      const userRes     = await axios.get("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      const discordUser = userRes.data;
      const fallback    = `discord_${discordUser.id}`;
      const avatarUrl   = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`;

      let user = await getUserByDiscordId(discordUser.id);
      if (!user) {
        let username = discordUser.username || fallback;
        if (await getUser(username)) username = fallback;
        user = makeNewUser({ id: randomUUID(), username, avatarUrl, discordId: discordUser.id });
        await saveUser(user);
      } else {
        user.avatarUrl = avatarUrl;
        await saveUser(user);
      }

      const token = jwt.sign({ username: user.username }, JWT_SECRET);
      return { user, token };
  }

  app.get("/api/auth/discord/url", (req: Request, res: Response) => {
    const origin = getAppUrl(req);
    const state  = encodeURIComponent(JSON.stringify({ origin }));
    const clientId = process.env.DISCORD_CLIENT_ID;
    console.log("Discord Client ID:", clientId);
    if (!clientId) {
        console.error("DISCORD_CLIENT_ID is not set!");
        return res.status(500).json({ error: "Discord OAuth not configured" });
    }
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  `${origin}/auth/discord/callback`,
      response_type: "code",
      scope:         "identify email",
      state,
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
  });

  app.post("/api/auth/discord/callback", async (req: Request, res: Response) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });
    try {
      const origin = getAppUrl(req);
      const { user, token } = await handleDiscordAuth(code, origin);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (err: any) {
      console.error("Discord Activity Auth Error:", err.response?.data || err.message);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  app.get(["/auth/discord/callback", "/auth/discord/callback/"], async (req: Request, res: Response) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");
    try {
      const origin = getAppUrl(req);
      const { user, token } = await handleDiscordAuth(code as string, origin);
      res.send(oauthSuccessPage(user, token));
    } catch (err: any) {
      console.error("Discord OAuth Error:", err.response?.data || err.message);
      res.status(500).send("Authentication failed");
    }
  });

  // ── Rooms ─────────────────────────────────────────────────────────────────

  app.get("/api/rooms", (_req: Request, res: Response) => {
    const roomList: RoomInfo[] = Array.from(rooms.entries()).map(([id, state]) => ({
      id,
      name:          state.roomId,
      playerCount:   state.players.length,
      maxPlayers:    state.maxPlayers,
      phase:         state.phase,
      actionTimer:   state.actionTimer,
      playerAvatars: state.players.map(p => p.avatarUrl || "").filter(Boolean),
      mode:          state.mode,
    }));
    res.json(roomList);
  });

  app.get("/api/rejoin-info", (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ canRejoin: false });
    for (const state of rooms.values()) {
      const player = state.players.find(p => p.userId === userId && p.isDisconnected);
      if (player) {
        return res.json({
          canRejoin: true,
          roomId:    state.roomId,
          roomName:  state.roomId,
          mode:      state.mode,
        });
      }
    }
    res.json({ canRejoin: false });
  });

  // ── Shop ──────────────────────────────────────────────────────────────────

  app.post("/api/shop/buy", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { itemId, price } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user    = await getUser(decoded.username);
      if (!user)                                  return res.status(404).json({ error: "User not found" });
      if (user.stats.points < price)              return res.status(400).json({ error: "Not enough points" });
      if (user.ownedCosmetics.includes(itemId))   return res.status(400).json({ error: "Already owned" });
      user.stats.points -= price;
      user.ownedCosmetics.push(itemId);
      await saveUser(user);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // ── Friends ───────────────────────────────────────────────────────────────

  app.get("/api/friends", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      const friends = await getFriends(user.id);
      res.json({ friends });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/friends/request", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { targetUserId } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      await sendFriendRequest(user.id, targetUserId);
      res.json({ success: true });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/friends/accept", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { targetUserId } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      await acceptFriendRequest(user.id, targetUserId);
      res.json({ success: true });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.get("/api/user/:userId", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const currentUser = await getUser(decoded.username);
      if (!currentUser) return res.status(404).json({ error: "User not found" });
      
      const user = await getUserById(req.params.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      const isFriendStatus = await isFriend(currentUser.id, user.id);
      
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, isFriend: isFriendStatus });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.delete("/api/friends/:targetUserId", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      await removeFriend(user.id, req.params.targetUserId);
      res.json({ success: true });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/friends/invite/:friendId", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { roomId } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      const friendSocketId = userSockets.get(req.params.friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit("friendInvite", { fromUserId: user.id, fromUsername: user.username, roomId });
      }
      res.json({ success: true });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/profile/frame", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { frameId, policyStyle, votingStyle, music, soundPack, backgroundId } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user    = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (frameId !== undefined) {
        if (frameId && !user.ownedCosmetics.includes(frameId)) return res.status(400).json({ error: "Not owned" });
        user.activeFrame = frameId;
      }
      if (policyStyle !== undefined) {
        if (policyStyle && !user.ownedCosmetics.includes(policyStyle)) return res.status(400).json({ error: "Not owned" });
        user.activePolicyStyle = policyStyle;
      }
      if (votingStyle !== undefined) {
        if (votingStyle && !user.ownedCosmetics.includes(votingStyle)) return res.status(400).json({ error: "Not owned" });
        user.activeVotingStyle = votingStyle;
      }
      if (music !== undefined) {
        if (music && !user.ownedCosmetics.includes(music)) return res.status(400).json({ error: "Not owned" });
        user.activeMusic = music;
      }
      if (soundPack !== undefined) {
        if (soundPack && !user.ownedCosmetics.includes(soundPack)) return res.status(400).json({ error: "Not owned" });
        user.activeSoundPack = soundPack;
      }
      if (backgroundId !== undefined) {
        if (backgroundId && !user.ownedCosmetics.includes(backgroundId)) return res.status(400).json({ error: "Not owned" });
        user.activeBackground = backgroundId;
      }

      await saveUser(user);

      // Push cosmetic changes to all live rooms immediately
      for (const room of rooms.values()) {
        let changed = false;
        for (const p of room.players) {
          if (p.userId === user.id) {
            if (frameId      !== undefined) p.activeFrame      = frameId;
            if (policyStyle  !== undefined) p.activePolicyStyle = policyStyle;
            if (votingStyle  !== undefined) p.activeVotingStyle = votingStyle;
            changed = true;
          }
        }
        if (changed) io.to(room.roomId).emit("gameStateUpdate", room);
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
