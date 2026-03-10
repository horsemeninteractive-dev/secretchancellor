import React from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'motion/react';
import { UserPlus, X, Check } from 'lucide-react';

interface FriendRequestModalProps {
  fromUsername: string;
  onAccept: () => void;
  onDeny: () => void;
}

export const FriendRequestModal: React.FC<FriendRequestModalProps> = ({ fromUsername, onAccept, onDeny }) => {
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-xs bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 shadow-2xl text-white"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 bg-red-900/20 rounded-full flex items-center justify-center border border-red-900/50">
            <UserPlus className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-thematic">Friend Request</h3>
            <p className="text-sm text-[#666] mt-1">
              <span className="text-white font-bold">{fromUsername}</span> wants to be friends.
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <button 
              onClick={onDeny}
              className="flex-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-xs font-mono uppercase tracking-widest transition-colors"
            >
              Deny
            </button>
            <button 
              onClick={onAccept}
              className="flex-1 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-xs font-mono uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-3 h-3" /> Accept
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
