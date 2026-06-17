'use client'

import { type ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FolderSearch,
  Bot,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  ShieldCheck,
  Menu,
  X,
  User as UserIcon,
  Command as CommandIcon,
  ShieldAlert,
  Zap,
  Keyboard as KeyboardIcon,
  FlaskConical,
} from 'lucide-react'
import { Brand, BrandMark } from '@/components/ansein/brand'
import { useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'
import { AuthGuard } from '@/components/ansein/auth-guard'
import { CommandPalette, useCommandPalette } from '@/components/ansein/command-palette'
import { QuickPasteModal } from '@/components/ansein/quick-paste'
import { GlobalShortcutsModal } from '@/components/ansein/global-shortcuts'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/investigations', label: 'Investigations', icon: FolderSearch },
  { href: '/app/ioc-playground', label: 'IOC Playground', icon: FlaskConical },
  { href: '/app/copilot', label: 'Copilot', icon: Bot },
  { href: '/app/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/app/profile', label: 'Profile', icon: UserIcon },
]

const ADMIN_ITEMS = [
  { href: '/app/audit', label: 'Audit log', icon: ShieldAlert },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [quickPasteOpen, setQuickPasteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const palette = useCommandPalette()
  // Close mobile menu on route change — React 19 render-phase state update pattern
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setMobileOpen(false)
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      // Shift+P → Quick paste
      if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuickPasteOpen((v) => !v)
      }
      // ? → Global shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleLogout() {
    logout()
    toast.success('Signed out')
    router.push('/login')
  }

  const initials = user?.email?.[0]?.toUpperCase() || 'A'

  return (
    <div className="flex h-screen bg-[var(--ansein-bg)] overflow-hidden">
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
      <QuickPasteModal open={quickPasteOpen} onClose={() => setQuickPasteOpen(false)} />
      <GlobalShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-[var(--ansein-sidebar)] border-r border-[var(--ansein-border)]">
        <SidebarContent
          pathname={pathname}
          user={user}
          initials={initials}
          onLogout={handleLogout}
          onOpenPalette={() => palette.setOpen(true)}
          onOpenQuickPaste={() => setQuickPasteOpen(true)}
        />
      </aside>

      {/* ---------- Mobile drawer ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[var(--ansein-sidebar)] border-r border-[var(--ansein-border)] flex flex-col ansein-fade-in">
            <button
              className="absolute top-4 right-4 text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)]"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              user={user}
              initials={initials}
              onLogout={handleLogout}
              onOpenPalette={() => palette.setOpen(true)}
              onOpenQuickPaste={() => setQuickPasteOpen(true)}
            />
          </aside>
        </div>
      )}

      {/* ---------- Main content ---------- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-[var(--ansein-border)] bg-[var(--ansein-surface)]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-[var(--ansein-surface-hover)] text-[var(--ansein-text-muted)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark size={24} />
          <button
            onClick={() => palette.setOpen(true)}
            className="p-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)]"
            aria-label="Open command palette"
          >
            <CommandIcon className="h-4 w-4" />
          </button>
        </div>

        <main className="flex-1 overflow-auto ansein-scrollbar">{children}</main>
      </div>

      {/* Floating shortcuts help button */}
      <button
        onClick={() => setShortcutsOpen(true)}
        className="fixed bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors z-30 shadow-lg"
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <KeyboardIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

function SidebarContent({
  pathname,
  user,
  initials,
  onLogout,
  onOpenPalette,
  onOpenQuickPaste,
}: {
  pathname: string
  user: { email: string; full_name: string; is_superuser: boolean } | null
  initials: string
  onLogout: () => void
  onOpenPalette: () => void
  onOpenQuickPaste: () => void
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--ansein-border)]">
        <Link href="/app">
          <Brand size={32} />
        </Link>
      </div>

      {/* New investigation CTA + Quick Paste */}
      <div className="px-3 pt-4 space-y-2">
        <Link
          href="/app/investigations/new"
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
        >
          <Plus className="h-4 w-4" />
          New investigation
        </Link>
        <button
          onClick={onOpenQuickPaste}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-xs text-[var(--ansein-text-muted)] hover:border-[var(--ansein-border-strong)] hover:text-[var(--ansein-text)] transition-colors"
          title="Quick paste (Shift+P)"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-[var(--ansein-accent)]" />
            Quick paste
          </span>
          <kbd className="ansein-mono text-[9px] px-1 py-0.5 rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)]">
            ⇧P
          </kbd>
        </button>
      </div>

      {/* Command palette trigger */}
      <div className="px-3 pt-2">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-xs text-[var(--ansein-text-muted)] hover:border-[var(--ansein-border-strong)] hover:text-[var(--ansein-text)] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <CommandIcon className="h-3 w-3" />
            Search…
          </span>
          <kbd className="ansein-mono text-[9px] px-1 py-0.5 rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ansein-text-dim)]">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            item.href === '/app'
              ? pathname === '/app'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all group relative',
                active
                  ? 'bg-[var(--ansein-surface-hover)] text-[var(--ansein-text)]'
                  : 'text-[var(--ansein-text-muted)] hover:bg-[var(--ansein-surface)] hover:text-[var(--ansein-text)]'
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-[var(--ansein-primary)]"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors flex-shrink-0',
                  active ? 'text-[var(--ansein-primary)]' : 'text-[var(--ansein-text-dim)] group-hover:text-[var(--ansein-text-muted)]'
                )}
              />
              <span className="font-medium truncate">{item.label}</span>
            </Link>
          )
        })}

        {/* Admin section */}
        {user?.is_superuser && (
          <>
            <p className="px-2 pt-5 pb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--ansein-text-dim)]">
              Administration
            </p>
            {ADMIN_ITEMS.map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all group relative',
                    active
                      ? 'bg-[var(--ansein-surface-hover)] text-[var(--ansein-text)]'
                      : 'text-[var(--ansein-text-muted)] hover:bg-[var(--ansein-surface)] hover:text-[var(--ansein-text)]'
                  )}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-amber-500"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-colors flex-shrink-0',
                      active ? 'text-amber-400' : 'text-[var(--ansein-text-dim)] group-hover:text-[var(--ansein-text-muted)]'
                    )}
                  />
                  <span className="font-medium truncate">{item.label}</span>
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User footer — make it a Profile link */}
      <div className="px-3 py-3 border-t border-[var(--ansein-border)]">
        <Link
          href="/app/profile"
          className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-[var(--ansein-surface)] transition-colors group"
        >
          {(() => {
            const email = user?.email || 'default'
            const hash = email.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
            const hue1 = hash % 360
            const hue2 = (hue1 + 60) % 360
            return (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-semibold flex-shrink-0 ring-2 ring-[var(--ansein-sidebar)]"
                style={{ background: `linear-gradient(135deg, hsl(${hue1}, 70%, 45%) 0%, hsl(${hue2}, 70%, 35%) 100%)` }}
              >
                {initials}
              </div>
            )
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--ansein-text)] truncate">
              {user?.full_name || user?.email || 'Analyst'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--ansein-text-dim)] flex items-center gap-1">
              {user?.is_superuser ? (
                <>
                  <ShieldCheck className="h-2.5 w-2.5 text-amber-400" /> Administrator
                </>
              ) : (
                'Analyst'
              )}
            </p>
          </div>
          <LogOut
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onLogout()
            }}
            className="h-3.5 w-3.5 text-[var(--ansein-text-dim)] hover:text-rose-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
          />
        </Link>
      </div>
    </>
  )
}
