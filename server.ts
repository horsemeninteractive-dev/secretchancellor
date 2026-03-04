import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";
import { GameState, Player, Policy, Role, ExecutiveAction, User, UserStats, RoomInfo, AIPersonality } from "./src/types.js";

// Look for process.env.PORT, otherwise default to 8080 for Cloud Run
const PORT = process.env.PORT || 8080;
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
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const rooms: Map<string, GameState> = new Map();
  const lobbyTimers: Map<string, NodeJS.Timeout> = new Map();
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
      activePolicyStyle: data.active_policy_style,
      activeVotingStyle: data.active_voting_style,
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
        active_policy_style: userData.activePolicyStyle,
        active_voting_style: userData.activeVotingStyle,
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

  const getAppUrl = () => {
    return process.env.APP_URL || "http://localhost:3000";
  };

  // Google OAuth
  app.get("/api/auth/google/url", (req, res) => {
    const redirectUri = `${getAppUrl()}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "GOOGLE_CLIENT_ID",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      access_type: "offline",
      prompt: "consent",
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = `${getAppUrl()}/auth/google/callback`;
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
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
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
    const redirectUri = `${getAppUrl()}/auth/discord/callback`;
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || "DISCORD_CLIENT_ID",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify email",
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
  });

  app.get("/auth/discord/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = `${getAppUrl()}/auth/discord/callback`;
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
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
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
      playerAvatars: state.players.map(p => p.avatarUrl || '').filter(Boolean)
    }));
    res.json(roomList);
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
          s.log.push(`[Timer] ${president.name} was too slow. A random policy was discarded.`);
          broadcastState(roomId);
          processAITurns(roomId);
        }
      } else if (s.phase === 'Legislative_Chancellor') {
        const chancellor = s.players.find(p => p.isChancellor);
        if (chancellor && s.chancellorPolicies.length > 0) {
          const played = s.chancellorPolicies.splice(Math.floor(Math.random() * s.chancellorPolicies.length), 1)[0];
          const discarded = s.chancellorPolicies[0];
          s.discard.push(discarded);
          s.chancellorPolicies = [];
          s.log.push(`[Timer] ${chancellor.name} was too slow. A random policy was played.`);
          triggerPolicyEnactment(s, roomId, played);
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
      if (state.actionTimer > 0 && !state.actionTimerEnd && state.phase !== 'Lobby' && state.phase !== 'GameOver') {
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
    if (!state || state.phase === "Lobby" || state.phase === "GameOver") return;

    setTimeout(async () => {
      const s = rooms.get(roomId);
      if (!s) return;

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
            
            // Personality based voting
            if (ai.personality === 'Aggressive') {
              if (ai.role !== 'Liberal' && chancellor && (chancellor.role !== 'Liberal')) {
                vote = 'Ja';
              } else {
                vote = Math.random() > 0.5 ? 'Ja' : 'Nein';
              }
            } else if (ai.personality === 'Honest') {
              vote = Math.random() > 0.3 ? 'Ja' : 'Nein';
            } else if (ai.personality === 'Chaotic') {
              vote = Math.random() > 0.5 ? 'Ja' : 'Nein';
            } else {
              vote = Math.random() > 0.2 ? 'Ja' : 'Nein';
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
          triggerPolicyEnactment(s, roomId, played);
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
    const president = state.players.find(p => p.isPresident);
    const chancellor = state.players.find(p => p.isChancellor);
    
    if (!president || !chancellor) return;

    const declareForAI = (player: Player, type: 'President' | 'Chancellor') => {
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
          } else if (fas > 0) {
            // Already 3 Fascists, can't lie much more unless they claim Liberals? 
            // Usually fascists claim fewer liberals.
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
      const presidentDeclared = state.declarations.some(d => d.type === 'President');
      if (!presidentDeclared && president.isAI) {
        declareForAI(president, 'President');
      }
      
      // Chancellor declares second
      const checkAndDeclareChancellor = () => {
        const chancellorDeclared = state.declarations.some(d => d.type === 'Chancellor');
        if (chancellorDeclared) return;

        if (chancellor.isAI) {
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

  function triggerPolicyEnactment(state: GameState, roomId: string, played: Policy) {
    state.lastEnactedPolicy = { type: played, timestamp: Date.now() };
    
    // Wait for animation (3 seconds)
    setTimeout(async () => {
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

      triggerAIDeclarations(state, roomId);
      await checkVictory(state, roomId);
      broadcastState(roomId);
    }, 3000);
  }

  function handleVoteResult(state: GameState, roomId: string, jaVotes: number, neinVotes: number) {
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

    // Delay 4 seconds to let players see the votes
    setTimeout(async () => {
      const state = rooms.get(roomId);
      if (!state) return;

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
          if (chaosPolicy === "Liberal") state.liberalPolicies++;
          else state.fascistPolicies++;
          state.lastEnactedPolicy = { type: chaosPolicy, timestamp: Date.now() };
          state.electionTracker = 0;
          state.players.forEach(p => {
            p.wasPresident = false;
            p.wasChancellor = false;
          });
          await checkVictory(state, roomId);
        }
        if ((state.phase as string) !== "GameOver") nextPresident(state, roomId);
      }
      
      // Clear previous votes after reveal delay
      state.previousVotes = undefined;
      broadcastState(roomId);
      processAITurns(roomId);
    }, 4000);
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
        let u: any = null;
        if (isSupabaseConfigured) {
          const { data } = await supabase.from('users').select('*').eq('id', president.userId).single();
          u = data;
        } else {
          for (const udata of users.values()) {
            if (udata.id === president.userId) { u = udata; break; }
          }
        }
        if (u) {
          u.stats.kills++;
          await saveUser(u);
        }
      }
      if (target.userId) {
        let u: any = null;
        if (isSupabaseConfigured) {
          const { data } = await supabase.from('users').select('*').eq('id', target.userId).single();
          u = data;
        } else {
          for (const udata of users.values()) {
            if (udata.id === target.userId) { u = udata; break; }
          }
        }
        if (u) {
          u.stats.deaths++;
          await saveUser(u);
        }
      }

      if (target.role === "Hitler") {
        state.phase = "GameOver";
        state.winner = "Liberals";
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
    socket.on("joinRoom", async ({ roomId, name, userId, activeFrame, maxPlayers, actionTimer }) => {
      let state = rooms.get(roomId);
      if (!state) {
        state = {
          roomId,
          players: [],
          phase: "Lobby",
          liberalPolicies: 0,
          fascistPolicies: 0,
          electionTracker: 0,
          deck: createDeck(),
          discard: [],
          drawnPolicies: [],
          chancellorPolicies: [],
          currentExecutiveAction: "None",
          log: [`Room ${roomId} created.`],
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

      if (state.phase !== "Lobby") {
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
        isAlive: true,
        isPresidentialCandidate: false,
        isChancellorCandidate: false,
        isPresident: false,
        isChancellor: false,
        wasPresident: false,
        wasChancellor: false,
      };

      state.players.push(player);
      socket.join(roomId);
      state.log.push(`${name} joined the lobby.`);
      
      // Auto-start timer if it's the first player
      if (state.players.length === 1 && !state.isTimerActive) {
        startTimer(roomId);
      }
      
      broadcastState(roomId);
    });

    socket.on("startLobbyTimer", () => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (!roomId) return;
      startTimer(roomId);
    });

    function startTimer(roomId: string) {
      const state = rooms.get(roomId);
      if (!state || state.isTimerActive || state.phase !== "Lobby") return;

      state.isTimerActive = true;
      state.lobbyTimer = 15; // 15 seconds countdown
      
      const timer = setInterval(() => {
        const s = rooms.get(roomId);
        if (!s || s.phase !== "Lobby") {
          clearInterval(timer);
          lobbyTimers.delete(roomId);
          return;
        }

        if (s.lobbyTimer! > 0) {
          s.lobbyTimer!--;
          broadcastState(roomId);
        } else {
          clearInterval(timer);
          lobbyTimers.delete(roomId);
          s.isTimerActive = false;
          s.log.push("Timer expired. Filling with AI players...");
          fillWithAI(roomId);
          broadcastState(roomId);
        }
      }, 1000);
      
      lobbyTimers.set(roomId, timer);
    }

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
      triggerPolicyEnactment(state, roomId, played);
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

    socket.on("voiceData", (data) => {
      const roomId = Array.from(socket.rooms).find((r) => r !== socket.id);
      if (roomId) {
        socket.to(roomId).emit("voiceData", { sender: socket.id, data });
      }
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
        if (chaosPolicy === "Liberal") state.liberalPolicies++;
        else state.fascistPolicies++;
        state.lastEnactedPolicy = { type: chaosPolicy, timestamp: Date.now() };
        state.electionTracker = 0;
        state.players.forEach(p => {
          p.wasPresident = false;
          p.wasChancellor = false;
        });
        await checkVictory(state, roomId);
      }
      
      if ((state.phase as string) !== "GameOver") {
        nextPresident(state, roomId, false); // Term limits only apply after a successfully enacted policy
      }
      triggerAIDeclarations(state, roomId);
      broadcastState(roomId);
    } else {
      state.log.push(`${player.name} (President) denied the Veto. Chancellor must play a policy.`);
      state.vetoRequested = false;
    }
    broadcastState(roomId);
  }

  function handleLeave(socket: any, roomId: string) {
    const state = rooms.get(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    state.players = state.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);
    if (player) state.log.push(`${player.name} left the room.`);

    const humanPlayers = state.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) {
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
      state.log.push("5 Liberal policies enacted! Liberals win!");
      await updateUserStats(state, "Liberals");
    } else if (state.fascistPolicies >= 6) {
      state.phase = "GameOver";
      state.winner = "Fascists";
      state.log.push("6 Fascist policies enacted! Fascists win!");
      await updateUserStats(state, "Fascists");
    }
  }

  async function updateUserStats(state: GameState, winningSide: 'Liberals' | 'Fascists') {
    for (const p of state.players) {
      if (p.isAI || !p.userId) continue;
      
      // Find user by ID
      let user: any = null;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', p.userId)
          .single();
        if (!error && data) user = data;
      } else {
        for (const udata of users.values()) {
          if (udata.id === p.userId) {
            user = udata;
            break;
          }
        }
      }
      
      if (!user) continue;

      user.stats.gamesPlayed++;
      if (p.role === 'Liberal') user.stats.liberalGames++;
      else if (p.role === 'Fascist') user.stats.fascistGames++;
      else if (p.role === 'Hitler') user.stats.hitlerGames++;

      const isWinner = (winningSide === 'Liberals' && p.role === 'Liberal') || 
                      (winningSide === 'Fascists' && (p.role === 'Fascist' || p.role === 'Hitler'));
      
      if (isWinner) {
        user.stats.wins++;
        user.stats.elo += 25;
        user.stats.points += 100;
      } else {
        user.stats.losses++;
        user.stats.elo = Math.max(0, user.stats.elo - 15);
        user.stats.points += 25; // Participation points
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
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server successfully running on port ${PORT}`);
  });
}

startServer();
