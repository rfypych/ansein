'use client'

/**
 * VirtualizedEntityTable — windowed rendering for large entity lists.
 *
 * Uses @tanstack/react-virtual so only the visible rows (plus a small
 * `overscan`) are mounted in the DOM. This keeps the page responsive even with
 * 100,000+ rows because React never has to reconcile more than ~30-40 row
 * elements at a time.
 *
 * Layout strategy: a real `<table>` element with a sticky `<thead>` and a
 * `<tbody>` whose total height equals `virtualizer.getTotalSize()`. We
 * achieve this with a leading spacer `<tr>` (height = first virtual item's
 * `start`) and a trailing spacer `<tr>` (height = totalSize − last item's
 * `end`). The visible data rows are sandwiched between the two spacers, so
 * the browser only paints ~30 rows at a time while the scrollbar reflects
 * the full row count.
 *
 * Columns: Type · Value · Method · Confidence · Enrichment.
 * Clicking a row calls `onSelect(id)`.
 */
import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ShieldWarning as ShieldAlert } from '@phosphor-icons/react'
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface VirtualizedEntity {
  id: number
  entity_type: string
  value: string
  source_method: string
  confidence: number
  enrichment: Record<string, unknown>
}

interface Props {
  entities: VirtualizedEntity[]
  onSelect: (id: number) => void
  height?: number
}

// Fixed row height keeps the virtualizer's measurements exact — no
// re-measurement jitter as the user scrolls.
const ROW_HEIGHT = 44

export function VirtualizedEntityTable({ entities, onSelect, height = 560 }: Props) {
  // The scroll container is also the virtualizer's measurement element.
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: entities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Pre-compute per-row enrichment metadata so we don't recompute on every
  // scroll tick.
  const rowMeta = useMemo(
    () =>
      entities.map((e) => {
        const enrKeys = Object.keys(e.enrichment || {}).filter(
          (k) =>
            e.enrichment[k] &&
            typeof e.enrichment[k] === 'object' &&
            Object.keys(e.enrichment[k] as object).length > 0
        )
        const isMalicious = enrKeys.some((k) => {
          const d = e.enrichment[k] as Record<string, unknown> | undefined
          return (
            (typeof d?.malicious === 'number' && d.malicious > 0) ||
            (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
          )
        })
        return { enrKeys, isMalicious }
      }),
    [entities],
  )

  const virtualItems = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()

  // Spacer heights — these are what make the scrollbar reflect the true row
  // count while only the visible rows are actually rendered.
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? Math.max(0, totalHeight - virtualItems[virtualItems.length - 1].end)
      : 0

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden border border-border">
      {/* Row count strip */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/40">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 ansein-mono">
          {entities.length.toLocaleString()} rows · virtualized
        </span>
        <span className="text-[10px] text-muted-foreground/50 ansein-mono">
          window {virtualItems.length} / {entities.length.toLocaleString()}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="ansein-scrollbar overflow-auto"
        style={{ height }}
      >
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '38%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '26%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              {['Type', 'Value', 'Method', 'Confidence', 'Enrichment'].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    'py-2.5 px-3 font-medium text-muted-foreground/50 uppercase tracking-[0.2em] text-[10px]',
                    i === 3 ? 'text-right' : 'text-left',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Leading spacer — pushes the first visible row down to its
                correct scroll position. */}
            {paddingTop > 0 && (
              <tr aria-hidden style={{ height: paddingTop }}>
                <td colSpan={5} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const e = entities[virtualRow.index]
              if (!e) return null
              const meta = rowMeta[virtualRow.index]
              const color = ENTITY_TYPE_COLORS[e.entity_type] || '#64748b'
              return (
                <tr
                  key={e.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onSelect(e.id)}
                  className="border-b border-border last:border-0 hover:bg-card cursor-pointer transition-colors group"
                >
                  {/* Type */}
                  <td className="py-2.5 px-3 text-left">
                    <span
                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] ansein-mono whitespace-nowrap"
                      style={{
                        background: `${color}15`,
                        color,
                        border: `1px solid ${color}30`,
                      }}
                    >
                      {ENTITY_TYPE_LABELS[e.entity_type] || e.entity_type}
                    </span>
                  </td>
                  {/* Value (monospace) */}
                  <td className="py-2.5 px-3 text-left max-w-0">
                    <span
                      className="ansein-mono text-foreground group-hover:text-primary transition-colors truncate block"
                      title={e.value}
                    >
                      {e.value}
                    </span>
                  </td>
                  {/* Method */}
                  <td className="py-2.5 px-3 text-left">
                    <span className="text-muted-foreground ansein-mono text-[10px]">
                      {e.source_method}
                    </span>
                  </td>
                  {/* Confidence */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="ansein-mono text-foreground tabular-nums">
                      {(e.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  {/* Enrichment */}
                  <td className="py-2.5 px-3 text-left max-w-0">
                    {meta.enrKeys.length > 0 ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {meta.isMalicious && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 border border-rose-500/30 text-rose-400 ansein-mono flex-shrink-0"
                            title="Malicious enrichment detected"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                            Mal
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50 ansein-mono truncate">
                          {meta.enrKeys.join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* Trailing spacer — fills the remaining scroll height so the
                scrollbar matches the true row count. */}
            {paddingBottom > 0 && (
              <tr aria-hidden style={{ height: paddingBottom }}>
                <td colSpan={5} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
          </tbody>
        </table>

        {/* Empty state — keep outside the table so the spacer math above
            stays simple. */}
        {entities.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No entities to display.
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-card/40">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <ShieldAlert weight="duotone" className="h-2.5 w-2.5 text-rose-400" />
          Click a row to open entity detail
        </span>
        <span className="text-[10px] text-muted-foreground/50 ansein-mono">
          row height {ROW_HEIGHT}px · overscan 12
        </span>
      </div>
    </div>
  )
}
