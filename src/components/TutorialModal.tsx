import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, X, Scale, Eye, Target,
  Vote, FileText, Zap, Crown, Shield, CheckCircle
} from 'lucide-react';
import { OverseerIcon } from './icons';
import { cn } from '../lib/utils';

interface TutorialModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface TutorialStep {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string;
  content: React.ReactNode;
}

const STEPS: TutorialStep[] = [
  {
    id: 'premise',
    title: 'The Assembly',
    subtitle: 'A game of hidden loyalty',
    icon: <Shield className="w-8 h-8" />,
    accentColor: 'text-primary',
    content: (
      <div className="space-y-4">
        <p className="text-secondary leading-relaxed">
          The world ended with <span className="text-primary font-medium">The Crisis</span>. What remains is The Assembly — a council of delegates trying to govern the ruins.
        </p>
        <p className="text-secondary leading-relaxed">
          But not everyone wants to restore order. Some want to build a new State — and one among them, the <span className="text-red-400 font-medium">Overseer</span>, is waiting to seize total power.
        </p>
        <div className="bg-card rounded-xl p-4 border border-default">
          <p className="text-tertiary text-sm font-mono uppercase tracking-widest mb-2">The Assembly is</p>
          <p className="text-primary text-sm leading-relaxed">A <strong>social deduction game</strong> for 5–10 players. You are given a secret role. Use it, lie with it, or die by it.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'roles',
    title: 'Secret Roles',
    subtitle: 'Three factions, one truth',
    icon: <Eye className="w-8 h-8" />,
    accentColor: 'text-primary',
    content: (
      <div className="space-y-3">
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex gap-4 items-start">
          <Scale className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-blue-400 font-bold uppercase tracking-wider text-sm mb-1">Civil</div>
            <p className="text-secondary text-sm leading-relaxed">The majority faction. You know nothing about who else is Civil. Enact <strong>5 Civil directives</strong> to win — or execute the Overseer.</p>
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex gap-4 items-start">
          <Eye className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-red-400 font-bold uppercase tracking-wider text-sm mb-1">State</div>
            <p className="text-secondary text-sm leading-relaxed">The minority faction. You know who your allies are. Enact <strong>6 State directives</strong> to win — or get the Overseer elected Chancellor.</p>
          </div>
        </div>
        <div className="bg-red-900/30 border border-red-600/50 rounded-xl p-4 flex gap-4 items-start">
          <OverseerIcon className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-red-500 font-bold uppercase tracking-wider text-sm mb-1">The Overseer</div>
            <p className="text-secondary text-sm leading-relaxed">A State agent. You win if State wins. If you are <strong>elected Chancellor after 3 State directives</strong>, the game ends immediately.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'loop',
    title: 'The Game Loop',
    subtitle: 'Each round follows the same sequence',
    icon: <Crown className="w-8 h-8" />,
    accentColor: 'text-yellow-400',
    content: (
      <div className="space-y-3">
        {[
          { num: '1', label: 'Presidential Nomination', desc: 'The current President nominates a Chancellor candidate. The presidential role rotates each round.' },
          { num: '2', label: 'Assembly Vote', desc: 'All living players vote AYE or NAY on the proposed government. Majority AYE passes it.' },
          { num: '3', label: 'Legislative Session', desc: 'The President draws 3 policy cards, discards 1, and passes 2 to the Chancellor. The Chancellor enacts one.' },
          { num: '4', label: 'Declarations', desc: 'Both President and Chancellor publicly declare what cards they saw and passed. This is how trust is built — or broken.' },
        ].map(step => (
          <div key={step.num} className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center shrink-0">
              <span className="text-yellow-400 text-xs font-bold">{step.num}</span>
            </div>
            <div>
              <div className="text-primary text-sm font-medium">{step.label}</div>
              <div className="text-tertiary text-xs leading-relaxed mt-0.5">{step.desc}</div>
            </div>
          </div>
        ))}
        <div className="bg-card rounded-xl p-3 border border-default mt-2">
          <p className="text-muted text-xs font-mono">If 3 elections fail in a row, a <span className="text-orange-400">chaos policy</span> is drawn automatically and enacted without a vote.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'voting',
    title: 'Voting & Declarations',
    subtitle: 'The heart of social deduction',
    icon: <Vote className="w-8 h-8" />,
    accentColor: 'text-purple-400',
    content: (
      <div className="space-y-4">
        <p className="text-secondary leading-relaxed text-sm">
          Votes are <strong className="text-primary">simultaneous and hidden</strong> until revealed. You can't see how others voted before you cast yours.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-3 text-center">
            <div className="text-emerald-400 font-bold text-lg font-thematic">AYE</div>
            <p className="text-tertiary text-xs mt-1">Support this government</p>
          </div>
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-center">
            <div className="text-red-400 font-bold text-lg font-thematic">NAY</div>
            <p className="text-tertiary text-xs mt-1">Block this government</p>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-default space-y-2">
          <div className="text-tertiary text-xs font-mono uppercase tracking-widest">Declarations</div>
          <p className="text-secondary text-sm leading-relaxed">
            After a policy is enacted, the President and Chancellor publicly declare what cards they drew and passed. These claims can be <span className="text-yellow-400">true or false</span> — the table must decide who to believe.
          </p>
          <p className="text-muted text-xs italic">Contradictions between the President's and Chancellor's declarations are your most important clue.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'executive',
    title: 'Executive Actions',
    subtitle: 'Power grows as State advances',
    icon: <Zap className="w-8 h-8" />,
    accentColor: 'text-orange-400',
    content: (
      <div className="space-y-3">
        <p className="text-secondary text-sm leading-relaxed">
          Each time a State directive is enacted, the President may unlock a special executive power. These grow more dangerous as State advances.
        </p>
        {[
          { name: 'Policy Peek', desc: 'See the top 3 cards in the draw pile.' },
          { name: 'Investigate', desc: 'Learn whether a player is Civil or State (not who specifically).' },
          { name: 'Special Election', desc: 'Choose who will be the next President, skipping normal rotation.' },
          { name: 'Execution', desc: 'Permanently eliminate a player. If it\'s the Overseer, Civil wins instantly.' },
        ].map(action => (
          <div key={action.name} className="flex gap-3 items-start bg-card rounded-lg p-3 border border-default">
            <Zap className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-orange-400 text-sm font-medium">{action.name}</div>
              <div className="text-tertiary text-xs mt-0.5">{action.desc}</div>
            </div>
          </div>
        ))}
        <p className="text-faint text-xs italic">Executive actions are given to the current President and must be used before the next round begins.</p>
      </div>
    ),
  },
  {
    id: 'titles',
    title: 'Title Roles',
    subtitle: 'Special abilities assigned at random',
    icon: <Crown className="w-8 h-8" />,
    accentColor: 'text-yellow-400',
    content: (
      <div className="space-y-3">
        <p className="text-secondary text-sm leading-relaxed">
          At the start of each game, some players are secretly assigned a <span className="text-yellow-400 font-medium">Title Role</span> — a one-time ability that fires at a specific moment.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { name: 'Interdictor', when: 'Start of round', desc: 'Detain a player, blocking them from voting or being Chancellor.' },
            { name: 'Broker', when: 'After nomination', desc: 'Veto the Chancellor nomination, forcing a re-nomination.' },
            { name: 'Strategist', when: 'Legislative session', desc: 'Draw 4 policies instead of 3 as President.' },
            { name: 'Auditor', when: 'After enactment', desc: 'Peek at the last 3 discarded policies.' },
            { name: 'Assassin', when: 'After enactment', desc: 'Secretly execute another player.' },
            { name: 'Handler', when: 'After enactment', desc: 'Swap the next two players in the presidential rotation.' },
          ].map(role => (
            <div key={role.name} className="flex gap-3 items-start">
              <div className="w-2 h-2 rounded-full bg-yellow-500/50 shrink-0 mt-1.5" />
              <div>
                <span className="text-yellow-400 text-sm font-medium">{role.name}</span>
                <span className="text-faint text-xs font-mono ml-2">({role.when})</span>
                <p className="text-tertiary text-xs mt-0.5">{role.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-faint text-xs italic">Title abilities are single-use. Check your Dossier to see if you have one.</p>
      </div>
    ),
  },
  {
    id: 'agendas',
    title: 'Personal Agendas',
    subtitle: 'Your hidden individual goal',
    icon: <Target className="w-8 h-8" />,
    accentColor: 'text-emerald-400',
    content: (
      <div className="space-y-4">
        <p className="text-secondary text-sm leading-relaxed">
          Every player is secretly assigned a <span className="text-emerald-400 font-medium">Personal Agenda</span> — a hidden objective that earns bonus XP and IP if completed, regardless of whether your faction wins or loses.
        </p>
        <div className="bg-emerald-900/15 border border-emerald-500/25 rounded-xl p-4 space-y-2">
          <div className="text-emerald-400 text-xs font-mono uppercase tracking-widest">Example Agendas</div>
          <div className="space-y-2 text-sm">
            {[
              'Vote Nay in at least 3 rounds',
              'Be nominated as Chancellor at least twice',
              'The game must end before round (player count + 3)',
              'No chaos policy is enacted during the game',
            ].map(a => (
              <div key={a} className="flex gap-2 items-start text-secondary">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500/50 shrink-0 mt-0.5" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card rounded-xl p-3 border border-default">
          <p className="text-muted text-xs leading-relaxed">
            Completing your agenda awards <span className="text-emerald-400">+100 XP</span> and bonus IP — the same as winning with your faction. Win <em>and</em> complete your agenda for double rewards.
          </p>
        </div>
        <p className="text-faint text-xs italic">Your agenda is visible in your Dossier at all times. Others can't see it.</p>
      </div>
    ),
  },
  {
    id: 'tips',
    title: 'Surviving The Assembly',
    subtitle: 'Key things to remember',
    icon: <FileText className="w-8 h-8" />,
    accentColor: 'text-blue-400',
    content: (
      <div className="space-y-3">
        {[
          {
            heading: 'Civil players: trust nobody',
            body: 'You outnumber State but you don\'t know who they are. Contradictory declarations, suspicious nominations, and patterns in voting are your only clues.',
            color: 'text-blue-400',
            bg: 'bg-blue-900/10 border-blue-500/20',
          },
          {
            heading: 'State players: coordinate carefully',
            body: 'You know your allies but can\'t communicate openly. Coordinate through nominations, declarations, and subtle voting patterns — without being obvious.',
            color: 'text-red-400',
            bg: 'bg-red-900/10 border-red-500/20',
          },
          {
            heading: 'Declarations are everything',
            body: 'After every legislative session, both President and Chancellor declare what they saw. Cross-referencing these claims is how you detect lies.',
            color: 'text-yellow-400',
            bg: 'bg-yellow-900/10 border-yellow-500/20',
          },
          {
            heading: 'Watch your Dossier',
            body: 'Your role, title ability, and personal agenda are always visible in your Dossier — tap the icon in the header during a game.',
            color: 'text-purple-400',
            bg: 'bg-purple-900/10 border-purple-500/20',
          },
        ].map(tip => (
          <div key={tip.heading} className={cn('rounded-xl p-3 border', tip.bg)}>
            <div className={cn('text-sm font-medium mb-1', tip.color)}>{tip.heading}</div>
            <p className="text-tertiary text-xs leading-relaxed">{tip.body}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onComplete, onSkip }) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const goNext = () => {
    setDirection(1);
    if (isLast) { onComplete(); return; }
    setStep(s => s + 1);
  };

  const goPrev = () => {
    setDirection(-1);
    setStep(s => s - 1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-backdrop-heavy backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-elevated border border-default rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            style={{ maxHeight: '90dvh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-subtle shrink-0">
              <div className="flex items-center gap-3">
                <div className="text-muted">{current.icon}</div>
                <div>
                  <div className={cn('text-lg font-thematic tracking-wide uppercase leading-none', current.accentColor)}>
                    {current.title}
                  </div>
                  {current.subtitle && (
                    <div className="text-faint text-xs font-mono mt-0.5">{current.subtitle}</div>
                  )}
                </div>
              </div>
              <button
                onClick={onSkip}
                className="text-ghost hover:text-tertiary transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: direction * 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -30 }}
                  transition={{ duration: 0.2 }}
                >
                  {current.content}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t border-subtle shrink-0 space-y-4">
              {/* Step indicators */}
              <div className="flex items-center justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
                    className={cn(
                      'rounded-full transition-all',
                      i === step ? 'w-6 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-subtle hover:bg-strong'
                    )}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex gap-3">
                {!isFirst && (
                  <button
                    onClick={goPrev}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-card text-tertiary rounded-xl border border-default hover:bg-hover hover:text-white transition-all text-sm font-mono"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                <button
                  onClick={goNext}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-thematic uppercase tracking-widest transition-all',
                    isLast
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'
                      : 'btn-primary hover:bg-subtle'
                  )}
                >
                  {isLast ? (
                    <><CheckCircle className="w-4 h-4" /> Enter the Assembly</>
                  ) : (
                    <>Next <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>

              {/* Skip */}
              <button
                onClick={onSkip}
                className="w-full text-center text-ghost hover:text-muted text-xs font-mono uppercase tracking-widest transition-colors"
              >
                Skip tutorial
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
