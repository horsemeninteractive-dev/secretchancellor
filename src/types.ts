export type Role = 'Civil' | 'State' | 'Overseer';
export type TitleRole = 'Assassin' | 'Strategist' | 'Broker' | 'Handler' | 'Auditor' | 'Interdictor';

export interface PrivateInfo {
  role: Role;
  stateAgents?: { id: string; name: string; role: Role }[];
  titleRole?: TitleRole;
}
export type Policy = 'Civil' | 'State';
export type GamePhase = 
  | 'Lobby' 
  | 'Interdictor_Action' 
  | 'Next_President' 
  | 'Nominate_Chancellor' 
  | 'Nomination_Review'
  | 'Election'
  | 'Broker_Action' 
  | 'Voting' 
  | 'Voting_Reveal' 
  | 'Strategist_Action' 
  | 'Legislative_President' 
  | 'Legislative_Chancellor' 
  | 'President_Declaration' 
  | 'Chancellor_Declaration' 
  | 'Auditor_Action' 
  | 'Assassin_Action' 
  | 'Handler_Action' 
  | 'Round_End' 
  | 'Executive_Action' 
  | 'GameOver';
export type ExecutiveAction = 'Investigate' | 'SpecialElection' | 'Execution' | 'PolicyPeek' | 'None';
export type GameMode = 'Casual' | 'Ranked';

export interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  civilGames: number;
  stateGames: number;
  overseerGames: number;
  kills: number;
  deaths: number;
  elo: number;
  points: number;
}

export interface CosmeticItem {
  id: string;
  name: string;
  price: number;
  type: 'frame' | 'badge' | 'policy' | 'vote' | 'music' | 'sound' | 'background';
  imageUrl?: string;
  description?: string;
}

export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  stats: UserStats;
  ownedCosmetics: string[];
  activeFrame?: string;
  activePolicyStyle?: string;
  activeVotingStyle?: string;
  activeMusic?: string;
  activeSoundPack?: string;
  activeBackground?: string;
  cabinetPoints: number;
  claimedRewards: string[];
}

export interface UserInternal extends User {
  password?: string;
  googleId?: string;
  discordId?: string;
}

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

export type AIPersonality = 'Honest' | 'Deceptive' | 'Chaotic' | 'Strategic' | 'Aggressive';

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
  vote?: 'Aye' | 'Nay';
  isAI?: boolean;
  personality?: AIPersonality;
  activeFrame?: string;
  activePolicyStyle?: string;
  activeVotingStyle?: string;
  isDisconnected?: boolean;
  isReady?: boolean;
  hasActed?: boolean; // Track if player has acted in current phase
  titleRole?: TitleRole;
  titleUsed?: boolean;
  // Bayesian suspicion model: log-odds that each other player is State/Overseer
  suspicion?: { [playerId: string]: number };
  // How many State directives this player has enacted as Chancellor (observable)
  stateEnactments?: number;
  alliances?: { [playerId: string]: number };
  difficulty?: 'Casual' | 'Normal' | 'Elite';
}

