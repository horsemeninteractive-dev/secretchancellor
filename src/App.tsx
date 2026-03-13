import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { GameState, Role, User, PrivateInfo } from './types';
import { motion } from 'motion/react';
import { Auth } from './components/Auth';
import { Lobby } from './components/Lobby';
import { Profile } from './components/Profile';
import { GameRoom } from './components/GameRoom';
import { UpdateBanner } from './components/UpdateBanner';
import { InviteModal } from './components/game/modals/InviteModal';
import { MUSIC_TRACKS, SOUND_PACKS } from './lib/audio';
import { discordSdk, setupDiscordSdk } from './lib/discord';
import { cn, getProxiedUrl } from './lib/utils';

const CLIENT_VERSION = 'v0.9.0';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isInteracted, setIsInteracted] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [privateInfo, setPrivateInfo] = useState<PrivateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDiscord, setIsDiscord] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ fromUsername: string; roomId: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      await setupDiscordSdk();
      setIsDiscord(!!discordSdk?.instanceId);
      setIsMobile(discordSdk?.platform === 'mobile' || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
      console.log("Discord SDK initialized, instanceId:", discordSdk?.instanceId, "platform:", discordSdk?.platform);
      
      // Attempt auto-login if in Discord
      if (discordSdk?.instanceId) {
        try {
          console.log("Attempting auto-login...");
          const { code } = await discordSdk.commands.authorize({
            client_id: (import.meta as any).env?.VITE_DISCORD_CLIENT_ID || "",
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds"],
          });
          console.log("Auto-login code received");

          const response = await fetch('/api/auth/discord/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          
          if (response.ok) {
            console.log("Auto-login successful");
            const data = await response.json();
            setUser(data.user);
            setToken(data.token);
            localStorage.setItem('token', data.token);
          } else {
            const data = await response.json();
            console.error("Auto-login server error:", data);
          }
        } catch (err) {
          console.error("Auto-login failed", err);
        }
      } else {
        console.log("Auto-login skipped: not in Discord");
      }
      setLoading(false);
    };
    init().catch(console.error);
  }, []);

  // Audio & Settings State
  const [isMusicOn, setIsMusicOn] = useState(() => localStorage.getItem('isMusicOn') !== 'false');
  const [isSoundOn, setIsSoundOn] = useState(() => localStorage.getItem('isSoundOn') !== 'false');
  const [musicVolume, setMusicVolume] = useState(() => parseInt(localStorage.getItem('musicVolume') || '50'));
  const [soundVolume, setSoundVolume] = useState(() => parseInt(localStorage.getItem('soundVolume') || '50'));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<string>(localStorage.getItem('ttsVoice') || '');
  const [isAiVoiceEnabled, setIsAiVoiceEnabled] = useState(() => localStorage.getItem('isAiVoiceEnabled') !== 'false');
  const [uiScaleSetting, setUiScaleSetting] = useState(() => parseFloat(localStorage.getItem('uiScaleSetting') || '1'));
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('isMusicOn', String(isMusicOn));
    localStorage.setItem('isSoundOn', String(isSoundOn));
    localStorage.setItem('musicVolume', String(musicVolume));
    localStorage.setItem('soundVolume', String(soundVolume));
    localStorage.setItem('ttsVoice', ttsVoice);
    localStorage.setItem('isAiVoiceEnabled', String(isAiVoiceEnabled));
    localStorage.setItem('uiScaleSetting', String(uiScaleSetting));
  }, [isMusicOn, isSoundOn, musicVolume, soundVolume, ttsVoice, isAiVoiceEnabled, uiScaleSetting]);

  // Power Used TTS
  useEffect(() => {
    socket.on('powerUsed', (data: { role: string }) => {
      if (!isSoundOn) return;

      const utterance = new SpeechSynthesisUtterance(`${data.role} power used`);
      utterance.volume = soundVolume / 100;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === ttsVoice);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    });

    return () => {
      socket.off('powerUsed');
    };
  }, [isSoundOn, soundVolume, ttsVoice]);

  // Background Music Logic
  useEffect(() => {
    if (!isMusicOn || !isInteracted) {
      musicAudioRef.current?.pause();
      return;
    }
    const trackKey = user?.activeMusic || 'music-ambient';
    const url = getProxiedUrl(MUSIC_TRACKS[trackKey] || MUSIC_TRACKS['music-ambient']);
    
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio(url);
      musicAudioRef.current.loop = true;
    } else if (musicAudioRef.current.src !== url) {
      musicAudioRef.current.src = url;
    }
    
    musicAudioRef.current.volume = musicVolume / 100;
    musicAudioRef.current.play().catch(() => {});
    
    return () => {
      musicAudioRef.current?.pause();
    };
  }, [isMusicOn, isInteracted, user?.activeMusic, musicVolume]);

  const playSound = (soundKey: string, overridePack?: string) => {
    if (!isSoundOn) return;
    const pack = overridePack || user?.activeSoundPack || 'default';
    const url = getProxiedUrl(SOUND_PACKS[pack]?.[soundKey] || SOUND_PACKS['default'][soundKey]);
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = soundVolume / 100;
    audio.play().catch(() => {});
  };

  const playMusic = (trackKey: string) => {
    if (!musicAudioRef.current) return;
    const url = getProxiedUrl(MUSIC_TRACKS[trackKey] || MUSIC_TRACKS['music-ambient']);
    musicAudioRef.current.src = url;
    musicAudioRef.current.play().catch(() => {});
  };

  const stopMusic = () => {
    musicAudioRef.current?.pause();
  };

  // Version polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/version');
        if (!res.ok) return;
        const data = await res.json();
        if (data.version && data.version !== 'dev' && data.version !== CLIENT_VERSION) {
          setUpdateAvailable(true);
        }
      } catch { /* silently ignore */ }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Restore session
  useEffect(() => {
    if (token) {
      fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => { if (data.user) setUser(data.user); else setToken(null); })
        .catch(() => setToken(null));
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      socket.emit('userConnected', user.id);
    }
  }, [user]);

  // OAuth redirect token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUser = params.get('user');
    if (urlToken && urlUser) {
      try {
        const userData = JSON.parse(decodeURIComponent(urlUser));
        handleAuthSuccess(userData, urlToken);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) { console.error('Failed to parse user from URL', e); }
    }
  }, []);

  // Socket listeners
  useEffect(() => {
    socket.on('gameStateUpdate', (state: GameState) => {
      setGameState(state);
      setJoined(true);
    });
    socket.on('privateInfo', (info) => setPrivateInfo(info));
    socket.on('error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });
    socket.on('userUpdate', (updatedUser: User) => setUser(updatedUser));
    socket.on('friendInvite', (data: { fromUsername: string; roomId: string }) => {
      setPendingInvite(data);
    });
    return () => {
      socket.off('gameStateUpdate');
      socket.off('privateInfo');
      socket.off('error');
      socket.off('userUpdate');
      socket.off('friendInvite');
    };
  }, []);

  const handleAuthSuccess = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    socket.emit('userConnected', userData.id);
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen()
          .then(() => setIsInteracted(true))
          .catch(() => setIsInteracted(false));
      }
    } catch { setIsInteracted(false); }
  };

  const handleEnterAssembly = () => {
    setIsInteracted(true);
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* ignore */ }
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
        roomId, name: user.username, userId: user.id,
        activeFrame: user.activeFrame, activePolicyStyle: user.activePolicyStyle,
        activeVotingStyle: user.activeVotingStyle,
        maxPlayers, actionTimer, mode, isSpectator,
      });
      setJoined(true);
    }
  };

  const handleLeaveRoom = (onComplete?: () => void) => {
    socket.emit('leaveRoom');
    setJoined(false);
    setGameState(null);
    setPrivateInfo(null);
    
    const safeOnComplete = typeof onComplete === 'function' ? onComplete : undefined;

    if (token) {
      fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => { 
          if (data.user) setUser(data.user); 
          if (safeOnComplete) safeOnComplete(); 
        })
        .catch(() => { 
          if (safeOnComplete) safeOnComplete(); 
        });
    } else {
        if (safeOnComplete) safeOnComplete();
    }
  };

  return (
    <div className={cn("h-screen bg-[#0a0a0a] flex flex-col bg-texture", isDiscord && isMobile ? "pt-12" : "")}>
      <UpdateBanner visible={updateAvailable} />

      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9998] px-6 py-3 bg-red-900/90 text-red-100 rounded-2xl text-sm font-mono border border-red-700 shadow-2xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white font-mono">Loading...</div>
      ) : !token || !user ? (
        <Auth onAuthSuccess={handleAuthSuccess} />
      ) : !isInteracted && !document.fullscreenElement ? (
        <div className="flex-1 w-full bg-texture flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-[#1a1a1a] border border-[#222] rounded-3xl p-8 shadow-2xl text-center"
          >
            <div className="w-20 h-20 bg-[#141414] rounded-2xl flex items-center justify-center border border-white/40 mx-auto mb-6 overflow-hidden">
              <img src={getProxiedUrl("https://storage.googleapis.com/secretchancellor/SC.png")} alt="The Assembly Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
            </div>
            <h2 className="text-3xl font-thematic text-white tracking-wide uppercase mb-2">Welcome, {user.username}</h2>
            <div className="space-y-4 mb-8">
              <p className="text-[#888] text-xs font-serif italic leading-relaxed px-4">
                "The old world ended with The Crisis. Now, only The Assembly stands between us and total collapse. Will you defend the Civil Charter, or will you build the new State?"
              </p>
              <p className="text-[#666] text-[10px] font-mono uppercase tracking-[0.2em]">The Assembly awaits your assessment.</p>
            </div>
            <button
              onClick={handleEnterAssembly}
              className="w-full bg-white text-black font-thematic text-2xl py-4 rounded-xl hover:bg-gray-200 transition-all shadow-xl shadow-white/5 uppercase tracking-widest"
            >
              Enter Assembly
            </button>
          </motion.div>
        </div>
      ) : !joined || !gameState ? (
        <>
          <Lobby
            user={user}
            onJoinRoom={handleJoinRoom}
            onLogout={handleLogout}
            onOpenProfile={() => setIsProfileOpen(true)}
            playSound={playSound}
            uiScaleSetting={uiScaleSetting}
          />
          {isProfileOpen && (
            <Profile 
              user={user} 
              token={token!} 
              onClose={() => setIsProfileOpen(false)} 
              onUpdateUser={setUser}
              playSound={playSound}
              playMusic={playMusic}
              stopMusic={stopMusic}
              settings={{
                isMusicOn, setIsMusicOn,
                isSoundOn, setIsSoundOn,
                musicVolume, setMusicVolume,
                soundVolume, setSoundVolume,
                isFullscreen, setIsFullscreen,
                ttsVoice, setTtsVoice,
                isAiVoiceEnabled, setIsAiVoiceEnabled,
                uiScaleSetting, setUiScaleSetting
              }}
              onJoinRoom={(roomId) => { setIsProfileOpen(false); handleJoinRoom(roomId); }}
            />
          )}
          {pendingInvite && (
            <InviteModal
              inviterName={pendingInvite.fromUsername}
              roomId={pendingInvite.roomId}
              onAccept={() => { handleJoinRoom(pendingInvite.roomId); setPendingInvite(null); }}
              onReject={() => setPendingInvite(null)}
            />
          )}
        </>
      ) : (
        <>
          <GameRoom
            gameState={gameState}
            privateInfo={privateInfo}
            user={user}
            token={token}
            onLeaveRoom={handleLeaveRoom}
            onPlayAgain={() => socket.emit('playAgain')}
            onOpenProfile={() => setIsProfileOpen(true)}
            onJoinRoom={handleJoinRoom}
            setUser={setUser}
            setGameState={setGameState}
            setPrivateInfo={setPrivateInfo}
            updateAvailable={updateAvailable}
            playSound={playSound}
            soundVolume={soundVolume}
            ttsVoice={ttsVoice}
            isAiVoiceEnabled={isAiVoiceEnabled}
            uiScaleSetting={uiScaleSetting}
          />
          {isProfileOpen && (
            <Profile 
              user={user} 
              token={token!} 
              onClose={() => setIsProfileOpen(false)} 
              onUpdateUser={setUser}
              playSound={playSound}
              playMusic={playMusic}
              stopMusic={stopMusic}
              settings={{
                isMusicOn, setIsMusicOn,
                isSoundOn, setIsSoundOn,
                musicVolume, setMusicVolume,
                soundVolume, setSoundVolume,
                isFullscreen, setIsFullscreen,
                ttsVoice, setTtsVoice,
                isAiVoiceEnabled, setIsAiVoiceEnabled,
                uiScaleSetting, setUiScaleSetting
              }}
              roomId={gameState?.roomId}
              mode={gameState?.mode}
              onJoinRoom={(roomId) => { setIsProfileOpen(false); handleLeaveRoom(() => handleJoinRoom(roomId)); }}
            />
          )}
          {pendingInvite && (
            <InviteModal
              inviterName={pendingInvite.fromUsername}
              roomId={pendingInvite.roomId}
              onAccept={() => { handleLeaveRoom(() => handleJoinRoom(pendingInvite.roomId)); setPendingInvite(null); }}
              onReject={() => setPendingInvite(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
