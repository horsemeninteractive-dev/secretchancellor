import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scale, Eye } from 'lucide-react';
import { Role } from '../../../types';
import { cn } from '../../../lib/utils';

interface InvestigationModalProps {
  result: { targetName: string; role: Role } | null;
  onClose: () => void;
}

export const InvestigationModal = ({ result, onClose }: InvestigationModalProps) => (
  <AnimatePresence>
    {result && (
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
            {result.role === 'Civil'
              ? <Scale className="w-8 h-8 text-blue-400" />
              : <Eye className="w-8 h-8 text-red-500" />}
          </div>
          <div className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#666] font-mono">Investigation Result</h3>
            <p className="text-xl font-serif italic text-white">{result.targetName.replace(' (AI)', '')} is a:</p>
          </div>
          <div className={cn(
            'text-4xl font-serif italic py-4 rounded-2xl border-2',
            result.role === 'Civil'
              ? 'bg-blue-900/10 border-blue-500/30 text-blue-400'
              : 'bg-red-900/10 border-red-500/30 text-red-500'
          )}>
            {result.role === 'Civil' ? 'CIVIL' : 'STATE'}
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#222] text-white rounded-xl hover:bg-[#333] transition-all text-sm font-serif italic"
          >
            Understood
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
