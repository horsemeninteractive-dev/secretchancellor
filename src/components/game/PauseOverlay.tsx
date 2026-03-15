import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { GameState } from '../../types';

interface PauseOverlayProps {
  gameState: GameState;
}

export const PauseOverlay = ({ gameState }: PauseOverlayProps) => (
  <AnimatePresence>
    {gameState.isPaused && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[100] bg-backdrop backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-20 h-20 bg-yellow-900/20 rounded-3xl flex items-center justify-center border border-yellow-500/30 mb-6 animate-pulse">
          <AlertTriangle className="w-10 h-10 text-yellow-500" />
        </div>
        <h2 className="text-3xl font-thematic text-primary tracking-widest uppercase mb-2">Assembly Paused</h2>
        <p className="text-sm font-mono text-yellow-500/70 uppercase tracking-widest mb-8 max-w-md">
          {gameState.pauseReason || 'A player has disconnected. Waiting for reconnection...'}
        </p>
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl font-thematic text-primary tabular-nums">{gameState.pauseTimer}s</div>
          <div className="w-48 h-1 bg-card rounded-full overflow-hidden">
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: `${((gameState.pauseTimer || 0) / 60) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
              className="h-full bg-yellow-500"
            />
          </div>
        </div>
        <p className="mt-12 text-[10px] text-ghost font-mono uppercase tracking-widest max-w-xs">
          {gameState.mode === 'Ranked'
            ? 'If the player fails to reconnect, the game will end as inconclusive.'
            : 'If the player fails to reconnect, they will be replaced by an AI bot.'}
        </p>
      </motion.div>
    )}
  </AnimatePresence>
);
