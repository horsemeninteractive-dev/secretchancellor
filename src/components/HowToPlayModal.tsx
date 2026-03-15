import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scale, Eye, Crown, Vote, Zap, Target, FileText } from 'lucide-react';
import { OverseerIcon } from './icons';
import { cn } from '../lib/utils';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'overview' | 'roles' | 'loop' | 'titles' | 'agendas' | 'tips';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'roles', label: 'Roles', icon: <Eye className="w-3.5 h-3.5" /> },
  { id: 'loop', label: 'Game Loop', icon: <Crown className="w-3.5 h-3.5" /> },
  { id: 'titles', label: 'Titles', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'agendas', label: 'Agendas', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'tips', label: 'Tips', icon: <Vote className="w-3.5 h-3.5" /> },
];

const TabContent: React.FC<{ tab: TabId }> = ({ tab }) => {
  if (tab === 'overview') return (
    <div className="space-y-4">
      <p className="text-[#aaa] leading-relaxed text-sm">
        The Assembly is a <strong className="text-white">social deduction game</strong> for 5–10 players. Each player is secretly assigned a faction — Civil or State — and must work with or against the others to achieve their faction's win condition.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-900/15 border border-blue-500/20 rounded-xl p-3">
          <div className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-1">Civil wins by</div>
          <ul className="text-[#888] text-xs space-y-1">
            <li>Enacting 5 Civil directives</li>
            <li>Executing the Overseer</li>
          </ul>
        </div>
        <div className="bg-red-900/15 border border-red-500/20 rounded-xl p-3">
          <div className="text-red-400 font-bold text-xs uppercase tracking-widest mb-1">State wins by</div>
          <ul className="text-[#888] text-xs space-y-1">
            <li>Enacting 6 State directives</li>
            <li>Electing Overseer Chancellor (after 3 State)</li>
          </ul>
        </div>
      </div>
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
        <div className="text-[#666] text-xs font-mono uppercase tracking-widest">Policy Deck</div>
        <p className="text-[#888] text-sm">The deck contains <span className="text-blue-400">6 Civil</span> and <span className="text-red-400">11 State</span> policy cards. The deck is stacked against Civil — deduction and coordination are essential.</p>
      </div>
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 space-y-2">
        <div className="text-[#666] text-xs font-mono uppercase tracking-widest">Election Tracker</div>
        <p className="text-[#888] text-sm">If three elections fail in a row, a <span className="text-orange-400">chaos policy</span> is drawn from the top of the deck and enacted automatically without a vote.</p>
      </div>
    </div>
  );

  if (tab === 'roles') return (
    <div className="space-y-3">
      <div className="bg-blue-900/15 border border-blue-500/25 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="w-5 h-5 text-blue-400" />
          <div className="text-blue-400 font-bold uppercase tracking-wider text-sm">Civil</div>
        </div>
        <p className="text-[#888] text-sm leading-relaxed">The majority. You don't know who your allies are. Use declarations, voting patterns, and nominations to find the State agents and stop them.</p>
      </div>
      <div className="bg-red-900/15 border border-red-500/25 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Eye className="w-5 h-5 text-red-400" />
          <div className="text-red-400 font-bold uppercase tracking-wider text-sm">State</div>
        </div>
        <p className="text-[#888] text-sm leading-relaxed">The minority. You know who your State allies are. Secretly coordinate to enact State directives or get the Overseer elected as Chancellor.</p>
      </div>
      <div className="bg-red-900/25 border border-red-600/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <OverseerIcon className="w-5 h-5 text-red-500" />
          <div className="text-red-500 font-bold uppercase tracking-wider text-sm">The Overseer</div>
        </div>
        <p className="text-[#888] text-sm leading-relaxed">A State agent who doesn't know the other State players. Wins with State. If elected Chancellor after 3 State directives are enacted, State wins immediately.</p>
        <p className="text-[#555] text-xs italic mt-2">At 5–6 players, the Overseer knows the other State agents.</p>
      </div>
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-3">
        <div className="text-[#666] text-xs font-mono uppercase tracking-widest mb-2">Role Distribution</div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {[
            ['5p', '3C', '1S+O'],
            ['6p', '4C', '1S+O'],
            ['7p', '4C', '2S+O'],
            ['8p', '5C', '2S+O'],
            ['9p', '5C', '3S+O'],
            ['10p', '6C', '3S+O'],
          ].map(([players, civil, state]) => (
            <div key={players} className="bg-[#252525] rounded-lg p-2">
              <div className="text-[#666] mb-1">{players}</div>
              <div className="text-blue-400">{civil}</div>
              <div className="text-red-400">{state}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (tab === 'loop') return (
    <div className="space-y-3">
      {[
        { num: '1', label: 'Nomination', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', desc: 'The current President nominates a Chancellor. The same player cannot serve as Chancellor in consecutive rounds (or as President in larger games).' },
        { num: '2', label: 'Vote', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', desc: 'All living players simultaneously vote AYE or NAY. A strict majority of AYE passes the government. Ties and equal splits fail.' },
        { num: '3', label: 'Legislative Session', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', desc: 'President draws 3 cards, discards 1 face-down, passes 2 to Chancellor. Chancellor enacts 1, discards the other. Neither can see what the other discarded.' },
        { num: '4', label: 'Declarations', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', desc: 'President declares how many Civil/State they drew and passed. Chancellor declares how many they received and enacted. These claims can be lies.' },
        { num: '5', label: 'Executive Action', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', desc: 'If a State directive was enacted and the player count/directive count triggers a power, the President must use it before the round ends.' },
      ].map(step => (
        <div key={step.num} className={cn('rounded-xl p-3 border', step.color)}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-xs font-bold">{step.num}</span>
            </div>
            <span className="font-medium text-sm">{step.label}</span>
          </div>
          <p className="text-[#888] text-xs leading-relaxed pl-7">{step.desc}</p>
        </div>
      ))}
    </div>
  );

  if (tab === 'titles') return (
    <div className="space-y-3">
      <p className="text-[#888] text-sm leading-relaxed">
        Title Roles are assigned randomly at game start. Each is single-use and fires at a specific point in the round. Check your Dossier to see if you have one.
      </p>
      {[
        { name: 'Interdictor', when: 'Start of each round', desc: 'Before nomination: detain a player for this round. They cannot vote or be nominated as Chancellor. Once used.' },
        { name: 'Broker', when: 'After nomination', desc: 'Review the Chancellor nomination and veto it, forcing the President to nominate again. Once used.' },
        { name: 'Strategist', when: 'As President', desc: 'When you\'re President, draw 4 policy cards instead of 3, then discard 2. Once used.' },
        { name: 'Auditor', when: 'After enactment', desc: 'Peek at the last 3 cards in the discard pile. Useful for tracking what policies are gone. Once used.' },
        { name: 'Assassin', when: 'After enactment (as President)', desc: 'When you\'re President, secretly execute any living player after the round ends. Once used.' },
        { name: 'Handler', when: 'After enactment', desc: 'Swap the next two players in the presidential rotation. The second becomes President before the first. Once used.' },
      ].map(role => (
        <div key={role.name} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-yellow-400 font-bold text-sm">{role.name}</div>
            <div className="text-[#555] text-[10px] font-mono uppercase tracking-widest shrink-0">{role.when}</div>
          </div>
          <p className="text-[#888] text-xs leading-relaxed">{role.desc}</p>
        </div>
      ))}
    </div>
  );

  if (tab === 'agendas') return (
    <div className="space-y-4">
      <p className="text-[#aaa] text-sm leading-relaxed">
        Every player receives a hidden <span className="text-emerald-400 font-medium">Personal Agenda</span> at the start of each game. Completing it earns <strong className="text-white">+100 XP and bonus IP</strong> — equal to winning with your faction — regardless of the game result.
      </p>
      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
        <div className="text-emerald-400 text-xs font-mono uppercase tracking-widest">All 20 Agendas</div>
        <div className="grid grid-cols-1 gap-1.5">
          {[
            ['Chaos Agent', 'Trigger a chaos policy at least once'],
            ['The Purist', 'At least 3 Civil directives enacted'],
            ['The Dissenter', 'Vote against the majority 3+ times'],
            ['The Dove', 'Vote Aye in every eligible round'],
            ['The Hawk', 'Vote Nay in at least 3 rounds'],
            ['Stonewalled', 'Vote Nay on 2 governments that fail'],
            ['Short Session', 'Game ends before round (players + 3)'],
            ['The Long Game', 'Game lasts at least (players + 6) rounds'],
            ['The Loyalist', 'Vote Aye on 3 civil-enacting governments'],
            ['Nominated', 'Be nominated Chancellor twice'],
            ['Deadlock', 'Be in at least 1 failed government'],
            ['Prolific', 'Enact 2 policies as Chancellor'],
            ['The Veteran', 'Serve as Chancellor at least once'],
            ['Unity', 'No chaos policy during the game'],
            ['The Mandate', 'At least 4 State directives enacted'],
            ['Clean Sweep', 'Enact a Civil directive as Chancellor'],
            ['The Weathervane', 'Switch your vote 4+ times'],
            ['Productive Session', 'More than half of rounds enact a policy'],
            ['Close Race', 'Tracks within 2 directives at game end'],
            ['The Swing Vote', 'Be in a government that passes by 1 vote'],
          ].map(([name, desc]) => (
            <div key={name} className="flex gap-2 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/30 shrink-0 mt-1.5" />
              <div>
                <span className="text-white text-xs font-medium">{name}</span>
                <span className="text-[#555] text-xs"> — {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (tab === 'tips') return (
    <div className="space-y-3">
      {[
        {
          faction: 'For Civil Players',
          color: 'text-blue-400',
          bg: 'bg-blue-900/10 border-blue-500/20',
          tips: [
            'Cross-reference declarations: if President says they passed 1C/1S but Chancellor says they received 2S, someone is lying.',
            'Track the voting record. Consistent Nay voting without explanation is suspicious.',
            'Be careful with executive actions — investigate based on evidence, not gut feeling.',
            'The deck is State-heavy. Some State policies being enacted doesn\'t prove anyone is guilty.',
          ],
        },
        {
          faction: 'For State Players',
          color: 'text-red-400',
          bg: 'bg-red-900/10 border-red-500/20',
          tips: [
            'Coordinate declarations carefully. Contradicting your State ally\'s claim is a giveaway.',
            'Nominate your State allies as Chancellor when possible — but not so obviously it looks suspicious.',
            'Blame bad hands. "I only had State cards" is plausible because the deck is State-heavy.',
            'The Overseer should stay quiet and unremarkable until the moment is right.',
          ],
        },
        {
          faction: 'General',
          color: 'text-[#aaa]',
          bg: 'bg-[#1e1e1e] border-[#2a2a2a]',
          tips: [
            'Use the chat and declarations together. What players say matters.',
            'Your personal agenda might conflict with your faction\'s best play. That tension is intentional.',
            'The round history button shows every government, every vote, and every declaration.',
          ],
        },
      ].map(section => (
        <div key={section.faction} className={cn('rounded-xl p-4 border', section.bg)}>
          <div className={cn('font-bold text-sm mb-2 uppercase tracking-wider', section.color)}>{section.faction}</div>
          <ul className="space-y-1.5">
            {section.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 items-start text-[#888] text-xs leading-relaxed">
                <span className="text-[#555] shrink-0 mt-0.5">—</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return null;
};

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg bg-[#141414] border border-[#2a2a2a] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            style={{ maxHeight: '88dvh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#222] shrink-0">
              <div>
                <h2 className="text-lg font-thematic text-white tracking-wide uppercase">How to Play</h2>
                <p className="text-[#555] text-xs font-mono">The Assembly — Rules Reference</p>
              </div>
              <button onClick={onClose} className="text-[#444] hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab grid - 2 rows of 3 */}
            <div className="grid grid-cols-3 gap-1 border-b border-[#222] shrink-0 px-4 pt-3 pb-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 px-2 py-2 rounded-t-lg text-xs font-mono uppercase tracking-widest transition-all',
                    activeTab === tab.id
                      ? 'bg-[#1e1e1e] text-white border-t border-l border-r border-[#2a2a2a]'
                      : 'text-[#555] hover:text-[#888]'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <TabContent tab={activeTab} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#222] shrink-0">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-[#222] text-white rounded-xl hover:bg-[#2a2a2a] transition-all font-thematic text-sm uppercase tracking-widest border border-[#333]"
              >
                Back to Lobby
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
