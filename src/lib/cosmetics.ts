import { Policy } from '../types';

export const getFrameStyles = (id: string) => {
  switch(id) {
    case 'frame-red': return "shadow-[inset_0_0_10px_rgba(239,68,68,0.5)]";
    case 'frame-gold': return "shadow-[inset_0_0_10px_rgba(234,179,8,0.5)]";
    case 'frame-blue': return "shadow-[inset_0_0_10px_rgba(59,130,246,0.5)]";
    case 'frame-rainbow': return "shadow-[inset_0_0_10px_rgba(168,85,247,0.5)] animate-pulse";
    case 'frame-neon': return "shadow-[inset_0_0_10px_rgba(16,185,129,0.5)]";
    case 'frame-shadow': return "shadow-[inset_0_0_10px_rgba(107,114,128,0.5)]";
    case 'frame-thorns': return "shadow-[0_0_15px_rgba(127,29,29,0.4)] after:content-[''] after:absolute after:inset-[-4px] after:border-2 after:border-red-900/30 after:rounded-3xl after:rotate-45";
    case 'frame-cyber': return "shadow-[0_0_15px_rgba(6,182,212,0.4)] before:content-[''] before:absolute before:top-0 before:left-0 before:w-2 before:h-2 before:bg-cyan-400 before:rounded-full";
    case 'frame-inferno': return "shadow-[0_0_20px_rgba(234,88,12,0.6)] animate-pulse";
    case 'frame-glitch': return "shadow-[2px_2px_0_rgba(236,72,153,0.5),-2px_-2px_0_rgba(6,182,212,0.5)]";
    case 'frame-royal': return "shadow-[0_0_15px_rgba(129,140,248,0.4)] before:content-[''] before:absolute before:top-[-8px] before:left-1/2 before:-translate-x-1/2 before:w-4 before:h-4 before:bg-indigo-400 before:rotate-45";
    case 'frame-pass-0': return "shadow-[0_0_20px_rgba(168,85,247,0.6)] animate-spin-slow animate-pulse";
    default: return "";
  }
};

export const getPolicyStyles = (styleId: string | undefined, type: Policy) => {
  const isCivil = type === 'Civil';
  switch(styleId) {
    case 'policy-vintage':
      return isCivil ? "bg-[#f5e6d3] border-[#8b4513] text-[#8b4513] shadow-md" : "bg-[#f5e6d3] border-[#4a0404] text-[#4a0404] shadow-md";
    case 'policy-modern':
      return isCivil ? "bg-white border-blue-600 text-blue-600" : "bg-white border-red-600 text-red-600";
    case 'policy-blueprint':
      return isCivil ? "bg-blue-800 border-white/50 text-white font-mono" : "bg-blue-900 border-white/30 text-white/80 font-mono";
    case 'policy-blood':
      return isCivil ? "bg-gray-800 border-red-900 text-red-500" : "bg-black border-red-600 text-red-600 shadow-[0_0_10px_rgba(220,38,38,0.3)]";
    default:
      return isCivil ? "bg-blue-900 border-blue-500/50 text-blue-400" : "bg-red-900 border-red-500/50 text-red-500";
  }
};

export const getVoteStyles = (styleId: string | undefined, type: 'Aye' | 'Nay') => {
  const isAye = type === 'Aye';
  switch(styleId) {
    case 'vote-wax':
      return isAye ? "bg-[#8b0000] border-[#5a0000] text-white shadow-[0_4px_0_#5a0000]" : "bg-[#1a1a1a] border-[#333] text-[#666]";
    case 'vote-digital':
      return isAye ? "bg-cyan-900/20 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]" : "bg-pink-900/20 border-pink-500 text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.4)]";
    case 'vote-ancient':
      return isAye ? "bg-[#d2b48c] border-[#8b4513] text-[#4a2c1d] font-serif" : "bg-[#c0c0c0] border-[#696969] text-[#2f4f4f] font-serif";
    case 'vote-pass-0':
      return isAye ? "bg-purple-900/40 border-purple-500 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-pulse" : "bg-gray-900/40 border-gray-500 text-gray-400 shadow-[0_0_15px_rgba(107,114,128,0.4)]";
    default:
      return isAye ? "bg-white border-white text-black" : "bg-black border-[#333] text-white";
  }
};

export const getBackgroundTexture = (id: string | undefined) => {
  switch(id) {
    case 'bg-leather': return 'https://www.transparenttextures.com/patterns/dark-leather.png';
    case 'bg-brushed': return 'https://www.transparenttextures.com/patterns/brushed-alum.png';
    case 'bg-diamonds': return 'https://www.transparenttextures.com/patterns/diagmonds-light.png';
    case 'bg-wood': return 'https://www.transparenttextures.com/patterns/dark-wood.png';
    case 'bg-paper': return 'https://www.transparenttextures.com/patterns/old-mathematics.png';
    case 'bg-concrete': return 'https://www.transparenttextures.com/patterns/concrete-wall.png';
    case 'bg-pass-0': return 'https://www.transparenttextures.com/patterns/gplay.png';
    default: return 'https://www.transparenttextures.com/patterns/carbon-fibre.png';
  }
};

export const getRarity = (price: number) => {
  if (price === 0) return { name: 'Common', color: 'text-gray-500' };
  if (price < 1000) return { name: 'Uncommon', color: 'text-emerald-500' };
  if (price < 2000) return { name: 'Rare', color: 'text-blue-500' };
  if (price < 3500) return { name: 'Epic', color: 'text-purple-500' };
  return { name: 'Legendary', color: 'text-yellow-500' };
};
