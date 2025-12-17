import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { BotId } from '../types';

interface ChatInterfaceProps {
  activeBot: BotId;
  isThinking: boolean;
  onSendMessage: (text: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ activeBot, isThinking, onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeBot && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeBot]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isThinking) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  if (!activeBot) {
    return (
      <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none">
        <div className="inline-block bg-black/50 backdrop-blur-md text-white px-6 py-3 rounded-full animate-bounce">
          Tap a block to start chatting
        </div>
      </div>
    );
  }

  const botColorClass = activeBot === 'red' ? 'border-red-500 text-red-500' : 'border-gray-800 text-gray-800';
  const buttonColorClass = activeBot === 'red' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-800 hover:bg-black';

  return (
    <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center items-end pointer-events-none">
      <div className="w-full max-w-md pointer-events-auto">
        <form onSubmit={handleSubmit} className="relative flex items-center shadow-2xl rounded-2xl overflow-hidden bg-white/90 backdrop-blur-xl border border-white/50 transition-all duration-300">
          <div className={`pl-4 pr-2 ${botColorClass}`}>
            <MessageSquare size={20} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Say something to ${activeBot === 'red' ? 'Red' : 'Noir'}...`}
            className="w-full bg-transparent py-4 px-2 outline-none text-gray-800 placeholder-gray-500"
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isThinking}
            className={`p-4 transition-colors ${buttonColorClass} text-white disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Send size={20} />
          </button>
        </form>
        <div className="text-center mt-2 text-xs text-white/70 font-medium drop-shadow-md">
            {isThinking ? `${activeBot === 'red' ? 'Red' : 'Noir'} is thinking...` : 'Press Enter to send'}
        </div>
      </div>
    </div>
  );
};