'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  LayoutDashboard,
  FolderSearch,
  Bot,
  Settings as SettingsIcon,
  User as UserIcon,
  Plus,
  Home,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  FlaskConical,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  group: 'Navigation' | 'Investigations' | 'Account'
  keywords?: string
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
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

  const items = useMemo<CommandItem[]>(() => {
    const close = () => onOpenChange(false)
    const go = (path: string) => {
      router.push(path)
      close()
    }
    return [
      { id: 'home', label: 'Home', icon: Home, action: () => go('/'), group: 'Navigation', hint: 'Public landing page' },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, action: () => go('/app'), group: 'Navigation', hint: 'Workspace overview' },
      { id: 'investigations', label: 'Investigations', icon: FolderSearch, action: () => go('/app/investigations'), group: 'Investigations', hint: 'Browse all cases' },
      { id: 'new-investigation', label: 'New investigation', icon: Plus, action: () => go('/app/investigations/new'), group: 'Investigations', hint: 'Create a new case', keywords: 'create add' },
      { id: 'ioc-playground', label: 'IOC Playground', icon: FlaskConical, action: () => go('/app/ioc-playground'), group: 'Navigation', hint: 'Quick IOC extraction & enrichment', keywords: 'ioc analyze playground extract' },
      { id: 'copilot', label: 'Copilot', icon: Bot, action: () => go('/app/copilot'), group: 'Navigation', hint: 'Open general Copilot chat' },
      { id: 'settings', label: 'Settings', icon: SettingsIcon, action: () => go('/app/settings'), group: 'Account', hint: 'Manage BYOK API keys' },
      { id: 'profile', label: 'Profile', icon: UserIcon, action: () => go('/app/profile'), group: 'Account', hint: 'Account & password' },
      ...(user?.is_superuser
        ? [{ id: 'audit', label: 'Audit log', icon: ShieldAlert, action: () => go('/app/audit'), group: 'Administration', hint: 'View security forensics', keywords: 'admin security logs' }]
        : []),
    ]
  }, [router, onOpenChange, user])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.hint?.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q) ||
      i.keywords?.toLowerCase().includes(q)
    )
  }, [items, query])

  // Group by category
  const grouped = useMemo(() => {
    const m = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      if (!m.has(item.group)) m.set(item.group, [])
      m.get(item.group)!.push(item)
    }
    return Array.from(m.entries())
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
        className="relative w-full max-w-xl ansein-card rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--ansein-border)]">
          <Search className="h-4 w-4 text-[var(--ansein-text-dim)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Search commands, pages, and actions…"
            className="flex-1 bg-transparent text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none"
          />
          <kbd className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-dim)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--ansein-text-muted)]">
              No matching commands.
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono">
                  {group}
                </p>
                {items.map((item) => {
                  const Icon = item.icon
                  const globalIdx = filtered.indexOf(item)
                  const active = globalIdx === activeIndex
                  return (
                    <button
                      key={item.id}
                      data-idx={globalIdx}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={item.action}
                      className={cn(
                        'w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors',
                        active
                          ? 'bg-[var(--ansein-surface-hover)]'
                          : 'hover:bg-[var(--ansein-surface)]'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0',
                          active
                            ? 'bg-[var(--ansein-primary)]/15 text-[var(--ansein-primary)]'
                            : 'bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)]'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--ansein-text)] truncate">{item.label}</p>
                        {item.hint && (
                          <p className="text-[11px] text-[var(--ansein-text-dim)] truncate">
                            {item.hint}
                          </p>
                        )}
                      </div>
                      {active && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-[var(--ansein-text-dim)] flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--ansein-border)] flex items-center justify-between text-[10px] text-[var(--ansein-text-dim)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp className="h-2.5 w-2.5" />
              <ArrowDown className="h-2.5 w-2.5" />
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-2.5 w-2.5" />
              select
            </span>
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
