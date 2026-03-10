import React from 'react';
import { motion } from 'motion/react';
import { X, Gamepad2 } from 'lucide-react';

interface InviteModalProps {
  inviterName: string;
  roomId: string;
  onAccept: () => void;
  onReject: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ inviterName, roomId, onAccept, onReject }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 shadow-2xl text-white max-w-sm w-full"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-thematic flex items-center gap-2">
            <Gamepad2 className="text-red-500" /> Game Invite
          </h3>
          <button onClick={onReject} className="text-[#444] hover:text-white">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm font-mono text-gray-300 mb-6">
          {inviterName} has invited you to join their game room: {roomId}
        </p>
        <div className="flex gap-3">
          <button 
            onClick={onReject}
            className="flex-1 py-2 bg-[#222] hover:bg-[#333] rounded-lg text-sm font-mono uppercase"
          >
            Reject
          </button>
          <button 
            onClick={onAccept}
            className="flex-1 py-2 bg-red-900 hover:bg-red-800 rounded-lg text-sm font-mono uppercase"
          >
            Accept
          </button>
        </div>
      </motion.div>
    </div>
  );
};
