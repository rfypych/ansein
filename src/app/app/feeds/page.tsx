'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Broadcast,
  Bug,
  Check,
  CircleNotch as Loader2,
  Copy,
  DownloadSimple as ArrowDownToLine,
  Export,
  ArrowSquareOut as ExternalLink,
  FileCode,
  MagnifyingGlass as Search,
  Plus,
  ShieldWarning as ShieldAlert,
  Warning as AlertTriangle,
} from '@phosphor-icons/react'
import { http } from '@/lib/http'
import { Badge, Spinner, EmptyState } from '@/components/ansein/ui'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FeedItem {
  id: string
  source: 'CISA KEV' | 'URLhaus' | 'ThreatFox'
  type: string
  indicator: string
  description: string
  date: string
  confidence: number
}

interface FeedsResponse {
  total: number
  items: FeedItem[]
}

export default function ThreatFeedsPage() {
  const router = useRouter()
  const [sourceFilter, setSourceFilter] = useState<'all' | 'cisa' | 'urlhaus' | 'threatfox'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery<FeedsResponse>({
    queryKey: ['threat-feeds', sourceFilter],
    queryFn: () => http.get<FeedsResponse>(`/feeds?source=${sourceFilter}`),
  })

  const ingestMutation = useMutation({
    mutationFn: async (item: FeedItem) => {
      const inv = await http.post<{ id: number }>('/investigations', {
        title: `[${item.source}] ${item.indicator}`,
        description: `${item.description}\nSource: ${item.source}\nReported: ${item.date}`,
        tags: ['feed', item.source.toLowerCase().replace(/\s+/g, '-'), item.type],
      })
      await http.post(`/ingest/${inv.id}/sources`, {
        source_type: 'text',
        title: `${item.source} Ingest`,
        content: `Indicator: ${item.indicator}\nDetails: ${item.description}\nSource: ${item.source}\nDate: ${item.date}`,
      })
      return inv.id
    },
    onSuccess: (id) => {
      toast.success('Ingested into new investigation case')
      router.push(`/app/investigations/${id}`)
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to ingest feed item')
    },
  })

  const filteredItems = (data?.items || []).filter((item) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      item.indicator.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.source.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Live Threat Feeds
            </h1>
            <Badge color="primary" className="text-xs">
              100% Free & Open OSINT
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Zero-cost streaming threat intelligence from CISA KEV, abuse.ch URLhaus & ThreatFox.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium transition-colors"
          >
            <Loader2 className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh Feed
          </button>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by CVE, URL, malware, or keyword…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex gap-1.5 p-1 bg-card border border-border rounded-lg">
          <button
            onClick={() => setSourceFilter('all')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              sourceFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All Sources
          </button>
          <button
            onClick={() => setSourceFilter('cisa')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              sourceFilter === 'cisa'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            CISA KEV
          </button>
          <button
            onClick={() => setSourceFilter('urlhaus')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              sourceFilter === 'urlhaus'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            URLhaus
          </button>
          <button
            onClick={() => setSourceFilter('threatfox')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              sourceFilter === 'threatfox'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            ThreatFox
          </button>
        </div>
      </div>

      {/* Feed List */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Spinner />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<Broadcast className="h-8 w-8 text-muted-foreground" />}
          title="No threat feed items found"
          description="Try adjusting your filter or search query."
        />
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((item) => (
            <div
              key={`${item.source}-${item.id}`}
              className="p-4 rounded-xl border border-border bg-card hover:border-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border',
                      item.source === 'CISA KEV'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    )}
                  >
                    {item.source}
                  </span>
                  <span className="text-xs font-mono font-bold text-foreground truncate">
                    {item.indicator}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {item.date}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(item.indicator)
                    toast.success('Copied to clipboard')
                  }}
                  title="Copy indicator"
                  className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => ingestMutation.mutate(item)}
                  disabled={ingestMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Investigate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
