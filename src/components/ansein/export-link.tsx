'use client'

import { useState, type ReactNode } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'
import { getStoredAccessToken } from '@/lib/auth-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ExportLinkProps {
  path: string
  filename: string
  mimeType?: string
  children?: ReactNode
  className?: string
  icon?: ReactNode
  label?: string
  /** Display variant */
  variant?: 'button' | 'link'
  /** If true, opens the response in a new window and triggers print (for PDF export) */
  printMode?: boolean
}

/**
 * Authenticated export link — fetches the export endpoint with the Bearer
 * token attached, then triggers a download via Blob. Anchor-based downloads
 * don't carry the Authorization header, so we need this for any protected
 * export endpoint.
 *
 * For PDF: uses printMode to open the HTML in a new window and auto-trigger
 * the browser's print dialog (which can save as PDF).
 */
export function ExportLink({
  path,
  filename,
  mimeType = 'application/octet-stream',
  className,
  icon,
  label,
  variant = 'button',
  printMode = false,
}: ExportLinkProps) {
  const [loading, setLoading] = useState(false)

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const token = getStoredAccessToken()
      const resp = await fetch(`/api/v1${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!resp.ok) {
        throw new Error(`Export failed: ${resp.status}`)
      }

      if (printMode) {
        // PDF: open HTML in a new window and trigger print
        const html = await resp.text()
        const printWindow = window.open('', '_blank', 'width=900,height=700')
        if (!printWindow) {
          toast.error('Pop-up blocked. Please allow pop-ups for PDF export.')
          return
        }
        printWindow.document.write(html)
        printWindow.document.close()
        // Wait for content to render, then trigger print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print()
          }, 500)
        }
        // Fallback: trigger print after 1.5s even if onload doesn't fire
        setTimeout(() => {
          try {
            printWindow.print()
          } catch {}
        }, 1500)
        toast.success('Opening print dialog…')
      } else {
        // Download: JSON, STIX, etc.
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
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'link') {
    return (
      <a
        href="#"
        onClick={handleDownload}
        className={cn('inline-flex items-center gap-1.5', className)}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
        {label}
      </a>
    )
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors',
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        icon || (printMode ? <Printer className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />)
      )}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}
