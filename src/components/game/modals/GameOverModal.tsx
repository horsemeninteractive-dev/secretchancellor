import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scroll, Scale, Eye } from 'lucide-react';
import { GameState } from '../../../types';
import { cn, getProxiedUrl } from '../../../lib/utils';
import { OverseerIcon } from '../../icons';

interface GameOverModalProps {
  gameState: GameState;
  onPlayAgain: () => void;
  onLeave: () => void;
  onOpenLog: () => void;
}

export const GameOverModal = ({ gameState, onPlayAgain, onLeave, onOpenLog }: GameOverModalProps) => (
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
          {/* Win banner */}
          <div className={cn(
            'p-[3vh] text-center border-b border-[#222]',
            gameState.winner === 'Civil' ? 'bg-blue-900/20' : gameState.winner === 'State' ? 'bg-red-900/20' : 'bg-[#1a1a1a]'
          )}>
            <div className={cn(
              'text-responsive-2xl font-thematic tracking-widest uppercase mb-1',
              gameState.winner === 'Civil' ? 'text-blue-400' : gameState.winner === 'State' ? 'text-red-500' : 'text-[#666]'
            )}>
              {gameState.winner === 'Civil'
                ? gameState.winReason || 'Charter Restored'
                : gameState.winner === 'State'
                  ? gameState.winReason || 'State Supremacy'
                  : 'Inconclusive'}
            </div>
            <p className="text-responsive-xs text-[#666] font-mono uppercase tracking-[0.2em]">
              {gameState.winner === 'Civil'
                ? 'The Charter has been defended.'
                : gameState.winner === 'State'
                  ? 'The Secretariat has fallen to the State.'
                  : 'The Assembly has collapsed due to a disconnection.'}
            </p>
          </div>

          <div className="p-[3vh] space-y-[2vh] overflow-hidden flex flex-col">
            <button
              onClick={onOpenLog}
              className="w-full py-[1vh] bg-[#222] text-[#888] border border-[#333] rounded-xl hover:bg-[#2a2a2a] hover:text-white transition-all font-mono text-responsive-xs uppercase tracking-widest flex items-center justify-center gap-2 shrink-0"
            >
              <Scroll className="w-[2vh] h-[2vh]" />
              View Assembly Log
            </button>

            <div className="space-y-[2vh] flex-1 overflow-hidden flex flex-col">
              <div className="text-responsive-xs uppercase tracking-[0.2em] text-[#444] font-mono border-b border-[#222] pb-2 flex justify-between shrink-0">
                <span>Final Identity Reveal</span>
                <span>Secret Identity</span>
              </div>
              <div className="space-y-[1vh] overflow-y-auto custom-scrollbar pr-2">
                {gameState.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-[1vh] border-b border-[#222]/30">
                    <div className="flex items-center gap-3">
                      <div className="w-[4vh] h-[4vh] rounded-full bg-[#222] flex items-center justify-center text-responsive-xs text-[#666] font-mono overflow-hidden border border-[#333]">
                        {p.avatarUrl
                          ? <img src={getProxiedUrl(p.avatarUrl)} alt={p.name} className="w-full h-full object-cover" />
                          : p.name.charAt(0)}
                      </div>
                      <span className="text-responsive-sm text-white font-medium">{p.name}</span>
                    </div>
                    <div className={cn(
                      'px-3 py-1 rounded-lg border text-responsive-xs font-mono uppercase tracking-widest',
                      p.role === 'Civil' ? 'bg-blue-900/20 border-blue-500/30 text-blue-400' :
                      p.role === 'State' ? 'bg-red-900/20 border-red-500/30 text-red-500' :
                      'bg-red-900/40 border-red-500 text-red-400 font-bold'
                    )}>
                      {p.role === 'Civil' ? 'Civil' : p.role === 'State' ? 'State' : 'The Overseer'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onPlayAgain}
                className="flex-1 py-[1.5vh] bg-white text-black rounded-xl hover:bg-gray-200 transition-all font-thematic text-responsive-sm uppercase tracking-widest"
              >
                Play Again
              </button>
              <button
                onClick={onLeave}
                className="flex-1 py-[1.5vh] bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all font-thematic text-responsive-sm uppercase tracking-widest border border-[#333]"
              >
                Lobby
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
