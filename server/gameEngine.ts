import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import {
  GameState, Player, Policy, ExecutiveAction, TitleRole
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
  updateSuspicionFromPolicyExpectation,
} from "./suspicion.ts";
import { getUserById, saveUser, incrementGlobalWin } from "./supabaseService.ts";

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
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  resetPlayerActions(state: GameState): void {
    state.players.forEach(p => {
      p.hasActed = false;
    });
  }

  private assignTitleRoles(state: GameState): void {
    const numPlayers = state.players.length;
    let numTitleRoles = 0;
    if (numPlayers >= 5 && numPlayers <= 6) numTitleRoles = 2;
    else if (numPlayers >= 7 && numPlayers <= 8) numTitleRoles = 3;
    else if (numPlayers >= 9 && numPlayers <= 10) numTitleRoles = 4;

    const roles: TitleRole[] = ['Assassin', 'Strategist', 'Broker', 'Handler', 'Auditor', 'Interdictor'];
    const shuffledRoles = shuffle(roles);
    
    const players = shuffle([...state.players]);
    for (let i = 0; i < numTitleRoles; i++) {
        players[i].titleRole = shuffledRoles[i];
        players[i].titleUsed = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Broadcasting
  // ═══════════════════════════════════════════════════════════════════════════

  broadcastState(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;
    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: Broadcasting state for room ${roomId}, phase: ${state.phase}, rejectedChancellorId: ${state.rejectedChancellorId}`);

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
      if (p.isAI || !p.role) return;
      const stateAgents = state.players
        .filter(pl => pl.role === "State" || pl.role === "Overseer")
        .map(pl => ({ id: pl.id, name: pl.name, role: pl.role! }));

      if (p.role === "State") {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents, titleRole: p.titleRole });
      } else if (p.role === "Overseer" && state.players.length <= 6) {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents, titleRole: p.titleRole });
      } else {
        this.io.to(p.id).emit("privateInfo", { role: p.role!, titleRole: p.titleRole });
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

    const timer = setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase === "Lobby" || s.phase === "GameOver") return;
      s.actionTimerEnd = undefined;
      await this.handleActionTimerExpiry(s, roomId);
    }, state.actionTimer * 1000);

    this.actionTimers.set(roomId, timer);
  }

  private async handleActionTimerExpiry(s: GameState, roomId: string): Promise<void> {
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
    } else if (s.titlePrompt) {
      // A pending title ability must be resolved before any phase-level fallback.
      // This handles Broker/Handler/Interdictor prompts that fire during Nomination_Review —
      // the old ordering let Nomination_Review fire first, bypassing the ability entirely.
      await this.handleTitleAbility(s, roomId, { use: false });
    } else if (s.phase === "Nomination_Review") {
      // Only reached if there is no titlePrompt (i.e. the timer fired during a bare review window).
      s.phase = "Voting";
      s.log.push("[Timer] Nomination review time expired.");
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    } else if (s.phase === "Legislative_Chancellor") {
      const chancellor = s.players.find(p => p.isChancellor);
      if (chancellor && s.chancellorPolicies.length > 0) {
        const played   = s.chancellorPolicies.splice(
          Math.floor(Math.random() * s.chancellorPolicies.length), 1
        )[0];
        s.discard.push(...s.chancellorPolicies);
        s.chancellorPolicies = [];
        s.chancellorTimedOut = true;
        s.log.push(`[Timer] ${chancellor.name} was too slow. A random directive was enacted.`);
        this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
      }

    } else if (s.phase === "Assassin_Action") {
      const nextPhase = s.titlePrompt?.nextPhase;
      s.titlePrompt = undefined;
      s.phase = nextPhase || 'Election';
      if (s.phase === 'Election') {
        this.nextPresident(s, roomId, true);
      }
      this.broadcastState(roomId);
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

    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: processAITurns called. Phase: ${state.phase}`);
    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.isPaused) return;

      // Phase-specific AI actions must not fire while a title ability is pending.
      // The Strategist in particular sets titlePrompt and leaves drawnPolicies empty
      // during Legislative_President — aiPresidentDiscard would splice an empty array,
      // corrupting the hand. All phase actions are skipped and aiHandleTitleAbility
      // resolves the prompt instead.
      if (!s.titlePrompt) {
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
      }

      // AI handle title ability
      if (s.titlePrompt) {
        await this.aiHandleTitleAbility(s, roomId);
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
      p.id !== s.rejectedChancellorId &&
      !p.wasChancellor &&
      !(s.players.filter(pl => pl.isAlive).length > 5 && p.wasPresident)
    );
    let target: Player;
    if (eligible.length === 0) {
      // Fallback: pick any alive player except president
      const allAlive = s.players.filter(p => p.isAlive && p.id !== president.id);
      if (allAlive.length === 0) return;
      target = allAlive[Math.floor(Math.random() * allAlive.length)];
      s.log.push(`[Fallback] ${president.name} could not nominate an eligible player. ${target.name} was auto-nominated.`);
    } else {
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
    }

    target.isChancellorCandidate = true;
    this.resetPlayerActions(s);
    
    const broker = s.players.find(p => p.titleRole === 'Broker' && !p.titleUsed && p.isAlive);

    if (broker && broker.id !== president.id) {
      s.titlePrompt = { playerId: broker.id, role: 'Broker', context: {}, nextPhase: 'Voting' };
      s.phase = 'Nomination_Review';
    } else {
      s.phase = "Voting";
    }

    this.startActionTimer(roomId);
    s.log.push(`${president.name} nominated ${target.name} for Chancellor.`);
    updateSuspicionFromNomination(s, president.id, target.id);
    this.triggerAIReactions(s, roomId, 'nomination', { targetId: target.id });
    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  private async aiHandleTitleAbility(s: GameState, roomId: string): Promise<void> {
    const prompt = s.titlePrompt;
    if (!prompt) return;
    const player = s.players.find(p => p.id === prompt.playerId);
    if (!player || !player.isAI) return;

    const isPresident = player.id === s.players[s.presidentIdx].id;
    if (isPresident && (prompt.role === 'Broker' || prompt.role === 'Interdictor')) {
      await this.handleTitleAbility(s, roomId, { use: false });
      return;
    }

    let abilityData: any = { use: false };

    switch (prompt.role) {
      case 'Assassin':
        const targets = s.players.filter(p => p.isAlive && p.id !== player.id);
        const mostSuspiciousTarget = mostSuspicious(player, targets);
        if (getSuspicion(player, mostSuspiciousTarget.id) > 0.7) {
          abilityData.use = true;
          abilityData.targetId = mostSuspiciousTarget.id;
        }
        break;
      case 'Strategist':
        // Strategist: Use if they want to find specific policies (Civil or State)
        // AI will use it 60% of the time if it's available
        if (Math.random() > 0.4) {
          abilityData.use = true;
        }
        break;
      case 'Broker': {
        // Broker: Force re-nomination if current nominee is suspicious
        // But don't force re-nomination of your own choice if you are the President
        const chancellorCandidate = s.players.find(p => p.isChancellorCandidate);
        const isPresident = player.id === s.players[s.presidentIdx].id;
        if (!isPresident && chancellorCandidate && getSuspicion(player, chancellorCandidate.id) > 0.6) {
          abilityData.use = true;
        }
        break;
      }
      case 'Handler': {
        // Handler: Swap next two if the person immediately after current president is suspicious
        if (s.presidentialOrder) {
          const currentId = s.players[s.presidentIdx].id;
          const currentIndex = s.presidentialOrder.indexOf(currentId);
          const next1Id = s.presidentialOrder[(currentIndex + 1) % s.presidentialOrder.length];
          if (getSuspicion(player, next1Id) > 0.6) {
            abilityData.use = true;
          }
        }
        break;
      }
      case 'Auditor': {
        // Auditor: Always useful to peek
        abilityData.use = true;
        break;
      }
      case 'Interdictor': {
        // Interdictor: Detain someone suspicious
        const eligibleTargets = s.players.filter(p => p.isAlive && p.id !== s.players[s.presidentIdx].id && p.id !== player.id);
        const suspiciousTarget = eligibleTargets.find(p => getSuspicion(player, p.id) > 0.7);
        if (suspiciousTarget) {
          abilityData.use = true;
          abilityData.targetId = suspiciousTarget.id;
        }
        break;
      }
    }

    await this.handleTitleAbility(s, roomId, abilityData);
  }

  // ─── AI: Voting phase ──────────────────────────────────────────────────────

  private aiCastVotes(s: GameState, roomId: string): void {
    const aiVoters = s.players.filter(p => p.isAI && p.isAlive && !p.vote && p.id !== s.detainedPlayerId);
    if (process.env.NODE_ENV !== 'production') s.log.push(`DEBUG: aiCastVotes called. AI voters: ${aiVoters.length}, Phase: ${s.phase}`);
    if (aiVoters.length === 0) return;

    const chancellor = s.players.find(p => p.isChancellorCandidate);
    const president  = s.players[s.presidentIdx];

    aiVoters.forEach(ai => {
      ai.vote = this.computeAIVote(ai, s, president, chancellor ?? null);
    });

    const ayeVotes   = s.players.filter(p => p.vote === "Aye").length;
    const nayVotes = s.players.filter(p => p.vote === "Nay").length;

    const remainingVotes = s.players.filter(p => p.isAlive && p.id !== s.detainedPlayerId && !p.vote).length;
    if (process.env.NODE_ENV !== 'production') s.log.push(`DEBUG: Remaining votes: ${remainingVotes}`);

    if (remainingVotes === 0) {
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
    // Difficulty scaling
    const difficultyMultiplier = ai.difficulty === 'Elite' ? 1.5 : ai.difficulty === 'Casual' ? 0.5 : 1.0;

    if (ai.role === "Civil" && ai.suspicion) {
      const presSusp  = getSuspicion(ai, president.id);
      const chanSusp  = chancellor ? getSuspicion(ai, chancellor.id) : 0;
      
      // Risk-based voting
      const riskTolerance = ai.personality === 'Strategic' ? 0.3 : ai.personality === 'Chaotic' ? 0.7 : 0.5;
      const threshold = Math.min(0.65, 0.50 + s.round * 0.015) * difficultyMultiplier;

      if ((presSusp * difficultyMultiplier > threshold || chanSusp * difficultyMultiplier > threshold) && Math.random() > riskTolerance) {
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

    if (s.drawnPolicies.length > 2) {
      // Still more to discard (Strategist case)
      this.aiPresidentDiscard(s, roomId);
      return;
    }

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

    let idx = this.choosePolicyToPlay(chancellor, s.chancellorPolicies, s.stateDirectives, s.civilDirectives);

    const played    = s.chancellorPolicies.splice(idx, 1)[0];
    s.discard.push(...s.chancellorPolicies);
    s.chancellorPolicies = [];
    this.triggerPolicyEnactment(s, roomId, played, false, chancellor.id);
  }

  private choosePolicyToPlay(player: Player, hand: Policy[], stateDirectives: number, civilDirectives: number): number {
    // If playing a directive wins the game for the AI's party, do it.
    if (player.role === "Civil" && civilDirectives === 4 && hand.includes("Civil")) {
      return hand.findIndex(p => p === "Civil");
    }
    if ((player.role === "State" || player.role === "Overseer") && stateDirectives === 5 && hand.includes("State")) {
      return hand.findIndex(p => p === "State");
    }

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

  private postAIChat(state: GameState, ai: Player, lines: readonly string[], targetName?: string): void {
    let text = lines[Math.floor(Math.random() * lines.length)];
    if (targetName) {
      text = text.replace("{name}", targetName.replace(" (AI)", ""));
    }
    state.messages.push({ sender: ai.name, text, timestamp: Date.now(), type: "text" });
    if (state.messages.length > 50) state.messages.shift();
  }

  private triggerAIReactions(state: GameState, roomId: string, type: 'nomination' | 'enactment' | 'failed_vote', context?: any): void {
    const aiPlayers = state.players.filter(p => p.isAI && p.isAlive);
    if (aiPlayers.length === 0) return;

    // Pick one or two AIs to react
    const commentators = aiPlayers.sort(() => Math.random() - 0.5).slice(0, Math.random() > 0.7 ? 2 : 1);

    for (const commentator of commentators) {
      setTimeout(() => {
        if (state.isPaused) return;
        
        let lines: readonly string[] = CHAT.banter;

        if (type === 'nomination' && context?.targetId) {
          const target = state.players.find(p => p.id === context.targetId);
          if (target) {
            if (commentator.id === target.id) {
              lines = CHAT.defendingSelf;
            } else {
              const suspicion = getSuspicion(commentator, target.id);
              const isTeammate = commentator.role !== "Civil" && (target.role === "State" || target.role === "Overseer");

              if (suspicion > 0.75 && !isTeammate) {
                lines = CHAT.highSuspicion;
              } else if (suspicion > 0.55 && !isTeammate) {
                lines = CHAT.suspiciousNominee;
              } else if (suspicion < 0.25 || isTeammate) {
                // Only praise if some actions have actually occurred (policies enacted)
                // or if we're past the very early game.
                const hasHistory = state.civilDirectives > 0 || state.stateDirectives > 0;
                if (hasHistory || state.round > 2) {
                  lines = CHAT.praisingCivil;
                } else {
                  // @ts-ignore - neutralSupport is added to CHAT
                  lines = CHAT.neutralSupport;
                }
              } else {
                lines = CHAT.banter;
              }
            }
            this.postAIChat(state, commentator, lines, target.name);
          }
        } else if (type === 'failed_vote') {
          lines = CHAT.governmentFailed;
          this.postAIChat(state, commentator, lines);
        }
        
        this.broadcastState(roomId);
      }, 1000 + Math.random() * 2000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Declarations
  // ═══════════════════════════════════════════════════════════════════════════

  triggerAIDeclarations(state: GameState, roomId: string): void {
    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: triggerAIDeclarations called, phase: ${state.phase}`);
    if (state.isPaused) return;
    // Only proceed if we are still in the legislative phase.
    // If a human player already declared and triggered the next round, skip this.
    if (state.phase !== "Legislative_Chancellor") return;

    const president  = state.players.find(p => p.isPresident);
    const chancellor = state.players.find(p => p.isChancellor);
    if (!president || !chancellor) return;

    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: AI declarations: president ${president.name} (AI: ${president.isAI}), chancellor ${chancellor.name} (AI: ${chancellor.isAI})`);

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
      const saw = state.chancellorSaw ?? [];
      const drew = state.presidentSaw ?? [];
      let civ = saw.filter(p => p === "Civil").length;
      let sta = saw.filter(p => p === "State").length;
      const drewCiv = drew.filter(p => p === "Civil").length;
      const drewSta = drew.filter(p => p === "State").length;

      if (bothState && enacted === "State") {
        // ── Coordinated State lying ─────────────────────────────────────
        if (type === "President") {
          // If they passed 2 State, they might lie and say they passed 1 of each
          // to make it look like there's a Civil card in the mix.
          if (sta === 2 && Math.random() > 0.5) {
            civ = 1;
            sta = 1;
          } else if (sta === 1 && Math.random() > 0.5) {
            // Or if they passed 1 of each, they might claim they passed 2 State
            // to hide the Civil card.
            civ = 0;
            sta = 2;
          }
          state.pendingChancellorClaim = { civ, sta };
        } else {
          if (state.pendingChancellorClaim) {
            civ = state.pendingChancellorClaim.civ;
            sta = state.pendingChancellorClaim.sta;
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
    console.log(`[DEBUG] triggerPolicyEnactment: roomId=${roomId}, played=${played}, playerId=${playerId}`);
    state.lastEnactedPolicy = { type: played, timestamp: Date.now(), playerId };
    this.broadcastState(roomId);

    setTimeout(async () => {
      console.log(`[DEBUG] triggerPolicyEnactment timeout: roomId=${roomId}, isPaused=${state.isPaused}`);
      if (state.isPaused) return;

      if (played === "Civil") {
        state.civilDirectives++;
        state.log.push("A Civil directive was enacted.");
      } else {
        state.stateDirectives++;
        state.log.push(`A State directive was enacted. Total State directives: ${state.stateDirectives}`);
        if (state.stateDirectives >= 5) state.vetoUnlocked = true;
      }

      updateSuspicionFromPolicy(state, played);
      updateSuspicionFromPolicyExpectation(state, played);

      console.log(`[DEBUG] triggerPolicyEnactment: calling checkVictory`);
      await this.checkVictory(state, roomId);
      console.log(`[DEBUG] triggerPolicyEnactment: checkVictory completed, phase=${state.phase}`);
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

  checkAuditorTrigger(state: GameState): void {
    const auditor = state.players.find(p => p.titleRole === 'Auditor' && !p.titleUsed && p.isAlive);
    if (auditor) {
      state.titlePrompt = {
        playerId: auditor.id,
        role: 'Auditor',
        context: { discardPile: state.discard.slice(-3) }
      };
    }
  }

  async handleTitleAbility(state: GameState, roomId: string, abilityData: any): Promise<void> {
    const player = state.players.find(p => p.id === state.titlePrompt?.playerId);
    if (!player || !state.titlePrompt) return;

    const phaseBefore = state.phase;
    const role = state.titlePrompt.role;
    const nextPhase = state.titlePrompt.nextPhase;

    if (abilityData.use) {
      // Apply ability logic based on role
      switch (state.titlePrompt.role) {
        case 'Assassin':
          const target = state.players.find(p => p.id === abilityData.targetId);
          if (target && target.isAlive) {
            target.isAlive = false;
            target.isPresident = false;
            target.isChancellor = false;
            target.isPresidentialCandidate = false;
            target.isChancellorCandidate = false;
            state.log.push(`${player.name} (Assassin) executed ${target.name}.`);
            
            if (target.role === 'Overseer') {
              state.phase = "GameOver";
              state.winner = "Civil";
              state.winReason = "OVERSEER ASSASSINATED";
              state.log.push("The Overseer has been assassinated! Civils win!");
              await this.updateUserStats(state, "Civil");
            }
          }
          break;
        case 'Strategist':
          const top4 = state.deck.splice(0, 4);
          state.drawnPolicies = top4;
          state.log.push(`${player.name} (Strategist) drew an extra policy (4 total).`);
          break;
        case 'Broker':
          // Logic for re-nomination
          const currentChancellor = state.players.find(p => p.isChancellorCandidate);
          if (currentChancellor) {
            currentChancellor.isChancellorCandidate = false;
            state.rejectedChancellorId = currentChancellor.id;
          if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: Broker rejected ${currentChancellor.name} (id: ${currentChancellor.id})`);
          }
          state.phase = 'Election';
          state.log.push(`${player.name} (Broker) forced a re-nomination.`);
          break;
        case 'Handler':
          if (state.presidentialOrder) {
            const currentId = state.players[state.presidentIdx].id;
            const currentIndex = state.presidentialOrder.indexOf(currentId);
            const next1Index = (currentIndex + 1) % state.presidentialOrder.length;
            const next2Index = (currentIndex + 2) % state.presidentialOrder.length;
            
            const temp = state.presidentialOrder[next1Index];
            state.presidentialOrder[next1Index] = state.presidentialOrder[next2Index];
            state.presidentialOrder[next2Index] = temp;
            
            state.log.push(`${player.name} (Handler) swapped the next two players in the presidential order.`);
          }
          break;
        case 'Auditor':
          // Logic for peeking discard
          // Send last 3 discarded policies to Auditor
          const last3Discarded = state.discard.slice(-3);
          this.io.to(player.id).emit("policyPeekResult", last3Discarded, "Last 3 discarded directives:");
          state.log.push(`${player.name} (Auditor) peeked at the discard pile.`);
          break;
        case 'Interdictor':
          const detainedTarget = state.players.find(p => p.id === abilityData.targetId);
          const president = state.players[state.presidentIdx];
          if (detainedTarget && detainedTarget.isAlive && detainedTarget.id !== president.id && detainedTarget.id !== player.id) {
            state.detainedPlayerId = detainedTarget.id;
            state.log.push(`${player.name} (Interdictor) detained ${detainedTarget.name} for this round.`);
          }
          break;
      }
      this.io.to(roomId).emit("powerUsed", { role: state.titlePrompt.role });
      player.titleUsed = true;
      if (player.isAI) {
        this.postAIChat(state, player, CHAT.powerUsage);
      }
    } else {
      // If NOT using the ability, some roles need fallback logic
      if (role === 'Strategist' && state.drawnPolicies.length === 0) {
        // President declined Strategist, draw standard 3
        state.drawnPolicies = state.deck.splice(0, 3);
      }
    }

    // Check for next title ability (chaining)
    let nextPrompt: any = undefined;
    const nextInterdictor = state.players.find(p => p.titleRole === 'Interdictor' && !p.titleUsed && p.isAlive);

    if (role === 'Broker') {
      const anotherBroker = state.players.find(p => p.titleRole === 'Broker' && !p.titleUsed && p.isAlive && p.id !== player.id);
      if (anotherBroker) {
        nextPrompt = { playerId: anotherBroker.id, role: 'Broker', context: {}, nextPhase };
      }
    } else if (role === 'Handler') {
      if (nextInterdictor) {
        nextPrompt = { playerId: nextInterdictor.id, role: 'Interdictor', context: {}, nextPhase };
      }
    } else if (role === 'Interdictor') {
      const anotherInterdictor = state.players.find(p => p.titleRole === 'Interdictor' && !p.titleUsed && p.isAlive && p.id !== player.id);
      if (anotherInterdictor) {
        nextPrompt = { playerId: anotherInterdictor.id, role: 'Interdictor', context: {}, nextPhase };
      }
    }

    if (nextPrompt) {
      state.titlePrompt = nextPrompt;
    } else {
      state.titlePrompt = undefined;

      // Only transition phase if the ability didn't already change it (e.g. Broker to Election)
      // and if we have a nextPhase or are in a blocking title phase.
      // Handler and Interdictor must NOT fire processAITurns here — startElection() below
      // is their sole launcher. Calling both causes a double-fire that corrupts the nomination.
      if (state.phase === phaseBefore) {
        if (nextPhase && role !== 'Handler' && role !== 'Interdictor') {
          state.phase = nextPhase;
          this.startActionTimer(roomId);
          this.processAITurns(roomId);
        } else if (state.phase === 'Nomination_Review' && role !== 'Handler' && role !== 'Interdictor') {
          state.phase = 'Voting';
          this.startActionTimer(roomId);
          this.processAITurns(roomId);
        }
      }
    }

    // Handler and Interdictor: startElection is the sole place that kicks off the round.
    // Broker (used): same pattern — startElection handles everything.
    if ((role === 'Handler' || role === 'Interdictor') && !state.titlePrompt) {
      this.startElection(state, roomId);
      return;
    }
    // If Broker was used, we MUST start the election now.
    if (role === 'Broker' && abilityData.use) {
      this.startElection(state, roomId);
      return;
    }

    if (role === 'Assassin') {
      if (state.phase !== 'GameOver') {
        state.phase = 'Legislative_Chancellor';
      }
      this.checkRoundEnd(state, roomId);
    }

    this.broadcastState(roomId);
    this.processAITurns(roomId);
  }

  handleVoteResult(state: GameState, roomId: string, ayeVotes: number, nayVotes: number): void {
    state.log.push(`DEBUG: handleVoteResult called. Aye: ${ayeVotes}, Nay: ${nayVotes}`);
    state.phase = "Voting_Reveal";

    if (!state.previousVotes) state.previousVotes = {};
    state.players.forEach(p => {
      if (p.vote) state.previousVotes![p.id] = p.vote;
      p.vote = undefined;
    });

    // Coalition detection
    const voters = state.players.filter(p => p.isAlive && state.previousVotes![p.id]);
    for (let i = 0; i < voters.length; i++) {
        for (let j = i + 1; j < voters.length; j++) {
            const p1 = voters[i];
            const p2 = voters[j];
            if (state.previousVotes![p1.id] === state.previousVotes![p2.id]) {
                if (!p1.alliances) p1.alliances = {};
                if (!p2.alliances) p2.alliances = {};
                p1.alliances[p2.id] = (p1.alliances[p2.id] || 0) + 0.1;
                p2.alliances[p1.id] = (p2.alliances[p1.id] || 0) + 0.1;
            }
        }
    }

    const voteInfo = `(${ayeVotes} Aye, ${nayVotes} Nay)`;
    state.actionTimerEnd = Date.now() + 4000;
    this.broadcastState(roomId);

    setTimeout(async () => {
      const s = this.rooms.get(roomId);
      if (!s || s.phase !== "Voting_Reveal") return;
      s.actionTimerEnd = undefined;

      if (ayeVotes > nayVotes) {
        await this.handleElectionPassed(s, roomId, voteInfo);
      } else {
        await this.handleElectionFailed(s, roomId, voteInfo);
      }

      s.previousVotes = undefined;
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    }, 6000);
  }

  private async handleElectionPassed(s: GameState, roomId: string, voteInfo: string): Promise<void> {
    s.log.push(`The election passed! ${voteInfo}`);
    const chancellor = s.players.find(p => p.isChancellorCandidate)!;
    const president  = s.players.find(p => p.isPresidentialCandidate)!;

    if (s.stateDirectives >= 3 && chancellor.role === "Overseer") {
      s.phase = "GameOver";
      this.startActionTimer(roomId);
      s.winner = "State";
      s.winReason = "THE OVERSEER HAS ASCENDED";
      s.log.push("The Overseer was elected Chancellor! State Supremacy!");
      await this.updateUserStats(s, "State");
      return;
    }

    s.phase = "Legislative_President";
    this.resetPlayerActions(s);
    this.startActionTimer(roomId);
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

    // Ensure we have at least 4 cards to draw (important for Strategist)
    if (s.deck.length < 4) {
      if (s.discard.length > 0) {
        s.log.push("Reshuffling discard pile to ensure enough directives...");
        s.deck = shuffle([...s.deck, ...s.discard]);
        s.discard = [];
      }
    }
    
    // Check for Strategist
    if (president.titleRole === 'Strategist' && !president.titleUsed && president.isAlive) {
        s.titlePrompt = {
            playerId: president.id,
            role: 'Strategist',
            context: {},
            nextPhase: 'Legislative_President'
        };
        s.drawnPolicies = []; // Wait for ability
        this.startActionTimer(roomId);
        this.broadcastState(roomId);
    } else {
        s.drawnPolicies = s.deck.splice(0, 3);
    }
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
      this.resetPlayerActions(s);
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

    // AI comments on the failure
    this.triggerAIReactions(s, roomId, 'failed_vote');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Round End / Executive Actions
  // ═══════════════════════════════════════════════════════════════════════════

  checkRoundEnd(state: GameState, roomId: string): void {
    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: checkRoundEnd called for room ${roomId}, phase: ${state.phase}`);
    if (state.phase === "GameOver") return;
    // Only proceed if we are in the phase where declarations are expected.
    // This prevents double-triggering nextPresident if checkRoundEnd is called multiple times.
    if (state.phase !== "Legislative_Chancellor") return;

    const presidentDeclared  = state.declarations.some(d => d.type === "President");
    const chancellorDeclared = state.declarations.some(d => d.type === "Chancellor");
    if (!presidentDeclared || !chancellorDeclared) return;

    this.checkAuditorTrigger(state);
    if (state.titlePrompt) {
      this.startActionTimer(roomId);
      this.broadcastState(roomId);
    }

    // Both have declared — capture round history now that we have all the data
    if (state.lastEnactedPolicy && !state.lastEnactedPolicy.historyCaptured) {
      this.captureRoundHistory(state, state.lastEnactedPolicy.type, false);
      state.lastEnactedPolicy.historyCaptured = true;
      state.lastGovernmentVotes = undefined; // safe to clear now
    }

    // Any pending title prompt (including Auditor, which has no nextPhase) must block
    // all further round progression — the old guard only checked for nextPhase, so Auditor
    // fell through and Executive_Action overwrote the prompt, hanging the UI.
    if (state.titlePrompt) return;

    // Assassin power
    const president = state.players[state.presidentIdx];
    if (president.titleRole === 'Assassin' && !president.titleUsed && president.isAlive) {
      state.titlePrompt = { playerId: president.id, role: 'Assassin', context: {}, nextPhase: 'Election' };
      state.phase = 'Assassin_Action';
      this.startActionTimer(roomId);
      this.broadcastState(roomId);
      this.processAITurns(roomId);
      return;
    }

    updateSuspicionFromDeclarations(state);
    const action = getExecutiveAction(state);

    if (action !== "None" && state.lastExecutiveActionStateCount !== state.stateDirectives) {
      state.lastExecutiveActionStateCount = state.stateDirectives;
      if (action === "PolicyPeek") {
        const top3 = state.deck.slice(0, 3);
        if (state.presidentId) {
          this.io.to(state.presidentId).emit("policyPeekResult", top3);
        }
        state.log.push(
          `${state.players.find(p => p.id === state.presidentId)?.name} previewed the top 3 directives.`
        );
        this.nextPresident(state, roomId, true);
        return;
      }

      state.phase = "Executive_Action";
      this.resetPlayerActions(state);
      this.startActionTimer(roomId);
      state.currentExecutiveAction = action;
      state.log.push(`Executive Action: ${action}`);
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
    }

    this.broadcastState(roomId);
    state.currentExecutiveAction = "None";
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
            investigationRole === "State" ? CHAT.investigateState : CHAT.investigateCivil,
            target.name
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
      this.checkAuditorTrigger(state);
      state.chancellorPolicies = [];
      state.vetoRequested = false;
      if (state.titlePrompt) {
        this.startActionTimer(roomId);
        this.broadcastState(roomId);
      }

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
    state.rejectedChancellorId = undefined;
    state.detainedPlayerId = undefined;
    this.resetPlayerActions(state);

    if (isSuccessfulGovernment) {
      const prevPresPlayer = state.players.find(p => p.isPresident);
      const prevChanPlayer = state.players.find(p => p.isChancellor);
      state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      if (prevPresPlayer) prevPresPlayer.wasPresident = true;
      if (prevChanPlayer) prevChanPlayer.wasChancellor = true;
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

    // Reshuffle if fewer than 4 cards remain before the round starts
    if (state.deck.length < 4) {
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

    // Random AI banter at round start
    if (Math.random() > 0.6) {
      const aiAlive = state.players.filter(p => p.isAI && p.isAlive);
      if (aiAlive.length > 0) {
        const commentator = aiAlive[Math.floor(Math.random() * aiAlive.length)];
        setTimeout(() => {
          if (!state.isPaused) {
            this.postAIChat(state, commentator, CHAT.banter);
            this.broadcastState(roomId);
          }
        }, 2000);
      }
    }

    const oldIdx = state.presidentIdx;
    do {
      if (state.presidentialOrder) {
        const currentId = state.players[state.presidentIdx].id;
        const currentIndexInOrder = state.presidentialOrder.indexOf(currentId);
        const nextIndexInOrder = (currentIndexInOrder + 1) % state.presidentialOrder.length;
        const nextId = state.presidentialOrder[nextIndexInOrder];
        state.presidentIdx = state.players.findIndex(p => p.id === nextId);
      } else {
        state.presidentIdx = (state.presidentIdx + 1) % state.players.length;
      }
    } while (!state.players[state.presidentIdx].isAlive);
    
    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: President index was ${oldIdx}, now ${state.presidentIdx}, player: ${state.players[state.presidentIdx].name}`);

    const handler = state.players.find(p => p.titleRole === 'Handler' && !p.titleUsed && p.isAlive);
    const interdictor = state.players.find(p => p.titleRole === 'Interdictor' && !p.titleUsed && p.isAlive);
    
    if (process.env.NODE_ENV !== 'production') state.log.push(`DEBUG: Handler found: ${handler?.name}, Interdictor found: ${interdictor?.name}`);

    if (handler) {
      state.phase = "Nomination_Review";
      state.titlePrompt = {
        playerId: handler.id,
        role: 'Handler',
        context: {},
        nextPhase: 'Election'
      };
      this.startActionTimer(roomId);
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    } else if (interdictor && interdictor.id !== state.players[state.presidentIdx].id) {
      state.phase = "Nomination_Review";
      state.titlePrompt = {
        playerId: interdictor.id,
        role: 'Interdictor',
        context: {},
        nextPhase: 'Election'
      };
      this.startActionTimer(roomId);
      this.broadcastState(roomId);
      this.processAITurns(roomId);
    } else {
      this.startElection(state, roomId);
    }
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

    if (state.players.length < state.maxPlayers && state.mode !== 'Ranked') {
      this.fillWithAI(roomId);
      return;
    }

    const numPlayers = state.players.length;
    const roles = assignRoles(numPlayers);
    state.players.forEach((p, i) => (p.role = roles[i]));
    this.assignTitleRoles(state);

    state.phase = "Election";
    state.presidentialOrder = state.players.map(p => p.id);
    state.declarations = [];
    state.log.push(`--- Round ${state.round} Started ---`);

    // Reshuffle if fewer than 4 cards remain (though deck is full at start)
    if (state.deck.length < 4) {
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
      if (state.phase === "Lobby" || state.phase === "GameOver") {
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
    console.log(`[DEBUG] checkVictory: roomId=${roomId}, phase=${state.phase}, civil=${state.civilDirectives}, state=${state.stateDirectives}`);
    if (state.phase === "GameOver") return;
    if (state.civilDirectives >= 5) {
      console.log(`[DEBUG] checkVictory: Civil victory`);
      state.phase    = "GameOver";
      state.winner = "Civil";
      state.winReason = "CHARTER RESTORED";
      state.log.push("5 Civil directives enacted! Charter Restored!");
      await this.updateUserStats(state, "Civil");
      await incrementGlobalWin("Civil");
    } else if (state.stateDirectives >= 6) {
      console.log(`[DEBUG] checkVictory: State victory`);
      state.phase    = "GameOver";
      state.winner = "State";
      state.winReason = "STATE SUPREMACY";
      state.log.push("6 State directives enacted! State Supremacy!");
      await this.updateUserStats(state, "State");
      await incrementGlobalWin("State");
    }
    console.log(`[DEBUG] checkVictory: completed`);
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
        user.stats.elo    += state.mode === "Ranked" ? 20 : 0;
        user.stats.points += state.mode === "Ranked" ? 100 : 40;
      } else {
        user.stats.losses++;
        user.stats.elo    = state.mode === "Ranked" ? Math.max(0, user.stats.elo - 20) : user.stats.elo;
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
