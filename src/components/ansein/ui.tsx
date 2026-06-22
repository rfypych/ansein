'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/* ----------------------------------------------------------- Badge */
type BadgeColor =
  | 'slate'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet'

const badgeColors: Record<BadgeColor, string> = {
  slate: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  primary: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
  accent: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  warning: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  danger: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  info: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
}

export function Badge({
  children,
  color = 'slate',
  dot = false,
  className,
}: {
  children: ReactNode
  color?: BadgeColor
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest',
        badgeColors[color],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------- SeverityMeter */
export function SeverityMeter({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const safe = Math.min(100, Math.max(0, score))
  const tier = safe >= 70 ? 'HIGH' : safe >= 40 ? 'MEDIUM' : safe > 0 ? 'LOW' : 'NONE'
  const color =
    safe >= 70 ? '#f43f5e' : safe >= 40 ? '#f59e0b' : safe > 0 ? '#10b981' : '#64748b'

  const dims =
    size === 'lg'
      ? { bar: 'h-2', num: 'text-2xl', label: 'text-xs' }
      : size === 'sm'
      ? { bar: 'h-1', num: 'text-sm', label: 'text-[10px]' }
      : { bar: 'h-1.5', num: 'text-lg', label: 'text-[11px]' }

  return (
    <div className="flex items-center gap-3">
      <div className={cn('font-semibold ansein-mono', dims.num)} style={{ color }}>
        {safe.toFixed(0)}
      </div>
      <div className="flex flex-col gap-1">
        <div className={cn('w-20 rounded-full bg-[var(--ansein-border)]', dims.bar)}>
          <div
            className={cn('h-full rounded-full transition-all', dims.bar)}
            style={{ width: `${safe}%`, background: color }}
          />
        </div>
        <span className={cn('uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono', dims.label)}>
          {tier}
        </span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- EmptyState */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = 'default',
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  variant?: 'default' | 'branded'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex h-14 w-14 items-center justify-center rounded-full border',
            variant === 'branded'
              ? 'bg-gradient-to-br from-[var(--ansein-primary)]/15 to-transparent border-[var(--ansein-primary)]/30 ansein-glow'
              : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)]'
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--ansein-text)]">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-[var(--ansein-text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ----------------------------------------------------------- SectionHeader */
export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--ansein-border)]">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-[var(--ansein-text)] tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-[var(--ansein-text-muted)] mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}

/* ----------------------------------------------------------- Spinner */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 rounded-full border-2 border-[var(--ansein-border-strong)] border-t-[var(--ansein-primary)] ansein-spin',
        className
      )}
    />
  )
}

/* ----------------------------------------------------------- KbdHint */
export function KbdHint({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

/* ----------------------------------------------------------- AnimatedNumber */
export function AnimatedNumber({
  value,
  duration = 800,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const previousValue = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const from = previousValue.current
    const to = value
    const delta = to - from

    if (delta === 0) return

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / duration)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(from + delta * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        previousValue.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return (
    <span className={cn('ansein-mono tabular-nums', className)}>
      {displayValue.toLocaleString()}
    </span>
  )
}

/* ----------------------------------------------------------- ProgressRing */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  color = '#14b8a6',
  label,
  sublabel,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ansein-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && (
          <span className="text-base font-semibold ansein-mono text-[var(--ansein-text)]">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-[9px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- Sparkline */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = '#14b8a6',
  fillOpacity = 0.15,
  strokeWidth = 1.5,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  fillOpacity?: number
  strokeWidth?: number
}) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const stepX = data.length > 1 ? width / (data.length - 1) : 0
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const pathD = points
    .map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`))
    .join(' ')
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`
  const lastPoint = points[points.length - 1]

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-grad-${color.replace('#', '')})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint && (
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} fill={color} />
      )}
    </svg>
  )
}

/* ----------------------------------------------------------- DonutChart */
export function DonutChart({
  data,
  size = 140,
  strokeWidth = 18,
  centerLabel,
  centerSublabel,
}: {
  data: Array<{ label: string; value: number; color: string }>
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerSublabel?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ansein-border)"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        {/* Stacked segments */}
        {total > 0 && data.map((d, i) => {
          const fraction = d.value / total
          const dash = fraction * circumference
          const segment = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              className="transition-all duration-700"
              style={{ strokeLinecap: 'butt' }}
            />
          )
          offset += dash
          return segment
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerLabel && (
          <span className="text-xl font-semibold ansein-mono text-[var(--ansein-text)]">
            {centerLabel}
          </span>
        )}
        {centerSublabel && (
          <span className="text-[9px] uppercase tracking-widest text-[var(--ansein-text-dim)] mt-0.5">
            {centerSublabel}
          </span>
        )}
      </div>
    </div>
  )
}
