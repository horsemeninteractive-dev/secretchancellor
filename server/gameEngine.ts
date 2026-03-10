import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import {
  GameState, Player, Policy, ExecutiveAction,
} from "../src/types.ts";
import { shuffle, createDeck } from "./utils.ts";
import { AI_BOTS, CHAT } from "./aiConstants.ts";
import { getExecutiveAction, assignRoles } from "./gameRules.ts";
import {
  initializeSuspicion,
  getSuspicion,
  leastSuspicious,
  mostSuspicious,
  updateSuspicionFromPolicy,
  updateSuspicionFromDeclarations,
  updateSuspicionFromInvestigation,
  updateSuspicionFromNomination,
} from "./suspicion.ts";
import { getUserById, saveUser } from "./supabaseService.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Deps = {
  io: Server;
};

// ---------------------------------------------------------------------------
// GameEngine
// ---------------------------------------------------------------------------

export class GameEngine {
  private io: Server;
  readonly rooms: Map<string, GameState> = new Map();

  private lobbyTimers:  Map<string, NodeJS.Timeout> = new Map();
  private pauseTimers:  Map<string, NodeJS.Timeout> = new Map();
  private actionTimers: Map<string, any>             = new Map();

  constructor({ io }: Deps) {
    this.io = io;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Broadcasting
  // ═══════════════════════════════════════════════════════════════════════════

  broadcastState(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Start action timer if phase changed or just started
    if (
      state.actionTimer > 0 &&
      !state.actionTimerEnd &&
      state.phase !== "Lobby" &&
      state.phase !== "GameOver" &&
      !state.isPaused
    ) {
      this.startActionTimer(roomId);
    }

    // Public view — hide roles until game over
    const publicState = {
      ...state,
      players: state.players.map(p => {
        const { role, ...rest } = p;
        return state.phase === "GameOver" ? { ...rest, role } : rest;
      }),
    };
    this.io.to(roomId).emit("gameStateUpdate", publicState);

    // Private role info per human player
    state.players.forEach(p => {
      if (p.isAI) return;
      const stateAgents = state.players
        .filter(pl => pl.role === "State" || pl.role === "Overseer")
        .map(pl => ({ id: pl.id, name: pl.name, role: pl.role! }));

      if (p.role === "State") {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents });
      } else if (p.role === "Overseer" && state.players.length <= 6) {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents });
      } else {
        this.io.to(p.id).emit("privateInfo", { role: p.role! });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Action Timer
  // ═══════════════════════════════════════════════════════════════════════════

  startActionTimer(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (
      !state ||
      state.actionTimer === 0 ||
      state.phase === "Lobby" ||
      state.phase === "GameOver"
    ) {
      if (state) state.actionTimerEnd = undefined;
      if (this.actionTimers.has(roomId)) {
        clearTimeout(this.actionTimers.get(roomId));
        this.actionTimers.delete(roomId);
      }
      return;
    }

    // Clear any existing timer
    if (this.actionTimers.has(roomId)) {
      clearTimeout(this.actionTimers.get(roomId));
    }

    state.actionTimerEnd = Date.now() + state.actionTimer * 1000;

    const timer = setTimeout(() => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase === "Lobby" || s.phase === "GameOver") return;
      s.actionTimerEnd = undefined;
      this.handleActionTimerExpiry(s, roomId);
    }, state.actionTimer * 1000);

