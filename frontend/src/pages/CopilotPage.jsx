import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Trash2, Loader2, Send } from "lucide-react";
import { http } from "../lib/api";
import { Card, CardHeader, Button, Input, EmptyState, Badge } from "../components/ui";
import { formatDate } from "../lib/utils";

export function CopilotPage() {
  const qc = useQueryClient();
  const [activeSession, setActiveSession] = useState(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  const sessions = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => http.get("/copilot/sessions"),
  });

  const messages = useQuery({
    queryKey: ["chat-messages", activeSession],
    queryFn: () => http.get(`/copilot/sessions/${activeSession}/messages`),
    enabled: !!activeSession,
  });

  const newSession = useMutation({
    mutationFn: () => http.post("/copilot/sessions", {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      setActiveSession(data.id);
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id) => http.delete(`/copilot/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (activeSession) setActiveSession(null);
    },
  });

  const ask = useMutation({
    mutationFn: (payload) => http.post("/copilot/ask", payload),
    onSuccess: (data) => {
      setActiveSession(data.session_id);
      qc.invalidateQueries({ queryKey: ["chat-messages", data.session_id] });
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const send = async () => {
    if (!input.trim() || ask.isPending) return;
    const msg = input;
    setInput("");
    await ask.mutateAsync({
      session_id: activeSession,
      message: msg,
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold">Chats</h2>
          <Button size="sm" variant="ghost" onClick={() => newSession.mutate()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {sessions.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          ) : sessions.data?.length === 0 ? (
            <div className="text-center text-xs text-slate-600 py-8 px-4">
              No chats yet. Click + to start.
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {sessions.data?.map((s) => (
                <div
                  key={s.id}
                  className={`px-3 py-2 rounded-lg cursor-pointer group flex items-center justify-between gap-2 ${
                    activeSession === s.id
                      ? "bg-slate-800 text-white"
                      : "hover:bg-slate-800/50 text-slate-400"
                  }`}
                  onClick={() => setActiveSession(s.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{s.title}</div>
                    <div className="text-xs text-slate-600">{formatDate(s.updated_at)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession.mutate(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select or start a chat"
              description="The Copilot can answer questions about any investigation you've created."
              action={
                <Button onClick={() => newSession.mutate()}>
                  <Plus className="w-4 h-4" />
                  New chat
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 px-6 py-3">
              <div className="font-semibold">
                {sessions.data?.find((s) => s.id === activeSession)?.title || "Chat"}
              </div>
              <div className="text-xs text-slate-500">
                Session ID: {activeSession}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {messages.data?.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8">
                  Start the conversation. Ask anything about your threat intelligence data.
                </div>
              ) : (
                messages.data?.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                        m.role === "user"
                          ? "bg-sky-600 text-white"
                          : "bg-slate-800 text-slate-100"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.tokens_used > 0 && (
                        <div className="text-[10px] opacity-50 mt-1">{m.tokens_used} tokens</div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {ask.isPending && (
                <div className="flex justify-start">
                  <div className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-slate-800 p-4 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask a question…"
                disabled={ask.isPending}
              />
              <Button onClick={send} disabled={ask.isPending || !input.trim()}>
                <Send className="w-4 h-4" />
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
