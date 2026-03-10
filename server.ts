import express from "express";
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
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  const engine = new GameEngine({ io });
  const userSockets = new Map<string, string>();

  registerRoutes(app, io, engine.rooms, userSockets);

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
          io.to(friendSocketId).emit("userStatusChanged", { userId, isOnline: true });
          socket.emit("userStatusChanged", { userId: friend.id, isOnline: true });
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
            io.to(friendSocketId).emit("userStatusChanged", { userId, isOnline: true });
            socket.emit("userStatusChanged", { userId: friend.id, isOnline: true });
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
      if (humanPlayers.every(p => p.isReady) && humanPlayers.length >= 1) {
        state.log.push("All human players ready! Starting game...");
        engine.fillWithAI(roomId);
      }

      engine.broadcastState(roomId);
    });

    socket.on("startGame", () => {
      const roomId = getRoom();
      if (!roomId) return;
      engine.startGame(roomId);
    });

    socket.on("signal", ({ to, signal, from }) => {
      io.to(to).emit("signal", { from, signal });
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
      if (president.id !== socket.id) return;

      const chancellor = state.players.find(p => p.id === chancellorId);
      if (!chancellor || !chancellor.isAlive || chancellor.id === president.id) return;

      const aliveCount = state.players.filter(p => p.isAlive).length;
      if (chancellor.wasChancellor || (aliveCount > 5 && chancellor.wasPresident)) {
        socket.emit("error", "Player is ineligible due to term limits.");
        return;
      }

      chancellor.isChancellorCandidate = true;
      state.phase = "Voting";
      engine.startActionTimer(roomId);
      state.log.push(`${president.name} nominated ${chancellor.name} for Chancellor.`);
      engine.broadcastState(roomId);
    });

    socket.on("vote", (vote) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Voting") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isAlive) return;

      player.vote = vote;

      if (state.players.filter(p => p.isAlive && !p.vote).length === 0) {
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
      // Guard: timer may have already auto-discarded and cleared the hand
      if (state.drawnPolicies.length === 0) return;

      state.presidentSaw = [...state.drawnPolicies];
      const discarded = state.drawnPolicies.splice(idx, 1)[0];
      if (!discarded) return;
      state.discard.push(discarded);
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
      // Guard: timer may have already auto-played and cleared the hand
      if (state.chancellorPolicies.length === 0) return;

      const played = state.chancellorPolicies.splice(idx, 1)[0];
      // Guard: splice on a partially-cleared array can return undefined
      if (!played) return;
      const discarded = state.chancellorPolicies[0];
      state.discard.push(discarded);
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
      await engine.handleExecutiveAction(state, roomId, targetId);
    });

    socket.on("vetoRequest", () => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state || state.phase !== "Legislative_Chancellor") return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player || !player.isChancellor) return;

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
      if (!player || !player.isPresident) return;

      engine.handleVetoResponse(state, roomId, player, agree);
    });

    socket.on("sendMessage", (text) => {
      const roomId = getRoom();
      if (!roomId) return;
      const state = engine.rooms.get(roomId);
      if (!state) return;

      const player = state.players.find(p => p.id === socket.id);
      if (!player) return;

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
