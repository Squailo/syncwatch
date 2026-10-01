"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  isHost: boolean;
  isSystem?: boolean;
  timestamp: number;
}

interface LiveChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUsername: string;
  isHost: boolean;
}

export default function LiveChat({
  messages,
  onSendMessage,
  currentUsername,
  isHost,
}: LiveChatProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const formatHour = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="text-sm font-semibold text-white tracking-wide">
            Chat en Vivo
          </h3>
        </div>
        <span className="text-xs text-zinc-500 font-mono">
          {messages.length} mensajes
        </span>
      </div>

      {/* Messages list */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-[220px] max-h-[360px] lg:max-h-none">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600">
            <span className="text-2xl mb-2">🍿</span>
            <p className="text-xs">¡El chat está listo!</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Comenten el video mientras lo miran juntos.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender === currentUsername;

            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="py-1 px-2.5 rounded-lg bg-white/[0.03] border border-white/5 text-center text-xs text-purple-300/80 italic font-mono"
                >
                  {msg.text}
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isMe ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  {msg.isHost && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-300 font-semibold border border-yellow-500/30">
                      👑 Host
                    </span>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      isMe ? "text-purple-300" : "text-zinc-300"
                    }`}
                  >
                    {isMe ? "Tú" : msg.sender}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {formatHour(msg.timestamp)}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words leading-relaxed ${
                    isMe
                      ? "bg-purple-600 text-white rounded-tr-sm"
                      : "bg-white/10 text-zinc-100 rounded-tl-sm border border-white/5"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 border-t border-white/10 bg-black/50 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Escribe un mensaje..."
          maxLength={300}
          className="flex-1 px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 text-white rounded-xl transition-all flex items-center justify-center shrink-0"
          title="Enviar"
        >
          <svg
            className="w-4 h-4 transform rotate-90"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
