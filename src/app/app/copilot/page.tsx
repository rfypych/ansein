'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChatCircle as MessageSquare, Check, Clock, PaperPlaneRight as Send, Pencil, Plus, Robot as Bot, Sparkle as Sparkles, Trash as Trash2, User, X, Info } from '@phosphor-icons/react'
import { http } from '@/lib/http'
import { EmptyState, Spinner, Badge } from '@/components/ansein/ui'
import { Markdown } from '@/components/ansein/markdown'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useChat } from '@ai-sdk/react'

interface ChatSession {
  id: number
  title: string
  investigation_id: number | null
  created_at: string
  updated_at: string
}

interface DbMessage {
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
    queryFn: () => http.get<DbMessage[]>(`/copilot/sessions/${selectedId}/messages`),
    enabled: selectedId !== null,
  })

  const { messages, setMessages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/v1/copilot/ask',
    body: { session_id: selectedId || undefined },
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
    }
  })

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(
        messagesQuery.data.map((m) => ({
          id: m.id.toString(),
          role: m.role as any,
          content: m.content,
        }))
      )
    } else {
      setMessages([])
    }
     
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

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  function startRename(s: ChatSession) {
    setEditingId(s.id)
    setEditTitle(s.title)
  }

  function saveRename() {
    if (editingId === null) return
    const trimmed = (editTitle || '').trim()
    if (!trimmed) return
    renameMutation.mutate({ id: editingId, title: trimmed })
  }

  const sessions = sessionsQuery.data || []
  const selectedSession = sessions.find((s) => s.id === selectedId)

  return (
    <div className="h-screen flex">
      {/* Sessions sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot weight="duotone" className="h-4 w-4 text-primary" />
              Copilot
            </h2>
            <button
              onClick={() => newSessionMutation.mutate()}
              disabled={newSessionMutation.isPending}
              className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
              title="New chat"
            >
              <Plus weight="duotone" className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
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
              <MessageSquare weight="duotone" className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
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
                      ? 'bg-card/80 text-foreground border-l-2 border-primary pl-[calc(0.625rem-2px)]'
                      : 'text-muted-foreground hover:bg-card hover:text-foreground border-l-2 border-transparent'
                  )}
                  onClick={() => {
                    if (!isEditing) {
                      setSelectedId(s.id)
                      setConfirmDeleteId(null)
                    }
                  }}
                >
                  <MessageSquare weight="duotone"
                    className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground/50'
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
                        className="w-full px-1.5 py-0.5 rounded bg-background border border-primary text-xs text-foreground focus:outline-none"
                      />
                    ) : (
                      <>
                        <p className="text-sm truncate" title={s.title}>
                          {s.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                          <Clock weight="duotone" className="h-2 w-2" />
                          {formatRelative(s.updated_at)}
                          {s.investigation_id && (
                            <span className="ml-1 px-1 rounded bg-primary/15 text-primary ansein-mono">
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
                        disabled={renameMutation.isPending || !(editTitle || '').trim()}
                        className="p-1 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                        title="Save name"
                      >
                        <Check weight="duotone" className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(null)
                        }}
                        className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                        title="Cancel rename"
                      >
                        <X weight="duotone" className="h-3 w-3" />
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
                          <Check weight="duotone" className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(null)
                        }}
                        className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                        title="Cancel delete"
                      >
                        <X weight="duotone" className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startRename(s)
                        }}
                        className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
                        title="Rename session"
                      >
                        <Pencil weight="duotone" className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(s.id)
                        }}
                        className="p-1 text-muted-foreground/50 hover:text-rose-400 transition-colors"
                        title="Delete session"
                      >
                        <Trash2 weight="duotone" className="h-3 w-3" />
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
          <div className="p-3 border-t border-border">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span className="uppercase tracking-widest ansein-mono">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Sparkles weight="duotone" className="h-2.5 w-2.5" />
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
          <div className="px-6 py-3 border-b border-border bg-card/50 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">
                {selectedSession.title}
              </h2>
              <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
                <Bot weight="duotone" className="h-2.5 w-2.5" />
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
              className="p-1.5 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-card transition-colors"
              title="Rename this session"
            >
              <Pencil weight="duotone" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!selectedId && sessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<Bot weight="duotone" className="h-6 w-6 text-primary" />}
              title="Start a conversation"
              description="Create a new chat to ask the AnseIn Copilot. General chats aren't bound to an investigation."
              variant="branded"
              action={
                <button
                  onClick={() => newSessionMutation.mutate()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus weight="duotone" className="h-3.5 w-3.5" />
                  New chat
                </button>
              }
            />
          </div>
        ) : !selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<MessageSquare weight="duotone" className="h-6 w-6 text-muted-foreground/50" />}
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
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/30 mb-4 shadow-[0_0_30px_rgba(0,85,255,0.15)] relative">
                    <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-20"></div>
                    <Bot weight="duotone" className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-lg font-semibold text-foreground tracking-wide">AnseIn Autonomous Agent</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
                    Awaiting instructions. Ask me to perform web searches, analyze IOCs, or summarize investigations.
                  </p>
                  {/* Suggested prompts */}
                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                    {SUGGESTED_PROMPTS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleInputChange({ target: { value: p.text } } as any)}
                        className="text-left px-4 py-3 rounded-lg bg-card/40 backdrop-blur-md border border-border hover:border-primary/50 hover:bg-card/60 hover:shadow-[0_0_15px_rgba(0,85,255,0.1)] transition-all duration-300 group"
                      >
                        <span className="text-sm text-muted-foreground group-hover:text-foreground flex items-center gap-3">
                          <span className="text-base">{p.icon}</span>
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
                    className={cn('flex gap-4 w-full max-w-4xl mx-auto flex-col', m.role === 'user' ? 'items-end' : 'items-start')}
                  >
                    <div className={cn('flex gap-4 w-full', m.role === 'user' && 'flex-row-reverse')}>
                      <div
                        className={cn(
                          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-md',
                          m.role === 'user'
                            ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,85,255,0.3)]'
                            : 'bg-card/80 border border-border text-primary backdrop-blur-md'
                        )}
                      >
                        {m.role === 'user' ? <User weight="duotone" className="h-4 w-4" /> : <Bot weight="duotone" className="h-4 w-4" />}
                      </div>
                      <div
                        className={cn(
                          'px-4 py-3 rounded-xl text-sm leading-relaxed transition-all',
                          m.role === 'user'
                            ? 'bg-primary/10 border border-primary/20 text-foreground shadow-[0_0_15px_rgba(0,85,255,0.05)] max-w-[80%]'
                            : 'bg-card/60 backdrop-blur-lg border border-border text-foreground shadow-lg max-w-[85%]'
                        )}
                      >
                        {m.role === 'assistant' ? (
                          <>
                            <Markdown content={m.content} />
                            
                            {m.toolInvocations && m.toolInvocations.length > 0 && (
                              <div className="mt-4 space-y-2">
                                {m.toolInvocations.map((toolInvocation: any) => {
                                  const { toolCallId, toolName, state, args } = toolInvocation
                                  return (
                                    <div key={toolCallId} className="p-3 rounded-lg bg-black/40 border border-border/60">
                                      <div className="flex items-center gap-2 mb-1">
                                        {state === 'result' ? (
                                          <Check weight="bold" className="h-3.5 w-3.5 text-emerald-500" />
                                        ) : (
                                          <Spinner className="h-3.5 w-3.5 text-amber-500" />
                                        )}
                                        <span className="text-xs font-semibold uppercase tracking-wider text-primary/80 ansein-mono">
                                          Action: {toolName}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-mono truncate max-w-full">
                                        {JSON.stringify(args)}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-4 w-full max-w-4xl mx-auto">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-md border border-border text-primary">
                    <Bot weight="duotone" className="h-4 w-4" />
                  </div>
                  <div className="bg-card/60 backdrop-blur-lg border border-border rounded-xl px-4 py-3 text-sm text-muted-foreground flex items-center shadow-lg">
                    <Spinner className="h-4 w-4 mr-3 text-primary" />
                    Processing intelligence...
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-background/80 backdrop-blur-2xl">
              <form onSubmit={handleSubmit} className="flex items-end gap-3 max-w-4xl mx-auto relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                <div className="relative flex w-full bg-card/80 backdrop-blur-xl border border-border rounded-xl shadow-lg focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKey}
                    placeholder="Provide intel or instructions..."
                    className="flex-1 px-4 py-3.5 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none max-h-32 leading-relaxed"
                    style={{ minHeight: '48px' }}
                  />
                  <div className="p-2 flex items-end">
                    <button
                      type="submit"
                      onClick={(e) => {
                        e.preventDefault()
                        handleSubmit(e as any)
                      }}
                      disabled={!(input || '').trim() || isLoading}
                      className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_10px_rgba(0,85,255,0.2)] hover:shadow-[0_0_15px_rgba(0,85,255,0.4)]"
                    >
                      <Send weight="duotone" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </form>
              <p className="text-[10px] text-muted-foreground/50 mt-3 text-center uppercase tracking-widest font-mono">
                [ENTER] Transmit · [SHIFT+ENTER] New Line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
