import React, { useState } from 'react';
import { socket } from '../../../socket';
import { TitleRole, GameState } from '../../../types';

interface TitleAbilityModalProps {
  role: TitleRole;
  gameState: GameState;
  onClose: () => void;
}

export const TitleAbilityModal = ({ role, gameState, onClose }: TitleAbilityModalProps) => {
  const [targetId, setTargetId] = useState<string>('');
  const eligible = gameState.players.filter(p => {
    if (!p || !p.isAlive) return false;
    if (p.id === socket.id) return false;
    if (role === 'Interdictor' && p.id === gameState.players[gameState.presidentIdx]?.id) return false;
    return true;
  });

  const handleUse = () => {
    if (role === 'Assassin' && !targetId) return;
    socket.emit('useTitleAbility', { use: true, targetId });
    onClose();
  };

  const handleSkip = () => {
    socket.emit('useTitleAbility', { use: false });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-default rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-thematic text-primary mb-4">Title Ability: {role}</h2>
        <div className="text-gray-300 mb-6">
          {role === 'Broker' && (
            <>
              Do you want to force a re-nomination?
              <div className="mt-4 p-3 bg-card rounded-lg text-sm border border-default">
                <p><strong>President:</strong> {gameState.players[gameState.presidentIdx]?.name}</p>
                <p><strong>Nominated Chancellor:</strong> {gameState.players.find(p => p.isChancellorCandidate)?.name || 'None'}</p>
              </div>
            </>
          )}
          {role === 'Assassin' && "Select a player to execute:"}
          {role === 'Strategist' && "Do you want to draw an extra policy?"}
          {role === 'Handler' && "Do you want to swap the next two players in the presidential order?"}
          {role === 'Auditor' && "Do you want to peek at the discard pile?"}
          {role === 'Interdictor' && "Select a player to detain for this round:"}
        </div>
        
        {(role === 'Assassin' || role === 'Interdictor') && (
          <select 
            className="w-full bg-card text-primary p-3 rounded-xl mb-6"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Select a player</option>
            {eligible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        <div className="flex gap-4">
          <button onClick={handleUse} className="flex-1 btn-primary py-3 rounded-xl font-bold hover:bg-subtle transition-all">Yes</button>
          <button onClick={handleSkip} className="flex-1 bg-subtle text-primary py-3 rounded-xl font-bold hover:bg-muted-bg transition-all">No</button>
        </div>
      </div>
    </div>
  );
};
