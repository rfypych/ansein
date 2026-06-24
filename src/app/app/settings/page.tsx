'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowSquareOut as ExternalLink, Broadcast, Check, CircleNotch as Loader2, Copy, Cpu, Eye, EyeClosed as EyeOff, FloppyDisk as Save, Globe, Info, Key as KeyRound, Lock, Plugs as Webhook, Robot as Bot, ShieldCheck, ShieldWarning as ShieldAlert, Terminal, WarningCircle as AlertCircle } from '@phosphor-icons/react'
import { http } from '@/lib/http'
import { useAuthStore, authUserRole } from '@/lib/auth-store'
import { Badge, Spinner } from '@/components/ansein/ui'
import { ROLE_DESCRIPTIONS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface UserSettings {
  preferred_llm: string
  has_openai: boolean
  has_groq: boolean
  has_custom_llm: boolean
  custom_llm_base_url: string
  custom_llm_model: string
  has_virustotal: boolean
  has_abuseipdb: boolean
  has_shodan: boolean
  has_webhook_secret: boolean
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
    icon: Broadcast,
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
  const user = useAuthStore((s) => s.user)
  const role = authUserRole(user)
  // Only admins can mutate settings (settings.manage permission).
  // Editors see the same content read-only (they still benefit from seeing
  // which providers are configured). Analysts see a read-only view too —
  // the encryption banner + provider status is informational.
  const canEdit = role === 'admin'
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
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
          Configuration
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
          {!canEdit && (
            <span className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-card border border-border text-muted-foreground align-middle">
              <ShieldCheck weight="duotone" className="h-3 w-3" />
              Read-only · {role}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your bring-your-own-key (BYOK) API credentials.
        </p>
      </div>

      {/* Role notice for non-admins */}
      {!canEdit && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-amber-500/[0.04] border border-amber-500/15">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
            <Info weight="duotone" className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">
              You are viewing this page as <span className="capitalize">{role}</span>.
            </strong>{' '}
            Only workspace administrators can add or rotate API keys. Your role grants:{' '}
            <span className="text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </span>
          </div>
        </div>
      )}

      {/* Encryption banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-primary/[0.04] border border-primary/15">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 border border-primary/20 flex-shrink-0">
          <Lock weight="duotone" className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Encryption at rest.</strong> All API keys are
          encrypted with <span className="ansein-mono text-primary">AES-256-GCM</span> using the application&apos;s <code className="ansein-mono px-1 py-0.5 rounded bg-card text-muted-foreground">SECRET_KEY</code> before being stored.
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
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Preferred LLM provider
              </h3>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 ansein-mono">
                Optional
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Which LLM to use when both OpenAI and Groq keys are configured.
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'auto', label: 'Auto', desc: 'Groq first, OpenAI fallback' },
                { key: 'openai', label: 'OpenAI', desc: 'GPT models' },
                { key: 'groq', label: 'Groq', desc: 'Llama/Mixtral, fast inference' },
                { key: 'custom', label: 'Custom', desc: 'Any OpenAI-compatible endpoint' },
              ] as const).map((p) => {
                const active = preferredLlm === p.key
                const disabled = !canEdit || (p.key === 'custom' && !settingsQuery.data?.has_custom_llm)
                return (
                  <button
                    key={p.key}
                    onClick={() => !disabled && handleSetPreferredLlm(p.key)}
                    disabled={disabled}
                    title={p.desc}
                    className={cn(
                      'inline-flex flex-col items-start px-3 py-2 rounded-md text-sm border transition-all text-left',
                      active
                        ? 'bg-primary/10 text-foreground border-primary/40'
                        : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50',
                      disabled && 'cursor-not-allowed opacity-50 hover:text-muted-foreground hover:border-border'
                    )}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className={cn(
                      'text-[10px] mt-0.5',
                      active ? 'text-primary' : 'text-muted-foreground/50'
                    )}>
                      {p.desc}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Provider cards grouped by category */}
          <div className="space-y-6">
            {/* LLM providers */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 border border-primary/30">
                  <Bot weight="duotone" className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">LLM providers</h3>
                  <p className="text-[10px] text-muted-foreground/50">Used for extraction, analysis, and copilot</p>
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
                    readOnly={!canEdit}
                    onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                    onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>

            {/* Custom LLM provider */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/15 border border-violet-500/30">
                  <Cpu weight="duotone" className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Custom LLM provider</h3>
                  <p className="text-[10px] text-muted-foreground/50">Any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenRouter, Together, Mistral, etc.)</p>
                </div>
              </div>
              <CustomLlmCard
                hasCustomLlm={!!settingsQuery.data?.has_custom_llm}
                baseUrl={settingsQuery.data?.custom_llm_base_url || ''}
                model={settingsQuery.data?.custom_llm_model || ''}
                values={values}
                visible={visible}
                savingKey={savingKey}
                canEdit={canEdit}
                onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
                onSave={handleSave}
              />
            </div>

            {/* Enrichment providers */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15 border border-amber-500/30">
                  <ShieldAlert weight="duotone" className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Enrichment providers</h3>
                  <p className="text-[10px] text-muted-foreground/50">Used to enrich IOCs with reputation and context</p>
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
                    readOnly={!canEdit}
                    onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                    onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Webhook Integration section */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/15 border border-violet-500/30">
                <Webhook weight="duotone" className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Webhook integration</h3>
                <p className="text-[10px] text-muted-foreground/50">Allow SIEMs and email gateways to forward alerts for automatic triage</p>
              </div>
            </div>
            <WebhookIntegrationCard
              hasWebhookSecret={!!settingsQuery.data?.has_webhook_secret}
              canEdit={canEdit}
              values={values}
              visible={visible}
              savingKey={savingKey}
              onValueChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
              onToggleVisible={(k) => setVisible((s) => ({ ...s, [k]: !s[k] }))}
              onSave={handleSave}
            />
          </div>

          {/* Clear key hint */}
          <div className="mt-6 p-4 rounded-md bg-card border border-border flex items-start gap-2.5">
            <AlertCircle weight="duotone" className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              To remove a key, save an empty value. The system will fall back to environment-configured
              keys (if any) for that provider.
            </p>
          </div>

          {/* Last updated */}
          {settingsQuery.data?.updated_at && (
            <p className="mt-6 text-center text-xs text-muted-foreground/50">
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
  readOnly = false,
  onValueChange,
  onToggleVisible,
  onSave,
}: {
  provider: typeof PROVIDERS[number]
  has: boolean
  values: Record<string, string>
  visible: Record<string, boolean>
  savingKey: string | null
  readOnly?: boolean
  onValueChange: (key: string, value: string) => void
  onToggleVisible: (key: string) => void
  onSave: (key: string) => void
}) {
  const Icon = provider.icon
  const isVisible = visible[provider.key]
  const isSaving = savingKey === provider.key
  return (
    <div className="bg-card border border-border rounded-xl p-5 relative overflow-hidden">
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
            <h3 className="text-sm font-semibold text-foreground">{provider.name}</h3>
            {has ? (
              <Badge color="success" dot>Configured</Badge>
            ) : (
              <Badge color="warning" dot>Not set</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">{provider.description}</p>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <KeyRound weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type={isVisible ? 'text' : 'password'}
                value={values[provider.key] || ''}
                onChange={(e) => onValueChange(provider.key, e.target.value)}
                disabled={readOnly}
                placeholder={has ? '•••••••• (enter new key to replace)' : 'Paste your API key…'}
                className="w-full pl-9 pr-10 py-2 rounded-md bg-card border border-border text-sm ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => onToggleVisible(provider.key)}
                disabled={readOnly}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVisible ? <EyeOff weight="duotone" className="h-3.5 w-3.5" /> : <Eye weight="duotone" className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => onSave(provider.key)}
              disabled={readOnly || isSaving || !(values[provider.key] || '').trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 weight="duotone" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check weight="duotone" className="h-3.5 w-3.5" />
              )}
              Save
            </button>
          </div>

          <a
            href={provider.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/90"
          >
            Get key
            <ExternalLink weight="duotone" className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

/* ============================================ Webhook Integration Card */
function WebhookIntegrationCard({
  hasWebhookSecret,
  canEdit,
  values,
  visible,
  savingKey,
  onValueChange,
  onToggleVisible,
  onSave,
}: {
  hasWebhookSecret: boolean
  canEdit: boolean
  values: Record<string, string>
  visible: Record<string, boolean>
  savingKey: string | null
  onValueChange: (key: string, value: string) => void
  onToggleVisible: (key: string) => void
  onSave: (key: string) => void
}) {
  const WEBHOOK_KEY = 'webhook_secret'
  // The webhook URL is shown to all users (it's not secret — the secret is
  // the X-Webhook-Key value, not the URL itself).
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/webhook/ingest`
    : '/api/v1/webhook/ingest'
  const isVisible = visible[WEBHOOK_KEY]
  const isSaving = savingKey === WEBHOOK_KEY

  function copyUrl() {
    navigator.clipboard?.writeText(webhookUrl).then(
      () => toast.success('Webhook URL copied to clipboard'),
      () => toast.error('Copy failed — copy manually')
    )
  }

  function copyCurlExample() {
    const example = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Key: <your-webhook-secret>" \\
  -d '{
    "source": "splunk",
    "alert_type": "phishing",
    "title": "Suspicious email from outside org",
    "raw_data": "Subject: Urgent: wire transfer\\nFrom: ceo@external-domain.com\\n...",
    "severity_hint": "high",
    "auto_investigate": true
  }'`
    navigator.clipboard?.writeText(example).then(
      () => toast.success('cURL example copied'),
      () => toast.error('Copy failed')
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 relative overflow-hidden">
      {hasWebhookSecret && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />
      )}
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{
            background: '#8b5cf615',
            color: '#8b5cf6',
            border: '1px solid #8b5cf630',
          }}
        >
          <Webhook weight="duotone" className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground">SIEM / email-gateway webhook</h3>
            {hasWebhookSecret ? (
              <Badge color="success" dot>Enabled</Badge>
            ) : (
              <Badge color="warning" dot>Not configured</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Forward alerts from Splunk, Elastic, email gateways, or any custom SIEM. AnseIn will create an investigation, run the extraction pipeline (optional), and apply SOAR playbooks automatically.
          </p>

          {/* Webhook URL display + copy button */}
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1">
              Webhook URL
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-card border border-border text-xs ansein-mono text-muted-foreground truncate">
                POST {webhookUrl}
              </code>
              <button
                onClick={copyUrl}
                type="button"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-card border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors whitespace-nowrap"
                title="Copy webhook URL"
              >
                <Copy weight="duotone" className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>

          {/* Secret input */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <KeyRound weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                type={isVisible ? 'text' : 'password'}
                value={values[WEBHOOK_KEY] || ''}
                onChange={(e) => onValueChange(WEBHOOK_KEY, e.target.value)}
                disabled={!canEdit}
                placeholder={hasWebhookSecret ? '•••••••• (enter new secret to rotate)' : 'Set a webhook secret…'}
                className="w-full pl-9 pr-10 py-2 rounded-md bg-card border border-border text-sm ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => onToggleVisible(WEBHOOK_KEY)}
                disabled={!canEdit}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVisible ? <EyeOff weight="duotone" className="h-3.5 w-3.5" /> : <Eye weight="duotone" className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={() => onSave(WEBHOOK_KEY)}
              disabled={!canEdit || isSaving || !(values[WEBHOOK_KEY] || '').trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 weight="duotone" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check weight="duotone" className="h-3.5 w-3.5" />
              )}
              {hasWebhookSecret ? 'Rotate' : 'Save'}
            </button>
          </div>

          {/* SIEM forwarding instructions */}
          <div className="mt-4 p-3 rounded-md bg-card border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 flex items-center gap-1.5">
                <Terminal weight="duotone" className="h-3 w-3" />
                Quick start — cURL example
              </p>
              <button
                onClick={copyCurlExample}
                type="button"
                className="text-[10px] text-primary hover:text-primary/90 flex items-center gap-1"
              >
                <Copy weight="duotone" className="h-3 w-3" />
                Copy
              </button>
            </div>
            <pre className="text-[10px] ansein-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Key: <your-webhook-secret>" \\
  -d '{
    "source": "splunk",
    "alert_type": "phishing",
    "title": "Suspicious email from outside org",
    "raw_data": "Subject: Urgent wire transfer\\nFrom: ceo@external-domain.com",
    "severity_hint": "high",
    "auto_investigate": true
  }'`}
            </pre>
            <ul className="mt-3 space-y-1 text-[10px] text-muted-foreground">
              <li className="flex gap-1.5">
                <span className="text-primary">▸</span>
                <span><strong className="text-foreground">Splunk</strong>: add a webhook action to your alert and point it at the URL above. Pass the search results in <code className="ansein-mono px-1 py-0.5 rounded bg-background text-muted-foreground/50">raw_data</code>.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-primary">▸</span>
                <span><strong className="text-foreground">Elastic / Kibana</strong>: configure a webhook connector on the alert rule. Use <code className="ansein-mono px-1 py-0.5 rounded bg-background text-muted-foreground/50">source: "elastic"</code> in the body.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-primary">▸</span>
                <span><strong className="text-foreground">Email gateway</strong>: forward suspicious email body/headers as <code className="ansein-mono px-1 py-0.5 rounded bg-background text-muted-foreground/50">raw_data</code> with <code className="ansein-mono px-1 py-0.5 rounded bg-background text-muted-foreground/50">alert_type: "phishing"</code>.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-primary">▸</span>
                <span>Set <code className="ansein-mono px-1 py-0.5 rounded bg-background text-muted-foreground/50">auto_investigate: true</code> to run the extraction pipeline immediately.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-primary">▸</span>
                <span>Rate limit: 100 requests per minute per source IP.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================ Custom LLM Card */
function CustomLlmCard({
  hasCustomLlm,
  baseUrl,
  model,
  values,
  visible,
  savingKey,
  canEdit,
  onValueChange,
  onToggleVisible,
  onSave,
}: {
  hasCustomLlm: boolean
  baseUrl: string
  model: string
  values: Record<string, string>
  visible: Record<string, boolean>
  savingKey: string | null
  canEdit: boolean
  onValueChange: (key: string, value: string) => void
  onToggleVisible: (key: string) => void
  onSave: (key: string) => void
}) {
  const isVisible = visible['custom_llm_api_key']
  const isSaving = savingKey === 'custom_llm_api_key' || savingKey === 'custom_llm_base_url' || savingKey === 'custom_llm_model'

  const qc = useQueryClient()
  const [localSaving, setLocalSaving] = useState(false)

  async function handleSaveCustom() {
    setLocalSaving(true)
    try {
      await http.put('/settings', {
        custom_llm_api_key: values['custom_llm_api_key'] !== undefined ? values['custom_llm_api_key'] : undefined,
        custom_llm_base_url: values['custom_llm_base_url'] !== undefined ? values['custom_llm_base_url'] : baseUrl,
        custom_llm_model: values['custom_llm_model'] !== undefined ? values['custom_llm_model'] : model,
      })
      toast.success('Custom LLM settings saved')
      qc.invalidateQueries({ queryKey: ['settings'] })
      onValueChange('custom_llm_api_key', '')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save Custom LLM settings')
    } finally {
      setLocalSaving(false)
    }
  }

  // Determine if we should enable the save button
  const hasChanges = (values['custom_llm_base_url'] !== undefined && values['custom_llm_base_url'] !== baseUrl) ||
                     (values['custom_llm_model'] !== undefined && values['custom_llm_model'] !== model) ||
                     (values['custom_llm_api_key'] !== undefined && values['custom_llm_api_key'].trim() !== '')

  return (
    <div className="bg-card border border-border rounded-xl p-5 relative overflow-hidden">
      {hasCustomLlm && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />
      )}
      <div className="space-y-4">
        
        {/* Base URL */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Base URL</label>
          <input
            type="text"
            value={values['custom_llm_base_url'] !== undefined ? values['custom_llm_base_url'] : baseUrl}
            onChange={(e) => onValueChange('custom_llm_base_url', e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. http://localhost:11434/v1"
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Model ID</label>
          <input
            type="text"
            value={values['custom_llm_model'] !== undefined ? values['custom_llm_model'] : model}
            onChange={(e) => onValueChange('custom_llm_model', e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. llama3, mistral-instruct"
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">API Key (Optional)</label>
          <div className="relative">
            <KeyRound weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type={isVisible ? 'text' : 'password'}
              value={values['custom_llm_api_key'] || ''}
              onChange={(e) => onValueChange('custom_llm_api_key', e.target.value)}
              disabled={!canEdit}
              placeholder={hasCustomLlm ? '•••••••• (leave blank to keep current)' : 'API key if required by provider…'}
              className="w-full pl-9 pr-10 py-2 rounded-md bg-card border border-border text-sm ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => onToggleVisible('custom_llm_api_key')}
              disabled={!canEdit}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVisible ? <EyeOff weight="duotone" className="h-3.5 w-3.5" /> : <Eye weight="duotone" className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveCustom}
            disabled={!canEdit || localSaving || !hasChanges}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {localSaving ? (
              <Loader2 weight="duotone" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save weight="duotone" className="h-3.5 w-3.5" />
            )}
            Save Custom Provider
          </button>
        </div>

      </div>
    </div>
  )
}
