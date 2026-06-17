'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Network,
  Bot,
  FileSearch,
  Brain,
  Download,
  ShieldCheck,
  Lock,
  Cpu,
  Activity,
  Github,
  ChevronRight,
  Zap,
  Globe,
  Layers,
  CheckCircle2,
  XCircle,
  Server,
  Code2,
  Database,
  GitBranch,
} from 'lucide-react'
import { Brand } from '@/components/ansein/brand'
import { Badge } from '@/components/ansein/ui'

const FEATURES = [
  {
    icon: FileSearch,
    title: 'Hybrid Extraction',
    color: '#14b8a6',
    description:
      'Regex → LLM pipeline extracts IOCs, malware families, threat actors, and vulnerabilities from raw threat data — degrades gracefully when no LLM is configured.',
  },
  {
    icon: Network,
    title: 'Knowledge Graph',
    color: '#f59e0b',
    description:
      'Interactive force-directed visualisation of entities and their relationships. Click any node to inspect enrichment, evidence, and confidence scores.',
  },
  {
    icon: Brain,
    title: 'Cognitive Analysis',
    color: '#a78bfa',
    description:
      'LLM-generated threat narratives, actor hypotheses, severity scores 0–100, Admiralty reliability codes, and actionable defensive recommendations.',
  },
  {
    icon: Bot,
    title: 'Investigation Copilot',
    color: '#38bdf8',
    description:
      'RAG-style chat grounded strictly in your investigation data. Per-session memory, citation-aware answers, no fabrication by design.',
  },
  {
    icon: Download,
    title: 'STIX 2.1 Export',
    color: '#10b981',
    description:
      'One-click export to STIX 2.1 bundle, raw JSON, or a polished printable PDF threat report — ready to share with stakeholders.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-Tenant SaaS',
    color: '#f43f5e',
    description:
      'Bring-your-own-key (BYOK) architecture with Fernet-equivalent AES-256-GCM encryption at rest. Each user supplies their own API keys.',
  },
]

const STATS = [
  { value: '13', label: 'Entity types' },
  { value: '4', label: 'Enrichment providers' },
  { value: '3', label: 'Export formats' },
  { value: '100', label: 'Analyst-grade' },
]

