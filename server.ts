import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { randomUUID } from "crypto";

import { GameState, Player } from "./src/types.ts";
import { createDeck } from "./server/utils.ts";
import { GameEngine } from "./server/gameEngine.ts";
import { registerRoutes } from "./server/apiRoutes.ts";
import { getUserById, sendFriendRequest, acceptFriendRequest, getFriends } from "./server/supabaseService.ts";

const PORT = 3000;

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: "*" }));
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, { 
    cors: { 
      origin: "*",
      methods: ["GET", "POST"]
    } 
  });

  const engine = new GameEngine({ io });
  const userSockets = new Map<string, string>();

  registerRoutes(app, io, engine, userSockets);

  // Add headers for Discord Activity media permissions
  app.use((req, res, next) => {
    // Explicitly allow microphone, camera, and display-capture for Discord Activity
    res.setHeader("Permissions-Policy", "microphone=*, camera=*, display-capture=*, speaker-selection=*, autoplay=*, text-to-speech=*, screen-wake-lock=*");
    
    // Comprehensive CSP for Discord Activity environment
    res.setHeader("Content-Security-Policy", 
      "default-src 'self' https://*.discord.com https://*.discordapp.io; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.discord.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src 'self' data: blob: *; " +
      "media-src 'self' blob: data: *; " +
      "connect-src 'self' *; " +
      "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordapp.io;"
    );

    // Headers for cross-origin isolation (needed for some media features)
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    
    next();
  });

  // Proxy route for external assets to bypass Discord's strict CSP
  app.get("/proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send("URL is required");
    
    console.log(`[Proxy] Requesting: ${url}`);
    
    try {
      // Basic validation to prevent abuse
      const allowedDomains = [
        'storage.googleapis.com',
        'gamesounds.xyz',
        'api.dicebear.com',
        'picsum.photos',
        'raw.githubusercontent.com',
        'transparenttextures.com',
        'images.unsplash.com',
        'i.pravatar.cc',
        'cdn.discordapp.com',
        'discord.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
      ];
      
      const parsedUrl = new URL(url);
      if (!allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain))) {
        return res.status(403).send("Domain not allowed");
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        console.error(`[Proxy] Fetch failed for ${url}: ${response.status} ${response.statusText}`);
        return res.status(response.status).send(response.statusText);
      }

      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      
      // Add CORP header to allow proxied assets in cross-origin isolated environments
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Access-Control-Allow-Origin", "*");
      
      // Set cache headers for better performance
      res.setHeader("Cache-Control", "public, max-age=31536000");
      
      const arrayBuffer = await response.arrayBuffer();
      let body = Buffer.from(arrayBuffer);

      // If it's a CSS file from Google Fonts, rewrite URLs to go through the proxy
      if (contentType && contentType.includes("text/css") && url.includes("fonts.googleapis.com")) {
        let css = body.toString();
        // Replace url(https://fonts.gstatic.com/...) with url(/proxy?url=https%3A%2F%2Ffonts.gstatic.com%2F...)
        css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (match, fontUrl) => {
          return `url(/proxy?url=${encodeURIComponent(fontUrl)})`;
        });
        body = Buffer.from(css);
      }
      
      res.send(body);
    } catch (error: any) {
      console.error(`[Proxy] Error fetching ${url}:`, error.message);
      res.status(500).send("Error fetching resource");
    }
  });

  io.on("connection", (socket) => {
    const getRoom = (): string | undefined =>
      Array.from(socket.rooms).find(r => r !== socket.id);

    socket.on("userConnected", async (userId) => {
      console.log(`User connected: ${userId}, socket: ${socket.id}`);
      socket.data.userId = userId;
      userSockets.set(userId, socket.id);
      const friends = await getFriends(userId);
      console.log(`Notifying ${friends.length} friends for user ${userId}`);
      for (const friend of friends) {
        const friendSocketId = userSockets.get(friend.id);
        if (friendSocketId) {
          console.log(`Notifying friend ${friend.id} at socket ${friendSocketId}`);
          // Find which room the friend is in (if any)
          let friendRoomId: string | undefined;
          for (const [rId, state] of engine.rooms.entries()) {
            if (state.players.some(p => p.userId === friend.id && !p.isDisconnected)) {
              friendRoomId = rId;
              break;
            }
          }
          io.to(friendSocketId).emit("userStatusChanged", { userId, isOnline: true });
          socket.emit("userStatusChanged", { userId: friend.id, isOnline: true, roomId: friendRoomId });
        }
      }
    });

    socket.on("joinRoom", async ({
      roomId, name, userId, activeFrame, activePolicyStyle, activeVotingStyle,
      maxPlayers, actionTimer, mode, isSpectator,
    }) => {
      let state = engine.rooms.get(roomId);

      if (!state) {
        state = {
          roomId,
          players: [],
          spectators: [],
          mode: mode || "Ranked",
          phase: "Lobby",
          civilDirectives: 0,
          stateDirectives: 0,
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
        engine.rooms.set(roomId, state);
      }

      if (isSpectator) {
        let avatarUrl: string | undefined;
        if (userId) {
          const user = await getUserById(userId);
          if (user) avatarUrl = user.avatarUrl;
        }
        state.spectators.push({ id: socket.id, name, avatarUrl });
        socket.join(roomId);
        engine.broadcastState(roomId);
        return;
      }

      if (state.phase !== "Lobby") {
        const disconnected = state.players.find(p => p.userId === userId && p.isDisconnected);
        if (disconnected) {
          const oldId = disconnected.id;
          disconnected.id = socket.id;
          disconnected.isDisconnected = false;
          if (state.presidentId === oldId) state.presidentId = socket.id;
          if (state.chancellorId === oldId) state.chancellorId = socket.id;
          state.isPaused = false;
          state.disconnectedPlayerId = undefined;
          state.pauseReason = undefined;
          state.pauseTimer = undefined;
          state.log.push(`${disconnected.name} reconnected.`);
          socket.join(roomId);
          engine.broadcastState(roomId);
          return;
        }
        socket.emit("error", "Game already in progress.");
        return;
      }

      if (state.players.length >= state.maxPlayers) {
        socket.emit("error", "Room full.");
        return;
      }

      let avatarUrl: string | undefined;
      if (userId) {
        socket.data.userId = userId;
        userSockets.set(userId, socket.id);
        const friends = await getFriends(userId);
        for (const friend of friends) {
          const friendSocketId = userSockets.get(friend.id);
          if (friendSocketId) {
            // Tell friend this user is online and in this room
            io.to(friendSocketId).emit("userStatusChanged", { userId, isOnline: true, roomId });
            // Tell this user which room the friend is in (if any)
            let friendRoomId: string | undefined;
            for (const [rId, state] of engine.rooms.entries()) {
              if (state.players.some(p => p.userId === friend.id && !p.isDisconnected)) {
                friendRoomId = rId;
                break;
              }
            }
            socket.emit("userStatusChanged", { userId: friend.id, isOnline: true, roomId: friendRoomId });
          }
        }
        const user = await getUserById(userId);
        if (user) avatarUrl = user.avatarUrl;
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
      socket.to(roomId).emit("peerJoined", socket.id);
      engine.broadcastState(roomId);
    });

    socket.on("toggleReady", () => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Lobby") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player) return;

      player.isReady = !player.isReady;
      state.log.push(`${player.name} is ${player.isReady ? "Ready" : "Not Ready"}.`);

      const humanPlayers = state.players.filter(p => !p.isAI);
      if (state.mode === 'Ranked' && humanPlayers.length < 5) {
        state.log.push("Need at least 5 players to ready up.");
        engine.broadcastState(roomId);
        return;
      }

      if (humanPlayers.every(p => p.isReady) && humanPlayers.length >= 1) {
        state.log.push("All human players ready! Starting game...");
        if (state.mode === 'Ranked') {
          engine.startGame(roomId);
        } else {
          engine.fillWithAI(roomId);
        }
      }

      engine.broadcastState(roomId);
    });

    socket.on("startLobbyTimer", () => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Lobby") return;
      
      state.lobbyTimer = 30;
      state.isTimerActive = true;
      engine.broadcastState(roomId);
    });

    socket.on("startGame", () => {
      const roomId = getRoom();
      if (!roomId) return;
      engine.startGame(roomId);
    });

    socket.on("signal", ({ to, signal }) => {
      io.to(to).emit("signal", { from: socket.id, signal });
    });

    socket.on("sendFriendRequest", async (targetUserId) => {
      const userId = socket.data.userId;
      if (!userId) return;
      await sendFriendRequest(userId, targetUserId);
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("friendRequestReceived", { fromUserId: userId });
      }
    });

    socket.on("acceptFriendRequest", async (targetUserId) => {
      const userId = socket.data.userId;
      if (!userId) return;
      await acceptFriendRequest(userId, targetUserId);
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("friendRequestAccepted", { fromUserId: userId });
      }
    });

    socket.on("nominateChancellor", (chancellorId) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Election") return;

      const president = state.players[state.presidentIdx];
      if (president.id !== socket.id || !president.isAlive || president.hasActed) return;
      president.hasActed = true;

      const chancellor = state.players.find(p => p.id === chancellorId);
      if (!chancellor || !chancellor.isAlive || chancellor.id === president.id) return;

      if (state.rejectedChancellorId === chancellor.id) {
        socket.emit("error", "This player was rejected by the Broker and cannot be nominated again this round.");
        return;
      }

      if (state.detainedPlayerId === chancellor.id) {
        socket.emit("error", "This player is detained by the Interdictor and cannot be nominated.");
        return;
      }

      const aliveCount = state.players.filter(p => p.isAlive).length;
      if (chancellor.wasChancellor || (aliveCount > 5 && chancellor.wasPresident)) {
        socket.emit("error", "Player is ineligible due to term limits.");
        return;
      }

      chancellor.isChancellorCandidate = true;
      engine.resetPlayerActions(state);
      
      const broker = state.players.find(p => p.titleRole === 'Broker' && !p.titleUsed);

      if (broker) {
        state.titlePrompt = {
          playerId: broker.id,
          role: 'Broker',
          context: {},
          nextPhase: 'Voting'
        };
        state.phase = 'Nomination_Review';
      } else {
        state.phase = "Voting";
      }
      
      engine.startActionTimer(roomId);
      state.log.push(`${president.name} nominated ${chancellor.name} for Chancellor.`);
      engine.broadcastState(roomId);
      engine.processAITurns(roomId);
    });

    socket.on("vote", (vote) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Voting") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isAlive || player.hasActed) return;

      if (state.detainedPlayerId === player.id) {
        socket.emit("error", "You are detained by the Interdictor and cannot vote this round.");
        return;
      }

      player.hasActed = true;
      player.vote = vote;

      if (state.players.filter(p => p.isAlive && p.id !== state.detainedPlayerId && !p.vote).length === 0) {
        const jaVotes = state.players.filter(p => p.vote === "Aye").length;
        const neinVotes = state.players.filter(p => p.vote === "Nay").length;
        engine.handleVoteResult(state, roomId, jaVotes, neinVotes);
      } else {
        engine.broadcastState(roomId);
        engine.processAITurns(roomId);
      }
    });

    socket.on("presidentDiscard", (idx) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Legislative_President") return;
      if (state.presidentId !== socket.id) return;
      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isAlive || player.hasActed) return;
      player.hasActed = true;
      // Guard: timer may have already auto-discarded and cleared the hand
      if (state.drawnPolicies.length === 0) return;

      state.presidentSaw = [...state.drawnPolicies];
      const discarded = state.drawnPolicies.splice(idx, 1)[0];
      if (!discarded) return;
      state.discard.push(discarded);

      if (state.drawnPolicies.length > 2) {
        // Still more to discard (Strategist case)
        player.hasActed = false; // Allow another discard
        engine.broadcastState(roomId);
        return;
      }

      state.chancellorPolicies = [...state.drawnPolicies];
      state.chancellorSaw = [...state.chancellorPolicies];
      state.drawnPolicies = [];
      state.phase = "Legislative_Chancellor";
      engine.startActionTimer(roomId);
      engine.broadcastState(roomId);
      engine.processAITurns(roomId);
    });

    socket.on("chancellorPlay", (idx) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Legislative_Chancellor") return;
      if (state.chancellorId !== socket.id) return;
      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isAlive || player.hasActed) return;
      player.hasActed = true;
      // Guard: timer may have already auto-played and cleared the hand
      if (state.chancellorPolicies.length === 0) return;

      const played = state.chancellorPolicies.splice(idx, 1)[0];
      // Guard: splice on a partially-cleared array can return undefined
      if (!played) return;
      state.discard.push(...state.chancellorPolicies);
      state.chancellorPolicies = [];
      engine.triggerPolicyEnactment(state, roomId, played, false, state.chancellorId);
      // Do NOT restart the timer here — phase stays Legislative_Chancellor during
      // the 6 s animation window; restarting would create a stale misfire.
      engine.broadcastState(roomId);
    });

    socket.on("declarePolicies", (data) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state) return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player) return;

      if (data) {
        const alreadyDeclared = state.declarations.some(
          d => d.playerId === player.id && d.type === data.type
        );
        if (alreadyDeclared) return;

        state.declarations.push({
          playerId: player.id,
          playerName: player.name,
          civ: data.civ,
          sta: data.sta,
          ...(data.type === 'President' ? { drewCiv: data.drewCiv, drewSta: data.drewSta } : {}),
          type: data.type,
          timestamp: Date.now(),
        });
        const passedOrReceived = data.type === 'President' ? 'passed' : 'received';
        const drewStr = data.type === 'President' && data.drewCiv !== undefined
          ? ` (drew ${data.drewCiv}C/${data.drewSta}S)`
          : '';
        state.log.push(
          `${player.name} (${data.type}) declared ${passedOrReceived} ${data.civ} Civil and ${data.sta} State directives.${drewStr}`
        );
      }

      engine.broadcastState(roomId);
      engine.checkRoundEnd(state, roomId);
    });

    socket.on("performExecutiveAction", async (targetId) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Executive_Action") return;
      if (state.presidentId !== socket.id) return;
      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isAlive || player.hasActed) return;
      player.hasActed = true;
      await engine.handleExecutiveAction(state, roomId, targetId);
    });

    socket.on("useTitleAbility", (abilityData) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || !state.titlePrompt || state.titlePrompt.playerId !== socket.id) return;
      engine.handleTitleAbility(state, roomId, abilityData);
    });

    socket.on("vetoRequest", () => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Legislative_Chancellor") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isChancellor || !player.isAlive || player.hasActed) return;
      player.hasActed = true;

      if (state.vetoUnlocked) {
        state.vetoRequested = true;
        state.log.push(`${player.name} (Chancellor) requested a Veto.`);
        engine.broadcastState(roomId);
        engine.processAITurns(roomId);
      }
    });

    socket.on("vetoResponse", (agree) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || !state.vetoRequested) return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isPresident || !player.isAlive || player.hasActed) return;
      player.hasActed = true;

      engine.handleVetoResponse(state, roomId, player, agree);
    });

    socket.on("sendMessage", (text) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state) return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player) return;

      if (text.startsWith('/debug')) {
        if (process.env.NODE_ENV !== 'production') {
          state.log.push(`DEBUG: Phase: ${state.phase}, PresIdx: ${state.presidentIdx}, Pres: ${state.players[state.presidentIdx]?.name}, Chan: ${state.players[state.chancellorId || '']?.name}`);
          engine.broadcastState(roomId);
        }
        return;
      }

      if (text.length > 300) return;
      state.messages.push({ sender: player.name, text, timestamp: Date.now() });
      if (state.messages.length > 50) state.messages.shift();
      engine.broadcastState(roomId);
    });

    socket.on("playAgain", () => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "GameOver") return;

      Object.assign(state, {
        phase: "Lobby",
        civilDirectives: 0,
        stateDirectives: 0,
        electionTracker: 0,
        deck: createDeck(),
        discard: [],
        drawnPolicies: [],
        chancellorPolicies: [],
        currentExecutiveAction: "None",
        log: [`Game reset in room ${roomId}.`],
        presidentIdx: 0,
        lastPresidentIdx: -1,
        round: 1,
        winner: undefined,
        declarations: [],
        lastEnactedPolicy: undefined,
        isTimerActive: false,
        lobbyTimer: 30,
        roundHistory: [],
        pendingChancellorClaim: undefined,
        lastGovernmentVotes: undefined,
        lastGovernmentPresidentId: undefined,
        lastGovernmentChancellorId: undefined,
      });

      state.players = state.players.filter(p => !p.isAI);
      state.players.forEach(p => {
        p.role = undefined;
        p.titleRole = undefined;
        p.titleUsed = false;
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

      engine.broadcastState(roomId);
    });

    socket.on("leaveRoom", () => {
      const roomId = getRoom();
      if (!roomId) return;
      engine.handleLeave(socket, roomId);
    });

    socket.on("disconnect", async () => {
      if (socket.data.userId) {
        const userId = socket.data.userId;
        userSockets.delete(userId);
        const friends = await getFriends(userId);
        for (const friend of friends) {
          const friendSocketId = userSockets.get(friend.id);
          if (friendSocketId) {
            io.to(friendSocketId).emit("userStatusChanged", { userId, isOnline: false });
          }
        }
      }
      engine.rooms.forEach((state, roomId) => {
        if (state.players.find(p => p.id === socket.id)) {
          engine.handleLeave(socket, roomId);
        }
      });
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve("dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
