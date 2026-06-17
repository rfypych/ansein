'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  Lock,
  Bot,
  Globe,
  ShieldAlert,
  Radar,
  ExternalLink,
} from 'lucide-react'
import { http } from '@/lib/http'
import { Badge, Spinner } from '@/components/ansein/ui'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface UserSettings {
  preferred_llm: string
  has_openai: boolean
  has_groq: boolean
  has_virustotal: boolean
  has_abuseipdb: boolean
  has_shodan: boolean
  updated_at: string
}

const PROVIDERS = [
  {
    key: 'groq_api_key',
    name: 'Groq',
    icon: Bot,
    color: '#f59e0b',
    description: 'Fast LLM inference for extraction and analysis. Free tier available.',
    url: 'https://console.groq.com/keys',
    badge: 'LLM',
  },
  {
    key: 'openai_api_key',
    name: 'OpenAI',
    icon: Bot,
    color: '#10b981',
    description: 'GPT models for higher-quality extraction and narrative generation.',
    url: 'https://platform.openai.com/api-keys',
    badge: 'LLM',
  },
  {
    key: 'virustotal_api_key',
    name: 'VirusTotal',
    icon: ShieldAlert,
    color: '#0d9488',
    description: 'File, URL, IP, and domain reputation lookups.',
    url: 'https://www.virustotal.com/gui/my-apikey',
    badge: 'Enrichment',
  },
  {
    key: 'abuseipdb_api_key',
    name: 'AbuseIPDB',
    icon: Radar,
    color: '#dc2626',
    description: 'IP abuse confidence scoring and report aggregation.',
    url: 'https://www.abuseipdb.com/account/api',
    badge: 'Enrichment',
  },
  {
    key: 'shodan_api_key',
    name: 'Shodan',
    icon: Globe,
    color: '#7c3aed',
    description: 'Internet-connected device metadata, ports, and vulnerabilities.',
    url: 'https://www.shodan.io/dashboard',
    badge: 'Enrichment',
  },
] as const

