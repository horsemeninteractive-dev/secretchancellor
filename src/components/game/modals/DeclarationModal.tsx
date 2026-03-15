import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';

interface DeclarationModalProps {
  show: boolean;
  declarationType: 'President' | 'Chancellor' | null;
  declCiv: number;
  declSta: number;
  declDrawCiv: number;
  declDrawSta: number;
  setDeclCiv: (n: number) => void;
  setDeclSta: (n: number) => void;
  setDeclDrawCiv: (n: number) => void;
  setDeclDrawSta: (n: number) => void;
  onSubmit: () => void;
}

export const DeclarationModal = ({
  show, declarationType,
  declCiv, declSta, declDrawCiv, declDrawSta,
  setDeclCiv, setDeclSta, setDeclDrawCiv, setDeclDrawSta,
  onSubmit,
}: DeclarationModalProps) => (
  <AnimatePresence>
    {show && declarationType && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-backdrop-heavy backdrop-blur-md flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="max-w-sm w-full bg-surface border border-default rounded-3xl overflow-hidden shadow-2xl p-8 space-y-6"
        >
          <div className="text-center space-y-2">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono">Directive Declaration</h3>
            <p className="text-xl font-thematic text-primary tracking-wide uppercase">What will you declare?</p>
            <p className="text-[10px] text-ghost italic">You may report truthfully or mislead the Assembly.</p>
          </div>

          <div className="space-y-5">
            {/* President only: what they drew (3 cards) */}
            {declarationType === 'President' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted font-mono ml-1">
                  What you drew <span className="normal-case text-ghost">(3 cards)</span>
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => { setDeclDrawCiv(n); setDeclDrawSta(3 - n); }}
                      className={cn(
                        'flex-1 py-3 rounded-xl border transition-all font-mono text-sm',
                        declDrawCiv === n
                          ? 'bg-blue-900/40 border-blue-500 text-blue-400'
                          : 'bg-elevated border-subtle text-ghost'
                      )}
                    >
                      {n}C
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-center text-faint font-mono">
                  Drew: <span className="text-blue-400">{declDrawCiv} Civil</span> / <span className="text-red-500">{declDrawSta} State</span>
                </div>
              </div>
            )}

            {/* Passed (president) or Received (chancellor) — 2 cards */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted font-mono ml-1">
                {declarationType === 'President'
                  ? <span>What you passed <span className="normal-case text-ghost">(2 cards)</span></span>
                  : <span>What you received <span className="normal-case text-ghost">(2 cards)</span></span>}
              </label>
              <div className="flex gap-2">
                {[0, 1, 2].map(n => (
                  <button
                    key={n}
                    onClick={() => { setDeclCiv(n); setDeclSta(2 - n); }}
                    className={cn(
                      'flex-1 py-3 rounded-xl border transition-all font-mono text-sm',
                      declCiv === n
                        ? 'bg-blue-900/40 border-blue-500 text-blue-400'
                        : 'bg-elevated border-subtle text-ghost'
                    )}
                  >
                    {n}C
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-center text-faint font-mono">
                {declarationType === 'President' ? 'Passed' : 'Received'}:{' '}
                <span className="text-blue-400">{declCiv} Civil</span> /{' '}
                <span className="text-red-500">{declSta} State</span>
              </div>
            </div>
          </div>

          <button
            onClick={onSubmit}
            className="w-full py-4 btn-primary rounded-xl hover:bg-subtle transition-all font-thematic text-xl uppercase tracking-wide"
          >
            Submit Declaration
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
