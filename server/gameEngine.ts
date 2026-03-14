/**
 * gameEngine.ts — The Assembly Game Engine (Rewrite)
 *
 * Design principles:
 *  - One canonical phase-transition path: every phase change goes through enterPhase().
 *  - AI turns fire exactly once per phase entry via scheduleAITurns(), never recursively.
 *  - Only one action timer is live per room at a time.
 *  - No setTimeout-based polling loops or nested retry chains.
 *  - Title abilities (Assassin, Strategist, Broker, Handler, Auditor, Interdictor)
 *    are resolved in a clean, ordered sequence via runPostRoundTitleAbilities().
 *  - Round history and suspicion updates happen at well-defined checkpoints only.
 */

import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import {
  GameState, Player, Policy, ExecutiveAction, TitleRole, GamePhase,
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

export type Deps = { io: Server };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[Math.floor(Math.random() * arr.length)];
}

function addLog(s: GameState, msg: string): void {
  s.log.push(msg);
}

function ensureDeckHas(s: GameState, n: number): void {
  if (s.deck.length < n && s.discard.length > 0) {
    s.deck = shuffle([...s.deck, ...s.discard]);
    s.discard = [];
    addLog(s, "Reshuffled discard pile into deck.");
  }
}

// ---------------------------------------------------------------------------
// GameEngine
// ---------------------------------------------------------------------------

export class GameEngine {
  private io: Server;
  readonly rooms: Map<string, GameState> = new Map();

