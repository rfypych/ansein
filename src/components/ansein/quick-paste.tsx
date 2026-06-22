'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Zap,
  X,
  Loader2,
  FileText,
  ChevronRight,
  Search,
} from 'lucide-react'
import { http } from '@/lib/http'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Investigation {
  id: number
  title: string
  status: string
  severity_score: number
  is_starred: boolean
}

interface InvestigationList {
  items: Investigation[]
  total: number
}

/**
 * Quick Paste modal — trigger with Shift+P
 * Lets users paste raw text and quickly add it as a source to any investigation.
 */
export function QuickPasteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [selectedInvId, setSelectedInvId] = useState<number | null>(null)
  const [runPipeline, setRunPipeline] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch investigations for selection
  const invQuery = useQuery({
    queryKey: ['quick-paste-investigations'],
    queryFn: () => http.get<InvestigationList>('/investigations?page=1&page_size=50'),
    enabled: open,
  })

  // Add source mutation
  const addMutation = useMutation({
    mutationFn: ({ invId, content, title }: { invId: number; content: string; title: string }) =>
      http.post(`/ingest/${invId}/sources`, {
        source_type: 'text',
        title: title || 'Quick paste',
        content,
      }),
    onSuccess: (data, vars) => {
      toast.success('Source added')
      qc.invalidateQueries({ queryKey: ['sources', vars.invId] })
      qc.invalidateQueries({ queryKey: ['investigation', vars.invId] })
      qc.invalidateQueries({ queryKey: ['investigations'] })
      if (runPipeline) {
        // Trigger pipeline in background
        http.post(`/investigations/${vars.invId}/pipeline`).then(() => {
          toast.success('Pipeline completed')
          qc.invalidateQueries({ queryKey: ['investigation', vars.invId] })
          qc.invalidateQueries({ queryKey: ['entities', vars.invId] })
          qc.invalidateQueries({ queryKey: ['graph', vars.invId] })
          qc.invalidateQueries({ queryKey: ['analysis', vars.invId] })
        }).catch((e) => {
          toast.error('Pipeline failed: ' + (e as Error).message)
        })
      }
      // Navigate to the investigation
      router.push(`/app/investigations/${vars.invId}`)
      handleClose()
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to add source')
    },
  })

  // Auto-focus textarea when opened
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setText('')
        setTitle('')
        setSearch('')
        setSelectedInvId(null)
        setRunPipeline(false)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function handleClose() {
    setText('')
    setTitle('')
    setSearch('')
    setSelectedInvId(null)
    setRunPipeline(false)
    onClose()
  }

  function handleSubmit() {
    if (!text.trim() || !selectedInvId) return
    addMutation.mutate({
      invId: selectedInvId,
      content: text.trim(),
      title: title.trim() || 'Quick paste',
    })
  }

  const investigations = invQuery.data?.items || []
  const filtered = investigations.filter((i) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return i.title.toLowerCase().includes(q)
  })

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] ansein-fade-in"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl ansein-card rounded-xl border-[var(--ansein-border-strong)] overflow-hidden ansein-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ansein-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Zap className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--ansein-text)]">Quick paste</h2>
              <p className="text-[10px] text-[var(--ansein-text-dim)]">
                Add raw text as a source to any investigation
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors p-1 rounded-md hover:bg-[var(--ansein-surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto ansein-scrollbar">
          {/* Title input */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono mb-1.5 block">
              Source title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Threat report excerpt, IOC list, pasted email…"
              className="w-full px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)] transition-colors"
            />
          </div>

          {/* Text content */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono mb-1.5 block">
              Content
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste raw threat data here — IOCs, malware names, threat actor info, URLs…"
              rows={6}
              className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)] resize-y min-h-[120px] ansein-mono text-xs"
            />
            <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1">
              {text.length.toLocaleString()} chars
            </p>
          </div>

          {/* Investigation selector */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono mb-1.5 block">
              Add to investigation
            </label>
            {invQuery.isLoading ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--ansein-text-dim)]" />
              </div>
            ) : investigations.length === 0 ? (
              <p className="text-xs text-[var(--ansein-text-dim)] py-3 text-center">
                No investigations yet. Create one first.
              </p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--ansein-text-dim)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search investigations…"
                    className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-xs text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)]"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto ansein-scrollbar space-y-0.5 rounded-md border border-[var(--ansein-border)]">
                  {filtered.slice(0, 20).map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => setSelectedInvId(inv.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        selectedInvId === inv.id
                          ? 'bg-[var(--ansein-primary)]/10 text-[var(--ansein-text)]'
                          : 'hover:bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)]'
                      )}
                    >
                      <FileText className="h-3 w-3 flex-shrink-0 text-[var(--ansein-text-dim)]" />
                      <span className="text-xs font-medium truncate flex-1">{inv.title}</span>
                      {inv.is_starred && (
                        <span className="text-amber-400 text-[10px]">★</span>
                      )}
                      {selectedInvId === inv.id && (
                        <ChevronRight className="h-3 w-3 text-[var(--ansein-primary)] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Run pipeline option */}
          {selectedInvId && (
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={runPipeline}
                onChange={(e) => setRunPipeline(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--ansein-border)] bg-[var(--ansein-surface)] accent-[var(--ansein-primary)]"
              />
              <span className="text-xs text-[var(--ansein-text-muted)] group-hover:text-[var(--ansein-text)] transition-colors">
                Run extraction pipeline after adding (takes ~30-60s)
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/30">
          <p className="text-[10px] text-[var(--ansein-text-dim)] ansein-mono">
            Esc to close
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-md text-xs text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || !selectedInvId || addMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-xs font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {addMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              {runPipeline ? 'Add & run' : 'Add source'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
