'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Zap,
  Loader2,
  Globe,
  Link as LinkIcon,
  Hash,
  Shield,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  FileText,
} from 'lucide-react'
import { http } from '@/lib/http'
import { Badge, Spinner, EmptyState } from '@/components/ansein/ui'
import { Markdown } from '@/components/ansein/markdown'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface IocResult {
  type: string
  value: string
  confidence: number
  enrichment: Record<string, Record<string, unknown>>
  admiralty: string
}

interface PlaygroundResponse {
  iocs: IocResult[]
  total: number
  message?: string
  summary?: {
    total_extracted: number
    enriched: number
    malicious: number
  }
}

const SAMPLE_TEXT = `APT29 infrastructure discovered:
- C2 servers: 185.220.101.47, 194.165.16.78
- Domains: malicious-update-server.ru, apt29-c2.eu
- Malware hash (SHA256): 5e8f7d4c3b2a1e0f9d8c7b6a5e4f3d2c1b0a9e8f7d6c5b4a3e2f1d0c9b8a7e6f
- Phishing URL: https://secure-login-portal.com/verify?id=12345
- Vulnerability exploited: CVE-2023-34360`

export default function IOCPlaygroundPage() {
  const [text, setText] = useState('')
  const [results, setResults] = useState<IocResult[] | null>(null)
  const [summary, setSummary] = useState<PlaygroundResponse['summary'] | null>(null)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  const analyzeMutation = useMutation({
    mutationFn: (input: string) =>
      http.post<PlaygroundResponse>('/ioc-playground', { text: input }),
    onSuccess: (data) => {
      setResults(data.iocs)
      setSummary(data.summary || null)
      if (data.iocs.length === 0) {
        toast.info('No IOCs detected')
      } else {
        toast.success(`Extracted ${data.iocs.length} IOCs`)
      }
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Analysis failed')
    },
  })

  function handleAnalyze() {
    if (!text.trim()) return
    analyzeMutation.mutate(text.trim())
  }

  function handleSample() {
    setText(SAMPLE_TEXT)
  }

  function handleClear() {
    setText('')
    setResults(null)
    setSummary(null)
  }

  function copyValue(value: string) {
    navigator.clipboard.writeText(value)
    setCopiedValue(value)
    setTimeout(() => setCopiedValue(null), 1200)
  }

  function exportResults() {
    if (!results) return
    const data = {
      timestamp: new Date().toISOString(),
      summary,
      iocs: results,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ioc-playground-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported results')
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">
          Quick analysis
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          IOC Playground
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste raw text to instantly extract and enrich IOCs — no investigation needed.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Input */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Input text
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSample}
                  className="text-[10px] text-primary hover:text-primary/90 transition-colors px-2 py-1 rounded-md hover:bg-card"
                >
                  Load sample
                </button>
                <button
                  onClick={handleClear}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-card"
                >
                  Clear
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste threat data, IOCs, suspicious text…&#10;&#10;Supported: IPv4/IPv6, domains, URLs, hashes (MD5/SHA1/SHA256/SHA512), CVEs, BTC wallets"
              rows={12}
              className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary resize-y min-h-[200px] ansein-mono text-xs"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] text-muted-foreground/50">
                {text.length.toLocaleString()} chars
              </p>
              <button
                onClick={handleAnalyze}
                disabled={!text.trim() || analyzeMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Analyze
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Summary card */}
          {summary && (
            <div className="bg-card border border-border rounded-xl p-5 ansein-slide-up">
              <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold ansein-mono text-foreground tabular-nums">
                    {summary.total_extracted}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                    Extracted
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold ansein-mono text-primary tabular-nums">
                    {summary.enriched}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                    Enriched
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold ansein-mono text-rose-400 tabular-nums">
                    {summary.malicious}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                    Malicious
                  </p>
                </div>
              </div>
              {results && results.length > 0 && (
                <button
                  onClick={exportResults}
                  className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export results (JSON)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Results
              {results && results.length > 0 && (
                <Badge color="primary">{results.length}</Badge>
              )}
            </h3>
          </div>

          {analyzeMutation.isPending ? (
            <div className="bg-card border border-border rounded-xl py-16 flex justify-center">
              <div className="flex flex-col items-center gap-3">
                <Spinner className="h-6 w-6" />
                <p className="text-xs text-muted-foreground">Extracting and enriching IOCs…</p>
              </div>
            </div>
          ) : !results ? (
            <div className="bg-card border border-border rounded-xl">
              <EmptyState
                icon={<Zap className="h-5 w-5 text-primary" />}
                title="No results yet"
                description="Paste text on the left and click Analyze to extract IOCs."
                variant="branded"
                className="py-16"
              />
            </div>
          ) : results.length === 0 ? (
            <div className="bg-card border border-border rounded-xl">
              <EmptyState
                icon={<Search className="h-5 w-5 text-muted-foreground/50" />}
                title="No IOCs detected"
                description="The provided text doesn't contain any recognizable IOCs (IPs, domains, URLs, hashes, CVEs)."
                className="py-16"
              />
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto ansein-scrollbar pr-1">
              {results.map((ioc, i) => (
                <IocCard
                  key={i}
                  ioc={ioc}
                  copied={copiedValue === ioc.value}
                  onCopy={() => copyValue(ioc.value)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------- IOC Card */
function IocCard({
  ioc,
  copied,
  onCopy,
}: {
  ioc: IocResult
  copied: boolean
  onCopy: () => void
}) {
  const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    ioc_ip: Globe,
    ioc_domain: LinkIcon,
    ioc_url: LinkIcon,
    ioc_hash: Hash,
    vulnerability: Shield,
  }
  const typeLabels: Record<string, string> = {
    ioc_ip: 'IP Address',
    ioc_domain: 'Domain',
    ioc_url: 'URL',
    ioc_hash: 'File Hash',
    vulnerability: 'CVE',
  }
  const typeColors: Record<string, string> = {
    ioc_ip: '#16a34a',
    ioc_domain: '#65a30d',
    ioc_url: '#9333ea',
    ioc_hash: '#0d9488',
    vulnerability: '#ea580c',
  }
  const Icon = typeIcons[ioc.type] || Search
  const color = typeColors[ioc.type] || '#64748b'
  const label = typeLabels[ioc.type] || ioc.type

  // Check enrichment for malicious
  const enrKeys = Object.keys(ioc.enrichment || {}).filter(
    (k) => ioc.enrichment[k] && Object.keys(ioc.enrichment[k] as object).length > 0
  )
  const isMalicious = enrKeys.some((k) => {
    const d = ioc.enrichment[k] as Record<string, unknown>
    return (typeof d?.malicious === 'number' && d.malicious > 0) ||
      (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
  })

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-lg p-4 relative overflow-hidden',
        isMalicious && 'border-rose-500/30'
      )}
    >
      {isMalicious && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-rose-500" />
      )}
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-[0.15em] ansein-mono font-medium" style={{ color }}>
              {label}
            </span>
            <span className="text-[9px] ansein-mono px-1 py-0.5 rounded bg-card border border-border text-muted-foreground/50">
              {ioc.admiralty}
            </span>
            {isMalicious && (
              <span className="inline-flex items-center gap-1 text-[9px] text-rose-400 font-medium">
                <AlertTriangle className="h-2.5 w-2.5" />
                Malicious
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground ansein-mono break-all">
            {ioc.value}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-muted-foreground/50">
              confidence: {(ioc.confidence * 100).toFixed(0)}%
            </span>
            {enrKeys.length > 0 && (
              <span className="text-[10px] text-muted-foreground/50">
                enriched: {enrKeys.join(', ')}
              </span>
            )}
          </div>

          {/* Enrichment details */}
          {enrKeys.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1.5">
              {enrKeys.map((provider) => {
                const data = ioc.enrichment[provider] as Record<string, unknown>
                const entries = Object.entries(data).filter(
                  ([, v]) => v !== null && v !== undefined && v !== ''
                )
                return (
                  <div key={provider}>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 ansein-mono mb-1">
                      {provider}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {entries.slice(0, 6).map(([key, val]) => {
                        const isMal = key === 'malicious' && typeof val === 'number' && val > 0
                        const isClean = key === 'malicious' && typeof val === 'number' && val === 0
                        return (
                          <span
                            key={key}
                            className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded ansein-mono border',
                              isMal
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : isClean
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-card text-muted-foreground border-border'
                            )}
                          >
                            {key}: {String(val).slice(0, 40)}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <button
          onClick={onCopy}
          className="p-1.5 text-muted-foreground/50 hover:text-foreground transition-colors flex-shrink-0"
          title="Copy value"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