    this.actionTimers.set(roomId, timer);
  }

  private handleActionTimerExpiry(s: GameState, roomId: string): void {
    if (s.phase === "Election") {
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
        this.broadcastState(roomId);
        this.processAITurns(roomId);
      }

    } else if (s.phase === "Voting") {
      s.players.forEach(p => {
        if (p.isAlive && !p.vote) {
          p.vote = Math.random() > 0.3 ? "Aye" : "Nay";
        }
      });
      const ayeVotes   = s.players.filter(p => p.vote === "Aye").length;
      const nayVotes = s.players.filter(p => p.vote === "Nay").length;
      s.log.push("[Timer] Voting time expired. Remaining votes were auto-cast.");
      this.handleVoteResult(s, roomId, ayeVotes, nayVotes);

    } else if (s.phase === "Legislative_President") {
      const president = s.players.find(p => p.isPresident);
      if (president) {
        s.presidentSaw = [...s.drawnPolicies];
        const discarded = s.drawnPolicies.splice(
          Math.floor(Math.random() * s.drawnPolicies.length), 1
        )[0];
        s.discard.push(discarded);
        s.chancellorPolicies = [...s.drawnPolicies];
        s.chancellorSaw = [...s.chancellorPolicies];
        s.drawnPolicies = [];
        s.phase = "Legislative_Chancellor";
        s.presidentTimedOut = true;
        s.log.push(`[Timer] ${president.name} was too slow. A random directive was discarded.`);
        this.broadcastState(roomId);
        this.processAITurns(roomId);
        // Note: triggerAIDeclarations is NOT called here. It will be called
        // by triggerPolicyEnactment after the chancellor plays their policy.
      }

    } else if (s.phase === "Legislative_Chancellor") {
      const chancellor = s.players.find(p => p.isChancellor);
      if (chancellor && s.chancellorPolicies.length > 0) {
        const played   = s.chancellorPolicies.splice(
          Math.floor(Math.random() * s.chancellorPolicies.length), 1
        )[0];
        const discarded = s.chancellorPolicies[0];
        s.discard.push(discarded);
        s.chancellorPolicies = [];
        s.chancellorTimedOut = true;
        s.log.push(`[Timer] ${chancellor.name} was too slow. A random directive was enacted.`);
        this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
      }

    } else if (s.phase === "Executive_Action") {
      const president = s.players.find(p => p.isPresident);
      if (president) {
        const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
        if (eligible.length > 0) {
          const target = eligible[Math.floor(Math.random() * eligible.length)];
          s.log.push(`[Timer] ${president.name} was too slow. A random target was selected.`);
          this.handleExecutiveAction(s, roomId, target.id);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Turns
  // ═══════════════════════════════════════════════════════════════════════════

  processAITurns(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.phase === "Lobby" || state.phase === "GameOver" || state.isPaused) return;

    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.isPaused) return;

      if (s.phase === "Election") {
        this.aiNominateChancellor(s, roomId);
      } else if (s.phase === "Voting") {
        this.aiCastVotes(s, roomId);
      } else if (s.phase === "Legislative_President") {
        this.aiPresidentDiscard(s, roomId);
      } else if (s.phase === "Legislative_Chancellor") {
        this.aiChancellorPlay(s, roomId);
      } else if (s.phase === "Executive_Action") {
        await this.aiExecutiveAction(s, roomId);
      }

      // AI President response to Veto
      if (s.vetoRequested) {
        await this.aiVetoResponse(s, roomId);
      }
    }, 2000); // 2-second AI "thinking" delay
  }

  // ─── AI: Election phase ────────────────────────────────────────────────────

  private aiNominateChancellor(s: GameState, roomId: string): void {
    const president = s.players[s.presidentIdx];
    if (!president.isAI) return;

    const eligible = s.players.filter(p =>
      p.isAlive &&
      p.id !== president.id &&
      !p.wasChancellor &&
      !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
    );
    if (eligible.length === 0) return;

    let target: Player;

    if (president.role === "Civil" && president.suspicion) {
      target = leastSuspicious(president, eligible);
    } else {
      const overseerCandidate  = eligible.find(p => p.role === "Overseer");
      const stateTeammate  = eligible.find(p => p.role === "State");
      if (s.stateDirectives >= 3 && overseerCandidate) {
        target = overseerCandidate;
      } else if (stateTeammate && Math.random() > 0.3) {
        target = stateTeammate;
      } else {
        target = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    target.isChancellorCandidate = true;
    s.phase = "Voting";
    s.log.push(`${president.name} nominated ${target.name} for Chancellor.`);
    updateSuspicionFromNomination(s, president.id, target.id);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  // ─── AI: Voting phase ──────────────────────────────────────────────────────

  private aiCastVotes(s: GameState, roomId: string): void {
    const aiVoters = s.players.filter(p => p.isAI && p.isAlive && !p.vote);
    if (aiVoters.length === 0) return;

    const chancellor = s.players.find(p => p.isChancellorCandidate);
    const president  = s.players[s.presidentIdx];

    aiVoters.forEach(ai => {
      ai.vote = this.computeAIVote(ai, s, president, chancellor ?? null);
    });

    const ayeVotes   = s.players.filter(p => p.vote === "Aye").length;
    const nayVotes = s.players.filter(p => p.vote === "Nay").length;

    if (s.players.filter(p => p.isAlive && !p.vote).length === 0) {
      this.handleVoteResult(s, roomId, ayeVotes, nayVotes);
    } else {
      this.broadcastState(roomId);
    }
  }

  private computeAIVote(
    ai: Player,
    s: GameState,
    president: Player,
    chancellor: Player | null
  ): "Aye" | "Nay" {
    if (ai.role === "Civil" && ai.suspicion) {
      const presSusp  = getSuspicion(ai, president.id);
      const chanSusp  = chancellor ? getSuspicion(ai, chancellor.id) : 0;
      const threshold = Math.min(0.65, 0.50 + s.round * 0.015);

      if (presSusp > threshold || chanSusp > threshold) {
        return s.electionTracker >= 2 ? "Aye" : "Nay";
      }
      if (s.stateDirectives >= 3 && chancellor?.role === "Overseer") return "Nay";
      if (s.electionTracker >= 2) return "Aye";
      return Math.random() > 0.15 ? "Aye" : "Nay";
    }

    // State strategic voting
    if (s.stateDirectives >= 3 && chancellor?.role === "Overseer") return "Aye";
    if (chancellor?.role !== "Civil" || president.role !== "Civil") {
      return Math.random() > 0.15 ? "Aye" : "Nay";
    }
    return Math.random() > 0.45 ? "Aye" : "Nay";
  }

  // ─── AI: Legislative — President discard ──────────────────────────────────

  private aiPresidentDiscard(s: GameState, roomId: string): void {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    s.presidentSaw = [...s.drawnPolicies];
    let idx = this.choosePolicyToDiscard(president, s.drawnPolicies, s.stateDirectives);

    const discarded = s.drawnPolicies.splice(idx, 1)[0];
    s.discard.push(discarded);
    s.chancellorPolicies = [...s.drawnPolicies];
    s.chancellorSaw = [...s.chancellorPolicies];
    s.drawnPolicies = [];
    s.phase = "Legislative_Chancellor";
    // CRITICAL: reset the action timer for the chancellor phase. Without this,
    // the president-phase timer keeps running and fires during the chancellor's
    // turn, auto-playing a second policy before the human chancellor can choose.
    this.startActionTimer(roomId);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  private choosePolicyToDiscard(player: Player, hand: Policy[], stateDirectives: number): number {
    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Civil") {
      idx = hand.findIndex(p => p === "Civil");
    } else if (player.personality === "Strategic" && player.role !== "Civil") {
      idx = stateDirectives < 2
        ? hand.findIndex(p => p === "State")
        : hand.findIndex(p => p === "Civil");
    } else if (player.personality === "Honest" || player.role === "Civil") {
      idx = hand.findIndex(p => p === "State");
    }
    return idx === -1 ? 0 : idx;
  }

  // ─── AI: Legislative — Chancellor play ────────────────────────────────────

  private aiChancellorPlay(s: GameState, roomId: string): void {
    const chancellor = s.players.find(p => p.isChancellor);
    if (!chancellor?.isAI || s.chancellorPolicies.length === 0) return;

    let idx = this.choosePolicyToPlay(chancellor, s.chancellorPolicies, s.stateDirectives);

    const played    = s.chancellorPolicies.splice(idx, 1)[0];
    const discarded = s.chancellorPolicies[0];
    s.discard.push(discarded);
    s.chancellorPolicies = [];
    this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
  }

  private choosePolicyToPlay(player: Player, hand: Policy[], stateDirectives: number): number {
    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Civil") {
      idx = hand.findIndex(p => p === "Civil"); // Discard Civil, play State
    } else if (player.personality === "Strategic" && player.role !== "Civil") {
      idx = stateDirectives < 3
        ? hand.findIndex(p => p === "Civil")
        : hand.findIndex(p => p === "State");
    } else if (player.personality === "Honest" || player.role === "Civil") {
      idx = hand.findIndex(p => p === "Civil"); // Play Civil
    }
    return idx === -1 ? 0 : idx;
  }

  // ─── AI: Executive Action ──────────────────────────────────────────────────

  private async aiExecutiveAction(s: GameState, roomId: string): Promise<void> {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
    if (eligible.length === 0) return;

    let target: Player;

    if (president.role === "Civil" && president.suspicion) {
      target = s.currentExecutiveAction === "SpecialElection"
        ? leastSuspicious(president, eligible)
        : mostSuspicious(president, eligible);
    } else {
      const civilPlayers = eligible.filter(p => p.role === "Civil");
      const stateTeam    = eligible.filter(p => p.role === "State" || p.role === "Overseer");
      if (s.currentExecutiveAction === "SpecialElection") {
        target = stateTeam.length > 0
          ? stateTeam[Math.floor(Math.random() * stateTeam.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      } else if (s.currentExecutiveAction === "Investigate") {
        target = civilPlayers.length > 0
          ? civilPlayers[Math.floor(Math.random() * civilPlayers.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      } else {
        target = civilPlayers.length > 0
          ? civilPlayers[Math.floor(Math.random() * civilPlayers.length)]
          : eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    await this.handleExecutiveAction(s, roomId, target.id);
  }

  // ─── AI: Veto response ─────────────────────────────────────────────────────

  private async aiVetoResponse(s: GameState, roomId: string): Promise<void> {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    const stateInHand = s.chancellorPolicies.filter(p => p === "State").length;
    const civilInHand = s.chancellorPolicies.filter(p => p === "Civil").length;
    let agree: boolean;

    if (president.role === "Civil") {
      if (s.electionTracker >= 2) {
        agree = false;
      } else if (stateInHand === 2) {
        agree = true;
      } else {
        agree = Math.random() > 0.75;
      }
    } else {
      if (civilInHand >= 1 && s.stateDirectives < 4) {
        agree = false;
      } else if (s.electionTracker === 0 && Math.random() > 0.6) {
        agree = true;
      } else {
        agree = Math.random() > 0.7;
      }
    }

    this.handleVetoResponse(s, roomId, president, agree);
  }

  // ─── AI: Chat helpers ──────────────────────────────────────────────────────

  private postAIChat(state: GameState, ai: Player, lines: readonly string[]): void {
    const text = lines[Math.floor(Math.random() * lines.length)];
    state.messages.push({ sender: ai.name, text, timestamp: Date.now(), type: "text" });
    if (state.messages.length > 50) state.messages.shift();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Declarations
  // ═══════════════════════════════════════════════════════════════════════════

  triggerAIDeclarations(state: GameState, roomId: string): void {
    if (state.isPaused) return;
    const president  = state.players.find(p => p.isPresident);
    const chancellor = state.players.find(p => p.isChancellor);
    if (!president || !chancellor) return;

    const presIsState = president.role === "State" || president.role === "Overseer";
    const chanIsState = chancellor.role === "State" || chancellor.role === "Overseer";
    const bothState   = presIsState && chanIsState;
    const enacted       = state.lastEnactedPolicy?.type;

    const declareForAI = (player: Player, type: "President" | "Chancellor") => {
      const alreadyDeclared = state.declarations.some(
        d => d.playerId === player.id && d.type === type
      );
      if (alreadyDeclared) return;

      // For president: saw = chancellorSaw (what they passed), drew = presidentSaw
      // For chancellor: saw = chancellorSaw (what they received)
      const saw  = type === "President" ? (state.chancellorSaw ?? []) : (state.chancellorSaw ?? []);
      const drew = state.presidentSaw ?? [];
      let civ   = saw.filter(p => p === "Civil").length;
      let sta    = saw.filter(p => p === "State").length;
      const drewCiv = drew.filter(p => p === "Civil").length;
      const drewSta = drew.filter(p => p === "State").length;

      if (bothState && enacted === "State") {
        // ── Coordinated State lying ─────────────────────────────────────
        if (type === "President") {
          const actualSta = sta;
          if (actualSta === 3) {
            if (Math.random() > 0.45) { civ = 1; sta = 2; }
          } else if (actualSta === 2) {
            civ = 2; sta = 1;
          }
          const chanSta = Math.max(1, sta - 1);
          state.pendingChancellorClaim = { civ: 2 - chanSta, sta: chanSta };
        } else {
          if (state.pendingChancellorClaim) {
            civ = state.pendingChancellorClaim.civ;
            sta  = state.pendingChancellorClaim.sta;
            state.pendingChancellorClaim = undefined;
          }
        }
      } else {
        // ── Independent lying (non-coordinated) ──────────────────────────
        let shouldLie = false;
        if (player.role !== "Civil") {
          if      (player.personality === "Deceptive")  shouldLie = true;
          else if (player.personality === "Aggressive")  shouldLie = Math.random() > 0.2;
          else if (player.personality === "Strategic")   shouldLie = state.stateDirectives >= 2;
          else if (player.personality === "Chaotic")     shouldLie = Math.random() > 0.5;
        }
        if (shouldLie && civ > 0) { civ--; sta++; }
      }

      state.declarations.push({
        playerId: player.id,
        playerName: player.name,
        civ, sta,
        ...(type === "President" ? { drewCiv, drewSta } : {}),
        type,
        timestamp: Date.now(),
      });
      const passedOrReceived = type === "President" ? "passed" : "received";
      const drewStr = type === "President" ? ` (drew ${drewCiv}C/${drewSta}S)` : "";
      state.log.push(
        `${player.name} (${type}) declared ${passedOrReceived} ${civ} Civil and ${sta} State directives.${drewStr}`
      );
      if (state.messages.length > 50) state.messages.shift();

      // AI chat reactions after declaration
      if (player.isAI && enacted === "State" && Math.random() > 0.4) {
        setTimeout(() => {
          if (state.isPaused) return;
          const lines = type === "Chancellor"
            ? (player.role === "Civil" ? CHAT.chanCivilStateEnacted : CHAT.chanStateStateEnacted)
            : (player.role === "Civil" ? CHAT.presCivilStateEnacted : CHAT.presStateStateEnacted);
          this.postAIChat(state, player, lines);
          this.broadcastState(roomId);
        }, 1200);
      }

      this.broadcastState(roomId);
      this.checkRoundEnd(state, roomId);
    };

    // President declares first, then chancellor waits for president
    setTimeout(() => {
      if (state.isPaused) return;
      const presidentDeclared = state.declarations.some(d => d.type === "President");
      if (!presidentDeclared && (president.isAI || state.presidentTimedOut)) {
        declareForAI(president, "President");
      }

      const checkAndDeclareChancellor = () => {
        if (state.isPaused) return;
        const chancellorDeclared = state.declarations.some(d => d.type === "Chancellor");
        if (chancellorDeclared) return;
        if (chancellor.isAI || state.chancellorTimedOut) {
          const presidentDeclared = state.declarations.some(d => d.type === "President");
          if (!presidentDeclared) { setTimeout(checkAndDeclareChancellor, 2000); return; }
          declareForAI(chancellor, "Chancellor");
        }
      };
      setTimeout(checkAndDeclareChancellor, 2000);
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Policy Enactment
  // ═══════════════════════════════════════════════════════════════════════════

  triggerPolicyEnactment(
    state: GameState,
    roomId: string,
    played: Policy,
    isChaos: boolean = false,
    playerId?: string
  ): void {
    state.lastEnactedPolicy = { type: played, timestamp: Date.now(), playerId };

    setTimeout(async () => {
      if (state.isPaused) return;

      if (played === "Civil") {
        state.civilDirectives++;
        state.log.push("A Civil directive was enacted.");
      } else {
        state.stateDirectives++;
        state.log.push("A State directive was enacted.");
        if (state.stateDirectives >= 5) state.vetoUnlocked = true;
      }

      updateSuspicionFromPolicy(state, played);

      await this.checkVictory(state, roomId);
      if (state.phase !== "GameOver") {
        if (isChaos) {
          this.nextPresident(state, roomId);
        } else {
          this.triggerAIDeclarations(state, roomId);
        }
      }
      this.broadcastState(roomId);
    }, 6000); // Wait for animation
  }

  private captureRoundHistory(state: GameState, played: Policy, isChaos: boolean): void {
    if (isChaos || !state.lastGovernmentPresidentId || !state.lastGovernmentChancellorId) return;
    const presPlayer = state.players.find(p => p.id === state.lastGovernmentPresidentId);
    const chanPlayer = state.players.find(p => p.id === state.lastGovernmentChancellorId);
    if (!presPlayer || !chanPlayer) return;

    const presDecl = state.declarations.find(d => d.type === "President");
    const chanDecl = state.declarations.find(d => d.type === "Chancellor");
    const action   = getExecutiveAction(state);

    if (!state.roundHistory) state.roundHistory = [];
    state.roundHistory.push({
      round:          state.round,
      presidentName:  presPlayer.name,
      chancellorName: chanPlayer.name,
      policy:         played,
      votes: Object.entries(state.lastGovernmentVotes ?? {}).map(([pid, v]) => {
        const pl = state.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v };
      }),
      presDeclaration: presDecl ? { civ: presDecl.civ, sta: presDecl.sta, drewCiv: presDecl.drewCiv ?? 0, drewSta: presDecl.drewSta ?? 0 } : undefined,
      chanDeclaration: chanDecl ? { civ: chanDecl.civ, sta: chanDecl.sta } : undefined,
      executiveAction: action !== "None" ? action : undefined,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Voting
  // ═══════════════════════════════════════════════════════════════════════════

  handleVoteResult(state: GameState, roomId: string, ayeVotes: number, nayVotes: number): void {
    state.phase = "Voting_Reveal" as any;

    if (!state.previousVotes) state.previousVotes = {};
    state.players.forEach(p => {
      if (p.vote) state.previousVotes![p.id] = p.vote;
      p.vote = undefined;
    });

    const voteInfo = `(${ayeVotes} Aye, ${nayVotes} Nay)`;
    state.actionTimerEnd = Date.now() + 4000;
    this.broadcastState(roomId);

    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase !== "Voting_Reveal") return;
      s.actionTimerEnd = undefined;

      if (ayeVotes > nayVotes) {
        this.handleElectionPassed(s, roomId, voteInfo);
      } else {
        await this.handleElectionFailed(s, roomId, voteInfo);
      }

      s.previousVotes = undefined;
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    }, 6000);
  }

  private handleElectionPassed(s: GameState, roomId: string, voteInfo: string): void {
    s.log.push(`The election passed! ${voteInfo}`);
    const chancellor = s.players.find(p => p.isChancellorCandidate)!;
    const president  = s.players.find(p => p.isPresidentialCandidate)!;

    if (s.stateDirectives >= 3 && chancellor.role === "Overseer") {
      s.phase = "GameOver";
      startActionTimerRef(this, roomId);
      s.winner = "State";
      s.winReason = "THE OVERSEER HAS ASCENDED";
      s.log.push("The Overseer was elected Chancellor! State Supremacy!");
      this.updateUserStats(s, "State");
      return;
    }

    s.phase = "Legislative_President";
    startActionTimerRef(this, roomId);
    s.electionTracker = 0;
    s.players.forEach(p => { p.isPresident = false; p.isChancellor = false; });
    president.isPresident   = true;
    chancellor.isChancellor = true;
    s.presidentId  = president.id;
    s.chancellorId = chancellor.id;

    s.lastGovernmentVotes          = { ...s.previousVotes };
    s.lastGovernmentPresidentId    = president.id;
    s.lastGovernmentChancellorId   = chancellor.id;

    updateSuspicionFromNomination(s, president.id, chancellor.id);

    // Ensure we have 3 cards to draw (should already be true due to pre-round reshuffle)
    if (s.deck.length < 3) {
      s.deck = shuffle([...s.deck, ...s.discard]);
      s.discard = [];
    }
    s.drawnPolicies = s.deck.splice(0, 3);
  }

  private async handleElectionFailed(s: GameState, roomId: string, voteInfo: string): Promise<void> {
    s.log.push(`The election failed! ${voteInfo}`);

    const presPlayer = s.players[s.presidentIdx];
    const chanPlayer = s.players.find(p => p.isChancellorCandidate);
    if (!s.roundHistory) s.roundHistory = [];
    s.roundHistory.push({
      round:          s.round,
      presidentName:  presPlayer?.name ?? "?",
      chancellorName: chanPlayer?.name ?? "?",
      failed:         true,
      failReason:     "vote",
      votes: Object.entries(s.previousVotes ?? {}).map(([pid, v]) => {
        const pl = s.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v };
      }),
    });

    s.electionTracker++;
    if (s.electionTracker === 3) {
      s.log.push("Election tracker reached 3! Chaos directive enacted.");
      if (s.deck.length < 1) {
        s.deck = shuffle([...s.deck, ...s.discard]);
        s.discard = [];
      }
      const chaosPolicy = s.deck.shift()!;
      s.electionTracker = 0;
      s.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      this.triggerPolicyEnactment(s, roomId, chaosPolicy, true);
    } else {
      if ((s.phase as string) !== "GameOver") this.nextPresident(s, roomId);
    }

    // Random AI comments on the failure
    const aiAlive = s.players.filter(p => p.isAI && p.isAlive);
    if (aiAlive.length > 0 && Math.random() > 0.5) {
      const commentator = aiAlive[Math.floor(Math.random() * aiAlive.length)];
      setTimeout(() => {
        if (!s.isPaused) {
          this.postAIChat(s, commentator, CHAT.governmentFailed);
          this.broadcastState(roomId);
        }
      }, 900);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Round End / Executive Actions
  // ═══════════════════════════════════════════════════════════════════════════

  checkRoundEnd(state: GameState, roomId: string): void {
    if (state.phase === "GameOver") return;

    const presidentDeclared  = state.declarations.some(d => d.type === "President");
    const chancellorDeclared = state.declarations.some(d => d.type === "Chancellor");
    if (!presidentDeclared || !chancellorDeclared) return;

    // Both have declared — capture round history now that we have all the data
    if (state.lastEnactedPolicy && !state.lastEnactedPolicy.historyCaptured) {
      this.captureRoundHistory(state, state.lastEnactedPolicy.type, false);
      state.lastEnactedPolicy.historyCaptured = true;
      state.lastGovernmentVotes = undefined; // safe to clear now
    }

    updateSuspicionFromDeclarations(state);
    const action = getExecutiveAction(state);

    if (action !== "None") {
      state.phase = "Executive_Action";
      this.startActionTimer(roomId);
      state.currentExecutiveAction = action;
      state.log.push(`Executive Action: ${action}`);

      if (action === "PolicyPeek") {
        const top3 = state.deck.slice(0, 3);
        this.io.to(state.presidentId!).emit("policyPeekResult", top3);
        state.log.push(
          `${state.players.find(p => p.id === state.presidentId)?.name} previewed the top 3 directives.`
        );
      }

      this.processAITurns(roomId);
    } else {
      this.nextPresident(state, roomId, true);
    }

    this.broadcastState(roomId);
  }

  async handleExecutiveAction(state: GameState, roomId: string, targetId: string): Promise<void> {
    const target = state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return;

    if (state.currentExecutiveAction === "Execution") {
      await this.executePlayer(state, roomId, target);
    } else if (state.currentExecutiveAction === "Investigate") {
      await this.investigatePlayer(state, roomId, target);
    } else if (state.currentExecutiveAction === "SpecialElection") {
      state.log.push(`Special Election! ${target.name} is the next candidate.`);
      state.lastPresidentIdx = state.presidentIdx;
      state.presidentIdx = state.players.indexOf(target);
      this.startElection(state, roomId);
    } else if (state.currentExecutiveAction === "PolicyPeek") {
      state.log.push("President previewed the top 3 directives.");
      if (state.presidentId) {
        this.io.to(state.presidentId).emit("policyPeekResult", state.deck.slice(0, 3));
      }
      this.nextPresident(state, roomId, true);
    }

    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  private async executePlayer(state: GameState, roomId: string, target: Player): Promise<void> {
    target.isAlive = false;
    state.log.push(`${target.name} was executed!`);

    // Update kill/death stats
    const president = state.players.find(p => p.id === state.presidentId);
    if (president?.userId) {
      const u = await getUserById(president.userId);
      if (u) { u.stats.kills++; await saveUser(u); }
    }
    if (target.userId) {
      const u = await getUserById(target.userId);
      if (u) { u.stats.deaths++; await saveUser(u); }
    }

    if (target.role === "Overseer") {
      state.phase    = "GameOver";
      state.winner = "Civil";
      state.winReason = "THE OVERSEER IS ELIMINATED — CHARTER RESTORED";
      state.log.push("The Overseer was eliminated! Charter Restored!");
      await this.updateUserStats(state, "Civil");
    } else {
      this.nextPresident(state, roomId, true);
    }
  }

  private async investigatePlayer(state: GameState, roomId: string, target: Player): Promise<void> {
    state.log.push(`President investigated ${target.name}.`);
    if (!state.presidentId) return;

    const investigationRole = target.role === "Civil" ? "Civil" : "State";
    this.io.to(state.presidentId).emit("investigationResult", {
      targetName: target.name,
      role: investigationRole,
    });
    updateSuspicionFromInvestigation(state, state.presidentId, target.id, investigationRole);

    // AI president hints at the result in chat
    const presPlayer = state.players.find(p => p.id === state.presidentId);
    if (presPlayer?.isAI && Math.random() > 0.3) {
      setTimeout(() => {
        if (!state.isPaused) {
          this.postAIChat(
            state, presPlayer,
            investigationRole === "State" ? CHAT.investigateState : CHAT.investigateCivil
          );
          this.broadcastState(roomId);
        }
      }, 1000);
    }

    this.nextPresident(state, roomId, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Veto
  // ═══════════════════════════════════════════════════════════════════════════

  handleVetoResponse(state: GameState, roomId: string, player: Player, agree: boolean): void {
    if (agree) {
      state.log.push(`${player.name} (President) agreed to the Veto. Both directives discarded.`);
      state.discard.push(...state.chancellorPolicies);
      state.chancellorPolicies = [];
      state.vetoRequested = false;

      // Record vetoed government in round history
      const presPlayer = state.players.find(p => p.isPresident);
      const chanPlayer = state.players.find(p => p.isChancellor);
      if (!state.roundHistory) state.roundHistory = [];
      state.roundHistory.push({
        round:          state.round,
        presidentName:  presPlayer?.name ?? "?",
        chancellorName: chanPlayer?.name ?? "?",
        failed:         true,
        failReason:     "veto",
        votes:          [],
      });

      state.electionTracker++;
      if (state.electionTracker === 3) {
        state.log.push("Election tracker reached 3! Chaos directive enacted.");
        if (state.deck.length < 1) {
          state.deck = shuffle([...state.deck, ...state.discard]);
          state.discard = [];
        }
        const chaosPolicy = state.deck.shift()!;
        state.electionTracker = 0;
        state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
        this.triggerPolicyEnactment(state, roomId, chaosPolicy, true);
      } else {
        if ((state.phase as string) !== "GameOver") {
          this.nextPresident(state, roomId, false);
        }
      }

      this.triggerAIDeclarations(state, roomId);
    } else {
      state.log.push(`${player.name} (President) denied the Veto. Chancellor must enact a directive.`);
      state.vetoRequested = false;
    }

    this.broadcastState(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Election flow
  // ═══════════════════════════════════════════════════════════════════════════

  nextPresident(state: GameState, roomId: string, isSuccessfulGovernment: boolean = false): void {
    state.vetoRequested = false;

    if (isSuccessfulGovernment) {
      const prevPres = state.players.find(p => p.isPresident);
      const prevChan = state.players.find(p => p.isChancellor);
      state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      if (prevPres) prevPres.wasPresident = true;
      if (prevChan) prevChan.wasChancellor = true;
    }

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

    // Reshuffle if fewer than 3 cards remain before the round starts
    if (state.deck.length < 3) {
      state.log.push("Fewer than 3 cards in deck. Reshuffling discard pile...");
      state.deck = shuffle([...state.deck, ...state.discard]);
      state.discard = [];
    }

    state.messages.push({
      sender: "System",
      text: `Round ${state.round} Started`,
      timestamp: Date.now(),
      type: "round_separator",
      round: state.round,
    });

    do {
      state.presidentIdx = (state.presidentIdx + 1) % state.players.length;
    } while (!state.players[state.presidentIdx].isAlive);

    this.startElection(state, roomId);
  }

  startElection(state: GameState, roomId: string): void {
    state.phase = "Election";
    this.startActionTimer(roomId);
    state.previousVotes        = undefined;
    state.declarations         = [];
    state.presidentTimedOut    = false;
    state.chancellorTimedOut   = false;
    state.players.forEach(p => {
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate   = false;
    });
    state.players[state.presidentIdx].isPresidentialCandidate = true;
    state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lobby / Room management
  // ═══════════════════════════════════════════════════════════════════════════

  fillWithAI(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const currentNames = state.players.map(p => p.name);
    const availableBots = AI_BOTS.filter(bot => !currentNames.includes(`${bot.name} (AI)`));

    while (state.players.length < state.maxPlayers && availableBots.length > 0) {
      const botIdx = Math.floor(Math.random() * availableBots.length);
      const bot    = availableBots.splice(botIdx, 1)[0];
      state.players.push({
        id:                    `ai-${randomUUID()}`,
        name:                  `${bot.name} (AI)`,
        avatarUrl:             bot.avatarUrl,
        personality:           bot.personality,
        isAlive:               true,
        isPresidentialCandidate: false,
        isChancellorCandidate:   false,
        isPresident:           false,
        isChancellor:          false,
        wasPresident:          false,
        wasChancellor:         false,
        isAI:                  true,
      });
    }

    this.startGame(roomId);
  }

  startGame(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.phase !== "Lobby") return;

    if (state.players.length < state.maxPlayers) {
      this.fillWithAI(roomId);
      return;
    }

    const numPlayers = state.players.length;
    const roles = assignRoles(numPlayers);
    state.players.forEach((p, i) => (p.role = roles[i]));

    state.phase = "Election";
    state.declarations = [];
    state.log.push(`--- Round ${state.round} Started ---`);

    // Reshuffle if fewer than 3 cards remain (though deck is full at start)
    if (state.deck.length < 3) {
      state.deck = shuffle([...state.deck, ...state.discard]);
      state.discard = [];
    }

    state.messages.push({
      sender: "System",
      text: `Round ${state.round} Started`,
      timestamp: Date.now(),
      type: "round_separator",
      round: state.round,
    });

    state.presidentIdx = Math.floor(Math.random() * numPlayers);
    state.players[state.presidentIdx].isPresidentialCandidate = true;
    state.log.push("Game started! Roles assigned.");
    state.log.push(`${state.players[state.presidentIdx].name} is the Presidential Candidate.`);
    initializeSuspicion(state);
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  handleLeave(socket: Socket, roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (player) {
      if (state.phase === "Lobby") {
        state.players = state.players.filter(p => p.id !== socket.id);
        state.log.push(`${player.name} left the room.`);
      } else if (!player.isAI && !player.isDisconnected) {
        player.isDisconnected = true;
        state.isPaused        = true;
        state.pauseReason     = `${player.name} disconnected. Waiting 60s for reconnection...`;
        state.pauseTimer      = 60;
        state.disconnectedPlayerId = player.id;
        state.log.push(`${player.name} disconnected. Game paused.`);

        if (this.actionTimers.has(roomId)) {
          clearTimeout(this.actionTimers.get(roomId));
          this.actionTimers.delete(roomId);
        }
        state.actionTimerEnd = undefined;

        if (this.pauseTimers.has(roomId)) clearInterval(this.pauseTimers.get(roomId));

        const pauseInterval = setInterval(() => {
          const s = this.rooms.get(roomId);
          if (!s || !s.isPaused) {
            clearInterval(pauseInterval);
            this.pauseTimers.delete(roomId);
            return;
          }
          s.pauseTimer!--;
          if (s.pauseTimer! <= 0) {
            clearInterval(pauseInterval);
            this.pauseTimers.delete(roomId);
            this.handlePauseTimeout(roomId);
          }
          this.broadcastState(roomId);
        }, 1000);

        this.pauseTimers.set(roomId, pauseInterval);
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
      this.rooms.delete(roomId);
      if (this.lobbyTimers.has(roomId)) {
        clearInterval(this.lobbyTimers.get(roomId)!);
        this.lobbyTimers.delete(roomId);
      }
    } else {
      this.broadcastState(roomId);
    }
  }

  handlePauseTimeout(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.isPaused) return;

    const player = state.players.find(p => p.id === state.disconnectedPlayerId);
    if (!player) {
      state.isPaused = false;
      this.broadcastState(roomId);
      return;
    }

    if (state.mode === "Ranked") {
      state.phase = "GameOver";
      state.winner = undefined;
      state.log.push(`Game ended as inconclusive because ${player.name} failed to reconnect.`);
      state.messages.push({
        sender: "System",
        text: `Game ended as inconclusive because ${player.name} failed to reconnect.`,
        timestamp: Date.now(),
        type: "text",
      });
    } else {
      const availableBots = AI_BOTS.filter(bot => !state.players.some(p => p.name === bot.name));
      const bot = availableBots.length > 0
        ? availableBots[Math.floor(Math.random() * availableBots.length)]
        : AI_BOTS[Math.floor(Math.random() * AI_BOTS.length)];

      player.isAI          = true;
      player.isDisconnected = false;
      player.id            = `ai-${randomUUID()}`;
      player.userId        = undefined;
      player.name          = bot.name;
      player.avatarUrl     = bot.avatarUrl;
      player.personality   = bot.personality;
      state.log.push(`${player.name} (AI) has taken over the seat.`);
      state.isPaused = false;
      this.processAITurns(roomId);
    }

    state.disconnectedPlayerId = undefined;
    state.pauseReason          = undefined;
    state.pauseTimer           = undefined;
    this.broadcastState(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Victory and stats
  // ═══════════════════════════════════════════════════════════════════════════

  async checkVictory(state: GameState, roomId: string): Promise<void> {
    if (state.phase === "GameOver") return;
    if (state.civilDirectives >= 5) {
      state.phase    = "GameOver";
      state.winner = "Civil";
      state.winReason = "CHARTER RESTORED";
      state.log.push("5 Civil directives enacted! Charter Restored!");
      await this.updateUserStats(state, "Civil");
    } else if (state.stateDirectives >= 6) {
      state.phase    = "GameOver";
      state.winner = "State";
      state.winReason = "STATE SUPREMACY";
      state.log.push("6 State directives enacted! State Supremacy!");
      await this.updateUserStats(state, "State");
    }
  }

  async updateUserStats(state: GameState, winningSide: "Civil" | "State"): Promise<void> {
    for (const p of state.players) {
      if (p.isAI || !p.userId) continue;
      const user = await getUserById(p.userId);
      if (!user) continue;

      user.stats.gamesPlayed++;
      if      (p.role === "Civil")    user.stats.civilGames++;
      else if (p.role === "State")    user.stats.stateGames++;
      else if (p.role === "Overseer") user.stats.overseerGames++;

      const isWinner =
        (winningSide === "Civil" && p.role === "Civil") ||
        (winningSide === "State" && (p.role === "State" || p.role === "Overseer"));

      if (isWinner) {
        user.stats.wins++;
        user.stats.elo    += state.mode === "Ranked" ? 25 : 0;
        user.stats.points += state.mode === "Ranked" ? 100 : 40;
      } else {
        user.stats.losses++;
        user.stats.elo    = state.mode === "Ranked" ? Math.max(0, user.stats.elo - 15) : user.stats.elo;
        user.stats.points += state.mode === "Ranked" ? 25 : 10;
      }

      const level = Math.floor(user.stats.gamesPlayed / 5) + 1;
      if (level >= 30 && !user.claimedRewards.includes('level-30-cp')) {
        user.cabinetPoints += 500;
        user.claimedRewards.push('level-30-cp');
      }

      await saveUser(user);
      const { password: _, ...userWithoutPassword } = user;
      this.io.to(p.id).emit("userUpdate", userWithoutPassword);
    }
  }
}

// ---------------------------------------------------------------------------
// Small helper to call startActionTimer from handleElectionPassed without
// breaking the "this" context inside an arrow-function callback.
// ---------------------------------------------------------------------------
function startActionTimerRef(engine: GameEngine, roomId: string): void {
  engine.startActionTimer(roomId);
}
