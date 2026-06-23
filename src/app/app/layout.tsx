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
  Menu,
  X,
  User as UserIcon,
  Command as CommandIcon,
  ShieldAlert,
  Zap,
  Keyboard as KeyboardIcon,
  FlaskConical,
  Workflow,
  ShieldCheck,
  Shield,
} from 'lucide-react'
import { Brand, BrandMark } from '@/components/ansein/brand'
import { useAuthStore, authUserRole, type AuthUser } from '@/lib/auth-store'
import { ROLE_COLORS } from '@/lib/rbac'
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
  { href: '/app/admin', label: 'Admin console', icon: Shield, minRole: 'admin' as const },
  { href: '/app/playbooks', label: 'Playbooks', icon: Workflow, minRole: 'admin' as const },
  { href: '/app/audit', label: 'Audit log', icon: ShieldAlert, minRole: 'editor' as const },
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
    <div className="flex h-screen bg-background overflow-hidden">
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
      <QuickPasteModal open={quickPasteOpen} onClose={() => setQuickPasteOpen(false)} />
      <GlobalShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col bg-card/60 backdrop-blur-2xl border-r border-border shadow-sm z-20">
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
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card/80 backdrop-blur-2xl border-r border-border flex flex-col ansein-fade-in shadow-sm">
            <button
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
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
        <div className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-card/60 backdrop-blur-xl z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:hover:bg-card/80 text-muted-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark size={24} />
          <button
            onClick={() => palette.setOpen(true)}
            className="p-1.5 rounded-md bg-card border border-border text-muted-foreground"
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
        className="fixed bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors z-30 shadow-lg"
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
  user: AuthUser | null
  initials: string
  onLogout: () => void
  onOpenPalette: () => void
  onOpenQuickPaste: () => void
}) {
  const role = authUserRole(user)
  // editor+ can see the audit log. Analysts are blocked from the page
  // server-side too, but we also hide the sidebar entry so the navigation
  // reflects their actual capabilities.
  const canSeeAudit = role === 'editor' || role === 'admin'
  const roleColors = ROLE_COLORS[role]
  // Filter ADMIN_ITEMS by each item's minimum role. Playbooks require admin;
  // audit log is editor+. Both groups render under the "Administration"
  // header (shown when at least one item is visible).
  const roleRank: Record<string, number> = { analyst: 0, editor: 1, admin: 2 }
  const visibleAdminItems = ADMIN_ITEMS.filter(
    (item) => roleRank[role] >= roleRank[item.minRole]
  )
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/app">
          <Brand size={32} />
        </Link>
      </div>

      {/* New investigation CTA + Quick Paste */}
      <div className="px-3 pt-4 space-y-2">
        <Link
          href="/app/investigations/new"
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New investigation
        </Link>
        <button
          onClick={onOpenQuickPaste}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          title="Quick paste (Shift+P)"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-accent-foreground" />
            Quick paste
          </span>
          <kbd className="ansein-mono text-[9px] px-1 py-0.5 rounded bg-background border border-border text-muted-foreground/50">
            ⇧P
          </kbd>
        </button>
      </div>

      {/* Command palette trigger */}
      <div className="px-3 pt-2">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <CommandIcon className="h-3 w-3" />
            Search…
          </span>
          <kbd className="ansein-mono text-[9px] px-1 py-0.5 rounded bg-background border border-border text-muted-foreground/50">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 pb-2 text-[10px] font-sans uppercase tracking-[0.2em] text-muted-foreground/50">
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
                  ? 'bg-card border border-border text-foreground shadow-sm'
                  : 'text-muted-foreground border border-transparent hover:bg-card/50 hover:text-foreground'
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors flex-shrink-0',
                  active ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-muted-foreground'
                )}
              />
              <span className="font-medium truncate">{item.label}</span>
            </Link>
          )
        })}

        {/* Admin section — visible to editor+ roles (per-item minimum) */}
        {visibleAdminItems.length > 0 && (
          <>
            <p className="px-2 pt-5 pb-2 text-[10px] font-sans uppercase tracking-[0.2em] text-muted-foreground/50">
              Administration
            </p>
            {visibleAdminItems.map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all group relative',
                    active
                      ? 'bg-card border border-border text-foreground shadow-sm'
                      : 'text-muted-foreground border border-transparent hover:bg-card/50 hover:text-foreground'
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
                      active ? 'text-amber-400' : 'text-muted-foreground/50 group-hover:text-muted-foreground'
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
      <div className="px-3 py-3 border-t border-border">
        <Link
          href="/app/profile"
          className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-card transition-colors group"
        >
          {(() => {
            const email = user?.email || 'default'
            const hash = email.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
            const hue1 = hash % 360
            const hue2 = (hue1 + 60) % 360
            return (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-semibold flex-shrink-0 ring-2 ring-card"
                style={{ background: `linear-gradient(135deg, hsl(${hue1}, 70%, 45%) 0%, hsl(${hue2}, 70%, 35%) 100%)` }}
              >
                {initials}
              </div>
            )
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {user?.full_name || user?.email || 'Analyst'}
            </p>
            <p className="text-[10px] uppercase tracking-wider flex items-center gap-1">
              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border', roleColors.bg, roleColors.fg, roleColors.border)}>
                <span className={cn('h-1 w-1 rounded-full', roleColors.dot)} />
                {role}
              </span>
            </p>
          </div>
          <LogOut
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onLogout()
            }}
            className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-rose-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
          />
        </Link>
      </div>
    </>
  )
}
