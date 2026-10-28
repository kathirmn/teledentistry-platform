'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ParticipantRole } from '@/lib/webrtc-types';
import { MessageSquare, Send, X } from 'lucide-react';

interface InCallChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: ParticipantRole;
}

export function InCallChat({
  messages,
  onSendMessage,
  isOpen,
  onClose,
  currentUserRole,
}: InCallChatProps) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const getRoleBadge = (role: ParticipantRole) => {
    switch (role) {
      case 'senior-doctor':
        return { label: 'Senior Specialist', color: 'bg-cyan-950/60 text-cyan-300 border-cyan-800' };
      case 'junior-dentist':
        return { label: 'Junior Clinician', color: 'bg-amber-950/60 text-amber-300 border-amber-800' };
      case 'mobile-cam':
      default:
        return { label: 'Mobile Cam', color: 'bg-purple-950/60 text-purple-300 border-purple-800' };
    }
  };

  return (
    <div className="fixed bottom-16 right-4 z-40 w-80 sm:w-96 h-[450px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white tracking-wide uppercase">Clinical Chat</h3>
          <span className="text-[10px] text-slate-400 font-mono">({messages.length})</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-[11px] font-medium">No messages yet</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Send a quick note or diagnosis comment</p>
          </div>
        ) : (
          messages.map((m) => {
            const roleBadge = getRoleBadge(m.senderRole);
            return (
              <div key={m.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200">{m.senderName}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${roleBadge.color}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-slate-200 text-xs break-words leading-relaxed">
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSend} className="p-2.5 bg-slate-950 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          placeholder="Type clinical observation..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition shadow"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
