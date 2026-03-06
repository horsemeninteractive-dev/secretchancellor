import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase.ts";
import { 
  GameState, 
  Player, 
  User, 
  UserStats, 
  RoomInfo, 
  Role, 
  Policy, 
  GamePhase, 
  ExecutiveAction, 
  AIPersonality 
} from "./src/types.ts";

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "secret-hitler-secret-key";

const AI_BOTS: { name: string; avatarUrl: string; personality: AIPersonality }[] = [
  { name: "Bismarck", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bismarck", personality: "Strategic" },
  { name: "Metternich", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Metternich", personality: "Strategic" },
  { name: "Talleyrand", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Talleyrand", personality: "Deceptive" },
  { name: "Cavour", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cavour", personality: "Honest" },
  { name: "Disraeli", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Disraeli", personality: "Strategic" },
  { name: "Gladstone", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gladstone", personality: "Honest" },
  { name: "Churchill", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Churchill", personality: "Aggressive" },
  { name: "Roosevelt", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Roosevelt", personality: "Honest" },
  { name: "Lincoln", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lincoln", personality: "Honest" },
  { name: "Washington", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Washington", personality: "Honest" },
  { name: "Napoleon", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Napoleon", personality: "Aggressive" },
  { name: "Caesar", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caesar", personality: "Aggressive" },
  { name: "Cleopatra", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cleopatra", personality: "Strategic" },
  { name: "Genghis", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Genghis", personality: "Aggressive" },
  { name: "Sun Tzu", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=SunTzu", personality: "Strategic" },
  { name: "Machiavelli", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Machiavelli", personality: "Deceptive" },
  { name: "Catherine", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Catherine", personality: "Strategic" },
  { name: "Elizabeth", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elizabeth", personality: "Strategic" },
  { name: "Victoria", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Victoria", personality: "Honest" },
  { name: "Joan", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Joan", personality: "Honest" },
  { name: "Spartacus", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Spartacus", personality: "Aggressive" },
  { name: "Leonidas", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leonidas", personality: "Aggressive" },
  { name: "Boudica", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Boudica", personality: "Aggressive" },
  { name: "Nero", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nero", personality: "Chaotic" },
  { name: "Caligula", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caligula", personality: "Chaotic" },
];

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const rooms: Map<string, GameState> = new Map();
  const lobbyTimers: Map<string, NodeJS.Timeout> = new Map();
  const pauseTimers: Map<string, NodeJS.Timeout> = new Map();
  const actionTimers: Map<string, any> = new Map();
  const users: Map<string, any> = new Map(); // username -> user data (including hashed password)

  // Helper to map Supabase snake_case to app camelCase
  const mapSupabaseToUser = (data: any) => {
    if (!data) return null;
    return {
      ...data,
      avatarUrl: data.avatar_url,
      ownedCosmetics: data.owned_cosmetics,
      activeFrame: data.active_frame,
      activePolicyStyle: data.active_policy,
      activeVotingStyle: data.active_vote,
      googleId: data.google_id,
      discordId: data.discord_id
    };
  };

  // Helper to get user from Supabase or Map
  const getUser = async (username: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
      if (error) return null;
      return mapSupabaseToUser(data);
    }
    return users.get(username);
  };

  const getUserByGoogleId = async (googleId: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('google_id', googleId)
        .single();
      if (error) return null;
      return mapSupabaseToUser(data);
    }
    for (const u of users.values()) {
      if (u.googleId === googleId) return u;
    }
    return null;
  };

  const getUserByDiscordId = async (discordId: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', discordId)
        .single();
      if (error) return null;
      return mapSupabaseToUser(data);
    }
    for (const u of users.values()) {
      if (u.discordId === discordId) return u;
    }
    return null;
  };

  const getUserById = async (id: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
      if (error) return null;
      return mapSupabaseToUser(data);
    }
    for (const u of users.values()) {
      if (u.id === id) return u;
    }
    return null;
  };

  // Helper to save user to Supabase and Map
  const saveUser = async (userData: any) => {
    if (isSupabaseConfigured) {
      // Map camelCase from the app to snake_case for Supabase
      const supabaseData = {
        id: userData.id,
        username: userData.username,
        password: userData.password,
        avatar_url: userData.avatarUrl,
        owned_cosmetics: userData.ownedCosmetics,
        active_frame: userData.activeFrame,
        active_policy: userData.activePolicyStyle,
        active_vote: userData.activeVotingStyle,
        google_id: userData.googleId,
        discord_id: userData.discordId,
        stats: userData.stats
      };
      
      const { error } = await supabase
        .from('users')
        .upsert(supabaseData);
      if (error) {
        console.error("Supabase Save Error:", JSON.stringify(error, null, 2));
      }
    }
    users.set(userData.username, userData);
  };

  // API Routes
  app.post("/api/register", async (req, res) => {
    const { username, password, avatarUrl } = req.body;
    const existingUser = await getUser(username);
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser: any = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      avatarUrl,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        liberalGames: 0,
        fascistGames: 0,
        hitlerGames: 0,
        kills: 0,
        deaths: 0,
        elo: 1000,
        points: 0,
      },
      ownedCosmetics: [],
      password: hashedPassword
    };
    await saveUser(newUser);
    const token = jwt.sign({ username }, JWT_SECRET);
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ user: userWithoutPassword, token });
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await getUser(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ username }, JWT_SECRET);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  });

  // --- OAuth Routes ---

  const getAppUrl = (req?: any) => {
    // Try to get origin from query param first (passed from client)
    if (req?.query?.origin) return req.query.origin as string;
    
    // Try to get origin from state parameter (passed back from OAuth)
    if (req?.query?.state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(req.query.state as string));
        if (stateData.origin) return stateData.origin;
      } catch (e) {}
    }

    if (!process.env.APP_URL) {
      console.warn("WARNING: APP_URL environment variable is not set. OAuth redirects may fail in production.");
    }
    return process.env.APP_URL || "http://localhost:3000";
  };

  // Google OAuth
  app.get("/api/auth/google/url", (req, res) => {
    const origin = getAppUrl(req);
    const redirectUri = `${origin}/auth/google/callback`;
    const state = encodeURIComponent(JSON.stringify({ origin }));
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "GOOGLE_CLIENT_ID",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      access_type: "offline",
      prompt: "consent",
      state: state
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const origin = getAppUrl(req);
      const redirectUri = `${origin}/auth/google/callback`;
      const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const { access_token } = tokenResponse.data;
      const userResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const googleUser = userResponse.data;
      const fallbackUsername = `google_${googleUser.sub}`;
      
      let user = await getUserByGoogleId(googleUser.sub);
      if (!user) {
        // Check if the desired username is already taken
        let desiredUsername = googleUser.name || fallbackUsername;
        const existingByUsername = await getUser(desiredUsername);
        if (existingByUsername) {
          // Username taken, use fallback
          desiredUsername = fallbackUsername;
        }

        const newUser: any = {
          id: Math.random().toString(36).substr(2, 9),
          username: desiredUsername,
          avatarUrl: googleUser.picture,
          stats: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            liberalGames: 0,
            fascistGames: 0,
            hitlerGames: 0,
            kills: 0,
            deaths: 0,
            elo: 1000,
            points: 0,
          },
          ownedCosmetics: [],
          googleId: googleUser.sub
        };
        user = newUser;
        await saveUser(user);
      } else {
        // Update avatar if it changed
        user.avatarUrl = googleUser.picture;
        await saveUser(user);
      }

      const token = jwt.sign({ username: user.username }, JWT_SECRET);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: ${JSON.stringify(user)}, 
                  token: '${token}' 
                }, '*');
                window.close();
              } else {
                const userEncoded = encodeURIComponent(JSON.stringify(${JSON.stringify(user)}));
                window.location.href = '/?token=${token}&user=' + userEncoded;
              }
            </script>
            <p>Authentication successful. Redirecting...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  // Discord OAuth
  app.get("/api/auth/discord/url", (req, res) => {
    const origin = getAppUrl(req);
    const redirectUri = `${origin}/auth/discord/callback`;
    const state = encodeURIComponent(JSON.stringify({ origin }));
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || "DISCORD_CLIENT_ID",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify email",
      state: state
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
  });

  app.get(["/auth/discord/callback", "/auth/discord/callback/"], async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const origin = getAppUrl(req);
      const redirectUri = `${origin}/auth/discord/callback`;
      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: redirectUri,
      });

      const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", params);
      const { access_token } = tokenResponse.data;

      const userResponse = await axios.get("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const discordUser = userResponse.data;
      const fallbackUsername = `discord_${discordUser.id}`;
      const avatarUrl = discordUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`;

      let user = await getUserByDiscordId(discordUser.id);
      if (!user) {
        // Check if the desired username is already taken
        let desiredUsername = discordUser.username || fallbackUsername;
        const existingByUsername = await getUser(desiredUsername);
        if (existingByUsername) {
          // Username taken, use fallback
          desiredUsername = fallbackUsername;
        }

        const newUser: any = {
          id: Math.random().toString(36).substr(2, 9),
          username: desiredUsername,
          avatarUrl: avatarUrl,
          stats: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            liberalGames: 0,
            fascistGames: 0,
            hitlerGames: 0,
            kills: 0,
            deaths: 0,
            elo: 1000,
            points: 0,
          },
          ownedCosmetics: [],
          discordId: discordUser.id
        };
        user = newUser;
        await saveUser(user);
      } else {
        // Update avatar if it changed
        user.avatarUrl = avatarUrl;
        await saveUser(user);
      }

      const token = jwt.sign({ username: user.username }, JWT_SECRET);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: ${JSON.stringify(user)}, 
                  token: '${token}' 
                }, '*');
                window.close();
              } else {
                const userEncoded = encodeURIComponent(JSON.stringify(${JSON.stringify(user)}));
                window.location.href = '/?token=${token}&user=' + userEncoded;
              }
            </script>
            <p>Authentication successful. Redirecting...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Discord OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/me", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.get("/api/rooms", (req, res) => {
    const roomList: RoomInfo[] = Array.from(rooms.entries()).map(([id, state]) => ({
      id,
      name: state.roomId,
      playerCount: state.players.length,
      maxPlayers: state.maxPlayers,
      phase: state.phase,
      actionTimer: state.actionTimer,
      playerAvatars: state.players.map(p => p.avatarUrl || '').filter(Boolean),
      mode: state.mode
    }));
    res.json(roomList);
  });

  app.get("/api/rejoin-info", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ canRejoin: false });

    for (const state of rooms.values()) {
      const player = state.players.find(p => p.userId === userId && p.isDisconnected);
      if (player) {
        return res.json({ 
          canRejoin: true, 
          roomId: state.roomId, 
          roomName: state.roomId,
          mode: state.mode
        });
      }
    }
    res.json({ canRejoin: false });
  });

  app.post("/api/shop/buy", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { itemId, price } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.stats.points < price) return res.status(400).json({ error: "Not enough points" });
      if (user.ownedCosmetics.includes(itemId)) return res.status(400).json({ error: "Already owned" });
      
      user.stats.points -= price;
      user.ownedCosmetics.push(itemId);
      await saveUser(user);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post("/api/profile/frame", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { frameId, policyStyle, votingStyle } = req.body;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
      const user = await getUser(decoded.username);
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
      
      await saveUser(user);

      // Update active rooms
      for (const room of rooms.values()) {
        let changed = false;
        for (const p of room.players) {
          if (p.userId === user.id) {
            if (frameId !== undefined) p.activeFrame = frameId;
            if (policyStyle !== undefined) p.activePolicyStyle = policyStyle;
            if (votingStyle !== undefined) p.activeVotingStyle = votingStyle;
            changed = true;
          }
        }
        if (changed) {
          io.to(room.roomId).emit("gameStateUpdate", room);
        }
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  function createDeck(): Policy[] {
    const deck: Policy[] = [];
    for (let i = 0; i < 6; i++) deck.push("Liberal");
    for (let i = 0; i < 11; i++) deck.push("Fascist");
    return shuffle(deck);
  }

  function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function startActionTimer(roomId: string) {
    const state = rooms.get(roomId);
    if (!state || state.actionTimer === 0 || state.phase === 'Lobby' || state.phase === 'GameOver') {
      if (state) state.actionTimerEnd = undefined;
      if (actionTimers.has(roomId)) {
        clearTimeout(actionTimers.get(roomId));
        actionTimers.delete(roomId);
      }
      return;
    }

    // Clear existing timer
    if (actionTimers.has(roomId)) {
      clearTimeout(actionTimers.get(roomId));
    }

    state.actionTimerEnd = Date.now() + (state.actionTimer * 1000);
    
    const timer = setTimeout(() => {
      const s = rooms.get(roomId);
      if (!s || s.phase === 'Lobby' || s.phase === 'GameOver') return;

      // Clear the end time so we don't think a timer is still running
      s.actionTimerEnd = undefined;

      // Auto-perform action based on phase
      if (s.phase === 'Election') {
        const president = s.players[s.presidentIdx];
        const eligible = s.players.filter(p => 
          p.isAlive && 
          p.id !== president.id && 
          !p.wasChancellor && 
          !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
        );
        if (eligible.length > 0) {
          const target = eligible[Math.floor(Math.random() * eligible.length)];
          target.isChancellorCandidate = true;
          s.phase = "Voting";
          s.log.push(`[Timer] ${president.name} was too slow. ${target.name} was auto-nominated.`);
          broadcastState(roomId);
          processAITurns(roomId);
        }
      } else if (s.phase === 'Voting') {
        s.players.forEach(p => {
          if (p.isAlive && !p.vote) {
            p.vote = Math.random() > 0.3 ? 'Ja' : 'Nein';
          }
        });
        const jaVotes = s.players.filter((p) => p.vote === "Ja").length;
        const neinVotes = s.players.filter((p) => p.vote === "Nein").length;
        s.log.push(`[Timer] Voting time expired. Remaining votes were auto-cast.`);
        handleVoteResult(s, roomId, jaVotes, neinVotes);
      } else if (s.phase === 'Legislative_President') {
        const president = s.players.find(p => p.isPresident);
        if (president) {
          s.presidentSaw = [...s.drawnPolicies];
          const discarded = s.drawnPolicies.splice(Math.floor(Math.random() * s.drawnPolicies.length), 1)[0];
          s.discard.push(discarded);
          s.chancellorPolicies = [...s.drawnPolicies];
          s.chancellorSaw = [...s.chancellorPolicies];
          s.drawnPolicies = [];
          s.phase = "Legislative_Chancellor";
          s.presidentTimedOut = true;
          s.log.push(`[Timer] ${president.name} was too slow. A random policy was discarded.`);
          broadcastState(roomId);
          processAITurns(roomId);
          triggerAIDeclarations(s, roomId); // Normal trigger, will handle President if timed out
        }
      } else if (s.phase === 'Legislative_Chancellor') {
        const chancellor = s.players.find(p => p.isChancellor);
        if (chancellor && s.chancellorPolicies.length > 0) {
          const played = s.chancellorPolicies.splice(Math.floor(Math.random() * s.chancellorPolicies.length), 1)[0];
          const discarded = s.chancellorPolicies[0];
          s.discard.push(discarded);
          s.chancellorPolicies = [];
          s.chancellorTimedOut = true;
          s.log.push(`[Timer] ${chancellor.name} was too slow. A random policy was played.`);
          triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
        }
      } else if (s.phase === 'Executive_Action') {
        const president = s.players.find(p => p.isPresident);
        if (president) {
          const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
          if (eligible.length > 0) {
            const target = eligible[Math.floor(Math.random() * eligible.length)];
            s.log.push(`[Timer] ${president.name} was too slow. A random target was selected.`);
            handleExecutiveAction(s, roomId, target.id);
          }
        }
      }
    }, state.actionTimer * 1000);

    actionTimers.set(roomId, timer);
  }

  function broadcastState(roomId: string) {
    const state = rooms.get(roomId);
    if (state) {
      // Start action timer if phase changed or just started
      if (state.actionTimer > 0 && !state.actionTimerEnd && state.phase !== 'Lobby' && state.phase !== 'GameOver' && !state.isPaused) {
        startActionTimer(roomId);
      }
      // Create a public version of the state that hides roles unless the game is over
      const publicState = {
        ...state,
        players: state.players.map(p => {
          const { role, ...rest } = p;
          if (state.phase === 'GameOver') {
            return { ...rest, role };
          }
          return rest;
        })
      };
      io.to(roomId).emit("gameStateUpdate", publicState);
      
      // Send private info
      state.players.forEach((p) => {
        if (p.isAI) return; // Don't emit to AI "sockets"
        const fascists = state.players
          .filter((pl) => pl.role === "Fascist" || pl.role === "Hitler")
          .map((pl) => ({ id: pl.id, name: pl.name, role: pl.role! }));

        if (p.role === "Fascist") {
          io.to(p.id).emit("privateInfo", { role: p.role, fascists });
        } else if (p.role === "Hitler" && state.players.length <= 6) {
          // In small games, Hitler knows fascists
          io.to(p.id).emit("privateInfo", { role: p.role, fascists });
        } else {
          io.to(p.id).emit("privateInfo", { role: p.role! });
        }
      });
    }
  }

  function processAITurns(roomId: string) {
    const state = rooms.get(roomId);
    if (!state || state.phase === "Lobby" || state.phase === "GameOver" || state.isPaused) return;

    setTimeout(async () => {
      const s = rooms.get(roomId);
      if (!s || s.isPaused) return;

      if (s.phase === "Election") {
        const president = s.players[s.presidentIdx];
        if (president.isAI) {
          // AI President nominates a Chancellor
          const eligible = s.players.filter(p => 
            p.isAlive && 
            p.id !== president.id && 
            !p.wasChancellor && 
            !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
          );
          if (eligible.length > 0) {
            const target = eligible[Math.floor(Math.random() * eligible.length)];
            target.isChancellorCandidate = true;
            s.phase = "Voting";
            s.log.push(`${president.name} nominated ${target.name} for Chancellor.`);
            broadcastState(roomId);
            processAITurns(roomId);
          }
        }
      } else if (s.phase === "Voting") {
        const aiVoters = s.players.filter(p => p.isAI && p.isAlive && !p.vote);
        if (aiVoters.length > 0) {
          aiVoters.forEach(ai => {
            let vote: 'Ja' | 'Nein' = 'Ja';
            const chancellor = s.players.find(p => p.isChancellorCandidate);
            const president = s.players[s.presidentIdx];
            
            // Meta-aware voting
            if (s.round === 1 && s.electionTracker === 0) {
              // First round, first government is almost always Ja in meta
              vote = 'Ja';
            } else if (s.fascistPolicies >= 3 && chancellor?.role === 'Hitler') {
              // Fascists vote Ja to win if Hitler is Chancellor
              if (ai.role === 'Fascist' || ai.role === 'Hitler') {
                vote = 'Ja';
              } else {
                // Liberals should be suspicious if 3 policies are down
                vote = Math.random() > 0.7 ? 'Ja' : 'Nein';
              }
            } else {
              // Personality based voting with more logic
              if (ai.role === 'Liberal') {
                // Liberals vote Ja unless they have reason to doubt
                vote = Math.random() > 0.2 ? 'Ja' : 'Nein';
                // If president or chancellor was investigated as fascist, vote Nein
                if (s.investigationResult && (s.investigationResult.targetName === president.name || s.investigationResult.targetName === chancellor?.name) && s.investigationResult.role !== 'Liberal') {
                  vote = 'Nein';
                }
              } else {
                // Fascists vote strategically
                if (chancellor?.role !== 'Liberal' || president.role !== 'Liberal') {
                  vote = 'Ja'; // Support fascist-leaning governments
                } else {
                  // Sometimes vote Nein to advance tracker or look liberal
                  vote = Math.random() > 0.4 ? 'Ja' : 'Nein';
                }
              }
            }
            ai.vote = vote;
          });
          
          // Trigger vote completion check
          const jaVotes = s.players.filter((p) => p.vote === "Ja").length;
          const neinVotes = s.players.filter((p) => p.vote === "Nein").length;
          if (s.players.filter((p) => p.isAlive && !p.vote).length === 0) {
            handleVoteResult(s, roomId, jaVotes, neinVotes);
          } else {
            broadcastState(roomId);
          }
        }
      } else if (s.phase === "Legislative_President") {
        const president = s.players.find(p => p.isPresident);
        if (president?.isAI) {
          // AI President discards
          s.presidentSaw = [...s.drawnPolicies];
          let idx = -1;
          
          if (president.personality === 'Aggressive' && president.role !== 'Liberal') {
            idx = s.drawnPolicies.findIndex(p => p === 'Liberal');
          } else if (president.personality === 'Strategic' && president.role !== 'Liberal') {
            if (s.fascistPolicies < 2) {
              idx = s.drawnPolicies.findIndex(p => p === 'Fascist');
            } else {
              idx = s.drawnPolicies.findIndex(p => p === 'Liberal');
            }
          } else if (president.personality === 'Honest' || president.role === 'Liberal') {
            idx = s.drawnPolicies.findIndex(p => p === 'Fascist');
          }
          
          if (idx === -1) idx = 0;
          
          const discarded = s.drawnPolicies.splice(idx, 1)[0];
          s.discard.push(discarded);
          s.chancellorPolicies = [...s.drawnPolicies];
          s.chancellorSaw = [...s.chancellorPolicies];
          s.drawnPolicies = [];
          s.phase = "Legislative_Chancellor";
          broadcastState(roomId);
          processAITurns(roomId);
        }
      } else if (s.phase === "Legislative_Chancellor") {
        const chancellor = s.players.find(p => p.isChancellor);
        if (chancellor?.isAI && s.chancellorPolicies.length > 0) {
          // AI Chancellor plays
          let idx = -1;
          if (chancellor.personality === 'Aggressive' && chancellor.role !== 'Liberal') {
            idx = s.chancellorPolicies.findIndex(p => p === 'Liberal');
          } else if (chancellor.personality === 'Strategic' && chancellor.role !== 'Liberal') {
            if (s.fascistPolicies < 3) {
              idx = s.chancellorPolicies.findIndex(p => p === 'Liberal');
            } else {
              idx = s.chancellorPolicies.findIndex(p => p === 'Fascist');
            }
          } else if (chancellor.personality === 'Honest' || chancellor.role === 'Liberal') {
            idx = s.chancellorPolicies.findIndex(p => p === 'Liberal');
          }
          
          if (idx === -1) idx = 0;

          const played = s.chancellorPolicies.splice(idx, 1)[0];
          const discarded = s.chancellorPolicies[0];
          s.discard.push(discarded);
          s.chancellorPolicies = [];
          triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
        }
      }
      else if (s.phase === "Executive_Action") {
        const president = s.players.find(p => p.isPresident);
        if (president?.isAI) {
          const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
          if (eligible.length > 0) {
            const target = eligible[Math.floor(Math.random() * eligible.length)];
            await handleExecutiveAction(s, roomId, target.id);
          }
        }
      }

      // AI President response to Veto
      if (s.vetoRequested) {
        const president = s.players.find(p => p.isPresident);
        if (president?.isAI) {
          // AI President decides whether to agree to Veto
          // Liberals usually agree if they are with a Liberal Chancellor and have bad cards
          // Fascists might agree to stall or if they want to hide cards
          const agree = Math.random() > 0.3; // 70% chance to agree for now
          
          // Trigger the same logic as the socket event
          handleVetoResponse(s, roomId, president, agree);
        }
      }
    }, 2000); // 2 second delay for AI thinking
  }

  function checkRoundEnd(state: GameState, roomId: string) {
    if (state.phase === "GameOver") return;
    
    const presidentDeclared = state.declarations.some(d => d.type === 'President');
    const chancellorDeclared = state.declarations.some(d => d.type === 'Chancellor');
    
    if (presidentDeclared && chancellorDeclared) {
      const action = getExecutiveAction(state);
      if (action !== "None") {
        state.phase = "Executive_Action";
        startActionTimer(roomId);
        state.currentExecutiveAction = action;
        state.log.push(`Executive Action: ${action}`);
        
        if (action === "PolicyPeek") {
          const top3 = state.deck.slice(0, 3);
          io.to(state.presidentId!).emit("policyPeekResult", top3);
          state.log.push(`${state.players.find(p => p.id === state.presidentId)?.name} peeked at the top 3 policies.`);
        }
        
        processAITurns(roomId);
      } else {
        nextPresident(state, roomId, true);
      }
      broadcastState(roomId);
    }
  }

  function triggerAIDeclarations(state: GameState, roomId: string) {
    if (state.isPaused) return;
    const president = state.players.find(p => p.isPresident);
    const chancellor = state.players.find(p => p.isChancellor);
    
    if (!president || !chancellor) return;

    const declareForAI = (player: Player, type: 'President' | 'Chancellor') => {
      // Prevent duplicate declarations
      const alreadyDeclared = state.declarations.some(d => d.playerId === player.id && d.type === type);
      if (alreadyDeclared) return;

      let libs = 0;
      let fas = 0;
      const saw = type === 'President' ? (state.presidentSaw || []) : (state.chancellorSaw || []);
      libs = saw.filter(p => p === 'Liberal').length;
      fas = saw.filter(p => p === 'Fascist').length;

      let shouldLie = false;
      if (player.role !== 'Liberal') {
        if (player.personality === 'Deceptive') shouldLie = true;
        else if (player.personality === 'Aggressive') shouldLie = Math.random() > 0.2;
        else if (player.personality === 'Strategic') shouldLie = state.fascistPolicies >= 2;
        else if (player.personality === 'Chaotic') shouldLie = Math.random() > 0.5;
      }

      if (shouldLie) {
        if (type === 'President') {
          // Lie about what was drawn
          if (libs > 0) {
            libs--;
            fas++;
          }
        } else {
          // Chancellor lies about what they received
          if (libs > 0) {
            libs--;
            fas++;
          }
        }
      }

      state.declarations.push({
        playerId: player.id,
        playerName: player.name,
        libs,
        fas,
        type,
        timestamp: Date.now()
      });
      
      const logMsg = `${player.name} (${type}) declared seeing ${libs} Liberal and ${fas} Fascist policies.`;
      state.log.push(logMsg);
      state.messages.push({
        sender: player.name,
        text: `I saw ${libs} Liberal and ${fas} Fascist policies.`,
        timestamp: Date.now(),
        type: 'declaration',
        declaration: { libs, fas, type }
      });
      broadcastState(roomId);
      checkRoundEnd(state, roomId);
    };

    // President declares first
    const presidentDelay = 1500;
    setTimeout(() => {
      if (state.isPaused) return;
      const presidentDeclared = state.declarations.some(d => d.type === 'President');
      if (!presidentDeclared && (president.isAI || state.presidentTimedOut)) {
        declareForAI(president, 'President');
      }
      
      // Chancellor declares second
      const checkAndDeclareChancellor = () => {
        if (state.isPaused) return;
        const chancellorDeclared = state.declarations.some(d => d.type === 'Chancellor');
        if (chancellorDeclared) return;

        if (chancellor.isAI || state.chancellorTimedOut) {
          const presidentDeclared = state.declarations.some(d => d.type === 'President');
          if (!presidentDeclared) {
             setTimeout(checkAndDeclareChancellor, 2000);
             return;
          }
          declareForAI(chancellor, 'Chancellor');
        }
      };

      setTimeout(checkAndDeclareChancellor, 2000);
    }, presidentDelay);
  }

  function triggerPolicyEnactment(state: GameState, roomId: string, played: Policy, isChaos: boolean = false, playerId?: string) {
    state.lastEnactedPolicy = { type: played, timestamp: Date.now(), playerId };
    
    // Wait for animation (6 seconds to ensure it finishes before Game Over or next round)
    setTimeout(async () => {
      if (state.isPaused) return;
      if (played === "Liberal") {
        state.liberalPolicies++;
        state.log.push("A Liberal policy was enacted.");
      } else {
        state.fascistPolicies++;
        state.log.push("A Fascist policy was enacted.");
        if (state.fascistPolicies >= 5) {
          state.vetoUnlocked = true;
        }
      }

      await checkVictory(state, roomId);
      if (state.phase !== "GameOver") {
        if (isChaos) {
          nextPresident(state, roomId);
        } else {
          triggerAIDeclarations(state, roomId);
        }
      }
      broadcastState(roomId);
    }, 6000);
  }

  function handleVoteResult(state: GameState, roomId: string, jaVotes: number, neinVotes: number) {
    if (state.phase !== "Voting") return;
    state.phase = "Voting_Reveal";

    // Store previous votes before clearing
    state.previousVotes = {};
    state.players.forEach(p => {
      if (p.vote) {
        state.previousVotes![p.id] = p.vote;
      }
      p.vote = undefined;
    });

    const voteInfo = `(${jaVotes} Ja, ${neinVotes} Nein)`;
    
    // Set a 4-second countdown for the vote reveal
    state.actionTimerEnd = Date.now() + 4000;
    broadcastState(roomId);

    // Delay 6 seconds to let players see the votes
    setTimeout(async () => {
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Voting_Reveal") return;

      // Clear the reveal countdown
      state.actionTimerEnd = undefined;

      if (jaVotes > neinVotes) {
        state.log.push(`The election passed! ${voteInfo}`);
        const chancellor = state.players.find(p => p.isChancellorCandidate)!;
        const president = state.players.find(p => p.isPresidentialCandidate)!;

        if (state.fascistPolicies >= 3 && chancellor.role === "Hitler") {
          state.phase = "GameOver";
          startActionTimer(roomId);
          state.winner = "Fascists";
          state.winReason = "Hitler was elected Chancellor!";
          state.log.push("Hitler was elected Chancellor! Fascists win!");
          await updateUserStats(state, "Fascists");
        } else {
          state.phase = "Legislative_President";
          startActionTimer(roomId);
          state.electionTracker = 0;
          state.players.forEach(p => {
            p.isPresident = false;
            p.isChancellor = false;
          });
          president.isPresident = true;
          chancellor.isChancellor = true;
          state.presidentId = president.id;
          state.chancellorId = chancellor.id;

          if (state.deck.length < 3) {
            state.deck = shuffle([...state.deck, ...state.discard]);
            state.discard = [];
          }
          state.drawnPolicies = state.deck.splice(0, 3);
        }
      } else {
        state.log.push(`The election failed! ${voteInfo}`);
        state.messages.push({
          sender: "System",
          text: "The government failed to form.",
          timestamp: Date.now(),
          type: 'failed_election'
        });
        state.electionTracker++;
        if (state.electionTracker === 3) {
          state.log.push("Election tracker reached 3! Chaos policy enacted.");
          if (state.deck.length < 1) {
            state.deck = shuffle([...state.deck, ...state.discard]);
            state.discard = [];
          }
          const chaosPolicy = state.deck.shift()!;
          state.electionTracker = 0;
          state.players.forEach(p => {
            p.wasPresident = false;
            p.wasChancellor = false;
          });
          triggerPolicyEnactment(state, roomId, chaosPolicy, true);
        } else {
          if ((state.phase as string) !== "GameOver") nextPresident(state, roomId);
        }
      }
      
      // Clear previous votes after reveal delay
      state.previousVotes = undefined;
      broadcastState(roomId);
      processAITurns(roomId);
    }, 6000);
  }

  async function handleExecutiveAction(state: GameState, roomId: string, targetId: string) {
    const target = state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return;

    if (state.currentExecutiveAction === "Execution") {
      target.isAlive = false;
      state.log.push(`${target.name} was executed!`);
      
      // Update kill/death stats
      const president = state.players.find(p => p.id === state.presidentId);
      if (president && president.userId) {
        const u = await getUserById(president.userId);
        if (u) {
          u.stats.kills++;
          await saveUser(u);
        }
      }
      if (target.userId) {
        const u = await getUserById(target.userId);
        if (u) {
          u.stats.deaths++;
          await saveUser(u);
        }
      }

      if (target.role === "Hitler") {
        state.phase = "GameOver";
        state.winner = "Liberals";
        state.winReason = "Hitler was executed!";
        state.log.push("Hitler was executed! Liberals win!");
        await updateUserStats(state, "Liberals");
      } else {
        nextPresident(state, roomId, true);
      }
    } else if (state.currentExecutiveAction === "Investigate") {
      state.log.push(`President investigated ${target.name}.`);
      // Send private info to the president
      if (state.presidentId) {
        io.to(state.presidentId).emit("investigationResult", { targetName: target.name, role: target.role === 'Liberal' ? 'Liberal' : 'Fascist' });
      }
      nextPresident(state, roomId, true);
    } else if (state.currentExecutiveAction === "SpecialElection") {
      state.log.push(`Special Election! ${target.name} is the next candidate.`);
      state.lastPresidentIdx = state.presidentIdx;
      state.presidentIdx = state.players.indexOf(target);
      startElection(state, roomId);
    } else if (state.currentExecutiveAction === "PolicyPeek") {
      state.log.push(`President peeked at the top 3 policies.`);
      if (state.presidentId) {
        const top3 = state.deck.slice(0, 3);
        io.to(state.presidentId).emit("policyPeekResult", top3);
      }
      nextPresident(state, roomId, true);
    }
    broadcastState(roomId);
    processAITurns(roomId);
  }

  io.on("connection", (socket) => {
    socket.on("joinRoom", async ({ roomId, name, userId, activeFrame, activePolicyStyle, activeVotingStyle, maxPlayers, actionTimer, mode, isSpectator }) => {
      let state = rooms.get(roomId);
      if (!state) {
        state = {
          roomId,
          players: [],
          spectators: [],
          mode: mode || "Ranked",
          phase: "Lobby",
          liberalPolicies: 0,
          fascistPolicies: 0,
          electionTracker: 0,
          deck: createDeck(),
          discard: [],
          drawnPolicies: [],
          chancellorPolicies: [],
          currentExecutiveAction: "None",
          log: [`Room ${roomId} created in ${mode || "Ranked"} mode.`],
          presidentIdx: 0,
          lastPresidentIdx: -1,
          maxPlayers: maxPlayers || 5,
          actionTimer: actionTimer || 0,
          messages: [],
          round: 1,
          vetoUnlocked: false,
          vetoRequested: false,
          declarations: [],
        };
        rooms.set(roomId, state);
      }

      if (isSpectator) {
        // Find user to get avatar
        let avatarUrl = undefined;
        if (userId) {
          const user = await getUserById(userId);
          if (user) {
            avatarUrl = user.avatarUrl;
          }
        }
        state.spectators.push({ id: socket.id, name, avatarUrl });
        socket.join(roomId);
        broadcastState(roomId);
        return;
      }

      if (state.phase !== "Lobby") {
        // Handle reconnection
        const disconnectedPlayer = state.players.find(p => p.userId === userId && p.isDisconnected);
        if (disconnectedPlayer) {
          const oldId = disconnectedPlayer.id;
          disconnectedPlayer.id = socket.id;
          disconnectedPlayer.isDisconnected = false;
          if (state.presidentId === oldId) state.presidentId = socket.id;
          if (state.chancellorId === oldId) state.chancellorId = socket.id;
          state.isPaused = false;
          state.disconnectedPlayerId = undefined;
          state.pauseReason = undefined;
          state.pauseTimer = undefined;
          state.log.push(`${disconnectedPlayer.name} reconnected.`);
          socket.join(roomId);
          
          // If there was an action timer, we might need to restart it
          // For now, we'll just let the game continue
          
          broadcastState(roomId);
          return;
        }
        
        socket.emit("error", "Game already in progress.");
        return;
      }

      if (state.players.length >= state.maxPlayers) {
        socket.emit("error", "Room full.");
        return;
      }

      // Find user to get avatar
      let avatarUrl = undefined;
      if (userId) {
        const user = await getUserById(userId);
        if (user) {
          avatarUrl = user.avatarUrl;
        }
      }

      const player: Player = {
        id: socket.id,
        name,
        userId,
        avatarUrl,
        activeFrame,
        activePolicyStyle,
        activeVotingStyle,
        isAlive: true,
        isPresidentialCandidate: false,
        isChancellorCandidate: false,
        isPresident: false,
        isChancellor: false,
        wasPresident: false,
        wasChancellor: false,
        isReady: false,
      };

      state.players.push(player);
      socket.join(roomId);
      state.log.push(`${name} joined the lobby.`);
      
      // Notify others to initiate WebRTC connection
      socket.to(roomId).emit("peerJoined", socket.id);
      
      broadcastState(roomId);
    });

    socket.on("toggleReady", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Lobby") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player) return;

      player.isReady = !player.isReady;
      state.log.push(`${player.name} is ${player.isReady ? 'Ready' : 'Not Ready'}.`);

      // Check if all human players are ready
      const humanPlayers = state.players.filter(p => !p.isAI);
      const allReady = humanPlayers.every(p => p.isReady);

      if (allReady && humanPlayers.length >= 1) {
        state.log.push("All human players ready! Starting game...");
        fillWithAI(roomId);
      }

      broadcastState(roomId);
    });

    socket.on("signal", (data) => {
      const { to, signal, from } = data;
      io.to(to).emit("signal", { from, signal });
    });

    function fillWithAI(roomId: string) {
      const state = rooms.get(roomId);
      if (!state) return;

      const currentNames = state.players.map(p => p.name);
      const availableBots = AI_BOTS.filter(bot => !currentNames.includes(`${bot.name} (AI)`));

      while (state.players.length < state.maxPlayers && availableBots.length > 0) {
        const botIdx = Math.floor(Math.random() * availableBots.length);
        const bot = availableBots.splice(botIdx, 1)[0];
        
        state.players.push({
          id: `ai-${Math.random().toString(36).substr(2, 9)}`,
          name: `${bot.name} (AI)`,
          avatarUrl: bot.avatarUrl,
          personality: bot.personality,
          isAlive: true,
          isPresidentialCandidate: false,
          isChancellorCandidate: false,
          isPresident: false,
          isChancellor: false,
          wasPresident: false,
          wasChancellor: false,
          isAI: true
        });
      }
      
      // Auto-start game after filling
      startGame(roomId);
    }

    function startGame(roomId: string) {
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Lobby") return;

      // Fill with AI if below maxPlayers
      if (state.players.length < state.maxPlayers) {
        fillWithAI(roomId);
        return;
      }

      // Assign Roles
      const numPlayers = state.players.length;
      let roles: Role[] = [];
      if (numPlayers === 5) roles = ["Liberal", "Liberal", "Liberal", "Fascist", "Hitler"];
      else if (numPlayers === 6) roles = ["Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Hitler"];
      else if (numPlayers === 7) roles = ["Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Hitler"];
      else if (numPlayers === 8) roles = ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Hitler"];
      else if (numPlayers === 9) roles = ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Fascist", "Hitler"];
      else if (numPlayers === 10) roles = ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Fascist", "Fascist", "Fascist", "Hitler"];

      shuffle(roles);
      state.players.forEach((p, i) => (p.role = roles[i]));

      state.phase = "Election";
      state.declarations = [];
      state.log.push(`--- Round ${state.round} Started ---`);
      state.messages.push({
        sender: "System",
        text: `Round ${state.round} Started`,
        timestamp: Date.now(),
        type: 'round_separator',
        round: state.round
      });
      state.presidentIdx = Math.floor(Math.random() * numPlayers);
      state.players[state.presidentIdx].isPresidentialCandidate = true;
      state.log.push("Game started! Roles assigned.");
      state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
      broadcastState(roomId);
      processAITurns(roomId);
    }

    socket.on("startGame", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      startGame(roomId);
    });

    socket.on("nominateChancellor", (chancellorId) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Election") return;

      const president = state.players[state.presidentIdx];
      if (president.id !== socket.id) return;

      const chancellor = state.players.find((p) => p.id === chancellorId);
      if (!chancellor || !chancellor.isAlive || chancellor.id === president.id) return;

      // Term limits
      const aliveCount = state.players.filter(p => p.isAlive).length;
      if (chancellor.wasChancellor || (aliveCount > 5 && chancellor.wasPresident)) {
         socket.emit("error", "Player is ineligible due to term limits.");
         return;
      }

      chancellor.isChancellorCandidate = true;
      state.phase = "Voting";
      startActionTimer(roomId);
      state.log.push(`${president.name} nominated ${chancellor.name} for Chancellor.`);
      broadcastState(roomId);
    });

    socket.on("vote", (vote) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Voting") return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || !player.isAlive) return;

      player.vote = vote;

      if (state.players.filter((p) => p.isAlive && !p.vote).length === 0) {
        // All alive players voted
        const jaVotes = state.players.filter((p) => p.vote === "Ja").length;
        const neinVotes = state.players.filter((p) => p.vote === "Nein").length;
        handleVoteResult(state, roomId, jaVotes, neinVotes);
      } else {
        broadcastState(roomId);
        processAITurns(roomId);
      }
    });

    socket.on("presidentDiscard", (idx) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Legislative_President") return;

      if (state.presidentId !== socket.id) return;
      
      state.presidentSaw = [...state.drawnPolicies];
      const discarded = state.drawnPolicies.splice(idx, 1)[0];
      state.discard.push(discarded);
      state.chancellorPolicies = [...state.drawnPolicies];
      state.chancellorSaw = [...state.chancellorPolicies];
      state.drawnPolicies = [];
      state.phase = "Legislative_Chancellor";
      startActionTimer(roomId);
      broadcastState(roomId);
      processAITurns(roomId);
    });

    socket.on("chancellorPlay", (idx) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Legislative_Chancellor") return;

      if (state.chancellorId !== socket.id) return;

      const played = state.chancellorPolicies.splice(idx, 1)[0];
      const discarded = state.chancellorPolicies[0];
      state.discard.push(discarded);
      state.chancellorPolicies = [];
      triggerPolicyEnactment(state, roomId, played, false, state.chancellorId);
      startActionTimer(roomId);
      broadcastState(roomId);
    });

    socket.on("performExecutiveAction", async (targetId) => {
       const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
       if (!roomId) return;
       const state = rooms.get(roomId);
       if (!state || state.phase !== "Executive_Action") return;
       if (state.presidentId !== socket.id) return;

       await handleExecutiveAction(state, roomId, targetId);
    });

    socket.on("playAgain", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "GameOver") return;

      // Reset state but keep players
      state.phase = "Lobby";
      state.liberalPolicies = 0;
      state.fascistPolicies = 0;
      state.electionTracker = 0;
      state.deck = createDeck();
      state.discard = [];
      state.drawnPolicies = [];
      state.chancellorPolicies = [];
      state.currentExecutiveAction = "None";
      state.log = [`Game reset in room ${roomId}.`];
      state.presidentIdx = 0;
      state.lastPresidentIdx = -1;
      state.round = 1;
      state.winner = undefined;
      state.declarations = [];
      state.lastEnactedPolicy = undefined;
      state.isTimerActive = false;
      state.lobbyTimer = 30;

      // Reset and clear bots
      state.players = state.players.filter(p => !p.isAI);
      state.players.forEach(p => {
        p.role = undefined;
        p.isAlive = true;
        p.isPresident = false;
        p.isChancellor = false;
        p.isPresidentialCandidate = false;
        p.isChancellorCandidate = false;
        p.wasPresident = false;
        p.wasChancellor = false;
        p.vote = undefined;
        p.isReady = false;
      });

      broadcastState(roomId);
    });

    socket.on("sendMessage", (text) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player) return;

      state.messages.push({
        sender: player.name,
        text,
        timestamp: Date.now(),
      });
      // Keep only last 50 messages
      if (state.messages.length > 50) state.messages.shift();
      broadcastState(roomId);
    });

    socket.on("declarePolicies", (data) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player) return;

      if (data) {
        // Prevent duplicate declarations
        const alreadyDeclared = state.declarations.some(d => d.playerId === player.id && d.type === data.type);
        if (alreadyDeclared) return;

        state.declarations.push({
          playerId: player.id,
          playerName: player.name,
          libs: data.libs,
          fas: data.fas,
          type: data.type,
          timestamp: Date.now()
        });
        const logMsg = `${player.name} (${data.type}) declared seeing ${data.libs} Liberal and ${data.fas} Fascist policies.`;
        state.log.push(logMsg);
        state.messages.push({
          sender: player.name,
          text: `I saw ${data.libs} Liberal and ${data.fas} Fascist policies.`,
          timestamp: Date.now(),
          type: 'declaration',
          declaration: { libs: data.libs, fas: data.fas, type: data.type }
        });
      }
      broadcastState(roomId);
      checkRoundEnd(state, roomId);
    });

    socket.on("vetoRequest", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.phase !== "Legislative_Chancellor") return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || !player.isChancellor) return;

      if (state.vetoUnlocked) {
        state.vetoRequested = true;
        state.log.push(`${player.name} (Chancellor) requested a Veto.`);
        broadcastState(roomId);
      }
    });

    socket.on("vetoResponse", (agree) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || !state.vetoRequested) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || !player.isPresident) return;

      handleVetoResponse(state, roomId, player, agree);
    });

    socket.on("leaveRoom", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      handleLeave(socket, roomId);
    });

    socket.on("disconnect", () => {
      // Find all rooms the socket was in
      rooms.forEach((state, roomId) => {
        if (state.players.find(p => p.id === socket.id)) {
          handleLeave(socket, roomId);
        }
      });
    });
  });

  async function handleVetoResponse(state: GameState, roomId: string, player: Player, agree: boolean) {
    if (agree) {
      state.log.push(`${player.name} (President) agreed to the Veto. Both policies discarded.`);
      state.discard.push(...state.chancellorPolicies);
      state.chancellorPolicies = [];
      state.vetoRequested = false;
      
      // Advance election tracker and check for chaos
      state.messages.push({
        sender: "System",
        text: "The government failed to form (Veto agreed).",
        timestamp: Date.now(),
        type: 'failed_election'
      });
      state.electionTracker++;
      if (state.electionTracker === 3) {
        state.log.push("Election tracker reached 3! Chaos policy enacted.");
        if (state.deck.length < 1) {
          state.deck = shuffle([...state.deck, ...state.discard]);
          state.discard = [];
        }
        const chaosPolicy = state.deck.shift()!;
        state.electionTracker = 0;
        state.players.forEach(p => {
          p.wasPresident = false;
          p.wasChancellor = false;
        });
        triggerPolicyEnactment(state, roomId, chaosPolicy, true);
      } else {
        if ((state.phase as string) !== "GameOver") {
          nextPresident(state, roomId, false); // Term limits only apply after a successfully enacted policy
        }
      }
      triggerAIDeclarations(state, roomId);
      broadcastState(roomId);
    } else {
      state.log.push(`${player.name} (President) denied the Veto. Chancellor must play a policy.`);
      state.vetoRequested = false;
    }
    broadcastState(roomId);
  }

  function handlePauseTimeout(roomId: string) {
    const state = rooms.get(roomId);
    if (!state || !state.isPaused) return;

    const player = state.players.find(p => p.id === state.disconnectedPlayerId);
    if (!player) {
      state.isPaused = false;
      broadcastState(roomId);
      return;
    }

    if (state.mode === "Ranked") {
      state.phase = "GameOver";
      state.winner = undefined; // Inconclusive
      state.log.push(`Game ended as inconclusive because ${player.name} failed to reconnect.`);
      state.messages.push({
        sender: "System",
        text: `Game ended as inconclusive because ${player.name} failed to reconnect.`,
        timestamp: Date.now(),
        type: 'text'
      });
    } else {
      // Casual mode: Replace with a fresh AI personality
      const availableBots = AI_BOTS.filter(bot => !state.players.some(p => p.name === bot.name));
      const bot = availableBots.length > 0 
        ? availableBots[Math.floor(Math.random() * availableBots.length)] 
        : AI_BOTS[Math.floor(Math.random() * AI_BOTS.length)];

      player.isAI = true;
      player.isDisconnected = false;
      player.id = `ai-${Math.random().toString(36).substr(2, 9)}`; // Change ID so original player can't rejoin this slot
      player.userId = undefined; // Clear association
      player.name = bot.name;
      player.avatarUrl = bot.avatarUrl;
      player.personality = bot.personality;
      
      state.log.push(`${player.name} (AI) has taken over the seat.`);
      state.isPaused = false;
      processAITurns(roomId);
    }
    
    state.disconnectedPlayerId = undefined;
    state.pauseReason = undefined;
    state.pauseTimer = undefined;
    broadcastState(roomId);
  }

  function handleLeave(socket: any, roomId: string) {
    const state = rooms.get(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (player) {
      if (state.phase === "Lobby") {
        state.players = state.players.filter(p => p.id !== socket.id);
        state.log.push(`${player.name} left the room.`);
      } else if (!player.isAI && !player.isDisconnected) {
        player.isDisconnected = true;
        state.isPaused = true;
        state.pauseReason = `${player.name} disconnected. Waiting 60s for reconnection...`;
        state.pauseTimer = 60;
        state.disconnectedPlayerId = player.id;
        state.log.push(`${player.name} disconnected. Game paused.`);
        
        // Clear any active action timers
        if (actionTimers.has(roomId)) {
          clearTimeout(actionTimers.get(roomId));
          actionTimers.delete(roomId);
        }
        state.actionTimerEnd = undefined;

        if (pauseTimers.has(roomId)) {
          clearInterval(pauseTimers.get(roomId));
        }

        const pauseInterval = setInterval(() => {
          const s = rooms.get(roomId);
          if (!s || !s.isPaused) {
            clearInterval(pauseInterval);
            pauseTimers.delete(roomId);
            return;
          }

          s.pauseTimer!--;
          if (s.pauseTimer! <= 0) {
            clearInterval(pauseInterval);
            pauseTimers.delete(roomId);
            handlePauseTimeout(roomId);
          }
          broadcastState(roomId);
        }, 1000);
        pauseTimers.set(roomId, pauseInterval);
      }
    }

    const spectator = state.spectators.find(s => s.id === socket.id);
    if (spectator) {
      state.spectators = state.spectators.filter(s => s.id !== socket.id);
      state.log.push(`${spectator.name} (Spectator) left the room.`);
    }

    socket.leave(roomId);

    const humanPlayers = state.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0 && state.spectators.length === 0) {
      rooms.delete(roomId);
      if (lobbyTimers.has(roomId)) {
        clearInterval(lobbyTimers.get(roomId)!);
        lobbyTimers.delete(roomId);
      }
    } else {
      broadcastState(roomId);
    }
  }

  function nextPresident(state: GameState, roomId: string, isSuccessfulGovernment: boolean = false) {
    state.vetoRequested = false;
    if (isSuccessfulGovernment) {
      // Set term limits only on successful governments
      const prevPres = state.players.find(p => p.isPresident);
      const prevChan = state.players.find(p => p.isChancellor);
      
      // Clear old term limits
      state.players.forEach(p => {
        p.wasPresident = false;
        p.wasChancellor = false;
      });

      if (prevPres) prevPres.wasPresident = true;
      if (prevChan) prevChan.wasChancellor = true;
    }

    // Clear current roles for the next election phase
    state.players.forEach(p => {
      p.isPresident = false;
      p.isChancellor = false;
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate = false;
    });

    if (state.lastPresidentIdx !== -1) {
      state.presidentIdx = state.lastPresidentIdx;
      state.lastPresidentIdx = -1;
    }

    state.round++;
    state.log.push(`--- Round ${state.round} Started ---`);
    state.messages.push({
      sender: "System",
      text: `Round ${state.round} Started`,
      timestamp: Date.now(),
      type: 'round_separator',
      round: state.round
    });
    do {
      state.presidentIdx = (state.presidentIdx + 1) % state.players.length;
    } while (!state.players[state.presidentIdx].isAlive);

    startElection(state, roomId);
  }

  function startElection(state: GameState, roomId: string) {
    state.phase = "Election";
    startActionTimer(roomId);
    state.previousVotes = undefined; // Clear previous votes for the new round
    state.declarations = []; // Reset declarations for the new round so players can declare again
    state.presidentTimedOut = false;
    state.chancellorTimedOut = false;
    state.players.forEach(p => {
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate = false;
    });
    state.players[state.presidentIdx].isPresidentialCandidate = true;
    state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
    broadcastState(roomId);
    processAITurns(roomId);
  }

  async function checkVictory(state: GameState, roomId: string) {
    if (state.phase === "GameOver") return;
    if (state.liberalPolicies >= 5) {
      state.phase = "GameOver";
      state.winner = "Liberals";
      state.winReason = "5 Liberal policies enacted!";
      state.log.push("5 Liberal policies enacted! Liberals win!");
      await updateUserStats(state, "Liberals");
    } else if (state.fascistPolicies >= 6) {
      state.phase = "GameOver";
      state.winner = "Fascists";
      state.winReason = "6 Fascist policies enacted!";
      state.log.push("6 Fascist policies enacted! Fascists win!");
      await updateUserStats(state, "Fascists");
    }
  }

  async function updateUserStats(state: GameState, winningSide: 'Liberals' | 'Fascists') {
    for (const p of state.players) {
      if (p.isAI || !p.userId) continue;
      
      const user = await getUserById(p.userId);
      if (!user) continue;

      user.stats.gamesPlayed++;
      if (p.role === 'Liberal') user.stats.liberalGames++;
      else if (p.role === 'Fascist') user.stats.fascistGames++;
      else if (p.role === 'Hitler') user.stats.hitlerGames++;

      const isWinner = (winningSide === 'Liberals' && p.role === 'Liberal') || 
                      (winningSide === 'Fascists' && (p.role === 'Fascist' || p.role === 'Hitler'));
      
      if (isWinner) {
        user.stats.wins++;
        if (state.mode === 'Ranked') {
          user.stats.elo += 25;
          user.stats.points += 100;
        } else {
          user.stats.points += 40; // Casual win points
        }
      } else {
        user.stats.losses++;
        if (state.mode === 'Ranked') {
          user.stats.elo = Math.max(0, user.stats.elo - 15);
          user.stats.points += 25;
        } else {
          user.stats.points += 10; // Casual participation points
        }
      }

      await saveUser(user);
      
      // Emit update to player
      const { password: _, ...userWithoutPassword } = user;
      io.to(p.id).emit("userUpdate", userWithoutPassword);
    }
  }

  function getExecutiveAction(state: GameState): ExecutiveAction {
    const n = state.players.length;
    const f = state.fascistPolicies;
    if (n <= 6) {
      if (f === 3) return "PolicyPeek";
      if (f === 4) return "Execution";
      if (f === 5) return "Execution";
    } else if (n <= 8) {
      if (f === 2) return "Investigate";
      if (f === 3) return "SpecialElection";
      if (f === 4) return "Execution";
      if (f === 5) return "Execution";
    } else {
      if (f === 1) return "Investigate";
      if (f === 2) return "Investigate";
      if (f === 3) return "SpecialElection";
      if (f === 4) return "Execution";
      if (f === 5) return "Execution";
    }
    return "None";
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
