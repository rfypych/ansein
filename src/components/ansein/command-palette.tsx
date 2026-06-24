'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowBendDownLeft, ArrowDown, ArrowUp, Copy as CopyPlus, FileCode, FileText as FileJson, Flask as FlaskConical, Folder as FolderSearch, Gear as SettingsIcon, House, Lightning as Zap, MagnifyingGlass as Search, Play, Plus, Printer, Robot as Bot, ShieldWarning as ShieldAlert, SquaresFour as LayoutDashboard, Star, User as UserIcon } from '@phosphor-icons/react'
import { useAuthStore, getStoredAccessToken } from '@/lib/auth-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type CommandType = 'navigation' | 'action'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  group: string
  type: CommandType
  keywords?: string
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Pattern that matches an open investigation detail page. */
const INVESTIGATION_PATH = /^\/app\/investigations\/(\d+)(?:\/|$)/

/** Lightweight client-side HTTP for action callbacks. */
async function authedFetch(path: string, init?: RequestInit) {
  const token = getStoredAccessToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`/api/v1${path}`, { ...init, headers })
}

/** Trigger a browser download for an authenticated export endpoint. */
async function downloadExport(
  path: string,
  filename: string,
  mimeType: string,
  printMode = false
) {
  try {
    const resp = await authedFetch(path)
    if (!resp.ok) throw new Error(`Export failed: ${resp.status}`)
    if (printMode) {
      const html = await resp.text()
      const printWindow = window.open('', '_blank', 'width=900,height=700')
      if (!printWindow) {
        toast.error('Pop-up blocked. Please allow pop-ups for PDF export.')
        return
      }
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.onload = () => setTimeout(() => printWindow.print(), 500)
      setTimeout(() => {
        try { printWindow.print() } catch {}
      }, 1500)
      toast.success('Opening print dialog…')
    } else {
      const blob = await resp.blob()
      const url = URL.createObjectURL(new Blob([blob], { type: mimeType }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    }
  } catch (err) {
    const e = err as Error
    toast.error(e.message || 'Export failed')
  }
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [wasOpen, setWasOpen] = useState(false)

  // Reset on open — render-phase state update (React 19 pattern)
  if (open && !wasOpen) {
    setWasOpen(true)
    setQuery('')
    setActiveIndex(0)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }
  // Focus input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Detect the current investigation ID from the pathname (if any)
  const currentInvestigationId = useMemo(() => {
    if (!pathname) return null
    const match = pathname.match(INVESTIGATION_PATH)
    return match ? Number(match[1]) : null
  }, [pathname])

  const items = useMemo<CommandItem[]>(() => {
    const close = () => onOpenChange(false)
    const go = (path: string) => {
      router.push(path)
      close()
    }

    // Navigation items — existing palette items, grouped by domain
    const nav: CommandItem[] = [
      { id: 'home', label: 'Home', icon: Home, action: () => go('/'), group: 'Navigation', type: 'navigation', hint: 'Public landing page' },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, action: () => go('/app'), group: 'Navigation', type: 'navigation', hint: 'Workspace overview' },
      { id: 'investigations', label: 'Investigations', icon: FolderSearch, action: () => go('/app/investigations'), group: 'Investigations', type: 'navigation', hint: 'Browse all cases' },
      { id: 'new-investigation', label: 'New investigation', icon: Plus, action: () => go('/app/investigations/new'), group: 'Investigations', type: 'navigation', hint: 'Create a new case', keywords: 'create add' },
      { id: 'ioc-playground', label: 'IOC Playground', icon: FlaskConical, action: () => go('/app/ioc-playground'), group: 'Navigation', type: 'navigation', hint: 'Quick IOC extraction & enrichment', keywords: 'ioc analyze playground extract' },
      { id: 'copilot', label: 'Copilot', icon: Bot, action: () => go('/app/copilot'), group: 'Navigation', type: 'navigation', hint: 'Open general Copilot chat' },
      { id: 'settings', label: 'Settings', icon: SettingsIcon, action: () => go('/app/settings'), group: 'Account', type: 'navigation', hint: 'Manage BYOK API keys' },
      { id: 'profile', label: 'Profile', icon: UserIcon, action: () => go('/app/profile'), group: 'Account', type: 'navigation', hint: 'Account & password' },
      ...(user?.is_superuser
        ? [{ id: 'audit', label: 'Audit log', icon: ShieldAlert, action: () => go('/app/audit'), group: 'Administration', type: 'navigation' as CommandType, hint: 'View security forensics', keywords: 'admin security logs' }]
        : []),
    ]

    // Action items — context-aware. Export & quick actions only show when
    // the user is on an investigation detail page.
    const actions: CommandItem[] = []

    if (currentInvestigationId !== null) {
      const invId = currentInvestigationId

      // Export actions
      actions.push(
        {
          id: 'export-json',
          label: 'Export current investigation as JSON',
          icon: FileJson,
          group: 'Actions',
          type: 'action',
          hint: 'Download a JSON bundle of entities, relationships, analysis',
          keywords: 'export download bundle',
          action: () => {
            close()
            void downloadExport(
              `/export/${invId}/json`,
              `ansein-investigation-${invId}.json`,
              'application/json'
            )
          },
        },
        {
          id: 'export-stix',
          label: 'Export current investigation as STIX',
          icon: FileCode,
          group: 'Actions',
          type: 'action',
          hint: 'Download a STIX 2.1 bundle (deterministic UUIDs)',
          keywords: 'stix export download bundle threat intel',
          action: () => {
            close()
            void downloadExport(
              `/export/${invId}/stix`,
              `ansein-investigation-${invId}-stix.json`,
              'application/json'
            )
          },
        },
        {
          id: 'export-pdf',
          label: 'Export current investigation as PDF',
          icon: Printer,
          group: 'Actions',
          type: 'action',
          hint: 'Open a printable report (save as PDF from the print dialog)',
          keywords: 'pdf report print export',
          action: () => {
            close()
            void downloadExport(`/export/${invId}/pdf`, '', '', true)
          },
        }
      )

      // Quick actions
      actions.push(
        {
          id: 'run-pipeline',
          label: 'Run pipeline on current investigation',
          icon: Play,
          group: 'Actions',
          type: 'action',
          hint: 'Extract → enrich → analyze in one click',
          keywords: 'extract enrich analyze pipeline run',
          action: async () => {
            close()
            try {
              const resp = await authedFetch(`/investigations/${invId}/pipeline`, { method: 'POST' })
              if (!resp.ok) {
                const err = await resp.json().catch(() => null)
                throw new Error(err?.detail || `Pipeline failed: ${resp.status}`)
              }
              toast.success('Pipeline completed')
              router.refresh()
            } catch (err) {
              const e = err as Error
              toast.error(e.message || 'Pipeline failed')
            }
          },
        },
        {
          id: 'star-investigation',
          label: 'Star current investigation',
          icon: Star,
          group: 'Actions',
          type: 'action',
          hint: 'Pin this case to your starred list',
          keywords: 'star favorite pin',
          action: async () => {
            close()
            try {
              const resp = await authedFetch(`/investigations/${invId}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_starred: true }),
              })
              if (!resp.ok) {
                const err = await resp.json().catch(() => null)
                throw new Error(err?.detail || `Failed to star: ${resp.status}`)
              }
              toast.success('Starred investigation')
              router.refresh()
            } catch (err) {
              const e = err as Error
              toast.error(e.message || 'Failed to star')
            }
          },
        },
        {
          id: 'duplicate-investigation',
          label: 'Duplicate current investigation',
          icon: CopyPlus,
          group: 'Actions',
          type: 'action',
          hint: 'Clone metadata + sources (not pipeline output)',
          keywords: 'copy clone duplicate',
          action: async () => {
            close()
            try {
              const resp = await authedFetch(`/investigations/${invId}/duplicate`, { method: 'POST' })
              if (!resp.ok) {
                const err = await resp.json().catch(() => null)
                throw new Error(err?.detail || `Failed to duplicate: ${resp.status}`)
              }
              const data = await resp.json()
              toast.success('Investigation duplicated')
              router.push(`/app/investigations/${data.id}`)
            } catch (err) {
              const e = err as Error
              toast.error(e.message || 'Failed to duplicate')
            }
          },
        }
      )
    }

    // Always-available actions (these are navigation-style but presented
    // as actions because they represent user-initiated workflows).
    actions.push(
      {
        id: 'action-ioc-playground',
        label: 'Analyze IOC in playground',
        icon: FlaskConical,
        group: 'Actions',
        type: 'action',
        hint: 'Quick IOC extraction & enrichment without creating a case',
        keywords: 'ioc analyze playground extract enrich',
        action: () => go('/app/ioc-playground'),
      },
      {
        id: 'action-new-investigation',
        label: 'Create new investigation',
        icon: Plus,
        group: 'Actions',
        type: 'action',
        hint: 'Start a fresh CTI/OSINT case',
        keywords: 'create add new',
        action: () => go('/app/investigations/new'),
      },
      {
        id: 'action-settings-api-keys',
        label: 'Configure API keys',
        icon: SettingsIcon,
        group: 'Actions',
        type: 'action',
        hint: 'Manage BYOK provider keys (Groq, OpenAI, VirusTotal, AbuseIPDB, Shodan)',
        keywords: 'api keys settings byok configure',
        action: () => go('/app/settings'),
      }
    )

    return [...nav, ...actions]
  }, [router, onOpenChange, user, currentInvestigationId])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)
    // Fuzzy: every token must match at least one field (label/hint/group/keywords)
    return items.filter((i) => {
      const haystack = `${i.label} ${i.hint || ''} ${i.group} ${i.keywords || ''}`.toLowerCase()
      return tokens.every((t) => haystack.includes(t))
    })
  }, [items, query])

  // Group by category — preserves the order groups first appear in `filtered`.
  // Place the "Actions" group last so navigation stays on top.
  const grouped = useMemo(() => {
    const navMap = new Map<string, CommandItem[]>()
    const actionList: CommandItem[] = []
    for (const item of filtered) {
      if (item.type === 'action') {
        actionList.push(item)
      } else {
        if (!navMap.has(item.group)) navMap.set(item.group, [])
        navMap.get(item.group)!.push(item)
      }
    }
    const out: [string, CommandItem[]][] = Array.from(navMap.entries())
    if (actionList.length > 0) out.push(['Actions', actionList])
    return out
  }, [filtered])

  // Clamp active index — render-phase state update (React 19 pattern)
  if (activeIndex >= filtered.length && filtered.length > 0) {
    setActiveIndex(filtered.length - 1)
  } else if (filtered.length === 0 && activeIndex !== 0) {
    setActiveIndex(0)
  }

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[activeIndex]
        if (item) item.action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, activeIndex, onOpenChange])

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      onClick={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm ansein-fade-in" />
      <div
        className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search weight="duotone" className="h-4 w-4 text-muted-foreground/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Search commands, pages, and actions…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <kbd className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground/50">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No matching commands.
            </div>
          ) : (
            grouped.map(([group, groupItems]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="flex items-center gap-1.5 px-2 py-1">
                  {group === 'Actions' && <Zap weight="duotone" className="h-2.5 w-2.5 text-amber-400" />}
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 ansein-mono">
                    {group}
                  </p>
                </div>
                {groupItems.map((item) => {
                  const Icon = item.icon
                  const globalIdx = filtered.indexOf(item)
                  const active = globalIdx === activeIndex
                  const isAction = item.type === 'action'
                  return (
                    <button
                      key={item.id}
                      data-idx={globalIdx}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={item.action}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors',
                        active
                          ? 'bg-card/80'
                          : 'hover:bg-card'
                      )}
                    >
                      <div
                        className={cn(
                          'relative flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0',
                          active
                            ? isAction
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-primary/15 text-primary'
                            : 'bg-card border border-border text-muted-foreground'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {isAction && (
                          <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-amber-500 flex items-center justify-center border border-[background]">
                            <Zap weight="duotone" className="h-2 w-2 text-primary-foreground" />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{item.label}</p>
                        {item.hint && (
                          <p className="text-[11px] text-muted-foreground/50 truncate">
                            {item.hint}
                          </p>
                        )}
                      </div>
                      {isAction && (
                        <span className="text-[9px] uppercase tracking-widest ansein-mono text-amber-400/70 flex-shrink-0">
                          action
                        </span>
                      )}
                      {active && (
                        <ArrowBendDownLeft weight="duotone" className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground/50">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp weight="duotone" className="h-2.5 w-2.5" />
              <ArrowDown weight="duotone" className="h-2.5 w-2.5" />
              navigate
            </span>
            <span className="flex items-center gap-1">
              <ArrowBendDownLeft weight="duotone" className="h-2.5 w-2.5" />
              select
            </span>
            {currentInvestigationId !== null && (
              <span className="flex items-center gap-1 text-amber-400/80">
                <Zap weight="duotone" className="h-2.5 w-2.5" />
                inv #{currentInvestigationId}
              </span>
            )}
          </div>
          {user?.is_superuser && (
            <span className="ansein-mono uppercase tracking-wider">Admin workspace</span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Hook for managing Cmd+K / Ctrl+K state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { open, setOpen }
}
