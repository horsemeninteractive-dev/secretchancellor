import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { GameState, Player, Role, Policy, User } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, Gavel, Scroll, MessageSquare, LogOut, Play, Check, X, AlertTriangle, Mic, MicOff, Send, Trophy, Coins, User as UserIcon, Skull, Eye, Zap, Target, Search, Bird } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Auth } from './components/Auth';
import { Lobby } from './components/Lobby';
import { Profile } from './components/Profile';
import { getFrameStyles, getPolicyStyles, getVoteStyles } from './lib/cosmetics';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isInteracted, setIsInteracted] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [privateInfo, setPrivateInfo] = useState<{ role: Role; fascists?: { id: string; name: string; role: Role }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [speakingPlayers, setSpeakingPlayers] = useState<Record<string, boolean>>({});
  const [peekedPolicies, setPeekedPolicies] = useState<Policy[] | null>(null);
  const [, setTick] = useState(0);

  const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const HitlerIcon = ({ className }: { className?: string }) => (
    <div className={cn("relative", className)}>
      <Skull className="w-full h-full" />
      {/* Moustache */}
      <div className="absolute top-[60%] left-1/2 -translate-x-1/2 w-[30%] h-[10%] bg-black rounded-sm" />
      {/* Hat (simplified) */}
      <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[110%] h-[30%] bg-[#1a1a1a] border border-[#333] rounded-t-full" />
      <div className="absolute -top-[5%] left-1/2 -translate-x-1/2 w-[120%] h-[10%] bg-[#1a1a1a] border-b border-[#333]" />
    </div>
  );

  // Sound effects
  const playSound = (url: string) => {
    const audio = new Audio(url);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.8;
    window.speechSynthesis.speak(utterance);
  };

  const prevPhase = useRef<string | undefined>(undefined);
  const prevLastEnactedTimestamp = useRef<number>(0);
  const prevVotes = useRef(0);
  const prevLiberalPolicies = useRef(0);
  const prevFascistPolicies = useRef(0);
  const prevAliveCount = useRef(0);

  useEffect(() => {
    if (!gameState) return;

    // Check if we need to show declaration UI
    const me = gameState.players.find(p => p.id === socket.id);
    if (me) {
      const alreadyDeclared = gameState.declarations.some(d => d.playerId === socket.id);
      const willWin = (gameState.lastEnactedPolicy?.type === 'Liberal' && gameState.liberalPolicies === 4) ||
                      (gameState.lastEnactedPolicy?.type === 'Fascist' && gameState.fascistPolicies === 5);

      if (!alreadyDeclared && !willWin && gameState.phase !== 'GameOver') {
        // Both President and Chancellor declare after policy is enacted
        const policyJustEnacted = gameState.lastEnactedPolicy && 
                                 gameState.lastEnactedPolicy.timestamp > prevLastEnactedTimestamp.current;

        if (policyJustEnacted && me.isPresident && !showPolicyAnim) {
          setDeclarationType('President');
          setShowDeclarationUI(true);
          setDeclLibs(0);
          setDeclFas(0);
        }

        // Chancellor declares after President
        const presidentDeclared = gameState.declarations.some(d => d.type === 'President');
        if (presidentDeclared && me.isChancellor && !showPolicyAnim) {
          setDeclarationType('Chancellor');
          setShowDeclarationUI(true);
          setDeclLibs(0);
          setDeclFas(0);
        }
      } else {
        setShowDeclarationUI(false);
      }
    }

    if (gameState.lastEnactedPolicy) {
      prevLastEnactedTimestamp.current = gameState.lastEnactedPolicy.timestamp;
    }

    // Vote sound
    const currentVotes = gameState.players.filter(p => p.vote).length;
    if (currentVotes > prevVotes.current) {
      // We don't know who voted what exactly from the state easily without more tracking, 
      // but we can check if the last vote was Ja or Nein if we had that info.
      // For now, generic vote sound if it's not the local user (who already plays it inline)
      const me = gameState.players.find(p => p.id === socket.id);
      if (me && !me.vote) {
        playSound('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
      }
    }
    prevVotes.current = currentVotes;

    // Player death sound
    const currentAliveCount = gameState.players.filter(p => p.isAlive).length;
    if (prevAliveCount.current > 0 && currentAliveCount < prevAliveCount.current) {
      playSound('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'); // Gunshot/Death
    }
    prevAliveCount.current = currentAliveCount;

    // Phase transitions
    if (prevPhase.current === 'Voting' && gameState.phase !== 'Voting') {
      // Check if election passed or failed
      if (gameState.phase === 'Legislative_President') {
        playSound('https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3'); // Election Passed
      } else if (gameState.phase === 'Election') {
        playSound('https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'); // Election Failed
      }
    }

    // Policy enactment sounds
    if (gameState.liberalPolicies > prevLiberalPolicies.current) {
      speak("For Democracy!");
    }
    if (gameState.fascistPolicies > prevFascistPolicies.current) {
      speak("For the Fuhrer!");
    }
    prevLiberalPolicies.current = gameState.liberalPolicies;
    prevFascistPolicies.current = gameState.fascistPolicies;

    // Game Over
    if (prevPhase.current !== 'GameOver' && gameState.phase === 'GameOver') {
      const me = gameState.players.find(p => p.id === socket.id);
      const myTeam = me?.role === 'Liberal' ? 'Liberals' : 'Fascists';
      const won = gameState.winner === myTeam;
      
      if (won) {
        playSound('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); // Victory
      } else {
        playSound('https://assets.mixkit.co/active_storage/sfx/251/251-preview.mp3'); // Defeat
      }
    }

    prevPhase.current = gameState.phase;
  }, [gameState]);

  useEffect(() => {
    socket.on('policyPeekResult', (policies: Policy[]) => {
      setPeekedPolicies(policies);
    });
    return () => {
      socket.off('policyPeekResult');
    };
  }, []);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [showDeclarationUI, setShowDeclarationUI] = useState(false);
  const [declarationType, setDeclarationType] = useState<'President' | 'Chancellor' | null>(null);
  const [declLibs, setDeclLibs] = useState(0);
  const [declFas, setDeclFas] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (isChatOpen && gameState) {
      setLastSeenMessageCount(gameState.messages.length);
    }
  }, [isChatOpen, gameState?.messages.length]);

  const hasNewMessages = gameState && !isChatOpen && gameState.messages.slice(lastSeenMessageCount).some(m => m.type !== 'round_separator');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const [chatText, setChatText] = useState('');
  const [investigationResult, setInvestigationResult] = useState<{ targetName: string; role: Role } | null>(null);
  const [lastSeenPolicyTime, setLastSeenPolicyTime] = useState(0);
  const [showPolicyAnim, setShowPolicyAnim] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const speakingTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (token) {
      fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else setToken(null);
      })
      .catch(() => setToken(null));
    }
  }, [token]);

  useEffect(() => {
    const handleInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.messages]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.log]);

  useEffect(() => {
    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
      setJoined(true);

      // Cleanup peers that are no longer in the room
      const currentPeerIds = state.players.map(p => p.id);
      Object.keys(peersRef.current).forEach(id => {
        if (!currentPeerIds.includes(id)) {
          peersRef.current[id].close();
          delete peersRef.current[id];
        }
      });
    });

    socket.on('privateInfo', (info) => {
      setPrivateInfo(info);
    });

    socket.on('investigationResult', (result) => {
      setInvestigationResult(result);
    });

    socket.on('signal', async ({ from, signal }) => {
      let pc = peersRef.current[from];
      if (!pc) {
        pc = createPeer(from, false);
      }

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, from: socket.id!, signal: { sdp: answer } });
        }
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      }
    });

    socket.on('peerJoined', (peerId) => {
      createPeer(peerId, true);
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('userUpdate', (updatedUser: User) => {
      setUser(updatedUser);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('privateInfo');
      socket.off('investigationResult');
      socket.off('signal');
      socket.off('peerJoined');
      socket.off('error');
    };
  }, []);

  const createPeer = (peerId: string, initiator: boolean) => {
    if (peersRef.current[peerId]) return peersRef.current[peerId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peersRef.current[peerId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { to: peerId, from: socket.id!, signal: { candidate: event.candidate } });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch(e => console.error("Remote audio play error", e));
      
      setupSpeakingDetection(remoteStream, peerId);
    };

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: peerId, from: socket.id!, signal: { sdp: offer } });
      } catch (err) {
        console.error("Negotiation error", err);
      }
    };

    if (initiator) {
      // Negotiation needed will trigger the offer
    }

    return pc;
  };

  const setupSpeakingDetection = async (stream: MediaStream, playerId: string) => {
    if (!playerId) {
      console.warn("setupSpeakingDetection: No playerId provided");
      return;
    }
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        await context.resume();
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let isRunning = true;
      const check = () => {
        if (!isRunning) return;

        // Check if peer still exists or it's us
        const isLocal = playerId === socket.id;
        const peerExists = !!peersRef.current[playerId];
        
        if (!isLocal && !peerExists) {
          isRunning = false;
          source.disconnect();
          analyser.disconnect();
          return;
        }
        
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Use average volume for more stable detection on mobile
        if (average > 10) { 
          setSpeakingPlayers(prev => ({ ...prev, [playerId]: true }));
          if (speakingTimers.current[playerId]) clearTimeout(speakingTimers.current[playerId]);
          speakingTimers.current[playerId] = setTimeout(() => {
            setSpeakingPlayers(prev => ({ ...prev, [playerId]: false }));
          }, 400);
        }
        requestAnimationFrame(check);
      };
      console.log(`Voice detection started for ${playerId === socket.id ? 'local player' : 'remote player ' + playerId}`);
      check();
    } catch (err) {
      console.error("Error setting up voice detection:", err);
    }
  };

  useEffect(() => {
    if (isLogOpen) {
      const timer = setTimeout(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLogOpen, gameState?.log]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.messages, gameState?.declarations]);

  const prevDeclarationsLength = useRef(0);
  useEffect(() => {
    if (gameState?.declarations && gameState.declarations.length > prevDeclarationsLength.current) {
      // setIsChatOpen(true); // REVERTED: User said not necessary
      prevDeclarationsLength.current = gameState.declarations.length;
    }
  }, [gameState?.declarations]);

  useEffect(() => {
    if (gameState?.lastEnactedPolicy && gameState.lastEnactedPolicy.timestamp > lastSeenPolicyTime) {
      setLastSeenPolicyTime(gameState.lastEnactedPolicy.timestamp);
      setShowPolicyAnim(true);
    }
  }, [gameState?.lastEnactedPolicy, lastSeenPolicyTime]);

  useEffect(() => {
    if (showPolicyAnim) {
      const timer = setTimeout(() => setShowPolicyAnim(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showPolicyAnim]);

  useEffect(() => {
    if (isVoiceActive && socket.id && localStream) {
      setupSpeakingDetection(localStream, socket.id);
    }
  }, [isVoiceActive, socket.id, localStream]);

  useEffect(() => {
    if (isVoiceActive) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(async stream => {
          setLocalStream(stream);

          // Add tracks to all existing peer connections
          Object.keys(peersRef.current).forEach(peerId => {
            const pc = peersRef.current[peerId];
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
          });
        })
        .catch(err => {
          console.error('Error accessing microphone:', err);
          setIsVoiceActive(false);
        });
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        
        // Remove tracks from all peers
        Object.keys(peersRef.current).forEach(peerId => {
          const pc = peersRef.current[peerId];
          pc.getSenders().forEach(sender => pc.removeTrack(sender));
        });
      }
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isVoiceActive]);

  const handleAuthSuccess = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('token', token);
    
    // Request fullscreen on login/signup
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen()
          .then(() => setIsInteracted(true))
          .catch(err => {
            console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
            // If it fails, we'll show the Welcome screen to get a user gesture
            setIsInteracted(false);
          });
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e);
      setIsInteracted(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUser = params.get('user');
    if (urlToken && urlUser) {
      try {
        const userData = JSON.parse(decodeURIComponent(urlUser));
        handleAuthSuccess(userData, urlToken);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Failed to parse user from URL", e);
      }
    }
  }, []);

  const handleEnterAssembly = () => {
    setIsInteracted(true);
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setJoined(false);
    setIsInteracted(false);
    setGameState(null);
  };

  const handleJoinRoom = (roomId: string, maxPlayers?: number, actionTimer?: number, mode?: 'Casual' | 'Ranked', isSpectator?: boolean) => {
    if (user) {
      socket.emit('joinRoom', { 
        roomId, 
        name: user.username, 
        userId: user.id,
        activeFrame: user.activeFrame,
        activePolicyStyle: user.activePolicyStyle,
        activeVotingStyle: user.activeVotingStyle,
        maxPlayers,
        actionTimer,
        mode,
        isSpectator
      });
      setJoined(true);
    }
  };

  const handleLeaveRoom = () => {
    socket.emit('leaveRoom');
    setJoined(false);
    setGameState(null);
    setPrivateInfo(null);
    // Refresh user data to show updated ELO/Points
    if (token) {
      fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      });
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatText.trim()) {
      socket.emit('sendMessage', chatText.trim());
      setChatText('');
    }
  };

  const getLogColor = (entry: string) => {
    if (entry.includes('Liberal') || entry.includes('passed')) return 'text-blue-400 border-blue-900/30';
    if (entry.includes('Fascist') || entry.includes('Hitler') || entry.includes('failed')) return 'text-red-500 border-red-900/30';
    if (entry.includes('executed') || entry.includes('killed')) return 'text-red-600 font-bold border-red-900/50';
    if (entry.includes('elected') || entry.includes('nominated')) return 'text-yellow-500 border-yellow-900/30';
    if (entry.includes('veto')) return 'text-purple-400 border-purple-900/30';
    return 'text-[#aaa] border-[#333]';
  };

  if (!token || !user) {
    return (
      <>
        <Auth onAuthSuccess={handleAuthSuccess} />
        <AnimatePresence>
          {isProfileOpen && user && (
            <Profile 
              user={user} 
              token={token || ''}
              onClose={() => setIsProfileOpen(false)} 
              onUpdateUser={setUser}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  if (!isInteracted && !document.fullscreenElement) {
    return (
      <div className="min-h-screen bg-texture flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#1a1a1a] border border-[#222] rounded-3xl p-8 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-[#141414] rounded-2xl flex items-center justify-center border border-white/40 mx-auto mb-6 overflow-hidden">
            <img src="https://storage.googleapis.com/secretchancellor/SC.png" alt="Secret Chancellor Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
          </div>
          <h2 className="text-3xl font-thematic text-white tracking-wide uppercase mb-2">Welcome, {user.username}</h2>
          <p className="text-[#666] text-sm mb-8 font-mono uppercase tracking-widest">The Assembly awaits your presence.</p>
          <button 
            onClick={handleEnterAssembly}
            className="w-full bg-white text-black font-thematic text-2xl py-4 rounded-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5 uppercase tracking-widest"
          >
            Enter Assembly
          </button>
        </motion.div>
      </div>
    );
  }

  if (!joined || !gameState) {
    return (
      <>
        <Lobby 
          user={user} 
          onJoinRoom={handleJoinRoom} 
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
        <AnimatePresence>
          {isProfileOpen && (
            <Profile 
              user={user} 
              token={token}
              onClose={() => setIsProfileOpen(false)} 
              onUpdateUser={setUser}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  const me = gameState.players.find(p => p.id === socket.id);
  const isPresidentialCandidate = me?.isPresidentialCandidate;
  const isChancellorCandidate = me?.isChancellorCandidate;
  const isPresident = me?.isPresident;
  const isChancellor = me?.isChancellor;

  return (
    <div className="fixed inset-0 bg-texture text-[#e4e3e0] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 sm:h-20 border-b border-[#222] bg-[#1a1a1a] px-3 sm:px-6 flex items-center justify-between shrink-0 shadow-lg z-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#141414] rounded-xl flex items-center justify-center border border-white/40 shrink-0 overflow-hidden">
            <img src="https://storage.googleapis.com/secretchancellor/SC.png" alt="Secret Chancellor Logo" className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="font-thematic text-sm sm:text-2xl text-white tracking-wide leading-none truncate">Secret Chancellor</div>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <span className="text-[8px] sm:text-[9px] font-mono text-[#444] uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate">
                {gameState.roomId}
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono text-red-500/50 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 shrink-0">
                <div className="w-1 h-1 rounded-full bg-red-500/50" />
                R{gameState.round}
              </span>
              {gameState.actionTimerEnd && (
                <span className="text-[8px] sm:text-[9px] font-mono text-yellow-500 uppercase tracking-[0.1em] sm:tracking-[0.2em] flex items-center gap-1 ml-1 sm:ml-2 shrink-0">
                  <div className="w-1 h-1 rounded-full bg-yellow-500 animate-pulse" />
                  {Math.max(0, Math.ceil((gameState.actionTimerEnd - Date.now()) / 1000))}s
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-4">
          <button 
            onClick={() => {
              if (me?.isAlive || gameState.phase === 'GameOver') {
                setIsVoiceActive(!isVoiceActive);
              }
            }}
            disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
            className={cn(
              "p-2 sm:p-2.5 rounded-xl border transition-all",
              isVoiceActive ? "border-red-500 bg-red-900/20 text-red-500" : "border-[#333] bg-[#222] text-[#444] hover:text-white",
              !me?.isAlive && gameState.phase !== 'GameOver' && "opacity-30 grayscale cursor-not-allowed"
            )}
          >
            {isVoiceActive ? <Mic className="w-3.5 h-3.5 sm:w-4 h-4" /> : <MicOff className="w-3.5 h-3.5 sm:w-4 h-4" />}
          </button>
          <button 
            onClick={() => setIsChatOpen(true)}
            className="p-2 sm:p-2.5 rounded-xl border border-[#333] bg-[#222] text-[#666] hover:text-white transition-all relative"
          >
            <MessageSquare className="w-3.5 h-3.5 sm:w-4 h-4" />
            {hasNewMessages && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full border border-[#1a1a1a]" />
            )}
          </button>
          <button 
            onClick={() => setIsDossierOpen(true)}
            className={cn(
              "p-2 sm:p-2.5 rounded-xl border transition-all",
              privateInfo ? (privateInfo.role === 'Liberal' ? "border-blue-900/50 bg-blue-900/20" : "border-red-900/50 bg-red-900/20") : "border-[#333] bg-[#222]"
            )}
          >
            {privateInfo?.role === 'Liberal' ? (
              <Bird className="w-3.5 h-3.5 sm:w-4 h-4 text-blue-400" />
            ) : privateInfo?.role === 'Hitler' ? (
              <HitlerIcon className="w-3.5 h-3.5 sm:w-4 h-4 text-red-500" />
            ) : (
              <Skull className={cn("w-3.5 h-3.5 sm:w-4 h-4", privateInfo ? "text-red-500" : "text-[#666]")} />
            )}
          </button>
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#222] border border-[#333] flex items-center justify-center hover:border-red-900/50 transition-colors overflow-hidden relative shrink-0"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-3.5 h-3.5 sm:w-4 h-4 text-[#666]" />
            )}
            {user?.activeFrame && (
              <div className={cn(
                "absolute inset-0 border-2 rounded-xl pointer-events-none",
                getFrameStyles(user.activeFrame)
              )} />
            )}
          </button>
          <div className="w-[1px] h-5 sm:h-6 bg-[#222] mx-0.5 sm:mx-1" />
          <button 
            onClick={handleLeaveRoom}
            className="p-2 sm:p-2.5 text-[#444] hover:text-red-500 transition-colors bg-[#141414] border border-[#222] rounded-xl"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 h-4" />
          </button>
        </div>
      </header>

      <main className={cn(
        "flex-1 flex flex-col min-h-0 relative",
        gameState?.fascistPolicies >= 3 && gameState?.phase !== 'GameOver' && "animate-danger-pulse"
      )}>
        {/* Policy Tracks (Compact) */}
        <div className="p-4 grid grid-cols-2 gap-4 bg-[#1a1a1a]/50 border-b border-[#222] shrink-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-mono text-blue-400/70">
              <div className="flex items-center gap-1">
                <Bird className="w-3 h-3" />
                <span>Liberal</span>
              </div>
              <span>{gameState.liberalPolicies}/5</span>
            </div>
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i}
                  className={cn(
                    "flex-1 h-8 rounded-sm border transition-all duration-500",
                    i < gameState.liberalPolicies 
                      ? "bg-blue-900/40 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]" 
                      : "bg-[#141414] border-[#222]"
                  )}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-mono text-red-500/70">
              <div className="flex items-center gap-1">
                <Skull className="w-3 h-3" />
                <span>Fascist</span>
              </div>
              <span>{gameState.fascistPolicies}/6</span>
            </div>
            <div className="flex gap-1">
              {[...Array(6)].map((_, i) => {
                const slotIndex = i + 1;
                const numPlayers = gameState.players.length;
                let power = "";
                let description = "";
                let Icon = Skull;

                if (numPlayers <= 6) {
                  if (slotIndex === 3) { power = "Peek"; description = "President examines top 3 policies"; Icon = Eye; }
                  if (slotIndex === 4 || slotIndex === 5) { power = "Kill"; description = "President executes a player"; Icon = Target; }
                } else if (numPlayers <= 8) {
                  if (slotIndex === 2) { power = "Inv"; description = "President investigates a player's party"; Icon = Search; }
                  if (slotIndex === 3) { power = "Spec"; description = "President chooses next candidate"; Icon = Zap; }
                  if (slotIndex === 4 || slotIndex === 5) { power = "Kill"; description = "President executes a player"; Icon = Target; }
                } else {
                  if (slotIndex === 1 || slotIndex === 2) { power = "Inv"; description = "President investigates a player's party"; Icon = Search; }
                  if (slotIndex === 3) { power = "Spec"; description = "President chooses next candidate"; Icon = Zap; }
                  if (slotIndex === 4 || slotIndex === 5) { power = "Kill"; description = "President executes a player"; Icon = Target; }
                }
                if (slotIndex === 6) { power = "Win"; description = "Fascists win immediately"; Icon = Trophy; }

                return (
                  <div 
                    key={i}
                    className={cn(
                      "flex-1 h-8 rounded-sm border transition-all duration-500 relative group cursor-help",
                      i < gameState.fascistPolicies 
                        ? "bg-red-900/40 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.2)]" 
                        : (i >= 3 ? "bg-red-900/10 border-red-900/30" : "bg-[#141414] border-[#222]")
                    )}
                  >
                    {power && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity">
                        <Icon className="w-3 h-3 text-red-500" />
                      </div>
                    )}
                    {/* Tooltip */}
                    {power && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-[#1a1a1a] border border-[#333] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl">
                        <div className="text-[8px] font-mono text-red-500 uppercase mb-1">{power}</div>
                        <div className="text-[7px] text-[#888] leading-tight">{description}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Spectators List (Compact) */}
        {gameState.spectators.length > 0 && (
          <div className="h-6 px-4 bg-[#141414] border-b border-[#222] flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Eye className="w-2.5 h-2.5 text-[#444]" />
              <span className="text-[7px] font-mono uppercase tracking-widest text-[#444]">Spectators ({gameState.spectators.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {gameState.spectators.map(s => (
                <div key={s.id} className="flex items-center gap-1 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#222] overflow-hidden border border-[#333]">
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-1.5 h-1.5 text-[#444] m-auto" />
                    )}
                  </div>
                  <span className="text-[8px] text-[#666]">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Election Tracker (Mini) */}
        <div className="h-8 flex items-center justify-center gap-3 bg-[#141414] shrink-0">
          <span className="text-[8px] uppercase tracking-[0.2em] text-[#444] font-mono">Election Tracker</span>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full border transition-all duration-300",
                  gameState.electionTracker === i 
                    ? "bg-white border-white scale-125 shadow-[0_0_5px_white]" 
                    : "border-[#333] bg-transparent"
                )}
              />
            ))}
          </div>
        </div>

        {/* Players Grid (Fit to size, no scroll) */}
        <div className="flex-1 p-2 sm:p-3 min-h-0">
          <div className={cn(
            "grid gap-1.5 sm:gap-3 h-full",
            "grid-cols-2", // Default mobile
            gameState.players.length <= 6 ? "grid-rows-3" : 
            gameState.players.length <= 8 ? "grid-rows-4" : "grid-rows-5",
            "sm:grid-cols-5 sm:grid-rows-2" // Desktop
          )}>
            {gameState.players.map((p) => {
              const prevVote = gameState.previousVotes?.[p.id];
              const isManyPlayers = gameState.players.length > 6;
              return (
                <div 
                  key={p.id}
                  className={cn(
                    "relative p-1 sm:p-4 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center min-h-0 card-border overflow-hidden",
                    p.isAlive ? "bg-[#1a1a1a]/80 backdrop-blur-sm border-[#222]" : "bg-[#111]/50 border-transparent opacity-50 grayscale",
                    p.isPresidentialCandidate && "border-yellow-500/50 ring-1 ring-yellow-500/20",
                    p.isChancellorCandidate && "border-blue-500/50 ring-1 ring-blue-500/20",
                    p.isPresident && "bg-yellow-900/20 border-yellow-500 shadow-lg shadow-yellow-500/10",
                    p.isChancellor && "bg-blue-900/20 border-blue-500 shadow-lg shadow-blue-500/10"
                  )}
                >
                  {speakingPlayers[p.id] && (
                    <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[inset_0_0_20px_rgba(16,185,129,0.4)] border border-emerald-500/50 z-20" />
                  )}
                  <motion.div 
                    animate={{ rotateY: prevVote ? 180 : 0 }}
                    transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                    className="w-full h-full relative preserve-3d"
                  >
                    {/* Front: Player Info */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center backface-hidden">
                      <div className={cn(
                        "flex flex-col items-center text-center min-h-0 overflow-hidden",
                        isManyPlayers ? "gap-0.5" : "gap-1 sm:gap-2"
                      )}>
                        <div className="relative shrink-0">
                          <div className={cn(
                            "rounded-full bg-[#222] flex items-center justify-center border border-[#333] relative overflow-hidden",
                            isManyPlayers ? "w-6 h-6 sm:w-12 sm:h-12" : "w-10 h-10 sm:w-12 sm:h-12"
                          )}>
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <Users className={cn("text-[#666]", isManyPlayers ? "w-3 h-3 sm:w-6 sm:h-6" : "w-5 h-5 sm:w-6 sm:h-6")} />
                            )}
                            {p.activeFrame && (
                              <div className={cn(
                                "absolute inset-0 border-2 sm:border-4 rounded-full pointer-events-none",
                                getFrameStyles(p.activeFrame)
                              )} />
                            )}
                            {!p.isAlive && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                                <Skull className={cn("text-red-600 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]", isManyPlayers ? "w-4 h-4 sm:w-8 sm:h-8" : "w-6 h-6 sm:w-8 sm:h-8")} />
                              </div>
                            )}
                            
                            {/* Mobile Voting Overlay (Inside for clipping) */}
                            {(gameState.phase === 'Voting' || gameState.phase === 'Voting_Reveal') && p.vote && (
                              <div className="sm:hidden absolute inset-0 flex items-center justify-center bg-green-500/40 backdrop-blur-[1px]">
                                <Check className="w-4 h-4 text-white opacity-100 drop-shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
                              </div>
                            )}
                          </div>

                          {/* Mobile Role Badges (Outside overflow-hidden) */}
                          <div className="sm:hidden absolute top-0 -right-1 flex flex-col gap-0.5 z-10">
                            {(p.isPresident || p.isPresidentialCandidate) && (
                              <div className="w-3 h-3 bg-yellow-500 rounded-full border border-[#1a1a1a] flex items-center justify-center shadow-sm">
                                <span className="text-[7px] font-bold text-black leading-none">P</span>
                              </div>
                            )}
                            {(p.isChancellor || p.isChancellorCandidate) && (
                              <div className="w-3 h-3 bg-blue-500 rounded-full border border-[#1a1a1a] flex items-center justify-center shadow-sm">
                                <span className="text-[7px] font-bold text-white leading-none">C</span>
                              </div>
                            )}
                          </div>

                          {p.activeFrame && (
                            <div className={cn(
                              "absolute -inset-1 border-2 rounded-full pointer-events-none",
                              p.activeFrame === 'frame-red' && "border-red-500",
                              p.activeFrame === 'frame-gold' && "border-yellow-500",
                              p.activeFrame === 'frame-blue' && "border-blue-500",
                              p.activeFrame === 'frame-rainbow' && "border-purple-500",
                              p.activeFrame === 'frame-neon' && "border-emerald-500",
                              p.activeFrame === 'frame-shadow' && "border-gray-500"
                            )} />
                          )}
                        </div>
                        <div className={cn(
                          "font-thematic tracking-wide truncate w-full px-1 leading-tight",
                          isManyPlayers ? "text-[9px] sm:text-[16px]" : "text-[11px] sm:text-[16px]",
                          p.isAlive ? "text-white/90" : "text-[#444]"
                        )}>
                          {p.name} {p.id === socket.id && "(You)"}
                        </div>
                        
                        {/* Desktop Only Badges */}
                        <div className="hidden sm:flex flex-wrap justify-center gap-1 shrink-0">
                          {(p.isPresident || p.isPresidentialCandidate) && (
                            <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-500 font-mono uppercase rounded border border-yellow-900/50 text-[9px]">
                              {p.isPresident ? 'President' : 'Candidate'}
                            </span>
                          )}
                          {(p.isChancellor || p.isChancellorCandidate) && (
                            <span className="px-2 py-0.5 bg-blue-900/40 text-blue-500 font-mono uppercase rounded border border-blue-900/50 text-[9px]">
                              {p.isChancellor ? 'Chancellor' : 'Candidate'}
                            </span>
                          )}
                          {!p.isAlive && <span className="px-2 py-0.5 bg-red-900/20 text-red-500 font-mono uppercase rounded text-[9px]">Dead</span>}
                          {gameState.phase === 'Lobby' && p.isReady && (
                            <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-500 font-mono uppercase rounded border border-emerald-900/50 text-[9px]">
                              Ready
                            </span>
                          )}
                        </div>
                        {(gameState.phase === 'Voting' || gameState.phase === 'Voting_Reveal') && p.vote && (
                          <div className="hidden sm:flex font-mono text-green-500 items-center gap-0.5 shrink-0 text-[10px]">
                            <Check className="w-3 h-3" /> Voted
                          </div>
                        )}
                        
                        {/* Mobile Dead Badge */}
                        {!p.isAlive && (
                          <span className="sm:hidden px-1 py-0.5 bg-red-900/20 text-red-500 font-mono uppercase rounded text-[6px]">Dead</span>
                        )}
                      </div>
                    </div>

                    {/* Back: Vote Reveal */}
                    <div className={cn(
                      "absolute inset-0 flex flex-col items-center justify-center backface-hidden rotate-y-180 rounded-xl border-2",
                      getVoteStyles(p.activeVotingStyle, prevVote)
                    )}>
                      <div className="text-2xl font-thematic uppercase tracking-widest leading-none">{prevVote}</div>
                      <div className="text-[8px] font-mono uppercase mt-1">({prevVote === 'Ja' ? 'YES' : 'NO'})</div>
                    </div>
                  </motion.div>

                  {/* Interaction Overlay */}
                  {gameState.phase === 'Election' && isPresidentialCandidate && p.id !== socket.id && p.isAlive && (
                  (() => {
                    const aliveCount = gameState.players.filter(pl => pl.isAlive).length;
                    const isEligible = !p.wasChancellor && !(aliveCount > 5 && p.wasPresident);
                    if (!isEligible) return null;
                    return (
                      <button 
                        onClick={() => socket.emit('nominateChancellor', p.id)}
                        className="absolute inset-0 bg-blue-900/80 rounded-xl flex items-center justify-center font-thematic tracking-wide text-white text-[12px] uppercase"
                      >
                        Nominate
                      </button>
                    );
                  })()
                )}
                {gameState.phase === 'Executive_Action' && isPresident && p.id !== socket.id && p.isAlive && (
                  <button 
                    onClick={() => socket.emit('performExecutiveAction', p.id)}
                    className="absolute inset-0 bg-red-900/80 rounded-xl flex items-center justify-center font-serif italic text-white text-[9px] text-center px-1"
                  >
                    {gameState.currentExecutiveAction}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

        {/* Action & Last Log Bar */}
        <div className="shrink-0 bg-[#1a1a1a] border-t border-[#222] flex flex-col">
          {/* Current Status */}
          <div className="px-4 py-3 bg-white/5 border-b border-[#222]">
            <div className="text-[9px] uppercase tracking-[0.2em] text-[#666] font-mono mb-1">Current Phase</div>
            <div className="text-xs font-serif italic text-white">
              {gameState.phase === 'Lobby' && `Waiting for players (${gameState.players.length}/${gameState.maxPlayers})...`}
              {gameState.phase === 'Election' && `${gameState.players[gameState.presidentIdx].name} is nominating a Chancellor.`}
              {(gameState.phase === 'Voting' || gameState.phase === 'Voting_Reveal') && "The Assembly is voting."}
              {gameState.phase === 'Legislative_President' && "President is reviewing policies."}
              {gameState.phase === 'Legislative_Chancellor' && "Chancellor is enacting a policy."}
              {gameState.phase === 'Executive_Action' && `Executive Action: ${gameState.currentExecutiveAction}`}
              {gameState.phase === 'GameOver' && `${gameState.winner} are victorious!`}
            </div>
          </div>

          {/* Controls (Voting, Legislative) - Static Height to prevent shift */}
          <div className="px-4 py-2 sm:py-3 h-24 sm:h-32 flex items-center justify-center">
            {gameState.phase === 'Voting' && me?.isAlive && !me.vote && (
              <div className="flex gap-3 sm:gap-4 w-full justify-center h-full items-center">
                <button 
                  onClick={() => {
                    socket.emit('vote', 'Ja');
                    playSound('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
                  }}
                  className={cn(
                    "flex-1 h-20 sm:h-24 rounded-xl border-2 sm:border-4 flex flex-col items-center justify-center transition-all hover:scale-[1.02] active:scale-95 shadow-lg",
                    getVoteStyles(user?.activeVotingStyle, 'Ja')
                  )}
                >
                  <span className="text-2xl sm:text-3xl font-thematic uppercase leading-none">Ja!</span>
                  <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-widest opacity-60">(YES)</span>
                </button>
                <button 
                  onClick={() => {
                    socket.emit('vote', 'Nein');
                    playSound('https://assets.mixkit.co/active_storage/sfx/251/251-preview.mp3');
                  }}
                  className={cn(
                    "flex-1 h-20 sm:h-24 rounded-xl border-2 sm:border-4 flex flex-col items-center justify-center transition-all hover:scale-[1.02] active:scale-95 shadow-lg",
                    getVoteStyles(user?.activeVotingStyle, 'Nein')
                  )}
                >
                  <span className="text-2xl sm:text-3xl font-thematic uppercase leading-none">Nein!</span>
                  <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-widest opacity-60">(NO)</span>
                </button>
              </div>
            )}

            {gameState.phase === 'Legislative_President' && isPresident && (
              <div className="flex gap-2 sm:gap-3 w-full justify-center h-full items-center">
                {gameState.drawnPolicies.map((p, i) => (
                  <button 
                    key={i}
                    onClick={() => socket.emit('presidentDiscard', i)}
                    className={cn(
                      "flex-1 h-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition-all",
                      getPolicyStyles(user?.activePolicyStyle, p)
                    )}
                  >
                    {p === 'Liberal' ? <Bird className="w-5 h-5 sm:w-6 sm:h-6" /> : <Skull className="w-5 h-5 sm:w-6 sm:h-6" />}
                    <span className="text-[7px] sm:text-[8px] font-mono uppercase tracking-widest">Discard</span>
                  </button>
                ))}
              </div>
            )}

            {gameState.phase === 'Legislative_Chancellor' && isChancellor && (
              <div className="flex gap-2 sm:gap-4 w-full justify-center h-full items-center">
                {gameState.chancellorPolicies.map((p, i) => (
                  <button 
                    key={i}
                    onClick={() => socket.emit('chancellorPlay', i)}
                    className={cn(
                      "flex-1 h-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-all",
                      getPolicyStyles(user?.activePolicyStyle, p)
                    )}
                  >
                    {p === 'Liberal' ? <Bird className="w-5 h-5 sm:w-6 sm:h-6" /> : <Skull className="w-5 h-5 sm:w-6 sm:h-6" />}
                    <span className="text-[7px] sm:text-[8px] font-mono uppercase tracking-widest">Enact</span>
                  </button>
                ))}
              </div>
            )}

            {gameState.phase === 'GameOver' && (
              <div className="flex flex-col gap-3 w-full max-w-xs h-full justify-center">
                <div className="text-center p-4 rounded-2xl border-2 mb-2 bg-[#222] border-[#333] text-[#666]">
                  <div className="text-xl font-thematic tracking-wide uppercase">Game Over</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest">See Assembly Results</div>
                </div>
                <button 
                  onClick={() => socket.emit('playAgain')}
                  className="py-3 bg-white text-black font-thematic text-xl rounded-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5"
                >
                  Play Again
                </button>
              </div>
            )}

            {gameState.phase === 'Lobby' && (
              <div className="flex flex-col gap-2 w-full max-w-xs h-full justify-center">
                <button 
                  onClick={() => socket.emit('toggleReady')}
                  className={cn(
                    "py-3 font-thematic text-xl rounded-lg shadow-xl transition-all active:scale-95",
                    me?.isReady 
                      ? "bg-emerald-500 text-white shadow-emerald-500/10" 
                      : "bg-white text-black shadow-white/5"
                  )}
                >
                  {me?.isReady ? 'Ready!' : 'Ready Up'}
                </button>
                <div className="text-center">
                  <span className="text-[9px] uppercase tracking-widest text-[#666]">
                    {gameState.players.filter(p => !p.isAI && p.isReady).length} / {gameState.players.filter(p => !p.isAI).length} Players Ready
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Log Bar (Tappable) */}
          <button 
            onClick={() => setIsLogOpen(true)}
            className="h-12 px-4 flex items-center gap-3 bg-[#141414] hover:bg-[#1a1a1a] transition-colors border-t border-[#222] group"
          >
            <Scroll className="w-4 h-4 text-white group-hover:text-red-500 transition-colors" />
            <div className="flex-1 text-[11px] text-[#666] truncate text-left italic">
              {gameState.log[gameState.log.length - 1]}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-[#444] font-mono">Log</div>
          </button>

          {/* Game Over Modal (In-game overlay) */}
          <AnimatePresence>
            {gameState.phase === 'GameOver' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 z-[50] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 pb-16"
              >
                <motion.div 
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-full"
                >
                  <div className={cn(
                    "p-6 text-center space-y-2",
                    gameState.winner === 'Liberals' ? "bg-blue-900/20" : "bg-red-900/20"
                  )}>
                    {gameState.winner === 'Liberals' ? (
                      <Bird className="w-12 h-12 mx-auto text-blue-400" />
                    ) : gameState.winner === 'Fascists' ? (
                      <HitlerIcon className="w-12 h-12 mx-auto text-red-500" />
                    ) : (
                      <AlertTriangle className="w-12 h-12 mx-auto text-gray-500" />
                    )}
                    <div className={cn(
                      "text-3xl font-thematic tracking-wide uppercase",
                      gameState.winner === 'Liberals' ? "text-blue-400" : gameState.winner === 'Fascists' ? "text-red-500" : "text-gray-500"
                    )}>
                      {gameState.winner ? `${gameState.winner} Win!` : 'Inconclusive'}
                    </div>
                    <p className="text-[10px] text-[#666] font-mono uppercase tracking-[0.2em]">
                      {gameState.winReason || (gameState.winner ? 'The Assembly has reached its verdict.' : 'The Assembly has collapsed due to a disconnection.')}
                    </p>
                  </div>

                  <div className="p-6 space-y-4 overflow-hidden flex flex-col">
                    <button 
                      onClick={() => setIsLogOpen(true)}
                      className="w-full py-2 bg-[#222] text-[#888] border border-[#333] rounded-xl hover:bg-[#2a2a2a] hover:text-white transition-all font-mono text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shrink-0"
                    >
                      <Scroll className="w-3 h-3" />
                      View Assembly Log
                    </button>
                    <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[#444] font-mono border-b border-[#222] pb-2 flex justify-between shrink-0">
                        <span>Final Role Reveal</span>
                        <span>Secret Identity</span>
                      </div>
                      <div className="space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        {gameState.players.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#222]/30">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#222] flex items-center justify-center text-[10px] text-[#666] font-mono overflow-hidden border border-[#333]">
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                  p.name.charAt(0)
                                )}
                              </div>
                              <span className="text-sm text-white font-medium">{p.name}</span>
                            </div>
                            <div className={cn(
                              "px-3 py-1 rounded-lg border text-[10px] font-mono uppercase tracking-widest",
                              p.role === 'Liberal' ? "bg-blue-900/20 border-blue-500/30 text-blue-400" :
                              p.role === 'Fascist' ? "bg-red-900/20 border-red-500/30 text-red-500" :
                              "bg-red-900/40 border-red-500 text-red-400 font-bold"
                            )}>
                              {p.role}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={() => socket.emit('playAgain')}
                        className="flex-1 py-3 bg-white text-black rounded-xl hover:bg-gray-200 transition-all font-thematic text-sm uppercase tracking-widest"
                      >
                        Play Again
                      </button>
                      <button 
                        onClick={handleLeaveRoom}
                        className="flex-1 py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all font-thematic text-sm uppercase tracking-widest border border-[#333]"
                      >
                        Lobby
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pause Overlay */}
          <AnimatePresence>
            {gameState.isPaused && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="w-20 h-20 bg-yellow-900/20 rounded-3xl flex items-center justify-center border border-yellow-500/30 mb-6 animate-pulse">
                  <AlertTriangle className="w-10 h-10 text-yellow-500" />
                </div>
                <h2 className="text-3xl font-thematic text-white tracking-widest uppercase mb-2">Assembly Paused</h2>
                <p className="text-sm font-mono text-yellow-500/70 uppercase tracking-widest mb-8 max-w-md">
                  {gameState.pauseReason || 'A player has disconnected. Waiting for reconnection...'}
                </p>
                
                <div className="flex flex-col items-center gap-4">
                  <div className="text-6xl font-thematic text-white tabular-nums">
                    {gameState.pauseTimer}s
                  </div>
                  <div className="w-48 h-1 bg-[#222] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: "100%" }}
                      animate={{ width: `${(gameState.pauseTimer || 0) / 60 * 100}%` }}
                      transition={{ duration: 1, ease: "linear" }}
                      className="h-full bg-yellow-500"
                    />
                  </div>
                </div>

                <p className="mt-12 text-[10px] text-[#444] font-mono uppercase tracking-widest max-w-xs">
                  {gameState.mode === 'Ranked' 
                    ? 'If the player fails to reconnect, the game will end as inconclusive.' 
                    : 'If the player fails to reconnect, they will be replaced by an AI bot.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Chat Modal */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed inset-y-0 right-0 z-[110] w-full sm:w-80 bg-[#1a1a1a] border-l border-[#222] shadow-2xl flex flex-col"
          >
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#222]">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-white" />
                <h3 className="font-thematic text-sm uppercase tracking-wider">Assembly Chat</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-2 text-[#666] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {gameState.messages.map((item, i) => {
                const senderPlayer = gameState.players.find(p => p.name === item.sender);
                
                if (item.type === 'round_separator') {
                  return (
                    <div key={i} className="w-full py-8 flex items-center justify-center">
                      <div className="flex items-center gap-4">
                        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#333]" />
                        <div className="px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center gap-2 shadow-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[10px] font-thematic uppercase tracking-[0.2em] text-white">Round {item.round}</span>
                        </div>
                        <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#333]" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className={cn("flex gap-2", item.sender === me?.name ? "flex-row-reverse" : "flex-row")}>
                    <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] shrink-0 overflow-hidden">
                      {senderPlayer?.avatarUrl ? (
                        <img src={senderPlayer.avatarUrl} alt={item.sender} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-[#444] m-2" />
                      )}
                    </div>
                    <div className={cn("flex flex-col", item.sender === me?.name ? "items-end" : "items-start")}>
                      <div className="text-[9px] text-[#444] font-mono mb-1">{item.sender}</div>
                      {item.type !== 'declaration' && item.type !== 'failed_election' ? (
                        <div className={cn(
                          "px-3 py-2 rounded-2xl text-xs max-w-[85%]",
                          item.sender === me?.name ? "bg-red-900/20 text-red-100 rounded-tr-none" : "bg-[#222] text-[#aaa] rounded-tl-none"
                        )}>
                          {item.text}
                        </div>
                      ) : item.type === 'declaration' ? (
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-3 flex flex-col gap-1 max-w-[90%] shadow-lg">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[8px] font-mono text-[#666] uppercase tracking-widest">Policy Declaration</span>
                            <span className={cn(
                              "text-[7px] font-mono px-1 py-0.5 rounded border leading-none",
                              item.declaration?.type === 'President' ? "bg-yellow-900/20 border-yellow-500/30 text-yellow-500" : "bg-blue-900/20 border-blue-500/30 text-blue-500"
                            )}>{item.declaration?.type}</span>
                          </div>
                          <div className="text-[11px] text-[#888] leading-tight">
                            {item.declaration?.type === 'President' ? 'Drew' : 'Passed'}: {' '}
                            <span className="font-bold text-blue-400"><b>{item.declaration?.libs}</b> Liberal</span> and {' '}
                            <span className="font-bold text-red-500"><b>{item.declaration?.fas}</b> Fascist</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-900/10 border border-red-500/30 rounded-xl p-3 flex flex-col gap-1 max-w-[90%] shadow-lg">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[8px] font-mono text-red-500 uppercase tracking-widest">Government Failed</span>
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                          </div>
                          <div className="text-[11px] text-red-200/70 leading-tight italic">
                            The Assembly could not reach a majority. The Election Tracker has advanced.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t border-[#222] bg-[#141414]">
              <div className="relative">
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={(!me?.isAlive && gameState.phase !== 'GameOver') ? "Dead players cannot speak..." : "Type a message..."}
                  disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
                  className={cn(
                    "w-full bg-[#1a1a1a] border border-[#333] rounded-full pl-4 pr-10 py-2 text-xs focus:outline-none focus:border-red-900/50",
                    (!me?.isAlive && gameState.phase !== 'GameOver') && "opacity-50 cursor-not-allowed"
                  )}
                />
                <button 
                  type="submit" 
                  disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
                  className="absolute right-1 top-1 p-1 text-red-500 hover:text-red-400 disabled:text-[#333]"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Investigation Result Modal */}
      <AnimatePresence>
        {investigationResult && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="max-w-xs w-full bg-[#1a1a1a] border border-blue-900/50 rounded-3xl p-8 text-center space-y-6 shadow-[0_0_50px_rgba(30,58,138,0.3)]">
              <div className="w-16 h-16 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto border border-blue-900/50">
                <Shield className="w-8 h-8 text-blue-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-widest text-[#666] font-mono">Investigation Result</h3>
                <div className="text-xl font-serif italic text-white">{investigationResult.targetName}</div>
                <div className={cn(
                  "text-2xl font-serif italic uppercase tracking-tighter",
                  investigationResult.role === 'Liberal' ? "text-blue-400" : "text-red-500"
                )}>
                  {investigationResult.role}
                </div>
              </div>
              <button 
                onClick={() => setInvestigationResult(null)}
                className="w-full py-3 bg-blue-900/40 text-blue-100 rounded-xl hover:bg-blue-900/60 transition-all text-sm font-serif italic border border-blue-900/50"
              >
                Understood
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Investigation Result Modal */}
      <AnimatePresence>
        {investigationResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-sm w-full bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto border border-yellow-900/50">
                {investigationResult.role === 'Liberal' ? <Bird className="w-8 h-8 text-blue-400" /> : <Skull className="w-8 h-8 text-red-500" />}
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Investigation Result</h3>
                <p className="text-xl font-serif italic text-white">{investigationResult.targetName} is a:</p>
              </div>
              <div className={cn(
                "text-4xl font-serif italic py-4 rounded-2xl border-2",
                investigationResult.role === 'Liberal' ? "bg-blue-900/10 border-blue-500/30 text-blue-400" : "bg-red-900/10 border-red-500/30 text-red-500"
              )}>
                {investigationResult.role}
              </div>
              <button 
                onClick={() => setInvestigationResult(null)}
                className="w-full py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-sm font-serif italic"
              >
                Understood
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Policy Peek Modal */}
      <AnimatePresence>
        {peekedPolicies && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-3xl p-8 text-center space-y-8 shadow-2xl"
            >
              <div className="space-y-2">
                <div className="w-12 h-12 bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto border border-yellow-900/50 mb-4">
                  <Eye className="w-6 h-6 text-yellow-500" />
                </div>
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Policy Peek</h3>
                <p className="text-lg font-serif italic text-white">Top 3 policies in the deck:</p>
              </div>
              
              <div className="flex justify-center gap-4">
                {peekedPolicies.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: i * 0.2 }}
                    className={cn(
                      "w-20 h-28 rounded-xl border-2 flex flex-col items-center justify-center gap-2 shadow-xl",
                      p === 'Liberal' ? "bg-blue-900/20 border-blue-500/50 text-blue-400" : "bg-red-900/20 border-red-500/50 text-red-500"
                    )}
                  >
                    {p === 'Liberal' ? <Scroll className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
                    <span className="text-[8px] font-mono uppercase tracking-widest">{p}</span>
                  </motion.div>
                ))}
              </div>

              <button 
                onClick={() => setPeekedPolicies(null)}
                className="w-full py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-sm font-serif italic border border-[#333]"
              >
                End Peek
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assembly Log (Slide-up Panel) */}
      <AnimatePresence>
        {isLogOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[150] bg-[#1a1a1a] flex flex-col"
          >
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#222] shrink-0 bg-[#1a1a1a]">
              <div className="flex items-center gap-3">
                <Scroll className="w-4 h-4 text-white" />
                <h3 className="font-thematic text-lg uppercase tracking-wider text-white">Assembly Log</h3>
              </div>
              <button 
                onClick={() => setIsLogOpen(false)} 
                className="p-2 text-[#666] hover:text-white transition-colors bg-[#222] rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar overscroll-contain bg-[#141414]">
              {gameState.log.map((entry, i) => {
                if (entry.startsWith('--- Round')) {
                  return (
                    <div key={i} className="w-full py-6 flex items-center justify-center">
                      <div className="flex items-center gap-4">
                        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#333]" />
                        <div className="px-4 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center gap-2 shadow-xl">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[10px] font-thematic uppercase tracking-[0.2em] text-white">{entry.replace(/---/g, '').trim()}</span>
                        </div>
                        <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#333]" />
                      </div>
                    </div>
                  );
                }
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "text-[11px] sm:text-xs leading-relaxed border-l-2 pl-4 py-2 transition-all hover:bg-white/5 rounded-r-lg", 
                      getLogColor(entry)
                    )}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="text-[8px] font-mono opacity-30 uppercase tracking-widest">Event #{i + 1}</div>
                      <div className="h-[1px] flex-1 bg-white/5" />
                    </div>
                    <div className="font-medium tracking-wide text-[#aaa]">{entry}</div>
                  </div>
                );
              })}
              <div ref={logEndRef} className="h-20" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Policy Enactment Animation */}
      <AnimatePresence>
        {showPolicyAnim && gameState.lastEnactedPolicy && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
          >
            <div className="perspective-1000">
              <motion.div
                initial={{ rotateY: 0, scale: 0.5, y: 100 }}
                animate={{ 
                  rotateY: 180, 
                  scale: 1.5, 
                  y: 0,
                  transition: { duration: 1, ease: "easeOut" }
                }}
                exit={{ 
                  y: -400, 
                  scale: 0.2, 
                  opacity: 0,
                  transition: { duration: 0.8, ease: "anticipate" }
                }}
                className="w-32 h-44 relative preserve-3d"
              >
                {/* Back of card (Hidden initially) */}
                <div className="absolute inset-0 bg-[#222] border-2 border-[#444] rounded-xl flex items-center justify-center backface-hidden">
                  <Shield className="w-12 h-12 text-[#444]" />
                </div>
                {/* Front of card (Revealed after flip) */}
                <div className={cn(
                  "absolute inset-0 rounded-xl border-4 flex flex-col items-center justify-center gap-3 backface-hidden rotate-y-180",
                  getPolicyStyles(gameState.players.find(p => p.id === gameState.lastEnactedPolicy?.playerId)?.activePolicyStyle, gameState.lastEnactedPolicy.type)
                )}>
                  {gameState.lastEnactedPolicy.type === 'Liberal' ? <Bird className="w-12 h-12" /> : <Skull className="w-12 h-12" />}
                  <span className="text-xs font-mono uppercase tracking-[0.2em] font-bold">
                    {gameState.lastEnactedPolicy.type}
                  </span>
                </div>
              </motion.div>
            </div>
            
            {/* Success particles or flash */}
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 4, opacity: [0, 0.5, 0] }}
              transition={{ delay: 0.8, duration: 1 }}
              className={cn(
                "absolute w-64 h-64 rounded-full blur-3xl",
                gameState.lastEnactedPolicy.type === 'Liberal' ? "bg-blue-500/20" : "bg-red-500/20"
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dossier Modal */}
      <AnimatePresence>
        {isDossierOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="max-w-sm w-full bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Your Secret Dossier</h3>
                  <button onClick={() => setIsDossierOpen(false)} className="text-[#444] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {privateInfo ? (
                  <div className="space-y-6">
                    <div className={cn(
                      "p-8 rounded-2xl border-2 text-center space-y-4",
                      privateInfo.role === 'Liberal' ? "bg-blue-900/10 border-blue-500/30" : "bg-red-900/10 border-red-500/30"
                    )}>
                      <div className="text-[10px] text-[#888] uppercase tracking-[0.2em] font-mono">Secret Identity</div>
                      <div className="flex justify-center">
                        {privateInfo.role === 'Liberal' ? (
                          <Bird className="w-16 h-16 text-blue-400" />
                        ) : privateInfo.role === 'Hitler' ? (
                          <HitlerIcon className="w-16 h-16 text-red-500" />
                        ) : (
                          <Skull className="w-16 h-16 text-red-500" />
                        )}
                      </div>
                      <div className={cn(
                        "text-5xl font-thematic tracking-wide uppercase",
                        privateInfo.role === 'Liberal' ? "text-blue-400" : "text-red-500"
                      )}>
                        {privateInfo.role}
                      </div>
                      <div className="text-[10px] text-[#666] italic">
                        {privateInfo.role === 'Liberal' ? "Protect the Chancellor, stop the Fascists." : "Enact Fascist policies, elect Hitler."}
                      </div>
                    </div>

                    {privateInfo.fascists && (
                      <div className="space-y-3">
                        <div className="text-[10px] uppercase tracking-widest text-[#666] border-b border-[#222] pb-2">Your Teammates</div>
                        {privateInfo.fascists.map(f => (
                          <div key={f.id} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              {f.role === 'Hitler' ? <HitlerIcon className="w-4 h-4 text-red-500" /> : <Skull className="w-4 h-4 text-red-500" />}
                              <span className="text-sm text-[#aaa]">{f.name}</span>
                            </div>
                            <span className={cn(
                              "text-[10px] font-mono uppercase px-2 py-0.5 rounded",
                              f.role === 'Hitler' ? "bg-red-900/40 text-red-500 border border-red-900/50" : "bg-[#222] text-[#666]"
                            )}>
                              {f.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-[#444] italic text-sm">
                    Awaiting role assignment...
                  </div>
                )}

                <button 
                  onClick={() => setIsDossierOpen(false)}
                  className="w-full py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-sm font-serif italic"
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Declaration UI Modal */}
      <AnimatePresence>
        {showDeclarationUI && declarationType && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-sm w-full bg-[#1a1a1a] border border-[#333] rounded-3xl overflow-hidden shadow-2xl p-8 space-y-6"
            >
              <div className="text-center space-y-2">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Policy Declaration</h3>
                <p className="text-xl font-thematic text-white tracking-wide uppercase">What will you declare?</p>
                <p className="text-[10px] text-[#444] italic">You can choose to tell the truth or lie to the Assembly.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-[#666] font-mono ml-1">Liberal Policies</label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].filter(n => n <= (declarationType === 'President' ? 3 : 2)).map(n => (
                      <button
                        key={n}
                        onClick={() => {
                          setDeclLibs(n);
                          setDeclFas((declarationType === 'President' ? 3 : 2) - n);
                        }}
                        className={cn(
                          "flex-1 py-3 rounded-xl border transition-all font-mono",
                          declLibs === n ? "bg-blue-900/40 border-blue-500 text-blue-400" : "bg-[#141414] border-[#222] text-[#444]"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#141414] border border-[#222] text-center">
                  <div className="text-xs text-[#888]">
                    Declaring: <span className="font-bold text-blue-400"><b>{declLibs}</b> Liberal</span> and <span className="font-bold text-red-500"><b>{declFas}</b> Fascist</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    socket.emit('declarePolicies', { libs: declLibs, fas: declFas, type: declarationType });
                    setShowDeclarationUI(false);
                  }}
                  className="w-full py-4 bg-white text-black rounded-xl hover:bg-gray-200 transition-all font-thematic text-xl uppercase tracking-wide"
                >
                  Submit Declaration
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
      <AnimatePresence>
        {isProfileOpen && (
          <Profile 
            user={user!} 
            token={token!}
            onClose={() => setIsProfileOpen(false)} 
            onUpdateUser={setUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
