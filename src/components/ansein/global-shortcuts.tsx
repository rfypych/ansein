'use client'

import { useEffect } from 'react'
import { Keyboard, X } from '@phosphor-icons/react'

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
        className="relative w-full max-w-md bg-card border border-border rounded-xl border-primary/50 ansein-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 border border-primary/30">
              <Keyboard weight="duotone" className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Keyboard shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-md hover:bg-card"
          >
            <X weight="duotone" className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto ansein-scrollbar">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 ansein-mono mb-2.5 font-medium">
                {cat}
              </p>
              <div className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-card transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-card text-foreground"
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
        <div className="px-5 py-3 border-t border-border bg-card/30">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Shortcuts are disabled while typing in input fields.
          </p>
        </div>
      </div>
    </div>
  )
}