const PIPELINE_STEPS = [
  {
    n: '01',
    title: 'Ingest',
    description: 'Paste raw text, upload files, or reference URLs into an investigation case.',
  },
  {
    n: '02',
    title: 'Extract',
    description: 'Hybrid regex + LLM extraction identifies IOCs, actors, malware, and TTPs.',
  },
  {
    n: '03',
    title: 'Enrich',
    description: 'VirusTotal, AbuseIPDB, and Shodan enrich technical indicators with verdicts.',
  },
  {
    n: '04',
    title: 'Analyse',
    description: 'LLM synthesises a narrative, severity score, and Admiralty reliability code.',
  },
  {
    n: '05',
    title: 'Decide',
    description: 'Query the Copilot for grounded answers, then export a STIX bundle or PDF.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-50 border-b border-[var(--ansein-border)] bg-[var(--ansein-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Brand size={32} />
          <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--ansein-text-muted)]">
            <a href="#features" className="ansein-underline hover:text-[var(--ansein-text)] transition-colors">
              Features
            </a>
            <a href="#pipeline" className="ansein-underline hover:text-[var(--ansein-text)] transition-colors">
              Pipeline
            </a>
            <a href="#architecture" className="ansein-underline hover:text-[var(--ansein-text)] transition-colors">
              Architecture
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #14b8a6 1px, transparent 1px), linear-gradient(to bottom, #14b8a6 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(ellipse 80% 50% at 50% 30%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 30%, black, transparent)',
          }}
        />
        {/* Animated gradient orbs */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.07] blur-3xl"
          style={{ background: 'radial-gradient(circle, #14b8a6, transparent 70%)', animation: 'ansein-float 8s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.05] blur-3xl"
          style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)', animation: 'ansein-float 10s ease-in-out infinite reverse' }}
        />

        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--ansein-border)] bg-[var(--ansein-surface)] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-muted)]">
                v3.0 · MySQL-ready · Plug-and-play setup
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[var(--ansein-text)] max-w-4xl leading-[1.05]">
              Turn raw threat data
              <br />
              into <span className="ansein-gradient-text">decisions</span>.
            </h1>

            <p className="mt-6 text-lg md:text-xl text-[var(--ansein-text-muted)] max-w-2xl leading-relaxed">
              A CTI/OSINT platform that extracts, enriches, and visualises threat intelligence —
              then writes the report for you. Hybrid extraction, knowledge graph, cognitive analysis,
              and a RAG copilot in one pane of glass.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
              >
                Start investigating
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text)] font-medium hover:border-[var(--ansein-border-strong)] transition-colors"
              >
                Sign in
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Stats strip */}
            <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--ansein-border)] border border-[var(--ansein-border)] rounded-xl overflow-hidden max-w-3xl w-full">
              {STATS.map((s) => (
                <div key={s.label} className="bg-[var(--ansein-surface)] px-4 py-5 text-center">
                  <div className="text-3xl font-semibold ansein-mono text-[var(--ansein-primary)]">
                    {s.value}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mt-1">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="border-t border-[var(--ansein-border)]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl mb-16">
            <Badge color="primary">Capabilities</Badge>
            <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-[var(--ansein-text)]">
              Six pillars of the intelligence pipeline
            </h2>
            <p className="mt-3 text-[var(--ansein-text-muted)]">
              Built from the ground up for analysts who need to move from raw data to defensible
              decisions — without juggling six different tools.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="ansein-card ansein-card-hover rounded-xl p-6 group relative overflow-hidden"
                >
                  {/* Top accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: `linear-gradient(90deg, ${f.color}, ${f.color}40)` }}
                  />
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-lg mb-4 transition-transform group-hover:scale-105"
                    style={{
                      background: `${f.color}1a`,
                      border: `1px solid ${f.color}40`,
                      color: f.color,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--ansein-text)] mb-2">
                    {f.title}
                  </h3>
                  <p className="text-sm text-[var(--ansein-text-muted)] leading-relaxed">
                    {f.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- Pipeline ---------- */}
      <section id="pipeline" className="border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl mb-16">
            <Badge color="accent">Workflow</Badge>
            <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-[var(--ansein-text)]">
              From raw text to defensible decision
            </h2>
            <p className="mt-3 text-[var(--ansein-text-muted)]">
              A single click triggers a deterministic five-stage pipeline. Each stage is observable,
              idempotent, and gracefully degrades when optional dependencies are missing.
            </p>
          </div>

          <div className="relative">
            {/* Vertical line on mobile, horizontal on desktop */}
            <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--ansein-border-strong)] to-transparent" />

            <div className="grid md:grid-cols-5 gap-6 md:gap-4 relative">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.n} className="relative">
                  <div className="flex flex-col items-start">
                    {/* Step node */}
                    <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ansein-surface-2)] border border-[var(--ansein-border-strong)] mb-4">
                      <span className="ansein-mono text-sm font-semibold text-[var(--ansein-primary)]">
                        {step.n}
                      </span>
                      {i < PIPELINE_STEPS.length - 1 && (
                        <ChevronRight className="hidden md:block absolute left-full top-1/2 -translate-y-1/2 translate-x-2 h-4 w-4 text-[var(--ansein-text-dim)]" />
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--ansein-text)] uppercase tracking-wide mb-1.5">
                      {step.title}
                    </h3>
                    <p className="text-sm text-[var(--ansein-text-muted)] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Architecture ---------- */}
      <section id="architecture" className="border-t border-[var(--ansein-border)]">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <Badge color="info">Architecture</Badge>
              <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-[var(--ansein-text)]">
                Built for cPanel.
                <br />
                Designed for analysts.
              </h2>
              <p className="mt-4 text-[var(--ansein-text-muted)] leading-relaxed">
                AnseIn runs on shared hosting with nothing but a MySQL database and a Python runtime.
                No Redis required. No Kubernetes. No fancy infrastructure. Just a single deployed
                Next.js application backed by Prisma.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  { icon: Lock, title: 'BYOK encryption', description: 'API keys encrypted at rest with AES-256-GCM. Keys never logged, never sent to third parties.' },
                  { icon: Cpu, title: 'Hybrid extraction', description: 'Regex catches the obvious. LLM catches the subtle. Both co-exist in one deduped entity graph.' },
                  { icon: Activity, title: 'Observable pipeline', description: 'Status transitions (pending → extracting → enriching → analyzing → completed) are visible in real-time.' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.title} className="flex gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--ansein-text)]">{item.title}</h3>
                        <p className="text-sm text-[var(--ansein-text-muted)] mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Architecture diagram */}
            <div className="ansein-card rounded-xl p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-2 w-2 rounded-full bg-rose-500/70" />
                <div className="h-2 w-2 rounded-full bg-amber-500/70" />
                <div className="h-2 w-2 rounded-full bg-emerald-500/70" />
                <span className="ml-auto ansein-mono text-xs text-[var(--ansein-text-dim)]">ansein-v3</span>
              </div>
              <pre className="ansein-mono text-[11px] leading-relaxed text-[var(--ansein-text-muted)] overflow-x-auto">
{`┌──────────────────────────────────────────┐
│              Next.js 16 App              │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Dashboard│  │ Graph    │  │ Copilot│ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       └─────┬───────┴────────────┘       │
│             ▼                            │
│     ┌──────────────────────┐             │
│     │  API Route Handlers  │             │
│     │  /api/v1/*           │             │
│     └──────────┬───────────┘             │
└────────────────┼─────────────────────────┘
                 ▼
   ┌─────────────────────────────┐
   │      Engines (pure TS)      │
   │  extraction · enrichment    │
   │  analysis · copilot · graph │
   └──────────────┬──────────────┘
                  ▼
        ┌──────────────────┐
        │   Prisma + SQL   │
        │  SQLite (dev)    │
        │  MySQL (cPanel)  │
        └──────────────────┘`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stats section ---------- */}
      <section className="border-t border-[var(--ansein-border)] bg-[var(--ansein-bg)]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="text-center mb-10">
            <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-2">
              By the numbers
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ansein-text)]">
              Built for analyst-grade work
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Layers, value: '13', label: 'Entity types', desc: 'IOCs, actors, malware, TTPs', color: '#14b8a6' },
              { icon: Globe, value: '4', label: 'Enrichment providers', desc: 'VirusTotal, AbuseIPDB, Shodan, +LLM', color: '#f59e0b' },
              { icon: Download, value: '3', label: 'Export formats', desc: 'STIX 2.1, JSON, printable PDF', color: '#a78bfa' },
              { icon: Zap, value: '11', label: 'Regex patterns', desc: 'IPv4/6, domains, hashes, CVE, BTC', color: '#f43f5e' },
            ].map((stat, i) => {
              const Icon = stat.icon
              return (
                <div
                  key={i}
                  className="ansein-card rounded-xl p-5 relative overflow-hidden group hover:border-[var(--ansein-border-strong)] transition-colors"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: stat.color }}
                  />
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg mb-3"
                    style={{ background: `${stat.color}15`, color: stat.color, border: `1px solid ${stat.color}30` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-3xl font-semibold ansein-mono text-[var(--ansein-text)]">
                    {stat.value}
                  </p>
                  <p className="text-sm font-medium text-[var(--ansein-text)] mt-1">{stat.label}</p>
                  <p className="text-xs text-[var(--ansein-text-dim)] mt-0.5">{stat.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- Comparison section ---------- */}
      <section className="border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/20">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="text-center mb-10">
            <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-2">
              Why AnseIn
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--ansein-text)]">
              One pane of glass vs. six tools
            </h2>
            <p className="mt-3 text-[var(--ansein-text-muted)] max-w-2xl mx-auto">
              Stop juggling OpenCTI for storage, VirusTotal for enrichment, ChatGPT for analysis, and STIX lib for export. AnseIn unifies the workflow.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Without AnseIn */}
            <div className="ansein-card rounded-xl p-6 border-rose-500/20">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--ansein-border)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-500/10 border border-rose-500/30">
                  <XCircle className="h-4 w-4 text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ansein-text)]">
                  Without AnseIn
                </h3>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Manual copy-paste between 4+ tools',
                  'No audit trail of analyst decisions',
                  'Inconsistent severity scoring',
                  'Per-seat licences for each tool',
                  'No grounded RAG chat on your data',
                  'Manual STIX bundle construction',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--ansein-text-muted)]">
                    <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* With AnseIn */}
            <div className="ansein-card rounded-xl p-6 border-emerald-500/30 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500/60 via-teal-400/80 to-emerald-500/60" />
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--ansein-border)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ansein-text)]">
                  With AnseIn
                </h3>
                <Badge color="success" className="ml-auto">Recommended</Badge>
              </div>
              <ul className="space-y-2.5">
                {[
                  'One-click pipeline: ingest → extract → enrich → analyse',
                  'Tamper-evident audit log of every action',
                  'LLM severity scores 0–100 + Admiralty codes',
                  'BYOK — bring your own API keys, multi-tenant',
                  'RAG Copilot grounded strictly in your data',
                  'STIX 2.1, JSON, and PDF export built-in',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--ansein-text)]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Tech stack section ---------- */}
      <section className="border-t border-[var(--ansein-border)]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="text-center mb-8">
            <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-2">
              Under the hood
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
              Modern, deployable, open
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Code2, label: 'Next.js 16', sub: 'App Router + TS' },
              { icon: Database, label: 'Prisma ORM', sub: 'SQLite → MySQL' },
              { icon: Server, label: 'cPanel-ready', sub: 'Shared hosting' },
              { icon: GitBranch, label: 'Open source', sub: 'MIT licence' },
            ].map((tech, i) => {
              const Icon = tech.icon
              return (
                <div
                  key={i}
                  className="ansein-card rounded-lg p-4 text-center hover:border-[var(--ansein-primary)]/40 transition-colors"
                >
                  <Icon className="h-5 w-5 text-[var(--ansein-primary)] mx-auto mb-2" />
                  <p className="text-sm font-medium text-[var(--ansein-text)]">{tech.label}</p>
                  <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mt-0.5">
                    {tech.sub}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="border-t border-[var(--ansein-border)] bg-[var(--ansein-surface)]/30">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--ansein-text)]">
            Ready to extract intelligence?
          </h2>
          <p className="mt-3 text-[var(--ansein-text-muted)]">
            The first account you create becomes the administrator. No CLI, no env wrangling, no
            infrastructure setup required.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
            >
              Create your account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text)] font-medium hover:border-[var(--ansein-border-strong)] transition-colors"
            >
              I already have one
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mt-auto border-t border-[var(--ansein-border)] bg-[var(--ansein-bg)]">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Brand size={28} />
            <div className="flex items-center gap-6 text-sm text-[var(--ansein-text-dim)]">
              <a
                href="https://github.com/rfypych/ansein"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[var(--ansein-text-muted)] transition-colors"
              >
                <Github className="h-4 w-4" />
                <span>Source</span>
              </a>
              <span className="ansein-mono text-xs">v3.0.0</span>
            </div>
          </div>
          <p className="mt-6 text-xs text-[var(--ansein-text-dim)] text-center md:text-left">
            © {new Date().getFullYear()} AnseIn. Open-source CTI/OSINT platform. Built with
            Next.js 16, Prisma, and the z-ai SDK.
          </p>
        </div>
      </footer>
    </div>
  )
}
