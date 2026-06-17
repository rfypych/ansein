'use client'

import { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'

interface ShortcutItem {
  keys: string[]
  desc: string
  category: string
}

const SHORTCUTS: ShortcutItem[] = [
  // Global
  { keys: ['⌘', 'K'], desc: 'Open command palette', category: 'Global' },
  { keys: ['⇧', 'P'], desc: 'Quick paste (add source to any investigation)', category: 'Global' },
  { keys: ['?'], desc: 'Toggle this shortcuts panel', category: 'Global' },
  { keys: ['Esc'], desc: 'Close modals / panels', category: 'Global' },

  // Investigation detail
  { keys: ['1'], desc: 'Switch to Overview tab', category: 'Investigation detail' },
  { keys: ['2'], desc: 'Switch to Sources tab', category: 'Investigation detail' },
  { keys: ['3'], desc: 'Switch to Graph tab', category: 'Investigation detail' },
  { keys: ['4'], desc: 'Switch to Entities tab', category: 'Investigation detail' },
  { keys: ['5'], desc: 'Switch to Analysis tab', category: 'Investigation detail' },
  { keys: ['6'], desc: 'Switch to Copilot tab', category: 'Investigation detail' },
  { keys: ['7'], desc: 'Switch to Notes tab', category: 'Investigation detail' },
  { keys: ['8'], desc: 'Switch to Activity tab', category: 'Investigation detail' },
]

export function GlobalShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Group by category
  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 ansein-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md ansein-card rounded-xl border-[var(--ansein-border-strong)] ansein-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ansein-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Keyboard className="h-4 w-4 text-[var(--ansein-primary)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--ansein-text)]">Keyboard shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors p-1 rounded-md hover:bg-[var(--ansein-surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto ansein-scrollbar">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--ansein-text-dim)] ansein-mono mb-2.5 font-medium">
                {cat}
              </p>
              <div className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[var(--ansein-surface)] transition-colors"
                  >
                    <span className="text-sm text-[var(--ansein-text-muted)]">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/30">
          <p className="text-[10px] text-[var(--ansein-text-dim)] text-center">
            Shortcuts are disabled while typing in input fields.
          </p>
        </div>
      </div>
    </div>
  )
}
