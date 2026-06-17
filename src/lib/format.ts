/**
 * Frontend utility helpers (date formatting, severity colors, truncation).
 * Mirrors the original lib/utils.js but with our unique palette.
 */

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return formatDate(date)
}

export function severityColor(score: number): { bg: string; text: string; border: string; label: string } {
  if (score >= 70)
    return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', label: 'HIGH' }
  if (score >= 40)
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'MEDIUM' }
  if (score > 0)
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'LOW' }
  return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30', label: 'NONE' }
}

export function statusColor(status: string): { bg: string; text: string; border: string; dot: string } {
  switch (status) {
    case 'pending':
      return { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30', dot: 'bg-slate-400' }
    case 'extracting':
      return { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/30', dot: 'bg-cyan-400' }
    case 'enriching':
      return { bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/30', dot: 'bg-teal-400' }
    case 'analyzing':
      return { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-400' }
    case 'completed':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' }
    case 'failed':
      return { bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/30', dot: 'bg-rose-400' }
    default:
      return { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30', dot: 'bg-slate-400' }
  }
}

export function truncate(s: string, n = 80): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function bytesToHuman(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function admiraltyLabel(code: string): { label: string; color: string } {
  if (!code) return { label: 'Not rated', color: 'text-slate-400' }
  const reliability = code[0]
  const credibility = code.slice(1)
  const relMap: Record<string, string> = {
    A: 'Completely reliable',
    B: 'Usually reliable',
    C: 'Fairly reliable',
    D: 'Not usually reliable',
    E: 'Unreliable',
    F: 'Reliability cannot be judged',
  }
  const credMap: Record<string, string> = {
    '1': 'Confirmed by other sources',
    '2': 'Probably true',
    '3': 'Possibly true',
    '4': 'Doubtful',
    '5': 'Improbable',
    '6': 'Truth cannot be judged',
  }
  const label = `${relMap[reliability] || reliability} — ${credMap[credibility] || credibility}`
  const color =
    reliability <= 'B' && credibility <= '2'
      ? 'text-emerald-400'
      : reliability <= 'D' && credibility <= '4'
      ? 'text-amber-400'
      : 'text-slate-400'
  return { label, color }
}

// Entity type display helpers
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  threat_actor: 'Threat Actor',
  malware: 'Malware',
  tool: 'Tool',
  technique: 'Technique',
  vulnerability: 'Vulnerability',
  ioc_ip: 'IP Address',
  ioc_domain: 'Domain',
  ioc_url: 'URL',
  ioc_hash: 'File Hash',
  ioc_wallet: 'Crypto Wallet',
  target: 'Target',
  location: 'Location',
  identity: 'Identity',
}

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  threat_actor: '#dc2626',
  malware: '#7c3aed',
  tool: '#0d9488',
  technique: '#0891b2',
  vulnerability: '#ea580c',
  ioc_ip: '#16a34a',
  ioc_domain: '#65a30d',
  ioc_url: '#9333ea',
  ioc_hash: '#0d9488',
  ioc_wallet: '#a16207',
  target: '#db2777',
  location: '#475569',
  identity: '#64748b',
}
