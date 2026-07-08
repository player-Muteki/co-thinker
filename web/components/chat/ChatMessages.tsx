"use client";

import { useEffect, useRef } from "react";
import { Bot, UserRound } from "lucide-react";

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export default function ChatMessages({
  messages,
  streaming,
}: {
  messages: Message[];
  streaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-[var(--text-secondary)]">
        <div>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-[var(--surface-alt)] text-[var(--text-muted)]">
            <Bot size={24} />
          </div>
          <p className="text-base font-medium text-[var(--text-primary)]">还没有消息</p>
          <p className="mt-1 text-sm">等待第一条问题。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 lg:px-6">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {msg.role !== "user" && (
            <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--surface-panel)] text-[var(--accent)] shadow-[var(--shadow-sm)]">
              <Bot size={17} />
            </div>
          )}
          <div
            className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 shadow-[var(--shadow-sm)] ${
              msg.role === "user"
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--text-primary)]"
            }`}
          >
            <div className="whitespace-pre-wrap break-words">
              {msg.content}
              {streaming && msg === messages[messages.length - 1] && msg.role === "assistant" && (
                <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-1" />
              )}
            </div>

            {msg.role === "assistant" && msg.content && (
              <div className="mt-3 border-t border-[var(--surface-border)] pt-2 text-xs text-[var(--text-secondary)]">
                {new Date(msg.created_at).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
          {msg.role === "user" && (
            <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]">
              <UserRound size={16} />
            </div>
          )}
        </div>
      ))}

      {streaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
        <div className="flex justify-start gap-3">
          <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--surface-panel)] text-[var(--accent)] shadow-[var(--shadow-sm)]">
            <Bot size={17} />
          </div>
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-3 text-sm shadow-[var(--shadow-sm)]">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