export interface GameState {
  roomId: string;
  players: Player[];
  spectators: { id: string; name: string; avatarUrl?: string }[];
  mode: GameMode;
  phase: GamePhase;
  civilDirectives: number;
  stateDirectives: number;
  electionTracker: number;
  deck: Policy[];
  discard: Policy[];
  drawnPolicies: Policy[];
  chancellorPolicies: Policy[];
  currentExecutiveAction: ExecutiveAction;
  log: string[];
  winner?: 'Civil' | 'State';
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
    declaration?: { civ: number; sta: number; type: 'President' | 'Chancellor' };
    round?: number;
  }[];
  investigationResult?: { targetName: string; role: Role };
  lastEnactedPolicy?: { type: Policy; timestamp: number; playerId?: string; historyCaptured?: boolean; trackerReady?: boolean };
  round: number;
  presidentialOrder?: string[];
  rejectedChancellorId?: string;
  detainedPlayerId?: string;
  vetoUnlocked: boolean;
  vetoRequested: boolean;
  previousVotes?: { [playerId: string]: 'Aye' | 'Nay' };
  presidentSaw?: Policy[];
  chancellorSaw?: Policy[];
  presidentTimedOut?: boolean;
  chancellorTimedOut?: boolean;
  declarations: { 
    playerId: string; 
    playerName: string; 
    civ: number;      // what was passed (president) or received (chancellor)
    sta: number;
    drewCiv?: number; // president only: what they drew (3-card hand)
    drewSta?: number;
    type: 'President' | 'Chancellor'; 
    timestamp: number;
  }[];
  isPaused?: boolean;
  pauseReason?: string;
  pauseTimer?: number;
  disconnectedPlayerId?: string;
  titlePrompt?: {
    playerId: string;
    role: TitleRole;
    context?: any;
    nextPhase?: GamePhase;
  };
  // Used by the Bayesian suspicion model: stores who voted how for the most
  // recently-formed government, and who was in it, so suspicion can be updated
  // once the enacted policy type is known (6s later during the animation).
  lastGovernmentVotes?: { [playerId: string]: 'Aye' | 'Nay' };
  lastGovernmentPresidentId?: string;
  lastGovernmentChancellorId?: string;
  lastExecutiveActionStateCount?: number;
  // Used by coordinated State AI lying: president stores the chancellor's intended claim
  pendingChancellorClaim?: { civ: number; sta: number };
  isStrategistAction?: boolean;
  // Structured per-round history for the history panel
  roundHistory?: {
    round: number;
    presidentName: string;
    chancellorName: string;
    policy?: Policy;
    failed?: boolean;
    failReason?: 'vote' | 'veto';
    chaos?: boolean;
    votes: { playerId: string; playerName: string; vote: 'Aye' | 'Nay' }[];
    presDeclaration?: { civ: number; sta: number; drewCiv: number; drewSta: number };
    chanDeclaration?: { civ: number; sta: number };
    executiveAction?: string;
  }[];
}

export interface ServerToClientEvents {
  gameStateUpdate: (state: GameState) => void;
  error: (message: string) => void;
  privateInfo: (info: { role: Role; stateAgents?: { id: string; name: string; role: Role }[] }) => void;
  investigationResult: (result: { targetName: string; role: Role }) => void;
  policyPeekResult: (policies: Policy[]) => void;
  voiceData: (data: { sender: string; data: ArrayBuffer }) => void;
  userUpdate: (user: User) => void;
  signal: (data: { from: string; signal: any }) => void;
  peerJoined: (peerId: string) => void;
  friendRequestReceived: (data: { fromUserId: string }) => void;
  friendRequestAccepted: (data: { fromUserId: string }) => void;
  userStatusChanged: (data: { userId: string; isOnline: boolean; roomId?: string }) => void;
  friendInvite: (data: { fromUserId: string; fromUsername: string; roomId: string }) => void;
  powerUsed: (data: { role: string }) => void;
}

export interface ClientToServerEvents {
  userConnected: (userId: string) => void;
  joinRoom: (data: { roomId: string; name: string; userId?: string; activeFrame?: string; activePolicyStyle?: string; activeVotingStyle?: string; maxPlayers?: number; actionTimer?: number; mode?: GameMode; isSpectator?: boolean }) => void;
  leaveRoom: () => void;
  playAgain: () => void;
  startGame: () => void;
  toggleReady: () => void;
  startLobbyTimer: () => void;
  nominateChancellor: (chancellorId: string) => void;
  vote: (vote: 'Aye' | 'Nay') => void;
  presidentDiscard: (policyIdx: number) => void;
  chancellorPlay: (policyIdx: number) => void;
  performExecutiveAction: (targetId: string) => void;
  useTitleAbility: (abilityData: any) => void;
  sendMessage: (message: string) => void;
  declarePolicies: (data: { civ: number; sta: number; drewCiv?: number; drewSta?: number; type: 'President' | 'Chancellor' } | null) => void;
  vetoRequest: () => void;
  vetoResponse: (agree: boolean) => void;
  voiceData: (data: ArrayBuffer) => void;
  signal: (data: { to: string; signal: any; from: string }) => void;
  sendFriendRequest: (targetUserId: string) => void;
  acceptFriendRequest: (targetUserId: string) => void;
}
