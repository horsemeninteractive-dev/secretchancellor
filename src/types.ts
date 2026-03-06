export type Role = 'Liberal' | 'Fascist' | 'Hitler';
export const Role = {};
export type Policy = 'Liberal' | 'Fascist';
export const Policy = {};
export type GamePhase = 'Lobby' | 'Election' | 'Voting' | 'Voting_Reveal' | 'Legislative_President' | 'Legislative_Chancellor' | 'Executive_Action' | 'GameOver';
export const GamePhase = {};
export type ExecutiveAction = 'Investigate' | 'SpecialElection' | 'Execution' | 'PolicyPeek' | 'None';
export const ExecutiveAction = {};
export type GameMode = 'Casual' | 'Ranked';
export const GameMode = {};

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  liberalGames: number;
  fascistGames: number;
  hitlerGames: number;
  kills: number;
  deaths: number;
  elo: number;
  points: number;
}
export const UserStats = {};

export interface CosmeticItem {
  id: string;
  name: string;
  price: number;
  type: 'frame' | 'badge' | 'policy' | 'vote';
  imageUrl?: string;
  description?: string;
}
export const CosmeticItem = {};

export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  stats: UserStats;
  ownedCosmetics: string[];
  activeFrame?: string;
  activePolicyStyle?: string;
  activeVotingStyle?: string;
}
export const User = {};

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  actionTimer: number;
  playerAvatars: string[];
  mode: GameMode;
}
export const RoomInfo = {};

export type AIPersonality = 'Honest' | 'Deceptive' | 'Chaotic' | 'Strategic' | 'Aggressive';
export const AIPersonality = {};

export interface Player {
  id: string;
  name: string;
  userId?: string;
  avatarUrl?: string;
  role?: Role;
  isAlive: boolean;
  isPresidentialCandidate: boolean;
  isChancellorCandidate: boolean;
  isPresident: boolean;
  isChancellor: boolean;
  wasPresident: boolean;
  wasChancellor: boolean;
  vote?: 'Ja' | 'Nein';
  isAI?: boolean;
  personality?: AIPersonality;
  activeFrame?: string;
  activePolicyStyle?: string;
  activeVotingStyle?: string;
  isDisconnected?: boolean;
  isReady?: boolean;
}
export const Player = {};

export interface GameState {
  roomId: string;
  players: Player[];
  spectators: { id: string; name: string; avatarUrl?: string }[];
  mode: GameMode;
  phase: GamePhase;
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  deck: Policy[];
  discard: Policy[];
  drawnPolicies: Policy[];
  chancellorPolicies: Policy[];
  currentExecutiveAction: ExecutiveAction;
  log: string[];
  winner?: 'Liberals' | 'Fascists';
  winReason?: string;
  presidentIdx: number;
  lastPresidentIdx: number;
  chancellorId?: string;
  presidentId?: string;
  lobbyTimer?: number;
  isTimerActive?: boolean;
  maxPlayers: number;
  actionTimer: number;
  actionTimerEnd?: number;
  messages: { 
    sender: string; 
    text: string; 
    timestamp: number; 
    type?: 'text' | 'declaration' | 'round_separator' | 'failed_election';
    declaration?: { libs: number; fas: number; type: 'President' | 'Chancellor' };
    round?: number;
  }[];
  investigationResult?: { targetName: string; role: Role };
  lastEnactedPolicy?: { type: Policy; timestamp: number; playerId?: string };
  round: number;
  vetoUnlocked: boolean;
  vetoRequested: boolean;
  previousVotes?: { [playerId: string]: 'Ja' | 'Nein' };
  presidentSaw?: Policy[];
  chancellorSaw?: Policy[];
  presidentTimedOut?: boolean;
  chancellorTimedOut?: boolean;
  declarations: { 
    playerId: string; 
    playerName: string; 
    libs: number; 
    fas: number; 
    type: 'President' | 'Chancellor'; 
    timestamp: number;
  }[];
  isPaused?: boolean;
  pauseReason?: string;
  pauseTimer?: number;
  disconnectedPlayerId?: string;
}
export const GameState = {};

export interface ServerToClientEvents {
  gameStateUpdate: (state: GameState) => void;
  error: (message: string) => void;
  privateInfo: (info: { role: Role; fascists?: { id: string; name: string; role: Role }[] }) => void;
  investigationResult: (result: { targetName: string; role: Role }) => void;
  policyPeekResult: (policies: Policy[]) => void;
  voiceData: (data: { sender: string; data: ArrayBuffer }) => void;
  userUpdate: (user: User) => void;
  signal: (data: { from: string; signal: any }) => void;
  peerJoined: (peerId: string) => void;
}

export interface ClientToServerEvents {
  joinRoom: (data: { roomId: string; name: string; userId?: string; activeFrame?: string; activePolicyStyle?: string; activeVotingStyle?: string; maxPlayers?: number; actionTimer?: number; mode?: GameMode; isSpectator?: boolean }) => void;
  leaveRoom: () => void;
  playAgain: () => void;
  startGame: () => void;
  toggleReady: () => void;
  startLobbyTimer: () => void;
  nominateChancellor: (chancellorId: string) => void;
  vote: (vote: 'Ja' | 'Nein') => void;
  presidentDiscard: (policyIdx: number) => void;
  chancellorPlay: (policyIdx: number) => void;
  performExecutiveAction: (targetId: string) => void;
  sendMessage: (message: string) => void;
  declarePolicies: (data: { libs: number; fas: number; type: 'President' | 'Chancellor' } | null) => void;
  vetoRequest: () => void;
  vetoResponse: (agree: boolean) => void;
  voiceData: (data: ArrayBuffer) => void;
  signal: (data: { to: string; signal: any; from: string }) => void;
}
