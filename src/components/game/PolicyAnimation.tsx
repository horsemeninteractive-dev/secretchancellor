import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Scale, Eye } from 'lucide-react';
import { GameState } from '../../types';
import { getPolicyStyles } from '../../lib/cosmetics';
import { cn } from '../../lib/utils';

interface PolicyAnimationProps {
  gameState: GameState;
  show: boolean;
}

export const PolicyAnimation = ({ gameState, show }: PolicyAnimationProps) => (
  <AnimatePresence>
    {show && gameState.lastEnactedPolicy && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      >
        <div className="perspective-1000">
          <motion.div
            initial={{ rotateY: 0, scale: 0.5, y: 100 }}
            animate={{ rotateY: 180, scale: 1.5, y: 0, transition: { duration: 1, ease: 'easeOut' } }}
            exit={{ y: -400, scale: 0.2, opacity: 0, transition: { duration: 0.8, ease: 'anticipate' } }}
            className="w-32 h-44 relative preserve-3d"
          >
            <div className="absolute inset-0 bg-card border-2 border-strong rounded-xl flex items-center justify-center backface-hidden">
              <Shield className="w-12 h-12 text-ghost" />
            </div>
            <div className={cn(
              'absolute inset-0 rounded-xl border-4 flex flex-col items-center justify-center gap-3 backface-hidden rotate-y-180',
              getPolicyStyles(
                gameState.players.find(p => p.id === gameState.lastEnactedPolicy?.playerId)?.activePolicyStyle,
                gameState.lastEnactedPolicy.type
              )
            )}>
              {gameState.lastEnactedPolicy.type === 'Civil'
                ? <Scale className="w-12 h-12" />
                : <Eye className="w-12 h-12" />}
              <span className="text-xs font-mono uppercase tracking-[0.2em] font-bold text-center">
                {gameState.lastEnactedPolicy.type === 'Civil' ? 'CIVIL DIRECTIVE' : 'STATE DIRECTIVE'}
              </span>
            </div>
          </motion.div>
        </div>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 4, opacity: [0, 0.5, 0] }}
          transition={{ delay: 0.8, duration: 1 }}
          className={cn(
            'absolute w-64 h-64 rounded-full blur-3xl',
            gameState.lastEnactedPolicy.type === 'Civil' ? 'bg-blue-500/20' : 'bg-red-500/20'
          )}
        />
      </motion.div>
    )}
  </AnimatePresence>
);
