import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HelpCircle } from 'lucide-react';
import { GameState, GamePhase, Player } from '../../types';
import { cn } from '../../lib/utils';

interface GameReferenceProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
  me: Player | undefined;
}

interface PhaseHelp {
  title: string;
  what: string;
  youShouldDo: string;
  tip?: string;
}

function getPhaseHelp(phase: GamePhase, me: Player | undefined, gameState: GameState): PhaseHelp {
  const isPresident = me?.isPresident;
  const isChancellor = me?.isChancellor;
  const isPresidentCandidate = me?.isPresidentialCandidate;
  const presidentName = gameState.players[gameState.presidentIdx]?.name ?? 'The President';

  switch (phase) {
    case 'Nomination_Review':
      return {
        title: 'Nomination Review',
        what: 'A Title Role ability (Interdictor or Broker) is being resolved before or after nomination.',
        youShouldDo: 'Wait for the ability holder to make their decision.',
        tip: 'The Interdictor can detain a player before nomination. The Broker can veto a nomination after it\'s made.',
      };
    case 'Nominate_Chancellor':
      return isPresidentCandidate
        ? {
            title: 'Nominate a Chancellor',
            what: 'You are the Presidential Candidate. You must choose a Chancellor to form a government with.',
            youShouldDo: 'Tap a player to nominate them as Chancellor. You cannot nominate someone who served as Chancellor last round, or as President last round (in larger games).',
            tip: 'Choose someone the Assembly trusts — but ideally someone you can work with.',
          }
        : {
            title: 'Waiting for Nomination',
            what: `${presidentName} is choosing a Chancellor candidate.`,
            youShouldDo: 'Watch who gets nominated. The nomination choice itself reveals information about the President\'s intentions.',
            tip: 'Presidents tend to nominate allies. A suspicious nomination is worth noting.',
          };
    case 'Voting':
    case 'Voting_Reveal':
      return {
        title: 'Assembly Vote',
        what: 'The Assembly is voting on the proposed government. All votes are cast simultaneously and revealed together.',
        youShouldDo: 'Vote AYE to support the government or NAY to block it. If majority vote NAY, the election fails and the election tracker advances.',
        tip: 'Three failed elections in a row triggers a chaos policy drawn from the top of the deck.',
      };
    case 'Legislative_President':
      return isPresident
        ? {
            title: 'Presidential Discard',
            what: 'You have drawn 3 policy cards. You must discard one face-down — the other two go to the Chancellor.',
            youShouldDo: 'Choose which card to discard. The Chancellor will not know what you discarded, only what you passed them.',
            tip: 'You will declare what you drew and passed after the round. Be ready to explain your choice.',
          }
        : {
            title: 'Presidential Review',
            what: 'The President is reviewing their 3 drawn policy cards and choosing which to discard.',
            youShouldDo: 'Wait. After this phase, the President will pass 2 cards to the Chancellor.',
          };
    case 'Legislative_Chancellor':
      return isChancellor
        ? {
            title: 'Chancellor Enactment',
            what: 'You have received 2 policy cards from the President. You must enact one.',
            youShouldDo: 'Choose which policy to enact. The other is discarded face-down. You can request a Veto if 5+ State directives are enacted and you\'d prefer neither policy.',
            tip: 'You will declare what you received after the round. Your claim and the President\'s should be consistent if you want to be trusted.',
          }
        : {
            title: 'Chancellor Decision',
            what: 'The Chancellor is choosing which policy to enact from the 2 cards the President passed them.',
            youShouldDo: 'Wait. After enactment, both President and Chancellor will make declarations.',
          };
    case 'President_Declaration':
    case 'Chancellor_Declaration':
      return {
        title: 'Policy Declaration',
        what: 'The President and Chancellor are declaring what cards they drew, passed, and received.',
        youShouldDo: 'Read the declarations carefully. If the President says they passed 1 Civil and 1 State but the Chancellor says they received 2 State — one of them is lying.',
        tip: 'Declarations are voluntary claims. They can be true or false. Cross-reference them with the enacted policy.',
      };
    case 'Auditor_Action':
      return {
        title: 'Auditor Ability',
        what: 'A player with the Auditor title role is peeking at the last 3 cards in the discard pile.',
        youShouldDo: 'Wait for the Auditor to finish. They will see what policies were recently discarded.',
        tip: 'Discarded policies are never seen by the table normally — the Auditor gains real information here.',
      };
    case 'Assassin_Action':
      return {
        title: 'Assassin Ability',
        what: 'The President has the Assassin title role and is choosing whether to secretly execute a player.',
        youShouldDo: 'Wait. If the Assassin executes someone, it will be announced.',
        tip: 'An executed Overseer ends the game immediately as a Civil victory.',
      };
    case 'Handler_Action':
      return {
        title: 'Handler Ability',
        what: 'A player with the Handler title role is swapping the next two players in the presidential rotation.',
        youShouldDo: 'Wait. The Handler\'s swap lasts for the next two presidential terms, then the order reverts.',
        tip: 'The Handler can be used defensively (put a trusted player in power earlier) or offensively.',
      };
    case 'Interdictor_Action':
      return {
        title: 'Interdictor Ability',
        what: 'The Interdictor is choosing a player to detain for this round.',
        youShouldDo: 'Wait. The detained player cannot vote or be nominated as Chancellor this round.',
        tip: 'The Interdictor fires before nomination — the detained player is excluded from this government entirely.',
      };
    case 'Broker_Action':
      return {
        title: 'Broker Ability',
        what: 'The Broker is deciding whether to veto the current Chancellor nomination.',
        youShouldDo: 'Wait. If the Broker vetoes, the President must nominate a different Chancellor.',
        tip: 'The Broker can use this strategically — blocking a dangerous government or protecting an ally.',
      };
    case 'Strategist_Action':
      return {
        title: 'Strategist Ability',
        what: 'The President has the Strategist title role and drew 4 policy cards instead of 3.',
        youShouldDo: 'Wait. The Strategist will discard 2 cards before passing the remaining 2 to the Chancellor.',
        tip: 'A Strategist President has more control over what gets passed — they see more of the deck.',
      };
    case 'Executive_Action':
      return {
        title: 'Executive Action',
        what: `An executive power has been unlocked. The President must use it before the next round.`,
        youShouldDo: 'If you are the President, select your target. Otherwise, watch who gets targeted — it reveals the President\'s suspicions.',
        tip: gameState.currentExecutiveAction === 'Investigate'
          ? 'Investigation reveals whether a player is Civil or State faction — not their exact role.'
          : gameState.currentExecutiveAction === 'Execution'
            ? 'Execution permanently eliminates a player. Executing the Overseer ends the game instantly as a Civil win.'
            : gameState.currentExecutiveAction === 'SpecialElection'
              ? 'Special Election lets the President choose the next President, skipping normal rotation.'
              : 'Policy Peek shows the top 3 cards in the draw pile — private information for the President only.',
      };
    default:
      return {
        title: 'In Progress',
        what: 'The Assembly is in session.',
        youShouldDo: 'Follow the prompts on screen. Your action area at the bottom shows what you need to do.',
      };
  }
}

