'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Tag,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Bug,
  Crosshair,
  ShieldAlert,
  Globe,
  Mail,
  Network,
  Sparkles,
  Check,
} from 'lucide-react'
import { http } from '@/lib/http'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface InvestigationCreated {
  id: number
  title: string
}

interface Template {
  id: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  title: string
  description: string
  presetTitle: string
  presetDesc: string
  tags: string[]
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    icon: FileText,
    color: '#64748b',
    title: 'Blank case',
    description: 'Start from scratch with no pre-filled content.',
    presetTitle: '',
    presetDesc: '',
    tags: [],
  },
  {
    id: 'malware',
    icon: Bug,
    color: '#7c3aed',
    title: 'Malware analysis',
    description: 'Analyse a malware sample, its IOCs, and behavioural indicators.',
    presetTitle: 'Malware Analysis — ',
    presetDesc: 'Investigate a malware sample including its IOCs (hashes, IPs, domains, URLs), behavioural indicators, delivery mechanism, and attributed threat actor if known. Include any sandbox reports, YARA rules, or detection signatures.',
    tags: ['malware', 'analysis', 'ioc'],
  },
  {
    id: 'phishing',
    icon: Mail,
    color: '#0891b2',
    title: 'Phishing campaign',
    description: 'Triage a phishing campaign: emails, lure URLs, and infrastructure.',
    presetTitle: 'Phishing Campaign — ',
    presetDesc: 'Investigate a phishing campaign targeting our organisation. Include the phishing email body, sender addresses, lure URLs, attachment hashes, credential harvesting domains, and any C2 infrastructure. Document the attack chain and recommended mitigations.',
    tags: ['phishing', 'email', 'social-engineering'],
  },
  {
    id: 'apt',
    icon: Network,
    color: '#dc2626',
    title: 'APT investigation',
    description: 'Attribute activity to a known APT group using TTPs and infrastructure.',
    presetTitle: 'APT Investigation — ',
    presetDesc: 'Investigate advanced persistent threat activity. Include known TTPs, historical campaigns, attributed tooling, C2 infrastructure, and targeting patterns. Correlate with MITRE ATT&CK techniques where possible and assess attribution confidence.',
    tags: ['apt', 'attribution', 'ttp'],
  },
  {
    id: 'vuln',
    icon: ShieldAlert,
    color: '#ea580c',
    title: 'Vulnerability assessment',
    description: 'Assess a CVE, its exploit status, and active exploitation in the wild.',
    presetTitle: 'Vulnerability Assessment — ',
    presetDesc: 'Assess a specific vulnerability (CVE) including its CVSS score, affected products, exploit availability, observed exploitation in the wild, and recommended patching timeline. Include any known threat actors leveraging this vulnerability.',
    tags: ['vulnerability', 'cve', 'patch'],
  },
  {
    id: 'infrastructure',
    icon: Globe,
    color: '#16a34a',
    title: 'Infrastructure mapping',
    description: 'Map adversary infrastructure: domains, IPs, certs, and hosting.',
    presetTitle: 'Infrastructure Mapping — ',
    presetDesc: 'Map adversary infrastructure including domains, IP addresses, SSL certificates, WHOIS records, hosting providers, and registrars. Identify patterns across the infrastructure set and pivot on shared indicators.',
    tags: ['infrastructure', 'attribution', 'osint'],
  },
  {
    id: 'target',
    icon: Crosshair,
    color: '#db2777',
    title: 'Targeted attack triage',
    description: 'Triage an attack targeting a specific organisation or sector.',
    presetTitle: 'Targeted Attack Triage — ',
    presetDesc: 'Triage a targeted attack against a specific organisation or sector. Document the target, initial access vector, persistence mechanisms, lateral movement, data exfiltration indicators, and scoping. Include timeline of events.',
    tags: ['targeted', 'triage', 'ir'],
  },
]

export default function NewInvestigationPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank')

  function applyTemplate(t: Template) {
    setSelectedTemplate(t.id)
    if (t.id === 'blank') return
    // Only pre-fill if fields are empty or match a previous template's preset
    setTitle(t.presetTitle)
    setDescription(t.presetDesc)
    setTags(t.tags)
  }

  function addTag() {
    const v = tagInput.trim().toLowerCase()
    if (!v) return
    if (tags.includes(v)) {
      setTagInput('')
      return
    }
    if (tags.length >= 20) {
      setError('Maximum 20 tags allowed')
      return
    }
    setTags([...tags, v])
    setTagInput('')
  }

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const inv = await http.post<InvestigationCreated>('/investigations', {
        title: title.trim(),
        description: description.trim(),
        tags,
      })
      toast.success('Investigation created')
      router.push(`/app/investigations/${inv.id}`)
    } catch (err) {
      const e = err as Error
      setError(e.message || 'Failed to create investigation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <Link
        href="/app/investigations"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to investigations
      </Link>

      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          New case
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
          Create investigation
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Start from a template or build a blank case. You can add sources and run the pipeline next.
        </p>
      </div>

      {/* Template picker */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[var(--ansein-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--ansein-text)]">Choose a template</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((t) => {
            const Icon = t.icon
            const isActive = selectedTemplate === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className={cn(
                  'ansein-card rounded-lg p-4 text-left transition-all relative overflow-hidden group',
                  isActive
                    ? 'border-[var(--ansein-primary)] ring-1 ring-[var(--ansein-primary)]'
                    : 'ansein-card-hover'
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: t.color }} />
                )}
                <div className="flex items-start justify-between mb-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}30` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {isActive && (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ansein-primary)]">
                      <Check className="h-2.5 w-2.5 text-[var(--ansein-bg)]" />
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--ansein-text)] mb-1">{t.title}</p>
                <p className="text-[11px] text-[var(--ansein-text-muted)] leading-relaxed">
                  {t.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="ansein-card rounded-xl p-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
            Title <span className="text-rose-400 normal-case">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] transition-colors"
            placeholder="e.g. APT29 Spear-Phishing Campaign Q4 2026"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows={5}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] transition-colors resize-y"
            placeholder="Briefly describe the scope, objectives, and any prior context for this investigation…"
          />
          <p className="text-xs text-[var(--ansein-text-dim)] mt-1">
            {description.length} / 10000 characters
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
            Tags <span className="text-[var(--ansein-text-dim)] normal-case">(press Enter to add)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] focus-within:border-[var(--ansein-primary)] focus-within:ring-1 focus-within:ring-[var(--ansein-primary)] transition-colors">
            <Tag className="h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded ansein-mono text-xs bg-teal-500/10 border border-teal-500/30 text-teal-300"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="hover:text-teal-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKey}
              onBlur={addTag}
              placeholder={tags.length === 0 ? 'apt29, phishing, q4-2026' : ''}
              className="flex-1 min-w-[100px] bg-transparent text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none"
            />
          </div>
        </div>

        {/* Tips card */}
        <div className="rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] p-4">
          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-[var(--ansein-primary)] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
              <strong className="text-[var(--ansein-text)]">Next step:</strong> after creating the
              investigation you&apos;ll be taken to its detail page where you can add sources (raw text,
              files, URLs) and trigger the extraction pipeline with a single click.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/app/investigations"
            className="px-4 py-2 rounded-md text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              'Create investigation'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
