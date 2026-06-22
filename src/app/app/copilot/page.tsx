'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Plus,
  Trash2,
  Send,
  User,
  MessageSquare,
  Pencil,
  Check,
  X,
  Sparkles,
  Clock,
} from 'lucide-react'
import { http } from '@/lib/http'
import { EmptyState, Spinner, Badge } from '@/components/ansein/ui'
import { Markdown } from '@/components/ansein/markdown'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ChatSession {
  id: number
  title: string
  investigation_id: number | null
  created_at: string
  updated_at: string
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  citations: string[]
  tokens_used: number
  created_at: string
}

const SUGGESTED_PROMPTS = [
  { icon: '🛡️', text: 'What are the latest IOCs in my workspace?' },
  { icon: '🔍', text: 'Summarise the APT29 investigation findings.' },
  { icon: '⚠️', text: 'Which entities have high severity scores?' },
  { icon: '🌐', text: 'List all malicious IPs and their enrichment.' },
]

export default function CopilotPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const sessionsQuery = useQuery({
    queryKey: ['copilot-sessions'],
    queryFn: () => http.get<ChatSession[]>('/copilot/sessions'),
  })

  const messagesQuery = useQuery({
    queryKey: ['copilot-messages', selectedId],
    queryFn: () => http.get<ChatMessage[]>(`/copilot/sessions/${selectedId}/messages`),
    enabled: selectedId !== null,
  })

  useEffect(() => {
    // eslint-disable-next-line
    if (messagesQuery.data) setMessages(messagesQuery.data)
  }, [messagesQuery.data])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const newSessionMutation = useMutation({
    mutationFn: () => http.post<ChatSession>('/copilot/sessions'),
    onSuccess: (s) => {
      setSelectedId(s.id)
      setMessages([])
      qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => http.delete(`/copilot/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
      if (confirmDeleteId === selectedId) {
        setSelectedId(null)
        setMessages([])
      }
      setConfirmDeleteId(null)
      toast.success('Session deleted')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      http.patch(`/copilot/sessions/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
      setEditingId(null)
      toast.success('Session renamed')
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to rename')
    },
  })

  async function handleSend() {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    setSending(true)

    // Optimistic add
    setMessages((m) => [
      ...m,
      {
        id: Date.now(),
        role: 'user',
        content: userMsg,
        citations: [],
        tokens_used: 0,
        created_at: new Date().toISOString(),
      },
    ])

    try {
      const resp = await http.post<{ session_id: number; message: ChatMessage }>('/copilot/ask', {
        session_id: selectedId || undefined,
        message: userMsg,
      })
      if (!selectedId) {
        setSelectedId(resp.session_id)
        qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
      }
      setMessages((m) => [...m, resp.message])
    } catch (err) {
      const e = err as Error
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: 'assistant',
          content: `Sorry, I hit an error: ${e.message}`,
          citations: [],
          tokens_used: 0,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id)
    setEditTitle(s.title)
  }

  function saveRename() {
    if (editingId === null) return
    const trimmed = editTitle.trim()
    if (!trimmed) return
    renameMutation.mutate({ id: editingId, title: trimmed })
  }

  const sessions = sessionsQuery.data || []
  const selectedSession = sessions.find((s) => s.id === selectedId)

  return (
    <div className="h-screen flex">
      {/* Sessions sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-[var(--ansein-border)] bg-[var(--ansein-sidebar)] flex flex-col">
        <div className="p-4 border-b border-[var(--ansein-border)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--ansein-text)] flex items-center gap-2">
              <Bot className="h-4 w-4 text-[var(--ansein-primary)]" />
              Copilot
            </h2>
            <button
              onClick={() => newSessionMutation.mutate()}
              disabled={newSessionMutation.isPending}
              className="p-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] hover:bg-[var(--ansein-primary-hover)] transition-colors disabled:opacity-60"
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-[var(--ansein-text-muted)]">
            General-purpose chats not bound to an investigation.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessionsQuery.isLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="h-6 w-6 text-[var(--ansein-text-dim)] mx-auto mb-2" />
              <p className="text-xs text-[var(--ansein-text-muted)]">
                No chats yet. Click + to start.
              </p>
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = selectedId === s.id
              const isEditing = editingId === s.id
              const isConfirmingDelete = confirmDeleteId === s.id
              return (
                <div
                  key={s.id}
                  className={cn(
                    'group relative flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors',
                    isActive
                      ? 'bg-[var(--ansein-surface-hover)] text-[var(--ansein-text)] border-l-2 border-[var(--ansein-primary)] pl-[calc(0.625rem-2px)]'
                      : 'text-[var(--ansein-text-muted)] hover:bg-[var(--ansein-surface)] hover:text-[var(--ansein-text)] border-l-2 border-transparent'
                  )}
                  onClick={() => {
                    if (!isEditing) {
                      setSelectedId(s.id)
                      setMessages([])
                      setConfirmDeleteId(null)
                    }
                  }}
                >
                  <MessageSquare
                    className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      isActive ? 'text-[var(--ansein-primary)]' : 'text-[var(--ansein-text-dim)]'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveRename()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingId(null)
                          }
                        }}
                        className="w-full px-1.5 py-0.5 rounded bg-[var(--ansein-bg)] border border-[var(--ansein-primary)] text-xs text-[var(--ansein-text)] focus:outline-none"
                      />
                    ) : (
                      <>
                        <p className="text-sm truncate" title={s.title}>
                          {s.title}
                        </p>
                        <p className="text-[10px] text-[var(--ansein-text-dim)] flex items-center gap-1">
                          <Clock className="h-2 w-2" />
                          {formatRelative(s.updated_at)}
                          {s.investigation_id && (
                            <span className="ml-1 px-1 rounded bg-[var(--ansein-primary)]/15 text-[var(--ansein-primary)] ansein-mono">
                              bound
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          saveRename()
                        }}
                        disabled={renameMutation.isPending || !editTitle.trim()}
                        className="p-1 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        title="Save name"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(null)
                        }}
                        className="p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
                        title="Cancel rename"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : isConfirmingDelete ? (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteMutation.mutate(s.id)
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1 text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Confirm delete"
                      >
                        {deleteMutation.isPending ? (
                          <Spinner className="h-3 w-3" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(null)
                        }}
                        className="p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
                        title="Cancel delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startRename(s)
                        }}
                        className="p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-primary)] transition-colors"
                        title="Rename session"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(s.id)
                        }}
                        className="p-1 text-[var(--ansein-text-dim)] hover:text-rose-400 transition-colors"
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer: stats */}
        {sessions.length > 0 && (
          <div className="p-3 border-t border-[var(--ansein-border)]">
            <div className="flex items-center justify-between text-[10px] text-[var(--ansein-text-dim)]">
              <span className="uppercase tracking-widest ansein-mono">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                RAG grounded
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat header (when session selected) */}
        {selectedSession && (
          <div className="px-6 py-3 border-b border-[var(--ansein-border)] bg-[var(--ansein-sidebar)]/50 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--ansein-text)] truncate">
                {selectedSession.title}
              </h2>
              <p className="text-[10px] text-[var(--ansein-text-dim)] flex items-center gap-1.5">
                <Bot className="h-2.5 w-2.5" />
                AnseIn Copilot
                {selectedSession.investigation_id && (
                  <Badge color="primary" className="ml-1">
                    Bound to #{selectedSession.investigation_id}
                  </Badge>
                )}
              </p>
            </div>
            <button
              onClick={() => startRename(selectedSession)}
              className="p-1.5 rounded-md text-[var(--ansein-text-dim)] hover:text-[var(--ansein-primary)] hover:bg-[var(--ansein-surface)] transition-colors"
              title="Rename this session"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!selectedId && sessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<Bot className="h-6 w-6 text-[var(--ansein-primary)]" />}
              title="Start a conversation"
              description="Create a new chat to ask the AnseIn Copilot. General chats aren't bound to an investigation."
              variant="branded"
              action={
                <button
                  onClick={() => newSessionMutation.mutate()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </button>
              }
            />
          </div>
        ) : !selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<MessageSquare className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
              title="Select a chat"
              description="Choose a session from the left, or start a new one."
              className="py-16"
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ansein-primary)]/15 to-transparent border border-[var(--ansein-primary)]/30 mb-3">
                    <Bot className="h-5 w-5 text-[var(--ansein-primary)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--ansein-text)]">How can I help?</p>
                  <p className="text-xs text-[var(--ansein-text-muted)] mt-1 max-w-sm">
                    I'm AnseIn Copilot. Ask me anything — for investigation-bound context, use the Copilot tab inside an investigation.
                  </p>
                  {/* Suggested prompts */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                    {SUGGESTED_PROMPTS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(p.text)}
                        className="text-left px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] hover:border-[var(--ansein-primary)]/40 hover:bg-[var(--ansein-surface-hover)] transition-colors group"
                      >
                        <span className="text-xs text-[var(--ansein-text-muted)] group-hover:text-[var(--ansein-text)] flex items-center gap-2">
                          <span>{p.icon}</span>
                          {p.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}
                  >
                    <div
                      className={cn(
                        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                        m.role === 'user'
                          ? 'bg-gradient-to-br from-[var(--ansein-primary)] to-[var(--ansein-primary-hover)] text-[var(--ansein-bg)]'
                          : 'bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]'
                      )}
                    >
                      {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div
                      className={cn(
                        'max-w-[75%] px-3.5 py-2.5 rounded-lg text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'bg-[var(--ansein-primary)]/10 border border-[var(--ansein-primary)]/20 text-[var(--ansein-text)]'
                          : 'bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)]'
                      )}
                    >
                      {m.role === 'assistant' ? (
                        <Markdown content={m.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--ansein-border)] flex flex-wrap gap-1">
                          <span className="text-[10px] text-[var(--ansein-text-dim)]">Cites:</span>
                          {m.citations.slice(0, 5).map((c, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] ansein-mono">
                              {c.length > 24 ? c.slice(0, 22) + '…' : c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="bg-[var(--ansein-surface)] border border-[var(--ansein-border)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--ansein-text-muted)]">
                    <Spinner className="h-3.5 w-3.5 inline mr-2" />
                    Thinking…
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/30">
              <div className="flex items-end gap-2 max-w-4xl mx-auto">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type your message…"
                  className="flex-1 px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] resize-none max-h-32"
                  style={{ minHeight: '38px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1.5 text-center">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