export default function SettingsPage() {
  const qc = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => http.get<UserSettings>('/settings'),
  })

  const [values, setValues] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // Derive preferred LLM directly from server state — no setState-in-effect needed
  const preferredLlm = settingsQuery.data?.preferred_llm || 'auto'

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const body: Record<string, unknown> = {}
      body[key] = values[key] || ''
      return http.put<UserSettings>('/settings', body)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved')
      setValues((v) => ({ ...v, [savingKey || '']: '' }))
      setSavingKey(null)
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to save')
      setSavingKey(null)
    },
  })

  const savePreferredMutation = useMutation({
    mutationFn: (llm: string) =>
      http.put<UserSettings>('/settings', { preferred_llm: llm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Preference updated')
    },
  })

  function handleSetPreferredLlm(llm: string) {
    savePreferredMutation.mutate(llm)
  }

  function handleSave(key: string) {
    setSavingKey(key)
    saveMutation.mutate(key)
  }

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          Configuration
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
          Settings
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Manage your bring-your-own-key (BYOK) API credentials.
        </p>
      </div>

      {/* Encryption banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-[var(--ansein-primary)]/[0.04] border border-[var(--ansein-primary)]/15">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ansein-primary)]/10 border border-[var(--ansein-primary)]/20 flex-shrink-0">
          <Lock className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
        </div>
        <div className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
          <strong className="text-[var(--ansein-text)]">Encryption at rest.</strong> All API keys are
          encrypted with <span className="ansein-mono text-[var(--ansein-primary)]">AES-256-GCM</span> using the application&apos;s <code className="ansein-mono px-1 py-0.5 rounded bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)]">SECRET_KEY</code> before being stored.
          Keys are never logged, never returned in API responses, and never sent to third parties.
        </div>
      </div>

      {settingsQuery.isLoading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Preferred LLM */}
          <div className="ansein-card rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-1">
              <h3 className="text-sm font-semibold text-[var(--ansein-text)]">
                Preferred LLM provider
              </h3>
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--ansein-text-dim)] ansein-mono">
                Optional
              </span>
            </div>
            <p className="text-xs text-[var(--ansein-text-muted)] mb-4">
              Which LLM to use when both OpenAI and Groq keys are configured.
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'auto', label: 'Auto', desc: 'Groq first, OpenAI fallback' },
                { key: 'openai', label: 'OpenAI', desc: 'GPT models' },
                { key: 'groq', label: 'Groq', desc: 'Llama/Mixtral, fast inference' },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleSetPreferredLlm(p.key)}
                  title={p.desc}
                  className={cn(
                    'inline-flex flex-col items-start px-3 py-2 rounded-md text-sm border transition-all text-left',
                    preferredLlm === p.key
                      ? 'bg-[var(--ansein-primary)]/10 text-[var(--ansein-text)] border-[var(--ansein-primary)]/40'
                      : 'bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] border-[var(--ansein-border)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)]'
                  )}
                >
                  <span className="font-medium">{p.label}</span>
                  <span className={cn(
                    'text-[10px] mt-0.5',
                    preferredLlm === p.key ? 'text-[var(--ansein-primary)]' : 'text-[var(--ansein-text-dim)]'
                  )}>
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Provider cards grouped by category */}
          <div className="space-y-6">
            {/* LLM providers */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
                  <Bot className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ansein-text)]">LLM providers</h3>
                  <p className="text-[10px] text-[var(--ansein-text-dim)]">Used for extraction, analysis, and copilot</p>
                </div>
              </div>
              <div className="space-y-3">
                {PROVIDERS.filter((p) => p.badge === 'LLM').map((p) => (
                  <ProviderCard
                    key={p.key}
                    provider={p}
                    has={settingsQuery.data ? (p.key === 'groq_api_key' ? settingsQuery.data.has_groq : settingsQuery.data.has_openai) : false}
                    values={values}
                    visible={visible}
                    savingKey={savingKey}
                    onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                    onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>

            {/* Enrichment providers */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 border border-amber-500/30">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ansein-text)]">Enrichment providers</h3>
                  <p className="text-[10px] text-[var(--ansein-text-dim)]">Used to enrich IOCs with reputation and context</p>
                </div>
              </div>
              <div className="space-y-3">
                {PROVIDERS.filter((p) => p.badge === 'Enrichment').map((p) => (
                  <ProviderCard
                    key={p.key}
                    provider={p}
                    has={settingsQuery.data ? (p.key === 'virustotal_api_key' ? settingsQuery.data.has_virustotal : p.key === 'abuseipdb_api_key' ? settingsQuery.data.has_abuseipdb : settingsQuery.data.has_shodan) : false}
                    values={values}
                    visible={visible}
                    savingKey={savingKey}
                    onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                    onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Clear key hint */}
          <div className="mt-6 p-4 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--ansein-text-muted)]">
              To remove a key, save an empty value. The system will fall back to environment-configured
              keys (if any) for that provider.
            </p>
          </div>

          {/* Last updated */}
          {settingsQuery.data?.updated_at && (
            <p className="mt-6 text-center text-xs text-[var(--ansein-text-dim)]">
              Last updated: {new Date(settingsQuery.data.updated_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/* ============================================ Provider Card */
function ProviderCard({
  provider,
  has,
  values,
  visible,
  savingKey,
  onValueChange,
  onToggleVisible,
  onSave,
}: {
  provider: typeof PROVIDERS[number]
  has: boolean
  values: Record<string, string>
  visible: Record<string, boolean>
  savingKey: string | null
  onValueChange: (key: string, value: string) => void
  onToggleVisible: (key: string) => void
  onSave: (key: string) => void
}) {
  const Icon = provider.icon
  const isVisible = visible[provider.key]
  const isSaving = savingKey === provider.key
  return (
    <div className="ansein-card rounded-xl p-5 relative overflow-hidden">
      {has && (
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: provider.color }} />
      )}
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{
            background: `${provider.color}15`,
            color: provider.color,
            border: `1px solid ${provider.color}30`,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-[var(--ansein-text)]">{provider.name}</h3>
            {has ? (
              <Badge color="success" dot>Configured</Badge>
            ) : (
              <Badge color="warning" dot>Not set</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--ansein-text-muted)] mb-3">{provider.description}</p>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type={isVisible ? 'text' : 'password'}
                value={values[provider.key] || ''}
                onChange={(e) => onValueChange(provider.key, e.target.value)}
                placeholder={has ? '•••••••• (enter new key to replace)' : 'Paste your API key…'}
                className="w-full pl-9 pr-10 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm ansein-mono focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => onToggleVisible(provider.key)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
              >
                {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => onSave(provider.key)}
              disabled={isSaving || !(values[provider.key] || '').trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>

          <a
            href={provider.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)]"
          >
            Get key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