export const GameReferencePanel: React.FC<GameReferenceProps> = ({ isOpen, onClose, gameState, me }) => {
  const help = getPhaseHelp(gameState.phase, me, gameState);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#666]" />
                <span className="text-[#666] text-xs font-mono uppercase tracking-widest">Phase Reference</span>
              </div>
              <button onClick={onClose} className="text-[#444] hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Phase title */}
              <div>
                <h3 className="text-white font-thematic text-lg uppercase tracking-wide">{help.title}</h3>
              </div>

              {/* What's happening */}
              <div className="space-y-1">
                <div className="text-[#555] text-[10px] font-mono uppercase tracking-widest">What's happening</div>
                <p className="text-[#aaa] text-sm leading-relaxed">{help.what}</p>
              </div>

              {/* What you should do */}
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="text-[#555] text-[10px] font-mono uppercase tracking-widest mb-1">What you should do</div>
                <p className="text-white text-sm leading-relaxed">{help.youShouldDo}</p>
              </div>

              {/* Tip */}
              {help.tip && (
                <div className="bg-yellow-900/10 border border-yellow-500/20 rounded-xl p-3">
                  <div className="text-yellow-500/70 text-[10px] font-mono uppercase tracking-widest mb-1">Tip</div>
                  <p className="text-[#aaa] text-xs leading-relaxed">{help.tip}</p>
                </div>
              )}
            </div>

            <div className="px-5 pb-5">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-[#222] text-[#888] rounded-xl hover:bg-[#2a2a2a] hover:text-white transition-all text-xs font-mono uppercase tracking-widest border border-[#333]"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
