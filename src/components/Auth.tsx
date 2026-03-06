import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, User as UserIcon, Loader2, Chrome, MessageSquare } from 'lucide-react';
import { User } from '../types';
import { cn } from '../lib/utils';

interface AuthProps {
  onAuthSuccess: (user: User, token: string) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const avatarChoices = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Casper',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Toby',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
  ];

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        onAuthSuccess(event.data.user, event.data.token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess]);

  const handleSocialLogin = async (provider: 'google' | 'discord') => {
    // Request fullscreen on user click to avoid permission error later
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    try {
      const origin = window.location.origin;
      const response = await fetch(`/api/auth/${provider}/url?origin=${encodeURIComponent(origin)}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      const isIframe = window.self !== window.top;
      if (isIframe) {
        window.open(url, 'oauth_popup', 'width=600,height=700');
      } else {
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, avatarUrl: isLogin ? undefined : avatarUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onAuthSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-texture flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#1a1a1a] border border-[#222] rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#141414] rounded-2xl flex items-center justify-center border border-white/40 mb-4 overflow-hidden">
            <img src="https://storage.googleapis.com/secretchancellor/SC.png" alt="Secret Chancellor Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-3xl font-thematic text-white tracking-wide uppercase">Secret Chancellor</h1>
          <p className="text-[#666] text-sm mt-1">
            {isLogin ? 'Welcome back, Delegate' : 'Register for the Assembly'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono ml-1">Username</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
              <input 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#141414] border border-[#222] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-red-900/50 transition-colors"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141414] border border-[#222] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-red-900/50 transition-colors"
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          {!isLogin && (
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-[#444] font-mono ml-1">Choose Avatar</label>
              <div className="grid grid-cols-6 gap-2">
                {avatarChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setAvatarUrl(choice)}
                    className={cn(
                      "w-full aspect-square rounded-lg border-2 overflow-hidden transition-all",
                      avatarUrl === choice ? "border-red-500 scale-110" : "border-[#222] hover:border-[#333]"
                    )}
                  >
                    <img src={choice} alt="Avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-xs text-center font-mono bg-red-900/10 py-2 rounded-lg border border-red-900/20">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-thematic text-xl py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#222]"></div>
            </div>
            <span className="relative px-4 bg-[#1a1a1a] text-[10px] uppercase tracking-widest text-[#444] font-mono">Or continue with</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => handleSocialLogin('google')}
              className="flex items-center justify-center gap-2 py-2.5 bg-[#141414] border border-[#222] rounded-xl text-xs text-[#aaa] hover:text-white hover:border-[#333] transition-all"
            >
              <Chrome className="w-4 h-4" />
              <span>Google</span>
            </button>
            <button 
              onClick={() => handleSocialLogin('discord')}
              className="flex items-center justify-center gap-2 py-2.5 bg-[#141414] border border-[#222] rounded-xl text-xs text-[#aaa] hover:text-white hover:border-[#333] transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Discord</span>
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-[11px] text-[#666] hover:text-white transition-colors font-mono uppercase tracking-widest"
          >
            {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
