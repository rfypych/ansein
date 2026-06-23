import { cn } from '@/lib/utils'

interface BrandProps {
  className?: string
  size?: number
  showWordmark?: boolean
  variant?: 'default' | 'mono' | 'compact'
}

/**
 * AnseIn brand mark — bold, professional, minimalist.
 *
 * Concept: A solid rounded-square app icon with a stylised "signal extraction"
 * motif. Three horizontal bars (data layers) converging into a single bright
 * node (extracted intelligence). The amber dot is the "insight" — the output
 * of the extraction pipeline.
 *
 * Bold enough to work as an app icon, clean enough for a sidebar.
 */
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="anseinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {/* Outer Hexagon Shield */}
      <path
        d="M200 24 L356 114 V286 L200 376 L44 286 V114 Z"
        fill="none"
        stroke="url(#anseinGrad)"
        strokeWidth="36"
        strokeLinejoin="round"
      />
      {/* Inner Stylized 'A' for AnseIn */}
      <path
        d="M200 110 L100 280 H160 L200 200 L240 280 H300 Z"
        fill="url(#anseinGrad)"
      />
      {/* Center Neural/Intelligence Node */}
      <circle cx="200" cy="270" r="24" fill="url(#anseinGrad)" />
    </svg>
  )
}

export function Brand({
  className,
  size = 32,
  showWordmark = true,
  variant = 'default',
}: BrandProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              'font-bold tracking-tight text-foreground',
              variant === 'compact' ? 'text-base' : 'text-lg'
            )}
          >
            Anse<span className="text-primary">In</span>
          </span>
          {!variant.includes('compact') && (
            <span className="ansein-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 mt-0.5">
              Threat Intelligence
            </span>
          )}
        </div>
      )}
    </div>
  )
}