  /** One action-timeout handle per room. */
  private actionTimers: Map<string, ReturnType<typeof setTimeout>>  = new Map();
  /** One pause-countdown handle per room. */
  private pauseTimers:  Map<string, ReturnType<typeof setInterval>> = new Map();
  /** Lobby countdown handles (kept for API compatibility). */
  private lobbyTimers:  Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor({ io }: Deps) {
    this.io = io;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public surface — called from server.ts socket handlers
  // ═══════════════════════════════════════════════════════════════════════════

  broadcastState(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    // Roles are hidden until game over
    const publicState = {
      ...state,
      players: state.players.map(p => {
        const { role, ...rest } = p;
        return state.phase === "GameOver" ? { ...rest, role } : rest;
      }),
    };
    this.io.to(roomId).emit("gameStateUpdate", publicState);

    // Send each human player their own private role info
    for (const p of state.players) {
      if (p.isAI || !p.role) continue;
      const stateAgents = state.players
        .filter(pl => pl.role === "State" || pl.role === "Overseer")
        .map(pl => ({ id: pl.id, name: pl.name, role: pl.role! }));

      if (p.role === "State") {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents, titleRole: p.titleRole });
      } else if (p.role === "Overseer" && state.players.length <= 6) {
        this.io.to(p.id).emit("privateInfo", { role: p.role, stateAgents, titleRole: p.titleRole });
      } else {
        this.io.to(p.id).emit("privateInfo", { role: p.role, titleRole: p.titleRole });
      }
    }
  }

  public resetPlayerActions(s: GameState): void {
    for (const p of s.players) {
      p.isPresidentialCandidate = false;
      p.isChancellorCandidate   = false;
      p.isPresident             = false;
      p.isChancellor            = false;
    }
  }

  public resetPlayerHasActed(s: GameState): void {
    for (const p of s.players) p.hasActed = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Action Timer — only one live per room
  // ═══════════════════════════════════════════════════════════════════════════

  startActionTimer(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.actionTimer === 0 || state.phase === "Lobby" || state.phase === "GameOver") {
      if (state) state.actionTimerEnd = undefined;
      this.clearActionTimer(roomId);
      return;
    }

    this.clearActionTimer(roomId);
    state.actionTimerEnd = Date.now() + state.actionTimer * 1000;

    const handle = setTimeout(async () => {
      this.actionTimers.delete(roomId);
      const s = this.rooms.get(roomId);
      if (!s || s.phase === "Lobby" || s.phase === "GameOver" || s.isPaused) return;
      s.actionTimerEnd = undefined;
      await this.onActionTimerExpired(s, roomId);
    }, state.actionTimer * 1000);

    this.actionTimers.set(roomId, handle);
  }

  private clearActionTimer(roomId: string): void {
    const h = this.actionTimers.get(roomId);
    if (h !== undefined) { clearTimeout(h); this.actionTimers.delete(roomId); }
  }

  private async onActionTimerExpired(s: GameState, roomId: string): Promise<void> {
    // Title ability prompts always take priority
    if (s.titlePrompt) {
      await this.resolveTitleAbility(s, roomId, { use: false });
      return;
    }

    switch (s.phase) {
      case "Nominate_Chancellor": {
        const president = s.players[s.presidentIdx];
        let eligible = this.getEligibleChancellors(s, president.id);
        if (eligible.length === 0) eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
        const target = pick(eligible);
        if (target) {
          target.isChancellorCandidate = true;
          addLog(s, `[Timer] ${president.name} timed out. ${target.name} auto-nominated.`);
          this.advanceToVotingOrBroker(s, roomId);
        }
        break;
      }
      case "Voting": {
        for (const p of s.players) {
          if (p.isAlive && !p.vote && p.id !== s.detainedPlayerId) {
            p.vote = Math.random() > 0.3 ? "Aye" : "Nay";
          }
        }
        addLog(s, "[Timer] Voting timed out. Remaining votes auto-cast.");
        this.tallyVotes(s, roomId);
        break;
      }
      case "Legislative_President": {
        const president = s.players.find(p => p.isPresident);
        if (president && s.drawnPolicies.length > 0) {
          s.presidentSaw = [...s.drawnPolicies];
          while (s.drawnPolicies.length > 2) {
            const i = Math.floor(Math.random() * s.drawnPolicies.length);
            s.discard.push(s.drawnPolicies.splice(i, 1)[0]);
          }
          s.chancellorPolicies = [...s.drawnPolicies];
          s.chancellorSaw      = [...s.chancellorPolicies];
          s.drawnPolicies      = [];
          s.presidentTimedOut  = true;
          addLog(s, `[Timer] ${president.name} timed out. Random directive discarded.`);
          this.enterPhase(s, roomId, "Legislative_Chancellor");
        }
        break;
      }
      case "Legislative_Chancellor": {
        if (s.lastEnactedPolicy) {
          // Policy already enacted; auto-declare for whoever hasn't yet
          s.presidentTimedOut  = true;
          s.chancellorTimedOut = true;
          this.autoDeclareMissing(s, roomId);
        } else {
          const chancellor = s.players.find(p => p.isChancellor);
          if (chancellor && s.chancellorPolicies.length > 0) {
            const idx    = Math.floor(Math.random() * s.chancellorPolicies.length);
            const played = s.chancellorPolicies.splice(idx, 1)[0];
            s.discard.push(...s.chancellorPolicies);
            s.chancellorPolicies = [];
            s.chancellorTimedOut = true;
            addLog(s, `[Timer] ${chancellor.name} timed out. Random directive enacted.`);
            this.enactPolicy(s, roomId, played, false, chancellor.id);
          }
        }
        break;
      }
      case "Executive_Action": {
        const president = s.players.find(p => p.isPresident);
        if (president) {
          const eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
          const target   = pick(eligible);
          if (target) {
            addLog(s, `[Timer] ${president.name} timed out. Random target selected.`);
            await this.applyExecutiveAction(s, roomId, target.id);
          }
        }
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase Management — single canonical entry point for all transitions
  // ═══════════════════════════════════════════════════════════════════════════

  private enterPhase(s: GameState, roomId: string, phase: GamePhase): void {
    if (s.phase === "GameOver") return;
    s.phase = phase;
    this.resetPlayerHasActed(s);
    this.startActionTimer(roomId);
    this.broadcastState(roomId);
    this.scheduleAITurns(s, roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI Turn Scheduling — fires once per phase entry, never recursively
  // ═══════════════════════════════════════════════════════════════════════════

  scheduleAITurns(s: GameState, roomId: string): void {
    if (s.phase === "Lobby" || s.phase === "GameOver" || s.isPaused) return;
    setTimeout(() => {
      const st = this.rooms.get(roomId);
      if (!st || st.isPaused || st.phase === "Lobby" || st.phase === "GameOver") return;
      this.runAITurn(st, roomId);
    }, 2000);
  }

  /** Public alias used by server.ts */
  processAITurns(roomId: string): void {
    const s = this.rooms.get(roomId);
    if (s) this.scheduleAITurns(s, roomId);
  }

  private async runAITurn(s: GameState, roomId: string): Promise<void> {
    // Title ability prompt takes priority over everything else
    if (s.titlePrompt) {
      const holder = s.players.find(p => p.id === s.titlePrompt!.playerId);
      if (holder?.isAI) await this.aiDecideTitleAbility(s, roomId);
      return;
    }

    if (s.vetoRequested) {
      await this.aiVetoResponse(s, roomId);
      return;
    }

    switch (s.phase) {
      case "Nominate_Chancellor": {
        const president = s.players[s.presidentIdx];
        if (president.isAI) this.aiNominateChancellor(s, roomId);
        break;
      }
      case "Voting":
        this.aiCastVotes(s, roomId);
        break;
      case "Legislative_President": {
        const president = s.players.find(p => p.isPresident);
        if (president?.isAI) this.aiPresidentDiscard(s, roomId);
        break;
      }
      case "Legislative_Chancellor": {
        const chancellor = s.players.find(p => p.isChancellor);
        if (chancellor?.isAI) this.aiChancellorPlay(s, roomId);
        break;
      }
      case "Executive_Action": {
        const president = s.players.find(p => p.isPresident);
        if (president?.isAI) await this.aiExecutiveAction(s, roomId);
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Game Start & Room Management
  // ═══════════════════════════════════════════════════════════════════════════

  fillWithAI(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const takenNames = new Set(state.players.map(p => p.name.replace(" (AI)", "")));
    const available  = AI_BOTS.filter(b => !takenNames.has(b.name));

    while (state.players.length < state.maxPlayers && available.length > 0) {
      const bot = available.splice(Math.floor(Math.random() * available.length), 1)[0];
      state.players.push({
        id:                      `ai-${randomUUID()}`,
        name:                    `${bot.name} (AI)`,
        avatarUrl:               bot.avatarUrl,
        personality:             bot.personality,
        isAlive:                 true,
        isPresidentialCandidate: false,
        isChancellorCandidate:   false,
        isPresident:             false,
        isChancellor:            false,
        wasPresident:            false,
        wasChancellor:           false,
        isAI:                    true,
      });
    }

    this.startGame(roomId);
  }

  startGame(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.phase !== "Lobby") return;

    if (state.players.length < state.maxPlayers && state.mode !== "Ranked") {
      this.fillWithAI(roomId);
      return;
    }

    const roles = assignRoles(state.players.length);
    state.players.forEach((p, i) => (p.role = roles[i]));
    this.assignTitleRoles(state);
    initializeSuspicion(state);

    state.presidentialOrder = state.players.map(p => p.id);
    state.declarations      = [];
    state.round             = 0;  // nextRound increments to 1 on first call
    state.lastPresidentIdx  = -1;

    // Pick a random starting president, then point presidentIdx one step
    // behind so that advancePresidentIdx() inside nextRound() lands on them.
    const orderLen  = state.presidentialOrder.length;
    const startPos  = Math.floor(Math.random() * orderLen);
    const prevPos   = (startPos - 1 + orderLen) % orderLen;
    const prevId    = state.presidentialOrder[prevPos];
    const prevIdx   = state.players.findIndex(p => p.id === prevId);
    state.presidentIdx = prevIdx !== -1 ? prevIdx : 0;

    addLog(state, "Game started! Roles assigned.");
    this.nextRound(state, roomId, false);
  }

  private assignTitleRoles(state: GameState): void {
    const n      = state.players.length;
    const count  = n <= 6 ? 2 : n <= 8 ? 3 : 4;
    const titles = shuffle<TitleRole>(["Assassin", "Strategist", "Broker", "Handler", "Auditor", "Interdictor"]);
    const players = shuffle([...state.players]);
    for (let i = 0; i < count; i++) {
      players[i].titleRole = titles[i];
      players[i].titleUsed = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Presidential Rotation
  // ═══════════════════════════════════════════════════════════════════════════

  private advancePresidentIdx(state: GameState): void {
    let safety = state.players.length + 1;
    do {
      if (state.presidentialOrder) {
        const curId  = state.players[state.presidentIdx]?.id;
        const curPos = state.presidentialOrder.indexOf(curId);
        const nextId = state.presidentialOrder[(curPos + 1) % state.presidentialOrder.length];
        const found  = state.players.findIndex(p => p.id === nextId);
        if (found !== -1) state.presidentIdx = found;
      } else {
        state.presidentIdx = (state.presidentIdx + 1) % state.players.length;
      }
      safety--;
    } while (
      safety > 0 &&
      (!state.players[state.presidentIdx] || !state.players[state.presidentIdx].isAlive)
    );

    if (safety <= 0) addLog(state, "[ERROR] No alive player found for President. Aborting.");
  }

  /**
   * End the current government, advance the president pointer, increment round,
   * then start the next nomination.
   */
  private nextRound(state: GameState, roomId: string, successfulGovernment = false): void {
    if (state.phase === "GameOver") return;

    state.vetoRequested        = false;
    state.rejectedChancellorId = undefined;
    state.detainedPlayerId     = undefined;

    if (successfulGovernment) {
      const prevPres = state.players.find(p => p.isPresident);
      const prevChan = state.players.find(p => p.isChancellor);
      state.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });
      if (prevPres) prevPres.wasPresident = true;
      if (prevChan) prevChan.wasChancellor = true;
    }

    this.resetPlayerActions(state);

    // If returning from a special election, restore the normal rotation origin
    if (state.lastPresidentIdx !== -1) {
      state.presidentIdx     = state.lastPresidentIdx;
      state.lastPresidentIdx = -1;
    }

    this.advancePresidentIdx(state);
    state.round++;
    addLog(state, `--- Round ${state.round} Started ---`);

    state.messages.push({
      sender: "System",
      text:   `Round ${state.round} Started`,
      timestamp: Date.now(),
      type:   "round_separator",
      round:  state.round,
    });

    ensureDeckHas(state, 4);

    // Occasional AI banter at round start
    if (Math.random() > 0.6) {
      const commentator = pick(state.players.filter(p => p.isAI && p.isAlive));
      if (commentator) {
        setTimeout(() => {
          if (!state.isPaused) {
            this.postAIChat(state, commentator, CHAT.banter);
            this.broadcastState(roomId);
          }
        }, 2000);
      }
    }

    this.beginNomination(state, roomId);
  }

  // Public alias used by old call-sites in server.ts
  nextPresident(state: GameState, roomId: string, successfulGovernment = false): void {
    this.nextRound(state, roomId, successfulGovernment);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Election Phase
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a nomination: set the presidential candidate, check for Interdictor.
   */
  private beginNomination(state: GameState, roomId: string): void {
    this.resetPlayerActions(state);
    state.declarations       = [];
    state.presidentTimedOut  = false;
    state.chancellorTimedOut = false;
    state.drawnPolicies      = [];
    state.chancellorPolicies = [];
    state.presidentSaw       = undefined;
    state.chancellorSaw      = undefined;
    state.lastEnactedPolicy  = undefined;
    state.isStrategistAction = undefined as any;

    state.players[state.presidentIdx].isPresidentialCandidate = true;
    addLog(state, `${state.players[state.presidentIdx].name} is the Presidential Candidate.`);

    // Check for an unused Interdictor (cannot be the incoming president)
    const interdictor = state.players.find(
      p => p.titleRole === "Interdictor" && !p.titleUsed && p.isAlive &&
           p.id !== state.players[state.presidentIdx].id,
    );

    if (interdictor) {
      state.titlePrompt = { playerId: interdictor.id, role: "Interdictor", context: {}, nextPhase: "Nominate_Chancellor" };
      this.enterPhase(state, roomId, "Nomination_Review");
    } else {
      this.enterPhase(state, roomId, "Nominate_Chancellor");
    }
  }

  // Public alias used by server.ts
  startNomination(state: GameState, roomId: string): void {
    this.beginNomination(state, roomId);
  }

  private getEligibleChancellors(s: GameState, presidentId: string): Player[] {
    const alive = s.players.filter(p => p.isAlive).length;
    return s.players.filter(p =>
      p.isAlive &&
      p.id !== presidentId &&
      p.id !== s.rejectedChancellorId &&
      p.id !== s.detainedPlayerId &&
      !p.wasChancellor &&
      !(alive > 5 && p.wasPresident),
    );
  }

  private advanceToVotingOrBroker(s: GameState, roomId: string): void {
    const broker = s.players.find(p => p.titleRole === "Broker" && !p.titleUsed && p.isAlive);
    if (broker) {
      s.titlePrompt = { playerId: broker.id, role: "Broker", context: {}, nextPhase: "Voting" };
      this.enterPhase(s, roomId, "Nomination_Review");
    } else {
      this.enterPhase(s, roomId, "Voting");
    }
  }

  nominateChancellor(s: GameState, roomId: string, chancellorId: string, presidentSocketId: string): void {
    const president = s.players[s.presidentIdx];
    if (president.id !== presidentSocketId || !president.isAlive || president.hasActed) return;
    president.hasActed = true;

    const chancellor = s.players.find(p => p.id === chancellorId);
    if (!chancellor || !chancellor.isAlive || chancellor.id === president.id) return;
    if (s.rejectedChancellorId === chancellor.id) return;
    if (s.detainedPlayerId    === chancellor.id) return;

    const alive = s.players.filter(p => p.isAlive).length;
    if (chancellor.wasChancellor || (alive > 5 && chancellor.wasPresident)) return;

    s.players.forEach(p => (p.isChancellorCandidate = false));
    chancellor.isChancellorCandidate = true;
    addLog(s, `${president.name} nominated ${chancellor.name} for Chancellor.`);
    updateSuspicionFromNomination(s, president.id, chancellor.id);
    this.triggerAIReactions(s, roomId, "nomination", { targetId: chancellor.id });
    this.advanceToVotingOrBroker(s, roomId);
  }

  // ─── Voting ────────────────────────────────────────────────────────────────

  private tallyVotes(s: GameState, roomId: string): void {
    if (!s.previousVotes) s.previousVotes = {};
    for (const p of s.players) {
      if (p.vote) s.previousVotes[p.id] = p.vote;
    }

    // Coalition tracking
    const voters = s.players.filter(p => p.isAlive && s.previousVotes![p.id]);
    for (let i = 0; i < voters.length; i++) {
      for (let j = i + 1; j < voters.length; j++) {
        const [p1, p2] = [voters[i], voters[j]];
        if (s.previousVotes![p1.id] === s.previousVotes![p2.id]) {
          if (!p1.alliances) p1.alliances = {};
          if (!p2.alliances) p2.alliances = {};
          p1.alliances[p2.id] = (p1.alliances[p2.id] ?? 0) + 0.1;
          p2.alliances[p1.id] = (p2.alliances[p1.id] ?? 0) + 0.1;
        }
      }
    }

    const aye = s.players.filter(p => p.vote === "Aye").length;
    const nay = s.players.filter(p => p.vote === "Nay").length;
    s.players.forEach(p => (p.vote = undefined));

    // Show the reveal for 4 seconds, then process the result
    s.actionTimerEnd = Date.now() + 4000;
    this.enterPhase(s, roomId, "Voting_Reveal");

    setTimeout(async () => {
      const st = this.rooms.get(roomId);
      if (!st || st.phase !== "Voting_Reveal") return;
      st.actionTimerEnd = undefined;
      const votes = st.previousVotes;
      st.previousVotes = undefined;

      if (aye > nay) {
        await this.electionPassed(st, roomId, aye, nay, votes ?? {});
      } else {
        await this.electionFailed(st, roomId, aye, nay, votes ?? {});
      }
    }, 4000);
  }

  /** Public alias used by server.ts vote handler */
  handleVoteResult(s: GameState, roomId: string, aye: number, nay: number): void {
    this.tallyVotes(s, roomId);
  }

  private async electionPassed(
    s: GameState, roomId: string, aye: number, nay: number,
    votes: Record<string, "Aye" | "Nay">,
  ): Promise<void> {
    addLog(s, `Election passed! (${aye} Aye, ${nay} Nay)`);

    const chancellor = s.players.find(p => p.isChancellorCandidate);
    const president  = s.players.find(p => p.isPresidentialCandidate);
    if (!chancellor || !president) {
      addLog(s, "[ERROR] electionPassed: missing candidates.");
      this.nextRound(s, roomId, false);
      return;
    }

    // Overseer wins by being elected chancellor after 3 State directives
    if (s.stateDirectives >= 3 && chancellor.role === "Overseer") {
      addLog(s, "The Overseer was elected Chancellor — State Supremacy!");
      await this.endGame(s, roomId, "State", "THE OVERSEER HAS ASCENDED");
      return;
    }

    this.resetPlayerActions(s);
    s.players.forEach(p => { p.isPresident = false; p.isChancellor = false; });
    president.isPresident   = true;
    chancellor.isChancellor = true;
    s.presidentId           = president.id;
    s.chancellorId          = chancellor.id;
    s.electionTracker       = 0;

    s.lastGovernmentVotes        = { ...votes };
    s.lastGovernmentPresidentId  = president.id;
    s.lastGovernmentChancellorId = chancellor.id;
    updateSuspicionFromNomination(s, president.id, chancellor.id);

    ensureDeckHas(s, 4);
    if (s.deck.length === 0) {
      addLog(s, "[ERROR] Deck empty after reshuffle. Skipping to next round.");
      this.nextRound(s, roomId, true);
      return;
    }

    // Strategist draws 4 instead of 3
    if (president.titleRole === "Strategist" && !president.titleUsed) {
      s.titlePrompt   = { playerId: president.id, role: "Strategist", context: {}, nextPhase: "Legislative_President" };
      s.drawnPolicies = [];
      this.enterPhase(s, roomId, "Legislative_President");
    } else {
      s.drawnPolicies = s.deck.splice(0, 3);
      this.enterPhase(s, roomId, "Legislative_President");
    }
  }

  private async electionFailed(
    s: GameState, roomId: string, aye: number, nay: number,
    votes: Record<string, "Aye" | "Nay">,
  ): Promise<void> {
    addLog(s, `Election failed! (${aye} Aye, ${nay} Nay)`);

    const presPlayer = s.players[s.presidentIdx];
    const chanPlayer = s.players.find(p => p.isChancellorCandidate);
    if (!s.roundHistory) s.roundHistory = [];
    s.roundHistory.push({
      round:          s.round,
      presidentName:  presPlayer?.name ?? "?",
      chancellorName: chanPlayer?.name ?? "?",
      failed:         true,
      failReason:     "vote",
      votes: Object.entries(votes).map(([pid, v]) => {
        const pl = s.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v };
      }),
    });

    s.electionTracker++;
    if (s.electionTracker >= 3) {
      await this.enactChaosPolicy(s, roomId);
    } else {
      this.triggerAIReactions(s, roomId, "failed_vote");
      this.nextRound(s, roomId, false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Legislative Phase
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Central policy-enactment dispatcher.
   * Waits 6 s for the animation, updates counts, checks victory,
   * then routes to declarations (normal) or chaos next-round.
   */
  private enactPolicy(
    s: GameState, roomId: string, policy: Policy, isChaos: boolean, playerId?: string,
  ): void {
    // Broadcast the played card for the animation — tracker not updated yet
    this.broadcastState(roomId);

    setTimeout(async () => {
      const st = this.rooms.get(roomId);
      if (!st || st.isPaused) return;

      if (policy === "Civil") {
        st.civilDirectives++;
        addLog(st, "A Civil directive was enacted.");
      } else {
        st.stateDirectives++;
        addLog(st, `A State directive was enacted. Total: ${st.stateDirectives}`);
        if (st.stateDirectives >= 5) st.vetoUnlocked = true;
      }

      // Set lastEnactedPolicy only after the tracker is updated so clients
      // don't receive the declaration prompt until the directive is registered
      st.lastEnactedPolicy = { type: policy, timestamp: Date.now(), playerId };

      updateSuspicionFromPolicy(st, policy);
      updateSuspicionFromPolicyExpectation(st, policy);

      if (await this.checkVictory(st, roomId)) return;

      if (isChaos) {
        this.captureRoundHistory(st, policy, true);
        this.nextRound(st, roomId, false);
      } else {
        // Wait for both players to declare before running end-of-round logic
        this.scheduleAutoDeclarations(st, roomId);
      }
    }, 6000);
  }

  /** Public alias retained for server.ts compatibility */
  triggerPolicyEnactment(
    s: GameState, roomId: string, policy: Policy, isChaos = false, playerId?: string,
  ): void {
    this.enactPolicy(s, roomId, policy, isChaos, playerId);
  }

  private async enactChaosPolicy(s: GameState, roomId: string): Promise<void> {
    addLog(s, "Election tracker hit 3 — Chaos directive enacted!");
    s.electionTracker = 0;
    s.players.forEach(p => { p.wasPresident = false; p.wasChancellor = false; });

    ensureDeckHas(s, 1);
    if (s.deck.length === 0) {
      addLog(s, "[ERROR] Deck empty. Skipping chaos policy.");
      this.nextRound(s, roomId, false);
      return;
    }

    const policy = s.deck.shift()!;
    this.resetPlayerActions(s);
    this.enactPolicy(s, roomId, policy, true);
    this.broadcastState(roomId);
  }

  // ─── Declarations ─────────────────────────────────────────────────────────

  /**
   * After policy enactment, schedule a single auto-declare pass.
   * Human players declare via socket; AI players and timed-out players are handled here.
   */
  private scheduleAutoDeclarations(s: GameState, roomId: string): void {
    setTimeout(() => {
      const st = this.rooms.get(roomId);
      if (!st || st.phase !== "Legislative_Chancellor") return;
      this.autoDeclareMissing(st, roomId);
    }, 1500);
  }

  private autoDeclareMissing(s: GameState, roomId: string): void {
    if (s.phase !== "Legislative_Chancellor") return;

    const president  = s.players.find(p => p.isPresident);
    const chancellor = s.players.find(p => p.isChancellor);
    if (!president || !chancellor) return;

    const presDeclared = s.declarations.some(d => d.type === "President");
    const chanDeclared = s.declarations.some(d => d.type === "Chancellor");

    if (!presDeclared && (president.isAI  || s.presidentTimedOut))  this.generateDeclaration(s, roomId, president,  "President");
    if (!chanDeclared && (chancellor.isAI || s.chancellorTimedOut)) this.generateDeclaration(s, roomId, chancellor, "Chancellor");
  }

  /** Generate and record an AI or auto-declaration (with possible lying). */
  private generateDeclaration(
    s: GameState, roomId: string, player: Player, type: "President" | "Chancellor",
  ): void {
    if (s.declarations.some(d => d.playerId === player.id && d.type === type)) return;

    const saw     = s.chancellorSaw ?? [];
    const drew    = s.presidentSaw  ?? [];
    let civ       = saw.filter(p => p === "Civil").length;
    let sta       = saw.filter(p => p === "State").length;
    const drewCiv = drew.filter(p => p === "Civil").length;
    const drewSta = drew.filter(p => p === "State").length;

    const presIsState = s.players.find(p => p.isPresident)?.role  !== "Civil";
    const chanIsState = s.players.find(p => p.isChancellor)?.role !== "Civil";
    const bothState   = presIsState && chanIsState;
    const enacted     = s.lastEnactedPolicy?.type;

    if (bothState && enacted === "State") {
      if (type === "President") {
        if      (sta === 2 && Math.random() > 0.5) { civ = 1; sta = 1; }
        else if (sta === 1 && Math.random() > 0.5) { civ = 0; sta = 2; }
        s.pendingChancellorClaim = { civ, sta };
      } else {
        if (s.pendingChancellorClaim) {
          ({ civ, sta } = s.pendingChancellorClaim);
          s.pendingChancellorClaim = undefined;
        }
      }
    } else {
      let lie = false;
      if (player.role !== "Civil") {
        if      (player.personality === "Deceptive")  lie = true;
        else if (player.personality === "Aggressive")  lie = Math.random() > 0.2;
        else if (player.personality === "Strategic")   lie = (s.stateDirectives ?? 0) >= 2;
        else if (player.personality === "Chaotic")     lie = Math.random() > 0.5;
      }
      if (lie && civ > 0) { civ--; sta++; }
    }

    s.declarations.push({
      playerId:   player.id,
      playerName: player.name,
      civ, sta,
      ...(type === "President" ? { drewCiv, drewSta } : {}),
      type,
      timestamp:  Date.now(),
    });

    const verb   = type === "President" ? "passed" : "received";
    const drewStr = type === "President" ? ` (drew ${drewCiv}C/${drewSta}S)` : "";
    addLog(s, `${player.name} (${type}) declared ${verb} ${civ}C/${sta}S.${drewStr}`);

    if (player.isAI && enacted === "State" && Math.random() > 0.4) {
      setTimeout(() => {
        if (s.isPaused) return;
        const lines = type === "Chancellor"
          ? (player.role === "Civil" ? CHAT.chanCivilStateEnacted : CHAT.chanStateStateEnacted)
          : (player.role === "Civil" ? CHAT.presCivilStateEnacted : CHAT.presStateStateEnacted);
        this.postAIChat(s, player, lines);
        this.broadcastState(roomId);
      }, 1200);
    }

    this.broadcastState(roomId);

    const presDecl = s.declarations.some(d => d.type === "President");
    const chanDecl = s.declarations.some(d => d.type === "Chancellor");
    if (presDecl && chanDecl) this.onBothDeclared(s, roomId);
  }

  /** Called once both players have declared — runs suspicion, history, then title abilities. */
  private onBothDeclared(s: GameState, roomId: string): void {
    if (s.phase !== "Legislative_Chancellor") return;
    if (!s.lastEnactedPolicy) return;

    updateSuspicionFromDeclarations(s);

    if (!s.lastEnactedPolicy.historyCaptured) {
      this.captureRoundHistory(s, s.lastEnactedPolicy.type, false);
      s.lastEnactedPolicy.historyCaptured = true;
      s.lastGovernmentVotes = undefined;
    }

    this.runPostRoundTitleAbilities(s, roomId);
  }

  /** Public alias used by server.ts declarePolicies handler */
  checkRoundEnd(s: GameState, roomId: string): void {
    const presDecl = s.declarations.some(d => d.type === "President");
    const chanDecl = s.declarations.some(d => d.type === "Chancellor");
    if (presDecl && chanDecl) this.onBothDeclared(s, roomId);
  }

  // ─── Post-round title abilities ────────────────────────────────────────────

  /**
   * After declarations, run title abilities in order: Auditor → Assassin → Handler.
   * Each ability sets titlePrompt and returns; resolution calls runExecutiveAction.
   */
  private runPostRoundTitleAbilities(s: GameState, roomId: string): void {
    if (s.phase === "GameOver") return;

    const auditor = s.players.find(p => p.titleRole === "Auditor" && !p.titleUsed && p.isAlive);
    if (auditor) {
      s.titlePrompt = { playerId: auditor.id, role: "Auditor", context: { discardPile: s.discard.slice(-3) } };
      this.enterPhase(s, roomId, "Auditor_Action");
      return;
    }

    const president = s.players[s.presidentIdx];
    if (president.titleRole === "Assassin" && !president.titleUsed && president.isAlive) {
      s.titlePrompt = { playerId: president.id, role: "Assassin", context: {}, nextPhase: "Handler_Action" };
      this.enterPhase(s, roomId, "Assassin_Action");
      return;
    }

    const handler = s.players.find(p => p.titleRole === "Handler" && !p.titleUsed && p.isAlive);
    if (handler) {
      s.titlePrompt = { playerId: handler.id, role: "Handler", context: {}, nextPhase: "Nominate_Chancellor" };
      this.enterPhase(s, roomId, "Handler_Action");
      return;
    }

    this.runExecutiveAction(s, roomId);
  }

  /** Continue post-round sequence starting after the given ability. */
  private continuePostRoundAfter(s: GameState, roomId: string, after: TitleRole): void {
    if (s.phase === "GameOver") return;

    if (after === "Auditor") {
      const president = s.players[s.presidentIdx];
      if (president.titleRole === "Assassin" && !president.titleUsed && president.isAlive) {
        s.titlePrompt = { playerId: president.id, role: "Assassin", context: {}, nextPhase: "Handler_Action" };
        this.enterPhase(s, roomId, "Assassin_Action");
        return;
      }
    }

    if (after === "Auditor" || after === "Assassin") {
      const handler = s.players.find(p => p.titleRole === "Handler" && !p.titleUsed && p.isAlive);
      if (handler) {
        s.titlePrompt = { playerId: handler.id, role: "Handler", context: {}, nextPhase: "Nominate_Chancellor" };
        this.enterPhase(s, roomId, "Handler_Action");
        return;
      }
    }

    this.runExecutiveAction(s, roomId);
  }

  // No-op stubs kept for server.ts call-site compatibility
  checkAuditorTrigger(_state: GameState): void {}
  triggerAIDeclarations(state: GameState, roomId: string): void {
    this.autoDeclareMissing(state, roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Title Ability Resolution — single handler for all abilities
  // ═══════════════════════════════════════════════════════════════════════════

  async handleTitleAbility(s: GameState, roomId: string, abilityData: any): Promise<void> {
    const prompt = s.titlePrompt;
    if (!prompt) return;

    const player = s.players.find(p => p.id === prompt.playerId);
    if (!player) { s.titlePrompt = undefined; return; }

    s.titlePrompt = undefined;

    if (abilityData.use) {
      // Only mark used and fire events when the ability is actually activated
      player.titleUsed = true;
      this.io.to(roomId).emit("powerUsed", { role: prompt.role });
      if (player.isAI) this.postAIChat(s, player, CHAT.powerUsage);
      await this.applyTitleAbility(s, roomId, player, prompt.role, abilityData);
    } else {
      // Player declined — ability is preserved for a future round
      this.onTitleAbilityDeclined(s, roomId, player, prompt.role);
    }

    this.broadcastState(roomId);
  }

  /** Alias used by old server.ts path */
  async resolveTitleAbility(s: GameState, roomId: string, abilityData: any): Promise<void> {
    await this.handleTitleAbility(s, roomId, abilityData);
  }

  private async applyTitleAbility(
    s: GameState, roomId: string, player: Player, role: TitleRole, data: any,
  ): Promise<void> {
    switch (role) {
      case "Assassin": {
        const target = s.players.find(p => p.id === data.targetId && p.isAlive);
        if (target) {
          target.isAlive = target.isPresident = target.isChancellor = false;
          target.isPresidentialCandidate = target.isChancellorCandidate = false;
          addLog(s, `${player.name} (Assassin) secretly executed ${target.name}.`);
          if (target.role === "Overseer") {
            await this.endGame(s, roomId, "Civil", "OVERSEER ASSASSINATED — CHARTER RESTORED");
            return;
          }
        }
        this.continuePostRoundAfter(s, roomId, "Assassin");
        break;
      }

      case "Strategist": {
        ensureDeckHas(s, 4);
        s.drawnPolicies      = s.deck.splice(0, 4);
        s.isStrategistAction = true as any;
        addLog(s, `${player.name} (Strategist) drew an extra directive (4 total).`);
        this.enterPhase(s, roomId, "Legislative_President");
        break;
      }

      case "Broker": {
        const candidate = s.players.find(p => p.isChancellorCandidate);
        if (candidate) {
          candidate.isChancellorCandidate = false;
          s.rejectedChancellorId = candidate.id;
          addLog(s, `${player.name} (Broker) rejected ${candidate.name} — re-nomination required.`);
        }
        // Chain to a second Broker if one exists
        const nextBroker = s.players.find(p => p.titleRole === "Broker" && !p.titleUsed && p.isAlive && p.id !== player.id);
        if (nextBroker) {
          s.titlePrompt = { playerId: nextBroker.id, role: "Broker", context: {}, nextPhase: "Voting" };
          this.enterPhase(s, roomId, "Nomination_Review");
        } else {
          this.enterPhase(s, roomId, "Nominate_Chancellor");
        }
        break;
      }

      case "Handler": {
        if (s.presidentialOrder) {
          const curId = s.players[s.presidentIdx].id;
          const cur   = s.presidentialOrder.indexOf(curId);
          const i1    = (cur + 1) % s.presidentialOrder.length;
          const i2    = (cur + 2) % s.presidentialOrder.length;
          [s.presidentialOrder[i1], s.presidentialOrder[i2]] =
            [s.presidentialOrder[i2], s.presidentialOrder[i1]];
          addLog(s, `${player.name} (Handler) swapped the next two players in presidential order.`);
        }
        this.continuePostRoundAfter(s, roomId, "Handler");
        break;
      }

      case "Auditor": {
        const last3 = s.discard.slice(-3);
        this.io.to(player.id).emit("policyPeekResult", last3);
        addLog(s, `${player.name} (Auditor) peeked at the discard pile.`);
        this.continuePostRoundAfter(s, roomId, "Auditor");
        break;
      }

      case "Interdictor": {
        const president = s.players[s.presidentIdx];
        const target = s.players.find(
          p => p.id === data.targetId && p.isAlive &&
               p.id !== president.id && p.id !== player.id,
        );
        if (target) {
          s.detainedPlayerId = target.id;
          addLog(s, `${player.name} (Interdictor) detained ${target.name} for this round.`);
        }
        const nextInterdictor = s.players.find(p => p.titleRole === "Interdictor" && !p.titleUsed && p.isAlive && p.id !== player.id);
        if (nextInterdictor) {
          s.titlePrompt = { playerId: nextInterdictor.id, role: "Interdictor", context: {}, nextPhase: "Nominate_Chancellor" };
          this.enterPhase(s, roomId, "Nomination_Review");
        } else {
          this.enterPhase(s, roomId, "Nominate_Chancellor");
        }
        break;
      }
    }
  }

  private onTitleAbilityDeclined(s: GameState, roomId: string, player: Player, role: TitleRole): void {
    switch (role) {
      case "Strategist":
        ensureDeckHas(s, 3);
        s.drawnPolicies = s.deck.splice(0, 3);
        this.enterPhase(s, roomId, "Legislative_President");
        break;
      case "Broker":
        this.enterPhase(s, roomId, "Voting");
        break;
      case "Interdictor":
        this.enterPhase(s, roomId, "Nominate_Chancellor");
        break;
      case "Assassin":
        this.continuePostRoundAfter(s, roomId, "Assassin");
        break;
      case "Handler":
        this.continuePostRoundAfter(s, roomId, "Handler");
        break;
      case "Auditor":
        this.continuePostRoundAfter(s, roomId, "Auditor");
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Executive Actions
  // ═══════════════════════════════════════════════════════════════════════════

  private runExecutiveAction(s: GameState, roomId: string): void {
    if (s.phase === "GameOver") return;

    const action = getExecutiveAction(s);

    // Only fire each action once per State directive milestone
    if (action !== "None" && s.lastExecutiveActionStateCount !== s.stateDirectives) {
      s.lastExecutiveActionStateCount = s.stateDirectives;
      s.currentExecutiveAction = action;

      if (action === "PolicyPeek") {
        const top3 = s.deck.slice(0, 3);
        if (s.presidentId) {
          this.io.to(s.presidentId).emit("policyPeekResult", top3);
          const pres = s.players.find(p => p.id === s.presidentId);
          addLog(s, `${pres?.name ?? "President"} previewed the top 3 directives.`);
        }
        this.nextRound(s, roomId, true);
        return;
      }

      addLog(s, `Executive Action unlocked: ${action}`);
      this.enterPhase(s, roomId, "Executive_Action");
    } else {
      this.nextRound(s, roomId, true);
    }
  }

  async handleExecutiveAction(s: GameState, roomId: string, targetId: string): Promise<void> {
    await this.applyExecutiveAction(s, roomId, targetId);
    this.broadcastState(roomId);
  }

  private async applyExecutiveAction(s: GameState, roomId: string, targetId: string): Promise<void> {
    const action = s.currentExecutiveAction;
    s.currentExecutiveAction = "None";

    const target = s.players.find(p => p.id === targetId && p.isAlive);
    if (!target) { this.nextRound(s, roomId, true); return; }

    if (action === "Execution") {
      await this.executePlayer(s, roomId, target);
    } else if (action === "Investigate") {
      this.investigatePlayer(s, roomId, target);
    } else if (action === "SpecialElection") {
      addLog(s, `Special Election: ${target.name} will be the next Presidential Candidate.`);
      s.lastPresidentIdx = s.presidentIdx;
      s.presidentIdx     = s.players.indexOf(target);

      // Set up nomination state directly for the special-elected president
      this.resetPlayerActions(s);
      s.players[s.presidentIdx].isPresidentialCandidate = true;
      s.declarations       = [];
      s.presidentTimedOut  = false;
      s.chancellorTimedOut = false;
      s.drawnPolicies      = [];
      s.chancellorPolicies = [];
      s.presidentSaw       = undefined;
      s.chancellorSaw      = undefined;
      s.lastEnactedPolicy  = undefined;

      // Check for Interdictor before starting nomination
      const interdictor = s.players.find(
        p => p.titleRole === "Interdictor" && !p.titleUsed && p.isAlive &&
             p.id !== s.players[s.presidentIdx].id,
      );
      if (interdictor) {
        s.titlePrompt = { playerId: interdictor.id, role: "Interdictor", context: {}, nextPhase: "Nominate_Chancellor" };
        this.enterPhase(s, roomId, "Nomination_Review");
      } else {
        this.enterPhase(s, roomId, "Nominate_Chancellor");
      }
    } else {
      this.nextRound(s, roomId, true);
    }
  }

  private async executePlayer(s: GameState, roomId: string, target: Player): Promise<void> {
    target.isAlive = false;
    target.isPresident = target.isChancellor = false;
    target.isPresidentialCandidate = target.isChancellorCandidate = false;
    addLog(s, `${target.name} was executed!`);

    const president = s.players.find(p => p.id === s.presidentId);
    if (president?.userId) {
      const u = await getUserById(president.userId);
      if (u) { u.stats.kills++; await saveUser(u); }
    }
    if (target.userId) {
      const u = await getUserById(target.userId);
      if (u) { u.stats.deaths++; await saveUser(u); }
    }

    if (target.role === "Overseer") {
      addLog(s, "The Overseer was executed — Charter Restored!");
      await this.endGame(s, roomId, "Civil", "THE OVERSEER IS ELIMINATED — CHARTER RESTORED");
    } else {
      this.nextRound(s, roomId, true);
    }
  }

  private investigatePlayer(s: GameState, roomId: string, target: Player): void {
    addLog(s, `President investigated ${target.name}.`);
    const result = target.role === "Civil" ? "Civil" : "State";

    if (s.presidentId) {
      this.io.to(s.presidentId).emit("investigationResult", { targetName: target.name, role: result });
      updateSuspicionFromInvestigation(s, s.presidentId, target.id, result);

      const pres = s.players.find(p => p.id === s.presidentId);
      if (pres?.isAI && Math.random() > 0.3) {
        setTimeout(() => {
          if (!s.isPaused) {
            this.postAIChat(s, pres, result === "State" ? CHAT.investigateState : CHAT.investigateCivil, target.name);
            this.broadcastState(roomId);
          }
        }, 1000);
      }
    }

    this.nextRound(s, roomId, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Veto
  // ═══════════════════════════════════════════════════════════════════════════

  handleVetoResponse(s: GameState, roomId: string, player: Player, agree: boolean): void {
    if (agree) {
      addLog(s, `${player.name} (President) agreed to Veto. Both directives discarded.`);
      s.discard.push(...s.chancellorPolicies);
      s.chancellorPolicies = [];
      s.vetoRequested      = false;

      if (!s.roundHistory) s.roundHistory = [];
      s.roundHistory.push({
        round:          s.round,
        presidentName:  s.players.find(p => p.isPresident)?.name  ?? "?",
        chancellorName: s.players.find(p => p.isChancellor)?.name ?? "?",
        failed: true, failReason: "veto", votes: [],
      });

      s.electionTracker++;
      if (s.electionTracker >= 3) {
        this.enactChaosPolicy(s, roomId);
        return;
      }

      // Check for Auditor even on a veto
      const auditor = s.players.find(p => p.titleRole === "Auditor" && !p.titleUsed && p.isAlive);
      if (auditor) {
        s.titlePrompt = { playerId: auditor.id, role: "Auditor", context: { discardPile: s.discard.slice(-3) } };
        this.enterPhase(s, roomId, "Auditor_Action");
      } else {
        this.nextRound(s, roomId, false);
      }
    } else {
      s.vetoRequested = false;
      addLog(s, `${player.name} (President) denied the Veto. Chancellor must enact a directive.`);
      this.broadcastState(roomId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Victory & Stats
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkVictory(s: GameState, roomId: string): Promise<boolean> {
    if (s.civilDirectives >= 5) {
      await this.endGame(s, roomId, "Civil", "CHARTER RESTORED");
      return true;
    }
    if (s.stateDirectives >= 6) {
      await this.endGame(s, roomId, "State", "STATE SUPREMACY");
      return true;
    }
    return false;
  }

  private async endGame(s: GameState, roomId: string, winner: "Civil" | "State", reason: string): Promise<void> {
    s.phase     = "GameOver";
    s.winner    = winner;
    s.winReason = reason;
    addLog(s, `Game over: ${reason}`);
    this.clearActionTimer(roomId);
    await this.updateUserStats(s, winner);
    await incrementGlobalWin(winner);
    this.broadcastState(roomId);
  }

  async updateUserStats(s: GameState, winningSide: "Civil" | "State"): Promise<void> {
    for (const p of s.players) {
      if (p.isAI || !p.userId) continue;
      const user = await getUserById(p.userId);
      if (!user) continue;

      user.stats.gamesPlayed++;
      if      (p.role === "Civil")    user.stats.civilGames++;
      else if (p.role === "State")    user.stats.stateGames++;
      else if (p.role === "Overseer") user.stats.overseerGames++;

      const won = (winningSide === "Civil" && p.role === "Civil") ||
                  (winningSide === "State"  && (p.role === "State" || p.role === "Overseer"));

      if (won) {
        user.stats.wins++;
        user.stats.elo    += s.mode === "Ranked" ? 20 : 0;
        user.stats.points += s.mode === "Ranked" ? 100 : 40;
      } else {
        user.stats.losses++;
        user.stats.elo    = s.mode === "Ranked" ? Math.max(0, user.stats.elo - 20) : user.stats.elo;
        user.stats.points += s.mode === "Ranked" ? 25 : 10;
      }

      const level = Math.floor(user.stats.gamesPlayed / 5) + 1;
      if (level >= 30 && !user.claimedRewards.includes("level-30-cp")) {
        user.cabinetPoints += 500;
        user.claimedRewards.push("level-30-cp");
      }

      await saveUser(user);
      const { password: _, ...safe } = user;
      this.io.to(p.id).emit("userUpdate", safe);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Round History
  // ═══════════════════════════════════════════════════════════════════════════

  private captureRoundHistory(s: GameState, policy: Policy, isChaos: boolean): void {
    if (!s.roundHistory) s.roundHistory = [];

    if (isChaos) {
      s.roundHistory.push({ round: s.round, presidentName: "—", chancellorName: "—", policy, chaos: true, votes: [] });
      return;
    }

    if (!s.lastGovernmentPresidentId || !s.lastGovernmentChancellorId) return;
    const pres = s.players.find(p => p.id === s.lastGovernmentPresidentId);
    const chan  = s.players.find(p => p.id === s.lastGovernmentChancellorId);
    if (!pres || !chan) return;

    const presDecl = s.declarations.find(d => d.type === "President");
    const chanDecl = s.declarations.find(d => d.type === "Chancellor");
    const action   = getExecutiveAction(s);

    s.roundHistory.push({
      round:          s.round,
      presidentName:  pres.name,
      chancellorName: chan.name,
      policy,
      votes: Object.entries(s.lastGovernmentVotes ?? {}).map(([pid, v]) => {
        const pl = s.players.find(p => p.id === pid);
        return { playerId: pid, playerName: pl?.name ?? pid, vote: v as "Aye" | "Nay" };
      }),
      presDeclaration: presDecl
        ? { civ: presDecl.civ, sta: presDecl.sta, drewCiv: presDecl.drewCiv ?? 0, drewSta: presDecl.drewSta ?? 0 }
        : undefined,
      chanDeclaration: chanDecl ? { civ: chanDecl.civ, sta: chanDecl.sta } : undefined,
      executiveAction: action !== "None" ? action : undefined,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Disconnection & Pause
  // ═══════════════════════════════════════════════════════════════════════════

  handleLeave(socket: Socket, roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (player) {
      if (state.phase === "Lobby" || state.phase === "GameOver") {
        state.players = state.players.filter(p => p.id !== socket.id);
        addLog(state, `${player.name} left the room.`);
      } else if (!player.isAI && !player.isDisconnected) {
        player.isDisconnected      = true;
        state.isPaused             = true;
        state.pauseReason          = `${player.name} disconnected. Waiting 60 s for reconnection…`;
        state.pauseTimer           = 60;
        state.disconnectedPlayerId = player.id;
        addLog(state, `${player.name} disconnected. Game paused.`);

        this.clearActionTimer(roomId);
        state.actionTimerEnd = undefined;

        const existing = this.pauseTimers.get(roomId);
        if (existing) clearInterval(existing);

        const iv = setInterval(() => {
          const s = this.rooms.get(roomId);
          if (!s || !s.isPaused) { clearInterval(iv); this.pauseTimers.delete(roomId); return; }
          s.pauseTimer!--;
          if (s.pauseTimer! <= 0) {
            clearInterval(iv);
            this.pauseTimers.delete(roomId);
            this.handlePauseTimeout(roomId);
          }
          this.broadcastState(roomId);
        }, 1000);

        this.pauseTimers.set(roomId, iv);
      }
    }

    const spectator = state.spectators.find(s => s.id === socket.id);
    if (spectator) {
      state.spectators = state.spectators.filter(s => s.id !== socket.id);
      addLog(state, `${spectator.name} (Spectator) left.`);
    }

    socket.leave(roomId);

    if (state.players.filter(p => !p.isAI).length === 0 && state.spectators.length === 0) {
      this.rooms.delete(roomId);
      const lt = this.lobbyTimers.get(roomId);
      if (lt) { clearInterval(lt); this.lobbyTimers.delete(roomId); }
    } else {
      this.broadcastState(roomId);
    }
  }

  handlePauseTimeout(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (!state || !state.isPaused) return;

    const player = state.players.find(p => p.id === state.disconnectedPlayerId);
    if (!player) { state.isPaused = false; this.broadcastState(roomId); return; }

    if (state.mode === "Ranked") {
      state.phase  = "GameOver";
      state.winner = undefined;
      const msg = `Game ended as inconclusive — ${player.name} failed to reconnect.`;
      addLog(state, msg);
      state.messages.push({ sender: "System", text: msg, timestamp: Date.now(), type: "text" });
    } else {
      const takenNames = new Set(state.players.map(p => p.name.replace(" (AI)", "")));
      const available  = AI_BOTS.filter(b => !takenNames.has(b.name));
      const bot        = pick(available) ?? AI_BOTS[Math.floor(Math.random() * AI_BOTS.length)];

      const oldId = player.id;
      player.isAI           = true;
      player.isDisconnected = false;
      player.id             = `ai-${randomUUID()}`;
      player.userId         = undefined;
      player.name           = `${bot.name} (AI)`;
      player.avatarUrl      = bot.avatarUrl;
      player.personality    = bot.personality;

      if (state.presidentialOrder) {
        const idx = state.presidentialOrder.indexOf(oldId);
        if (idx !== -1) state.presidentialOrder[idx] = player.id;
      }
      if (state.presidentId  === oldId) state.presidentId  = player.id;
      if (state.chancellorId === oldId) state.chancellorId = player.id;

      addLog(state, `${player.name} (AI) took over the disconnected seat.`);
      state.isPaused = false;
      this.scheduleAITurns(state, roomId);
    }

    state.disconnectedPlayerId = undefined;
    state.pauseReason          = undefined;
    state.pauseTimer           = undefined;
    this.broadcastState(roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Nomination
  // ═══════════════════════════════════════════════════════════════════════════

  private aiNominateChancellor(s: GameState, roomId: string): void {
    const president = s.players[s.presidentIdx];
    if (!president.isAI) return;

    let eligible = this.getEligibleChancellors(s, president.id);
    if (eligible.length === 0) eligible = s.players.filter(p => p.isAlive && p.id !== president.id);
    if (eligible.length === 0) return;

    let target: Player;
    if (president.role === "Civil" && president.suspicion) {
      target = leastSuspicious(president, eligible);
    } else {
      const overseer = eligible.find(p => p.role === "Overseer");
      const teammate = eligible.find(p => p.role === "State");
      target = (s.stateDirectives >= 3 && overseer)
        ? overseer
        : (teammate && Math.random() > 0.3)
          ? teammate
          : pick(eligible)!;
    }

    s.players.forEach(p => (p.isChancellorCandidate = false));
    target.isChancellorCandidate = true;
    addLog(s, `${president.name} nominated ${target.name} for Chancellor.`);
    updateSuspicionFromNomination(s, president.id, target.id);
    this.triggerAIReactions(s, roomId, "nomination", { targetId: target.id });
    this.advanceToVotingOrBroker(s, roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Voting
  // ═══════════════════════════════════════════════════════════════════════════

  private aiCastVotes(s: GameState, roomId: string): void {
    const chancellor = s.players.find(p => p.isChancellorCandidate);
    const president  = s.players[s.presidentIdx];

    for (const ai of s.players.filter(p => p.isAI && p.isAlive && !p.vote && p.id !== s.detainedPlayerId)) {
      ai.vote = this.computeAIVote(ai, s, president, chancellor ?? null);
    }

    const remaining = s.players.filter(p => p.isAlive && p.id !== s.detainedPlayerId && !p.vote).length;
    if (remaining === 0) this.tallyVotes(s, roomId);
    else this.broadcastState(roomId);
  }

  private computeAIVote(ai: Player, s: GameState, president: Player, chancellor: Player | null): "Aye" | "Nay" {
    const diff = ai.difficulty === "Elite" ? 1.5 : ai.difficulty === "Casual" ? 0.5 : 1.0;

    if (ai.role === "Civil" && ai.suspicion) {
      const ps  = getSuspicion(ai, president.id);
      const cs  = chancellor ? getSuspicion(ai, chancellor.id) : 0;
      const thr = Math.min(0.65, 0.50 + s.round * 0.015) * diff;
      const risk = ai.personality === "Strategic" ? 0.3 : ai.personality === "Chaotic" ? 0.7 : 0.5;

      if ((ps * diff > thr || cs * diff > thr) && Math.random() > risk) {
        return s.electionTracker >= 2 ? "Aye" : "Nay";
      }
      if (s.stateDirectives >= 3 && chancellor?.role === "Overseer") return "Nay";
      if (s.electionTracker >= 2) return "Aye";
      return Math.random() > 0.15 ? "Aye" : "Nay";
    }

    if (s.stateDirectives >= 3 && chancellor?.role === "Overseer") return "Aye";
    if (chancellor?.role !== "Civil" || president.role !== "Civil") return Math.random() > 0.15 ? "Aye" : "Nay";
    return Math.random() > 0.45 ? "Aye" : "Nay";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Legislative
  // ═══════════════════════════════════════════════════════════════════════════

  private aiPresidentDiscard(s: GameState, roomId: string): void {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI || s.drawnPolicies.length === 0) return;

    s.presidentSaw = [...s.drawnPolicies];
    while (s.drawnPolicies.length > 2) {
      const idx = this.choosePolicyToDiscard(president, s.drawnPolicies, s.stateDirectives);
      s.discard.push(s.drawnPolicies.splice(idx, 1)[0]);
    }

    s.chancellorPolicies  = [...s.drawnPolicies];
    s.chancellorSaw       = [...s.chancellorPolicies];
    s.drawnPolicies       = [];
    s.isStrategistAction  = undefined as any;
    this.enterPhase(s, roomId, "Legislative_Chancellor");
  }

  private choosePolicyToDiscard(player: Player, hand: Policy[], stateDir: number): number {
    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Civil") {
      idx = hand.findIndex(p => p === "Civil");
    } else if (player.personality === "Strategic" && player.role !== "Civil") {
      idx = stateDir < 2 ? hand.findIndex(p => p === "State") : hand.findIndex(p => p === "Civil");
    } else if (player.personality === "Honest" || player.role === "Civil") {
      idx = hand.findIndex(p => p === "State");
    }
    return idx === -1 ? 0 : idx;
  }

  private aiChancellorPlay(s: GameState, roomId: string): void {
    const chancellor = s.players.find(p => p.isChancellor);
    if (!chancellor?.isAI || s.chancellorPolicies.length === 0) return;

    const idx    = this.choosePolicyToPlay(chancellor, s.chancellorPolicies, s.stateDirectives, s.civilDirectives);
    const played = s.chancellorPolicies.splice(idx, 1)[0];
    s.discard.push(...s.chancellorPolicies);
    s.chancellorPolicies = [];
    this.enactPolicy(s, roomId, played, false, chancellor.id);
  }

  private choosePolicyToPlay(player: Player, hand: Policy[], stateDir: number, civilDir: number): number {
    if (player.role === "Civil" && civilDir === 4 && hand.includes("Civil")) return hand.findIndex(p => p === "Civil");
    if ((player.role === "State" || player.role === "Overseer") && stateDir === 5 && hand.includes("State")) return hand.findIndex(p => p === "State");

    let idx = -1;
    if (player.personality === "Aggressive" && player.role !== "Civil") {
      idx = hand.findIndex(p => p === "Civil");
    } else if (player.personality === "Strategic" && player.role !== "Civil") {
      idx = stateDir < 3 ? hand.findIndex(p => p === "Civil") : hand.findIndex(p => p === "State");
    } else if (player.personality === "Honest" || player.role === "Civil") {
      idx = hand.findIndex(p => p === "Civil");
    }
    return idx === -1 ? 0 : idx;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Executive Action
  // ═══════════════════════════════════════════════════════════════════════════

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
      const civil = eligible.filter(p => p.role === "Civil");
      const state = eligible.filter(p => p.role === "State" || p.role === "Overseer");
      target = s.currentExecutiveAction === "SpecialElection"
        ? (pick(state) ?? pick(eligible)!)
        : (pick(civil) ?? pick(eligible)!);
    }

    await this.applyExecutiveAction(s, roomId, target.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Veto
  // ═══════════════════════════════════════════════════════════════════════════

  private async aiVetoResponse(s: GameState, roomId: string): Promise<void> {
    const president = s.players.find(p => p.isPresident);
    if (!president?.isAI) return;

    const stateInHand = s.chancellorPolicies.filter(p => p === "State").length;
    const civilInHand = s.chancellorPolicies.filter(p => p === "Civil").length;
    let agree: boolean;

    if (president.role === "Civil") {
      agree = s.electionTracker >= 2 ? false : stateInHand === 2 ? true : Math.random() > 0.75;
    } else {
      agree = (civilInHand >= 1 && s.stateDirectives < 4) ? false : Math.random() > 0.7;
    }

    this.handleVetoResponse(s, roomId, president, agree);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Title Ability Decisions
  // ═══════════════════════════════════════════════════════════════════════════

  private async aiDecideTitleAbility(s: GameState, roomId: string): Promise<void> {
    const prompt = s.titlePrompt;
    if (!prompt) return;

    const player = s.players.find(p => p.id === prompt.playerId);
    if (!player?.isAI) return;

    const isPresident = player.id === s.players[s.presidentIdx].id;
    // Broker and Interdictor cannot be self-applied by the sitting president
    if (isPresident && (prompt.role === "Broker" || prompt.role === "Interdictor")) {
      await this.handleTitleAbility(s, roomId, { use: false });
      return;
    }

    let data: any = { use: false };

    switch (prompt.role) {
      case "Assassin": {
        const targets = s.players.filter(p => p.isAlive && p.id !== player.id);
        const suspect = mostSuspicious(player, targets);
        if (getSuspicion(player, suspect.id) > 0.7) data = { use: true, targetId: suspect.id };
        break;
      }
      case "Strategist":
        data = { use: Math.random() > 0.4 };
        break;
      case "Broker": {
        const candidate = s.players.find(p => p.isChancellorCandidate);
        if (!isPresident && candidate && getSuspicion(player, candidate.id) > 0.6) data = { use: true };
        break;
      }
      case "Handler": {
        if (s.presidentialOrder) {
          const curId  = s.players[s.presidentIdx].id;
          const curPos = s.presidentialOrder.indexOf(curId);
          const nextId = s.presidentialOrder[(curPos + 1) % s.presidentialOrder.length];
          if (getSuspicion(player, nextId) > 0.6) data = { use: true };
        }
        break;
      }
      case "Auditor":
        data = { use: true };
        break;
      case "Interdictor": {
        const candidates = s.players.filter(p =>
          p.isAlive && p.id !== s.players[s.presidentIdx].id && p.id !== player.id,
        );
        const suspect = candidates.find(p => getSuspicion(player, p.id) > 0.7);
        if (suspect) data = { use: true, targetId: suspect.id };
        break;
      }
    }

    await this.handleTitleAbility(s, roomId, data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI — Chat
  // ═══════════════════════════════════════════════════════════════════════════

  private postAIChat(state: GameState, ai: Player, lines: readonly string[], targetName?: string): void {
    let text = lines[Math.floor(Math.random() * lines.length)];
    if (targetName) text = text.replace("{name}", targetName.replace(" (AI)", ""));
    state.messages.push({ sender: ai.name, text, timestamp: Date.now(), type: "text" });
    if (state.messages.length > 50) state.messages.shift();
  }

  private triggerAIReactions(
    state: GameState, roomId: string,
    type: "nomination" | "enactment" | "failed_vote",
    context?: any,
  ): void {
    const ai = state.players.filter(p => p.isAI && p.isAlive);
    if (ai.length === 0) return;

    const count       = Math.random() > 0.7 ? 2 : 1;
    const commentators = shuffle([...ai]).slice(0, count);

    for (const c of commentators) {
      setTimeout(() => {
        if (state.isPaused) return;
        let lines: readonly string[] = CHAT.banter;

        if (type === "nomination" && context?.targetId) {
          const target = state.players.find(p => p.id === context.targetId);
          if (target) {
            if (c.id === target.id) {
              lines = CHAT.defendingSelf;
            } else {
              const susp   = getSuspicion(c, target.id);
              const isTeam = c.role !== "Civil" && (target.role === "State" || target.role === "Overseer");
              if      (susp > 0.75 && !isTeam) lines = CHAT.highSuspicion;
              else if (susp > 0.55 && !isTeam) lines = CHAT.suspiciousNominee;
              else if (susp < 0.25 || isTeam)  lines = CHAT.praisingCivil;
            }
            this.postAIChat(state, c, lines, target.name);
          }
        } else if (type === "failed_vote") {
          this.postAIChat(state, c, CHAT.governmentFailed);
        }

        this.broadcastState(roomId);
      }, 1000 + Math.random() * 2000);
    }
  }
}
