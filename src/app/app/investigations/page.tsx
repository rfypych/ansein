'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  FolderSearch,
  FileText,
  Network,
  Share2,
  Star,
  Trash2,
  X,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react'
import { http } from '@/lib/http'
import { Badge, EmptyState, SeverityMeter, Spinner } from '@/components/ansein/ui'
import { InvestigationCardSkeleton } from '@/components/ansein/skeletons'
import { statusColor, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface InvestigationItem {
  id: number
  title: string
  description: string
  status: string
  severity_score: number
  tags: string[]
  is_starred: boolean
  created_at: string
  updated_at: string
  source_count: number
  entity_count: number
  relationship_count: number
}

interface InvestigationList {
  items: InvestigationItem[]
  total: number
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'enriching', label: 'Enriching' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
]

export default function InvestigationListPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [starredOnly, setStarredOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const pageSize = 12

  // Fetch all investigations on the current page
  const { data, isLoading } = useQuery({
    queryKey: ['investigations', page, pageSize],
    queryFn: () => http.get<InvestigationList>(`/investigations?page=${page}&page_size=${pageSize}`),
    refetchInterval: 30_000,
  })

  const items = data?.items || []

  // Client-side filter for search + status + starred
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (starredOnly && !i.is_starred) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
      }
      return true
    })
  }, [items, statusFilter, starredOnly, search])

  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const starredCount = items.filter((i) => i.is_starred).length

  // Star mutation (optimistic)
  const starMutation = useMutation({
    mutationFn: ({ id, isStarred }: { id: number; isStarred: boolean }) =>
      http.patch(`/investigations/${id}`, { is_starred: isStarred }),
    onMutate: async ({ id, isStarred }) => {
      await qc.cancelQueries({ queryKey: ['investigations'] })
      const previous = qc.getQueryData<InvestigationList>(['investigations', page, pageSize])
      if (previous) {
        qc.setQueryData<InvestigationList>(['investigations', page, pageSize], {
          ...previous,
          items: previous.items.map((i) => (i.id === id ? { ...i, is_starred: isStarred } : i)),
        })
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['investigations', page, pageSize], ctx.previous)
      }
      toast.error('Failed to update star')
    },
    onSuccess: (_d, { isStarred }) => {
      toast.success(isStarred ? 'Starred investigation' : 'Removed star', { duration: 1500 })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      http.delete<{ deleted: number; requested: number }>(`/investigations`, { ids }),
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} investigation${data.deleted !== 1 ? 's' : ''}`)
      setSelected(new Set())
      setBulkConfirm(false)
      qc.invalidateQueries({ queryKey: ['investigations'] })
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to delete investigations')
      setBulkConfirm(false)
    },
  })

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map((i) => i.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function toggleStar(e: React.MouseEvent, inv: InvestigationItem) {
    e.preventDefault()
    e.stopPropagation()
    starMutation.mutate({ id: inv.id, isStarred: !inv.is_starred })
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
            Cases
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Investigations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} total · {filtered.length} shown{starredCount > 0 && ` · ${starredCount} starred`}
          </p>
        </div>
        <Link
          href="/app/investigations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors w-fit"
        >
          <Plus className="h-4 w-4" />
          New investigation
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or description…"
            className="w-full pl-9 pr-3 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto ansein-no-scrollbar pb-1">
          {STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f.key
            const count = f.key === 'all' ? items.length : items.filter((i) => i.status === f.key).length
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors border',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50'
                )}
              >
                {f.label}
                {count > 0 && (
                  <span className={cn(
                    'ansein-mono text-[9px] px-1 rounded',
                    isActive ? 'bg-background/20' : 'bg-background/50'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
          {/* Starred filter */}
          <div className="w-px h-5 bg-[border] mx-1 flex-shrink-0" />
          <button
            onClick={() => setStarredOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors border',
              starredOnly
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                : 'bg-card text-muted-foreground border-border hover:text-amber-400 hover:border-amber-500/30'
            )}
            title="Show only starred investigations"
          >
            <Star className={cn('h-3 w-3', starredOnly && 'fill-current')} />
            Starred
            {starredCount > 0 && (
              <span className={cn(
                'ansein-mono text-[9px] px-1 rounded',
                starredOnly ? 'bg-amber-500/20' : 'bg-background/50'
              )}>
                {starredCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-4 -mx-2 px-2">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-card/80 border border-primary/30 backdrop-blur ansein-fade-in">
            <div className="flex items-center gap-3">
              <button
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="text-sm text-foreground">
                <span className="ansein-mono font-semibold">{selected.size}</span> selected
              </span>
              <button
                onClick={selectAll}
                className="text-xs text-primary hover:text-primary/90 transition-colors"
              >
                Select all visible ({filtered.length})
              </button>
            </div>
            <div className="flex items-center gap-2">
              {bulkConfirm ? (
                <>
                  <span className="text-xs text-rose-400">Delete {selected.size} investigation{selected.size !== 1 ? 's' : ''}?</span>
                  <button
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
                    disabled={bulkDeleteMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500 text-white text-xs font-medium hover:bg-rose-600 disabled:opacity-60 transition-colors"
                  >
                    {bulkDeleteMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setBulkConfirm(false)}
                    className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setBulkConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InvestigationCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon={<FolderSearch className="h-6 w-6 text-primary" />}
            title={search || statusFilter !== 'all' || starredOnly ? 'No matching investigations' : 'No investigations yet'}
            description={
              search || statusFilter !== 'all' || starredOnly
                ? 'Try adjusting your search query or filters.'
                : 'Create your first investigation to start extracting threat intelligence.'
            }
            variant="branded"
            action={
              !search && statusFilter === 'all' && !starredOnly && (
                <Link
                  href="/app/investigations/new"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New investigation
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((inv) => {
            const s = statusColor(inv.status)
            const isSelected = selected.has(inv.id)
            return (
              <div
                key={inv.id}
                className={cn(
                  'bg-card border border-border rounded-xl relative overflow-hidden group transition-all',
                  isSelected && 'ring-1 ring-[primary] border-primary/40'
                )}
              >
                {/* Selection checkbox */}
                <button
                  onClick={() => toggleSelected(inv.id)}
                  className={cn(
                    'absolute top-3 left-3 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all',
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-card/80 border-border text-transparent opacity-0 group-hover:opacity-100 hover:border-primary'
                  )}
                  title={isSelected ? 'Deselect' : 'Select for bulk action'}
                >
                  {isSelected ? (
                    <CheckSquare className="h-3 w-3" />
                  ) : (
                    <Square className="h-3 w-3" />
                  )}
                </button>
                {/* Star button */}
                <button
                  onClick={(e) => toggleStar(e, inv)}
                  disabled={starMutation.isPending}
                  className={cn(
                    'absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-md border transition-all disabled:opacity-60',
                    inv.is_starred
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 opacity-100'
                      : 'bg-card/80 border-border text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:border-amber-500/30'
                  )}
                  title={inv.is_starred ? 'Remove star' : 'Star this investigation'}
                >
                  <Star className={cn('h-3.5 w-3.5', inv.is_starred && 'fill-current')} />
                </button>
                {/* Status accent line */}
                <div
                  className={cn('absolute top-0 left-0 right-0 h-0.5', s.dot)}
                  style={{ background: s.dot.replace('bg-', '') }}
                />
                <Link
                  href={`/app/investigations/${inv.id}`}
                  className="block p-5 pt-10 flex flex-col gap-3"
                >
                  <h3 className="text-base font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">
                    {inv.title}
                  </h3>
                  <span className={cn('self-start inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0', s.bg, s.text, s.border)}>
                    <span className={cn('h-1 w-1 rounded-full', s.dot)} />
                    {inv.status}
                  </span>
                  {inv.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {inv.description}
                    </p>
                  )}
                  {inv.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {inv.tags.slice(0, 4).map((t, i) => (
                        <span key={i} className="text-[10px] ansein-mono px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground/50">
                          #{t}
                        </span>
                      ))}
                      {inv.tags.length > 4 && (
                        <span className="text-[10px] ansein-mono px-1.5 py-0.5 text-muted-foreground/50">
                          +{inv.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-border">
                    <Stat icon={<FileText className="h-3 w-3" />} value={inv.source_count} label="sources" />
                    <Stat icon={<Network className="h-3 w-3" />} value={inv.entity_count} label="entities" />
                    <Stat icon={<Share2 className="h-3 w-3" />} value={inv.relationship_count} label="rels" />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground/50">
                      {formatRelative(inv.updated_at)}
                    </span>
                    <SeverityMeter score={inv.severity_score} size="sm" />
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !search && statusFilter === 'all' && !starredOnly && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-md border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground ansein-mono">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-md border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="ansein-mono text-sm font-semibold">{value}</span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mt-0.5">
        {label}
      </span>
    </div>
  )
}
