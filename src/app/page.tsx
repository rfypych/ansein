'use client'

import Link from 'next/link'
import { ShieldCheck, Brain, Lightning, ChatCircleDots, FilePdf, LockKey, ArrowRight, GithubLogo, Cube, Cloud, HardDrives } from '@phosphor-icons/react'
import { useEffect, useState, useRef } from 'react'
import { ThemeToggle } from "@/components/ansein/theme-toggle"
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

/* ──────────────────────────────────────────────────────────────────────
   AnseIn Landing Page — Hermes-inspired editorial layout
   Clean programmatic ASCII animations, no scraped art, no glitch bugs
   ────────────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'HYBRID\nEXTRACTION',
    desc: 'Regex catches the obvious. LLM catches the subtle. Both co-exist in a single deduplication pass with graceful degradation.',
  },
  {
    icon: Brain,
    title: 'GRAPH\nMEMORY',
    desc: 'Force-directed entity visualisation maps relationships between IOCs, threat actors, malware families, and TTPs.',
  },
  {
    icon: Lightning,
    title: 'AUTO\nANALYSIS',
    desc: 'LLM-generated threat narratives, actor hypotheses, severity scores, admiralty codes, and defensive recommendations.',
  },
  {
    icon: ChatCircleDots,
    title: 'THREAT\nCOPILOT',
    desc: 'RAG-style chat grounded strictly in your investigation data. Per-session memory, citation-aware, zero fabrication.',
  },
  {
    icon: FilePdf,
    title: 'EXPORT\nREPORTS',
    desc: 'One-click export to STIX 2.1 bundle, raw JSON, or a polished printable PDF threat report for stakeholders.',
  },
  {
    icon: LockKey,
    title: 'ZERO\nTRUST',
    desc: 'Multi-tenant BYOK architecture. API keys encrypted with AES-256-GCM. Each user cryptographically sandboxed.',
  },
]

// ─── Smooth animated ASCII canvas ───────────────────────────────────
function AnimatedWave() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const w = 300
    const h = 50
    const interval = setInterval(() => {
      frame++
      const result: string[] = []
      for (let y = 0; y < h; y++) {
        let row = ''
        for (let x = 0; x < w; x++) {
          const v = Math.sin(x * 0.12 + frame * 0.08) * 4 +
            Math.sin(x * 0.05 + y * 0.3 + frame * 0.05) * 3 +
            Math.sin(y * 0.2 - frame * 0.06) * 2
          const ny = (y - h / 2)
          const d = Math.abs(ny - v)
          if (d < 0.8) row += '\u2588'
          else if (d < 1.6) row += '\u2593'
          else if (d < 2.4) row += '\u2592'
          else if (d < 3.5) row += '\u2591'
          else row += ' '
        }
        result.push(row)
      }
      setLines(result)
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <pre 
      className="text-[12px] md:text-[16px] leading-[1.1] text-primary/80 whitespace-pre select-none"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
    >
      {lines.join('\n')}
    </pre>
  )
}

function AnimatedTopo() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const w = 150
    const h = 50
    const interval = setInterval(() => {
      frame++
      const result: string[] = []
      for (let y = 0; y < h; y++) {
        let row = ''
        for (let x = 0; x < w * 2; x++) {
          const nx = x * 0.03 + frame * 0.01
          const ny = y * 0.06 - frame * 0.015
          const v = Math.sin(nx) * Math.cos(ny) + Math.sin(nx * 0.5 + ny * 0.5)
          // Create sharp contour lines
          const contour = Math.abs((v * 8) % 2)

          if (contour < 0.2) row += '\u2588'
          else if (contour < 0.4) row += '\u2593'
          else if (contour < 0.6) row += '\u00b7'
          else row += ' '
        }
        result.push(row)
      }
      setLines(result)
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <pre 
      className="text-[10px] md:text-[12px] leading-[1.15] text-primary/40 whitespace-pre select-none"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
    >
      {lines.join('\n')}
    </pre>
  )
}

function AnimatedGlobe() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const w = 150
    const h = 40
    const interval = setInterval(() => {
      frame++
      const result: string[] = []
      for (let y = 0; y < h; y++) {
        let row = ''
        for (let x = 0; x < w; x++) {
          const distFromRight = w - 1 - x
          const wave1 = Math.sin(x * 0.15 + frame * 0.1 + y * 0.1)
          const wave2 = Math.sin(x * 0.05 + frame * 0.05 - y * 0.2)
          const noise = wave1 * wave2
          
          // Smooth fade out from the right edge
          const xFade = Math.exp(-distFromRight * 0.035)
          // Smooth fade out towards top and bottom edges
          const yFade = Math.exp(-Math.pow((y - h / 2) / (h / 3), 2))
          
          const envelope = xFade * yFade
          const density = Math.abs(noise) * envelope

          if (density > 0.6) row += '\u2588'
          else if (density > 0.4) row += '\u2593'
          else if (density > 0.2) row += '\u2592'
          else if (density > 0.05) row += '\u2591'
          else row += ' '
        }
        result.push(row)
      }
      setLines(result)
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <pre 
      className="text-[7px] md:text-[9px] leading-[1] text-primary/40 whitespace-pre select-none text-right block"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
    >
      {lines.join('\n')}
    </pre>
  )
}

// ─── Bento Grid ASCII Backgrounds ──────────────────────────────────
function DockerASCII() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const w = 60
    const h = 16
    const interval = setInterval(() => {
      frame++
      const result: string[] = []
      for (let y = 0; y < h; y++) {
        let row = ''
        for (let x = 0; x < w; x++) {
          const stackIdx = Math.floor(x / 10)
          const lx = x % 10
          if (lx >= 1 && lx <= 8) {
            // We are inside a stack
            const sinVal = Math.sin(stackIdx * 1.2 + frame * 0.06)
            const containerCount = Math.floor(sinVal * 1.5 + 2.5) // 1 to 4 containers
            const hCells = containerCount * 3

            if (y >= h - hCells) {
              const localY = h - 1 - y
              const isTop = y === h - hCells
              const isDivider = localY % 3 === 0
              const isEdge = lx === 1 || lx === 8

              if (isTop) {
                row += '\u2584' // bottom half block
              } else if (isEdge) {
                row += '\u2588' // full block
              } else if (isDivider) {
                row += '\u2550' // double horizontal line
              } else {
                // Corrugated container body
                // Alternate light/dark vertical ridges
                const ridge = (lx % 2 === 0)
                const pulse = Math.sin(x * 0.2 - frame * 0.08) > 0.2
                if (ridge) {
                  row += pulse ? '\u2588' : '\u2593'
                } else {
                  row += pulse ? '\u2592' : '\u2591'
                }
              }
              continue
            }
          }
          row += ' '
        }
        result.push(row)
      }
      setLines(result)
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute top-0 right-0 bottom-0 w-full md:w-1/2 flex items-center justify-end pointer-events-none opacity-[0.12] overflow-hidden">
      <pre 
        className="text-[10px] md:text-[12px] leading-[1.1] text-primary whitespace-pre select-none pr-8"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}

function CloudASCII() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const cols = 28
    const rows = 14
    const interval = setInterval(() => {
      frame++
      const result: string[] = []
      for (let y = 0; y < rows; y++) {
        let row = ''
        for (let x = 0; x < cols; x++) {
          // Clean, geometric rippling node grid
          const dx = x - cols / 2
          const dy = y - rows / 2
          const dist = Math.sqrt(dx * dx + (dy * 2.5) ** 2) // stretch Y for isometric feel

          const ripple = Math.sin(dist * 0.6 - frame * 0.15)

          if (ripple > 0.6) row += ' ✦ '
          else if (ripple > 0.1) row += ' + '
          else if (ripple > -0.5) row += ' · '
          else row += '   '
        }
        result.push(row)
      }
      setLines(result)
    }, 80)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-end pointer-events-none opacity-[0.20] overflow-hidden">
      <pre 
        className="text-[9px] md:text-[11px] leading-[1.3] text-primary whitespace-pre select-none pr-8"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}

function CircuitASCII() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    let frame = 0
    const w = 8 // 8 columns of hex pairs
    const h = 14
    const hexChars = '0123456789ABCDEF'

    // Pre-generate a static memory block
    const mem = Array.from({ length: h * w * 2 }, () => hexChars[Math.floor(Math.random() * 16)])

    const interval = setInterval(() => {
      frame++
      const result: string[] = []

      for (let y = 0; y < h; y++) {
        let row = `0x${(y * 16).toString(16).padStart(4, '0').toUpperCase()}  `
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 2

          // Randomly mutate some bytes to simulate active memory dumping
          if (Math.random() > 0.96) {
            mem[idx] = hexChars[Math.floor(Math.random() * 16)]
            mem[idx + 1] = hexChars[Math.floor(Math.random() * 16)]
          }

          row += `${mem[idx]}${mem[idx + 1]} `
        }

        // Add ASCII representation string on the right
        row += ' '
        for (let x = 0; x < w; x++) {
          const charCode = parseInt(mem[(y * w + x) * 2] + mem[(y * w + x) * 2 + 1], 16)
          // Printable ascii range
          if (charCode >= 33 && charCode <= 126) {
            row += String.fromCharCode(charCode)
          } else {
            row += '.'
          }
        }

        result.push(row)
      }
      setLines(result)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 flex items-center justify-end pointer-events-none opacity-[0.25] overflow-hidden">
      <pre 
        className="text-[10px] md:text-[12px] leading-[1.3] text-primary whitespace-pre select-none pr-8"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}

function MatrixRain({ color = 'text-primary/30' }: { color?: string }) {
  const [content, setContent] = useState('')

  useEffect(() => {
    const cols = 60
    const rows = 25
    const drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * rows))
    const chars = '01ANSEIN{}<>[]/:;!@#$%^&*()THREAT'

    const interval = setInterval(() => {
      const grid: string[][] = Array.from({ length: rows }, () => new Array(cols).fill(' '))
      for (let c = 0; c < cols; c++) {
        const head = drops[c]
        for (let t = 0; t < 8; t++) {
          const r = head - t
          if (r >= 0 && r < rows) {
            grid[r][c] = chars[Math.floor(Math.random() * chars.length)]
          }
        }
        drops[c]++
        if (drops[c] > rows + 10 && Math.random() > 0.95) {
          drops[c] = 0
        }
      }
      setContent(grid.map(row => row.join('')).join('\n'))
    }, 80)

    return () => clearInterval(interval)
  }, [])

  return (
    <pre 
      className={`text-[10px] md:text-[12px] leading-[1.15] whitespace-pre select-none ${color}`}
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
    >
      {content}
    </pre>
  )
}

// Dummy high-detail dashboard for preview
function DummyDashboard() {
  const [time, setTime] = useState('14:44:00')
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const tInterval = setInterval(() => {
      const now = new Date()
      setTime(now.toTimeString().split(' ')[0])
    }, 1000)

    const pInterval = setInterval(() => {
      setPulse(p => !p)
    }, 1500)

    return () => {
      clearInterval(tInterval)
      clearInterval(pInterval)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-[10px] md:text-[11px] font-sans text-foreground/70 h-full select-none">
      {/* Left Column: Stats & Investigations */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 border-r border-border/50 pr-5">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-primary font-bold mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full bg-red-500 ${pulse ? 'animate-pulse' : ''}`} />
              Active Triage
            </div>
            <span className="text-foreground/30 text-[8px]">3 PENDING</span>
          </div>
          <div className="space-y-2">
            <div className="bg-card/[0.02] border border-border/50 p-2.5 rounded-sm hover:bg-card/[0.04] transition-colors cursor-pointer">
              <div className="flex justify-between mb-1.5 font-mono text-[9.5px]">
                <span className="text-foreground truncate max-w-[120px]">APT29_report.pdf</span>
                <span className="text-[8px] text-red-400 font-bold bg-red-400/10 px-1.5 py-0.5 border border-red-400/20">CRITICAL</span>
              </div>
              <div className="w-full bg-card/5 h-1 rounded-full overflow-hidden">
                <div className="bg-red-400 h-full w-[85%]" />
              </div>
              <div className="text-[8px] text-foreground/40 mt-1.5 flex justify-between"><span>Risk Score: 85</span><span>T1059.001</span></div>
            </div>
            <div className="bg-card/[0.02] border border-border/50 p-2.5 rounded-sm hover:bg-card/[0.04] transition-colors cursor-pointer">
              <div className="flex justify-between mb-1.5 font-mono text-[9.5px]">
                <span className="text-foreground truncate max-w-[120px]">log_dump_tor.txt</span>
                <span className="text-[8px] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 border border-amber-400/20">HIGH</span>
              </div>
              <div className="w-full bg-card/5 h-1 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full w-[60%]" />
              </div>
              <div className="text-[8px] text-foreground/40 mt-1.5 flex justify-between"><span>Risk Score: 60</span><span>T1090.003</span></div>
            </div>
            <div className="bg-card/[0.02] border border-border/50 p-2.5 rounded-sm hover:bg-card/[0.04] transition-colors cursor-pointer">
              <div className="flex justify-between mb-1.5 font-mono text-[9.5px]">
                <span className="text-foreground truncate max-w-[120px]">payload_v2.dll</span>
                <span className="text-[8px] text-red-400 font-bold bg-red-400/10 px-1.5 py-0.5 border border-red-400/20">CRITICAL</span>
              </div>
              <div className="w-full bg-card/5 h-1 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full w-[95%]" />
              </div>
              <div className="text-[8px] text-foreground/40 mt-1.5 flex justify-between"><span>Risk Score: 95</span><span>T1105</span></div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest text-primary/60 font-bold mb-2">Sources Integration</div>
          <div className="space-y-1.5 font-mono text-[9px]">
            <div className="flex justify-between items-center">
              <span className="text-foreground/50">VirusTotal v3</span>
              <span className="text-primary font-bold">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-foreground/50">AbuseIPDB API</span>
              <span className="text-primary font-bold">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-foreground/50">Shodan API</span>
              <span className="text-primary font-bold">ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Column: Knowledge Graph & Alerts */}
      <div className="lg:col-span-6 flex flex-col gap-5">
        <div className="flex-1 min-h-[160px] border border-border/50 bg-border0 relative overflow-hidden flex flex-col p-3 rounded-sm shadow-inner">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[9px] uppercase tracking-widest text-primary/60 font-bold">Threat Knowledge Graph</div>
            <div className="text-[8px] font-mono text-foreground/40 flex gap-2"><span>N: 142</span><span>E: 308</span></div>
          </div>
          <div className="flex-1 flex items-center justify-center relative border border-border/50 bg-primary/5">
            {/* Grid Pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-30">
              <defs>
                <pattern id="graph-grid" width="15" height="15" patternUnits="userSpaceOnUse">
                  <path d="M 15 0 L 0 0 0 15" fill="none" stroke="rgba(20, 184, 166, 0.15)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#graph-grid)" />
            </svg>

            <svg className="w-full h-full max-h-[150px] relative z-10 drop-shadow-md" viewBox="0 0 300 130">
              {/* Complex Connection paths */}
              <line x1="150" y1="65" x2="80" y2="35" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1" strokeDasharray="3,3" />
              <line x1="150" y1="65" x2="220" y2="35" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1.5" />
              <line x1="150" y1="65" x2="110" y2="95" stroke="rgba(239, 68, 68, 0.5)" strokeWidth="2" />
              <line x1="150" y1="65" x2="190" y2="95" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1" />

              {/* Secondary connections */}
              <line x1="80" y1="35" x2="40" y2="60" stroke="rgba(20, 184, 166, 0.2)" strokeWidth="0.5" />
              <line x1="220" y1="35" x2="260" y2="70" stroke="rgba(20, 184, 166, 0.2)" strokeWidth="0.5" />
              <line x1="110" y1="95" x2="70" y2="110" stroke="rgba(239, 68, 68, 0.3)" strokeWidth="1" strokeDasharray="2,2" />
              <line x1="190" y1="95" x2="230" y2="120" stroke="rgba(20, 184, 166, 0.2)" strokeWidth="0.5" />
              <line x1="190" y1="95" x2="220" y2="35" stroke="rgba(20, 184, 166, 0.15)" strokeWidth="0.5" />

              {/* Graph nodes */}
              {/* Primary */}
              <circle cx="150" cy="65" r="7" fill="#14b8a6" className="animate-pulse" />
              <circle cx="80" cy="35" r="5" fill="#f59e0b" />
              <circle cx="220" cy="35" r="5" fill="#14b8a6" />
              <circle cx="110" cy="95" r="6" fill="#ef4444" />
              <circle cx="190" cy="95" r="5" fill="#14b8a6" />

              {/* Secondary */}
              <circle cx="40" cy="60" r="3" fill="#14b8a6" opacity="0.5" />
              <circle cx="260" cy="70" r="3" fill="#14b8a6" opacity="0.5" />
              <circle cx="70" cy="110" r="4" fill="#ef4444" opacity="0.6" />
              <circle cx="230" cy="120" r="3" fill="#14b8a6" opacity="0.5" />

              {/* Outer rings for visual density */}
              <circle cx="150" cy="65" r="14" fill="none" stroke="#14b8a6" strokeWidth="0.5" opacity="0.4" strokeDasharray="2,2" />
              <circle cx="110" cy="95" r="12" fill="none" stroke="#ef4444" strokeWidth="0.5" opacity="0.3" />

              {/* Text labels */}
              <text x="150" y="52" fill="currentColor" className="text-foreground" fontSize="8" textAnchor="middle" fontFamily="monospace" fontWeight="bold">Invest_09</text>
              <text x="80" y="24" fill="currentColor" className="text-foreground opacity-60" fontSize="7" textAnchor="middle" fontFamily="monospace">ioc_ip</text>
              <text x="220" y="24" fill="currentColor" className="text-foreground opacity-60" fontSize="7" textAnchor="middle" fontFamily="monospace">malware</text>
              <text x="110" y="111" fill="#ef4444" fontSize="8" textAnchor="middle" fontFamily="monospace" fontWeight="bold">APT29_Actor</text>
              <text x="190" y="111" fill="currentColor" className="text-foreground opacity-60" fontSize="7" textAnchor="middle" fontFamily="monospace">c2_domain</text>

              <text x="40" y="70" fill="currentColor" className="text-foreground opacity-40" fontSize="5" textAnchor="middle" fontFamily="monospace">asn_45</text>
              <text x="260" y="80" fill="currentColor" className="text-foreground opacity-40" fontSize="5" textAnchor="middle" fontFamily="monospace">dropper_file</text>
              <text x="70" y="120" fill="#ef4444" className="opacity-60" fontSize="5" textAnchor="middle" fontFamily="monospace">alias_cozy</text>
            </svg>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="text-[9px] uppercase tracking-widest text-primary/60 font-bold mb-2">Live Ingestion Stream</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[9px] border-collapse">
              <thead>
                <tr className="border-b border-border text-foreground/40">
                  <th className="pb-1.5 font-normal">ENTITY VALUE</th>
                  <th className="pb-1.5 font-normal">TYPE</th>
                  <th className="pb-1.5 font-normal">SOURCE</th>
                  <th className="pb-1.5 font-normal">REPUTATION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-foreground/60">
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">185.220.101.5</td>
                  <td className="py-2">ioc_ip</td>
                  <td className="py-2">AbuseIPDB</td>
                  <td className="py-2 text-red-400 font-bold">MALICIOUS (100%)</td>
                </tr>
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">cobalt-c2.net</td>
                  <td className="py-2">ioc_domain</td>
                  <td className="py-2">VirusTotal</td>
                  <td className="py-2 text-amber-400 font-bold">SUSPICIOUS (12/90)</td>
                </tr>
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">CVE-2024-3094</td>
                  <td className="py-2">vulnerability</td>
                  <td className="py-2">NVD</td>
                  <td className="py-2 text-red-500 font-bold">CRITICAL (CVSS 10)</td>
                </tr>
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">a94a8fe5ccb19ba...</td>
                  <td className="py-2">ioc_hash</td>
                  <td className="py-2">CrowdStrike</td>
                  <td className="py-2 text-red-400 font-bold">MALICIOUS</td>
                </tr>
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">sysadmin@corp.io</td>
                  <td className="py-2">identity</td>
                  <td className="py-2">Okta Logs</td>
                  <td className="py-2 text-amber-400 font-bold">ANOMALOUS LOGIN</td>
                </tr>
                <tr className="hover:bg-card/[0.02] transition-colors cursor-pointer">
                  <td className="py-2 text-teal-300">10.0.4.22</td>
                  <td className="py-2">internal_ip</td>
                  <td className="py-2">PaloAlto FW</td>
                  <td className="py-2 text-primary font-bold">CLEAN</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Column: AI Agent & SOAR */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 border-l border-border/50 pl-5">
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-primary/60 font-bold mb-2 flex items-center justify-between">
              <span>AI Copilot Analysis</span>
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_5px_#14b8a6]" />
            </div>
            <div className="bg-primary/5 border border-primary/20 p-3 rounded-sm text-[9.5px] text-primary font-mono leading-relaxed relative overflow-hidden">
              <div className="absolute top-0 left-0 w-0.5 h-full bg-primary" />
              <div className="space-y-2">
                <p className="opacity-70">&gt; Correlating 42 events across 3 sources...</p>
                <p className="opacity-70">&gt; TTP mapping to MITRE ATT&CK matrix...</p>
                <p>&gt; <span className="text-foreground bg-primary/20 px-1">ALERT:</span> Threat Actor identified as <strong className="text-foreground">APT29 (Cozy Bear)</strong> based on behavioral heuristic graph.</p>
                <p className="text-amber-400">&gt; Auto-mitigation workflow engaged.</p>
              </div>
            </div>
          </div>
          <div className="mt-3 text-right">
            <span className="text-[8px] font-mono text-foreground/30">model: gpt-4o-mini &bull; infer: 124ms &bull; t:{time}</span>
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest text-primary/60 font-bold mb-3">Playbooks Status</div>
          <div className="space-y-2 text-[9px] font-mono">
            <div className="flex justify-between items-center group cursor-default">
              <span className="text-foreground/60 group-hover:text-foreground transition-colors">Rule_Isolate_IP</span>
              <span className="text-primary font-bold bg-primary/10 px-1.5 py-0.5 border border-primary/20 rounded-xs">EXECUTED</span>
            </div>
            <div className="flex justify-between items-center group cursor-default">
              <span className="text-foreground/60 group-hover:text-foreground transition-colors">Rule_Slack_Notify</span>
              <span className="text-primary font-bold bg-primary/10 px-1.5 py-0.5 border border-primary/20 rounded-xs">EXECUTED</span>
            </div>
            <div className="flex justify-between items-center group cursor-default">
              <span className="text-foreground/60 group-hover:text-foreground transition-colors">Rule_Block_Domain</span>
              <span className="text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 border border-amber-400/20 rounded-xs animate-pulse">PENDING</span>
            </div>
            <div className="flex justify-between items-center group cursor-default">
              <span className="text-foreground/60 group-hover:text-foreground transition-colors">Rule_STIX_Export</span>
              <span className="text-foreground/40 font-bold bg-card/5 px-1.5 py-0.5 border border-border rounded-xs">IDLE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    // 1. Hero Mount Animation
    gsap.from('.gsap-hero-title', {
      y: 50,
      opacity: 0,
      duration: 1.5,
      ease: 'power4.out',
      delay: 0.2
    })
    gsap.from('.gsap-hero-desc', {
      y: 30,
      opacity: 0,
      duration: 1.5,
      ease: 'power4.out',
      delay: 0.4
    })
    gsap.from('.gsap-hero-btns', {
      y: 20,
      opacity: 0,
      duration: 1.5,
      ease: 'power4.out',
      delay: 0.6
    })

    // 2. Dashboard Parallax & Perspective Scale
    gsap.from('.gsap-dashboard-container', {
      scrollTrigger: {
        trigger: '.gsap-dashboard-section',
        start: 'top 85%',
        end: 'top 20%',
        scrub: 1,
      },
      y: 150,
      scale: 0.9,
      opacity: 0.2,
      rotateX: 15,
      transformPerspective: 1000,
      ease: 'power2.out'
    })

    gsap.to('.gsap-matrix-bg', {
      scrollTrigger: {
        trigger: '.gsap-dashboard-section',
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
      y: 200,
      ease: 'none'
    })

    // 3. Bento Grid Sequential Stagger
    gsap.from('.gsap-bento-content', {
      scrollTrigger: {
        trigger: '.gsap-bento-section',
        start: 'top 75%',
      },
      y: 50,
      opacity: 0,
      duration: 1,
      stagger: 0.2,
      ease: 'power3.out'
    })

    // 4. Features Horizontal Scroll
    const featuresWrap = document.querySelector('.gsap-features-wrapper') as HTMLElement
    if (featuresWrap) {
      gsap.to('.gsap-features-wrapper', {
        x: () => -(featuresWrap.scrollWidth - window.innerWidth),
        ease: 'none',
        scrollTrigger: {
          trigger: '.gsap-features-section',
          start: 'top top',
          end: () => '+=' + featuresWrap.scrollWidth,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
        }
      })
    }

    // 5. Huge Typography Horizontal Parallax
    gsap.to('.gsap-huge-text', {
      scrollTrigger: {
        trigger: '.gsap-huge-text-section',
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
      xPercent: -15,
      ease: 'none'
    })

  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="min-h-screen font-serif selection:bg-primary selection:text-foreground bg-background text-foreground overflow-x-hidden">

      <main className="relative z-10 bg-background mb-[100vh] shadow-[0_20px_100px_rgba(0,0,0,0.1)]">
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <header className="w-full px-6 md:px-12 py-6 flex items-center justify-between text-[10px] md:text-[11px] font-sans uppercase tracking-[0.2em]">
          <div className="flex items-center gap-6 md:gap-12">
            <img 
              src="/logo.svg" 
              alt="AnseIn Logo" 
              className="w-5 h-5 md:w-6 md:h-6 brightness-0 dark:invert opacity-90 transition-all" 
            />
            <div className="flex gap-8 md:gap-12">
              <Link href="/app" className="hover:text-primary transition-colors">App</Link>
              <a href="https://github.com/rfypych/ansein" className="hover:text-primary transition-colors hidden sm:block">Github</a>
            </div>
          </div>

          <Link href="/" className="flex flex-col items-center">
            <span className="text-base md:text-lg font-serif tracking-[0.05em]">ANSEIN</span>
            <span className="text-[7px] tracking-[0.3em] opacity-50 mt-0.5">PLATFORM</span>
          </Link>

          <div className="flex gap-8 md:gap-10 items-center">
            <a href="#features" className="hover:text-primary transition-colors hidden sm:block">Features</a>
            <Link href="/register" className="hover:text-primary transition-colors">Start &rarr;</Link>
            <ThemeToggle />
          </div>
        </header>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <section className="relative px-6 md:px-12 pt-16 pb-32 overflow-hidden">
          {/* Full-width wave background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 text-lg">
          <AnimatedWave />
        </div>
          {/* Gradient overlay so text stays readable */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />

          <div className="relative z-10 max-w-[1400px] mx-auto w-full">
            <p className="text-[9px] font-sans uppercase tracking-[0.3em] text-primary mb-8">
              Open Source &bull; Self-Hosted &bull; LLM-Powered
            </p>
            <h1 className="gsap-hero-title text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-serif leading-[0.9] tracking-tight mb-12">
              THREAT<br />
              INTELLIGENCE<br />
              <span className="text-primary">PLATFORM</span>
            </h1>
            <p className="gsap-hero-desc font-sans text-sm md:text-base text-foreground-muted max-w-md leading-relaxed mb-12">
              Extract IOCs. Enrich with OSINT. Visualise threat graphs.
              Generate reports. All from a single investigation workspace.
            </p>

            <div className="gsap-hero-btns flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="bg-primary text-primary-foreground font-sans text-xs font-bold uppercase tracking-widest px-8 py-4 hover:bg-primary/90 transition-colors flex items-center gap-3"
              >
                Get Started <ArrowRight weight="bold" className="w-4 h-4" />
              </Link>
              <a
                href="https://github.com/rfypych/ansein"
                className="border border-border font-sans text-xs uppercase tracking-widest px-8 py-4 hover:border-primary/50 hover:text-primary transition-colors flex items-center gap-3"
              >
                <GithubLogo weight="duotone" className="w-5 h-5" /> Source Code
              </a>
            </div>
          </div>
        </section>

        {/* ── TERMINAL DEMO ──────────────────────────────────────── */}
        <section className="gsap-dashboard-section relative w-full py-32 flex items-center justify-center px-6">
          {/* Background matrix rain */}
          <div className="gsap-matrix-bg absolute -top-[30%] -bottom-[30%] left-0 right-0 overflow-hidden flex items-center justify-center opacity-[0.05] pointer-events-none">
            <MatrixRain color="text-primary" />
          </div>

          <div className="gsap-dashboard-container z-10 w-full max-w-5xl relative">
            {/* Subtle glow behind the terminal */}
            <div className="absolute -inset-1 bg-primary/10 blur-2xl rounded-lg pointer-events-none" />

            {/* Decorative telemetry header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-2 sm:gap-0 mb-4 px-2 text-[9px] font-sans uppercase tracking-[0.2em] text-primary/60">
              <div className="flex gap-4">
                <span>[STAT: ACTIVE]</span>
                <span>[NET: SECURE]</span>
              </div>
              <span>NODE::GLOBAL_01</span>
            </div>

            {/* Terminal chrome (Brutalist/Hermes Style) */}
            <div className="border border-border bg-card shadow-[0_40px_100px_rgba(0,0,0,0.4)] relative">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card/[0.02]">
                <div className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-sans text-primary font-bold flex items-center gap-2 sm:gap-3 overflow-hidden">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                  <span className="truncate">SYSTEM :: ANSEIN_DASHBOARD</span>
                </div>
                <div className="flex gap-2 sm:gap-3 text-[10px] font-mono text-foreground/30 tracking-widest select-none flex-shrink-0">
                  <span className="hover:text-primary cursor-pointer transition-colors">[ _ ]</span>
                  <span className="hover:text-primary cursor-pointer transition-colors">[ + ]</span>
                  <span className="hover:text-primary cursor-pointer transition-colors">[ X ]</span>
                </div>
              </div>
              <div className="p-4 sm:p-6 md:p-8 min-h-[150px] md:min-h-[320px]">
                <DummyDashboard />
              </div>
            </div>
          </div>
        </section>

        {/* ── DEPLOYMENT OPTIONS — BENTO GRID ────────────────────── */}
        <section className="gsap-bento-section relative w-full py-16 md:py-24 px-6 md:px-12 overflow-hidden border-y border-border">
          <div className="max-w-[1400px] mx-auto">
            <div className="mb-12 md:mb-16">
              <p className="text-[9px] font-sans uppercase tracking-[0.3em] text-primary mb-4">Deploy Anywhere</p>
              <h2 className="text-3xl md:text-5xl font-serif tracking-tight leading-[1.1]">
                Your infrastructure,<br />your rules.
              </h2>
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-card/10">
              {/* Docker — spans full width on top */}
              <div className="group relative bg-card p-8 md:p-12 md:col-span-2 overflow-hidden cursor-pointer">
                <div className="gsap-bento-content w-full h-full relative z-10 flex flex-col md:block">
                  {/* ASCII: animated container stacks */}
                  <DockerASCII />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 flex items-center justify-center border border-border bg-card/[0.03] group-hover:border-primary/40 transition-colors">
                        <Cube weight="duotone" className="w-7 h-7 text-primary" />
                      </div>
                      <div className="h-px flex-1 bg-card/10 group-hover:bg-primary/20 transition-colors" />
                      <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-foreground-muted group-hover:text-primary/70 transition-colors">Recommended</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-serif tracking-tight mb-3 group-hover:text-primary transition-colors">Docker Container</h3>
                    <p className="font-sans text-sm text-foreground-muted max-w-md mb-6 group-hover:text-foreground/80 transition-colors">
                      Production-ready containerised deployment. One command to spin up the entire stack with PostgreSQL, Redis, and the AnseIn engine.
                    </p>
                    <div className="font-mono text-[11px] text-primary bg-primary/10 border border-primary/20 group-hover:border-primary/40 px-4 py-2.5 inline-block transition-colors">
                      $ docker compose up -d
                    </div>
                  </div>
                </div>
              </div>

              {/* Cloud Native — bottom left */}
              <div className="group relative bg-card p-8 md:p-12 overflow-hidden cursor-pointer">
                <div className="gsap-bento-content w-full h-full relative z-10 flex flex-col md:block">
                  {/* ASCII: floating cloud particles */}
                  <CloudASCII />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 flex items-center justify-center border border-border bg-card/[0.03] group-hover:border-primary/40 transition-colors">
                        <Cloud weight="duotone" className="w-7 h-7 text-primary" />
                      </div>
                      <div className="h-px flex-1 bg-card/10 group-hover:bg-primary/20 transition-colors" />
                      <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-foreground-muted">02</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-serif tracking-tight mb-3 group-hover:text-primary transition-colors">Cloud Native</h3>
                    <p className="font-sans text-sm text-foreground-muted mb-6 group-hover:text-foreground/80 transition-colors">
                      One-click deploy to Vercel, Railway, or AWS. Serverless-ready with zero config.
                    </p>
                    <div className="font-mono text-[11px] text-primary bg-primary/10 border border-primary/20 group-hover:border-primary/40 px-4 py-2.5 inline-block transition-colors">
                      $ vercel deploy --prod
                    </div>
                  </div>
                </div>
              </div>

              {/* Bare Metal — bottom right */}
              <div className="group relative bg-card p-8 md:p-12 overflow-hidden cursor-pointer">
                <div className="gsap-bento-content w-full h-full relative z-10 flex flex-col md:block">
                  {/* ASCII: circuit board traces */}
                  <CircuitASCII />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 flex items-center justify-center border border-border bg-card/[0.03] group-hover:border-primary/40 transition-colors">
                        <HardDrives weight="duotone" className="w-7 h-7 text-primary" />
                      </div>
                      <div className="h-px flex-1 bg-card/10 group-hover:bg-primary/20 transition-colors" />
                      <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-foreground-muted">03</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-serif tracking-tight mb-3 group-hover:text-primary transition-colors">Bare Metal</h3>
                    <p className="font-sans text-sm text-foreground-muted mb-6 group-hover:text-foreground/80 transition-colors">
                      Full control. Clone the repo, configure your environment, and run directly on your hardware.
                    </p>
                    <div className="font-mono text-[11px] text-primary bg-primary/10 border border-primary/20 group-hover:border-primary/40 px-4 py-2.5 inline-block transition-colors">
                      $ git clone &amp;&amp; npm run dev
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES HORIZONTAL SCROLL ─────────────────────────── */}
        <section id="features" className="gsap-features-section relative z-20 bg-background text-foreground h-[100vh] overflow-hidden border-b border-border flex flex-col justify-center">
          
          {/* Ambient ASCII Background */}
          <div className="absolute inset-0 flex items-start justify-end pt-2 md:pt-6 pointer-events-none select-none z-0 opacity-40 overflow-hidden text-primary">
            <AnimatedGlobe />
          </div>

          <div className="relative z-10 w-full shrink-0 max-w-[1400px] mx-auto px-6 md:px-12 mb-10 md:mb-16">
            <div className="max-w-xl">
              <p className="text-[9px] font-sans uppercase tracking-[0.3em] text-primary mb-4">Features</p>
              <h2 className="text-4xl md:text-5xl font-serif tracking-tight leading-[1.1]">
                Everything you need for threat intelligence.
              </h2>
            </div>
          </div>

          <div className="relative z-10 w-full">
            <div className="gsap-features-wrapper flex gap-4 md:gap-8 px-6 md:px-12 w-max">
              {FEATURES.map((f, i) => (
                <div key={i} className="group relative bg-card p-8 md:p-12 overflow-hidden flex flex-col items-start cursor-pointer w-[85vw] md:w-[450px] h-[350px] shrink-0 border border-border hover:border-primary/30 transition-colors shadow-sm hover:shadow-xl">
                  {/* Hover subtle glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/[0.03] group-hover:to-transparent transition-colors opacity-0 group-hover:opacity-100 pointer-events-none" />

                  <div className="gsap-feature-content w-full h-full flex flex-col items-start relative z-10">
                    <div className="flex items-center gap-4 mb-8 relative z-10 w-full">
                      <div className="w-12 h-12 flex items-center justify-center border border-border bg-border group-hover:border-primary/40 transition-colors">
                        <f.icon weight="duotone" className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1 h-px bg-card/10 group-hover:bg-primary/30 transition-colors" />
                      <span className="text-[9px] font-sans uppercase tracking-[0.2em] text-foreground-muted group-hover:text-primary transition-colors">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-serif leading-[1.1] tracking-tight mb-3 whitespace-pre-line group-hover:text-primary transition-colors relative z-10">
                      {f.title}
                    </h3>
                    <p className="font-sans text-sm leading-relaxed text-foreground-muted group-hover:text-foreground/80 transition-colors relative z-10">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* ── FIXED REVEAL FOOTER ───────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full h-[100vh] z-0 bg-background flex flex-col justify-between overflow-hidden">

        {/* Top Section (White) */}
        <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
          {/* Animated ASCII Background covering the entire white area */}
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none z-0 text-primary">
            <AnimatedTopo />
          </div>

          {/* CTA Content */}
          <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 pt-24">
            <p className="text-[10px] font-sans font-bold uppercase tracking-[0.4em] mb-4 text-primary/80">
              FREE &bull; PLUS &bull; SUPER &bull; ULTRA
            </p>
            <h2 className="text-5xl md:text-7xl font-serif tracking-tight mb-8 leading-[1.1] text-foreground">
              Ready to extract<br />intelligence?
            </h2>
            <div className="flex flex-col sm:flex-row gap-6 justify-center w-full max-w-md">
              <Link
                href="/register"
                className="bg-primary text-primary-foreground font-sans text-xs font-bold uppercase tracking-widest px-8 py-5 hover:bg-primary/90 hover:scale-105 transition-all w-full sm:w-auto shadow-xl"
              >
                View All Our Plans
              </Link>
            </div>
          </div>

          {/* Huge Watermark (Seamless Merge) */}
          <div className="w-full flex justify-center items-end px-6 relative z-10 pointer-events-none select-none overflow-hidden translate-y-[calc(3%+5px)]">
            {/* Removed artificial horizontal scaling to preserve the font's beautiful natural high-contrast strokes. Tightened tracking to match Hermes. */}
            <h1 className="text-[25vw] leading-[0.72] font-serif tracking-tighter whitespace-nowrap text-primary origin-bottom font-light">
              ANSEIN
            </h1>
          </div>
        </div>

        {/* Footer Links (Solid Blue) */}
        <footer className="relative z-20 w-full px-6 md:px-12 py-8 bg-primary">
          {/* Animated ASCII Background inside the blue footer */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none select-none z-0 overflow-hidden">
            <AnimatedTopo />
          </div>

          <div className="relative z-10 max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
            <span className="font-sans text-[9px] md:text-[10px] uppercase tracking-[0.2em] font-bold text-primary-foreground/70 text-center md:text-left">
              &copy; 2026 AnseIn &mdash; Open Source Threat Intelligence
            </span>
            <div className="flex flex-wrap justify-center md:justify-end gap-6 md:gap-8 font-sans text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/60">
              <a href="https://github.com/rfypych/ansein" className="hover:text-primary-foreground transition-colors">Github</a>
              <Link href="/login" className="hover:text-primary-foreground transition-colors">Login</Link>
              <Link href="/register" className="hover:text-primary-foreground transition-colors">Register</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
