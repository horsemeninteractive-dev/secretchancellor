import React, { RefObject } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Smile, Send, User as UserIcon } from 'lucide-react';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { GameState, Player } from '../../../types';
import { EmojiRenderer } from '../../EmojiRenderer';
import { cn, getProxiedUrl } from '../../../lib/utils';

interface ChatPanelProps {
  gameState: GameState;
  me: Player | undefined;
  isOpen: boolean;
  onClose: () => void;
  chatText: string;
  setChatText: (t: string) => void;
  onSend: (e: React.FormEvent) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (v: boolean) => void;
  onEmojiClick: (data: any) => void;
  chatEndRef: RefObject<HTMLDivElement>;
  chatInputRef: RefObject<HTMLInputElement>;
  chatGhostRef: RefObject<HTMLDivElement>;
  onChatScroll: () => void;
  playSound: (key: string) => void;
}

export const ChatPanel = ({
  gameState, me, isOpen, onClose,
  chatText, setChatText, onSend,
  showEmojiPicker, setShowEmojiPicker, onEmojiClick,
  chatEndRef, chatInputRef, chatGhostRef, onChatScroll,
  playSound,
}: ChatPanelProps) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        className="fixed inset-y-0 right-0 z-[110] w-full sm:w-80 bg-surface border-l border-subtle shadow-2xl flex flex-col"
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-subtle">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="font-thematic text-sm uppercase tracking-wider">Assembly Chat</h3>
          </div>
          <button onClick={() => { playSound('click'); onClose(); }} className="p-2 text-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {gameState.messages.map((item, i) => {
            if (item.type === 'declaration') return null;
            if (item.type === 'failed_election') return null;

            const senderPlayer = gameState.players.find(p => p.name === item.sender);

            if (item.type === 'round_separator') {
              return (
                <div key={i} className="w-full py-8 flex items-center justify-center">
                  <div className="flex items-center gap-4">
                    <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#333]" />
                    <div className="px-4 py-1.5 rounded-full bg-surface border border-default flex items-center gap-2 shadow-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-thematic uppercase tracking-[0.2em] text-primary">Round {item.round}</span>
                    </div>
                    <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#333]" />
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={cn('flex w-full gap-2', item.sender === me?.name ? 'flex-row-reverse' : 'flex-row')}>
                <div className="w-8 h-8 rounded-full bg-card border border-default shrink-0 overflow-hidden">
                  {senderPlayer?.avatarUrl
                    ? <img src={getProxiedUrl(senderPlayer.avatarUrl)} alt={item.sender} className="w-full h-full object-cover" />
                    : <UserIcon className="w-4 h-4 text-ghost m-2" />}
                </div>
                <div className={cn('flex flex-col min-w-0', item.sender === me?.name ? 'items-end' : 'items-start')}>
                  <div className="text-[9px] text-ghost font-mono mb-1 whitespace-nowrap">
                    {item.sender.replace(' (AI)', '')}
                  </div>
                  <div className={cn(
                    'px-3 py-2 rounded-2xl text-xs max-w-[85%] break-words whitespace-pre-wrap leading-relaxed',
                    item.sender === me?.name
                      ? 'bg-red-900/20 text-red-100 rounded-tr-none'
                      : 'bg-card text-secondary rounded-tl-none'
                  )}>
                    <EmojiRenderer text={item.text} />
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={onSend} className="p-4 border-t border-subtle bg-elevated relative">
          {showEmojiPicker && (
            <div className="absolute bottom-full right-0 mb-2 z-[120]">
              <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)} />
              <div className="relative">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={Theme.DARK}
                  emojiStyle={EmojiStyle.APPLE}
                  width={280}
                  height={350}
                  lazyLoadEmojis
                  skinTonesDisabled
                  searchDisabled
                />
              </div>
            </div>
          )}
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <div
                ref={chatGhostRef}
                className={cn(
                  'absolute inset-0 w-full h-full pl-4 pr-20 py-2 text-xs pointer-events-none overflow-hidden whitespace-nowrap flex items-center',
                  (!me?.isAlive && gameState.phase !== 'GameOver') && 'opacity-50'
                )}
              >
                {chatText === '' ? (
                  <span className="text-ghost">
                    {((me ? !me.isAlive : false) && gameState.phase !== 'GameOver') ? 'Dead players cannot speak...' : 'Type a message...'}
                  </span>
                ) : (
                  <div className="flex items-center h-full">
                    <EmojiRenderer text={chatText} />
                  </div>
                )}
              </div>
              <input
                ref={chatInputRef}
                type="text"
                value={chatText}
                onChange={e => { setChatText(e.target.value); setTimeout(onChatScroll, 0); }}
                onScroll={onChatScroll}
                placeholder={((me ? !me.isAlive : false) && gameState.phase !== 'GameOver') ? 'Dead players cannot speak...' : 'Type a message...'}
                disabled={(me ? !me.isAlive : false) && gameState.phase !== 'GameOver'}
                className={cn(
                  'w-full bg-surface border border-default rounded-full pl-4 pr-20 py-2 text-xs focus:outline-none focus:border-red-900/50 text-transparent caret-white selection:bg-red-900/30',
                  ((me ? !me.isAlive : false) && gameState.phase !== 'GameOver') && 'opacity-50 cursor-not-allowed'
                )}
              />
              <button
                type="button"
                onClick={() => { playSound('click'); setShowEmojiPicker(!showEmojiPicker); }}
                disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
                className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-white disabled:opacity-50"
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!me?.isAlive && gameState.phase !== 'GameOver'}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-red-500 hover:text-red-400 disabled:text-whisper"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    )}
  </AnimatePresence>
);
