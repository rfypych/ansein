/**
 * Loading skeletons for various content types.
 * Replaces spinners for a more polished loading experience.
 */
import { cn } from '@/lib/utils'

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'ansein-card rounded-xl p-5 space-y-3',
        className
      )}
    >
      <div className="h-4 w-24 ansein-shimmer rounded" />
      <div className="h-3 w-full ansein-shimmer rounded" />
      <div className="h-3 w-2/3 ansein-shimmer rounded" />
      <div className="flex gap-2 pt-2">
        <div className="h-5 w-12 ansein-shimmer rounded" />
        <div className="h-5 w-16 ansein-shimmer rounded" />
      </div>
    </div>
  )
}

export function InvestigationCardSkeleton() {
  return (
    <div className="ansein-card rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-32 ansein-shimmer rounded" />
        <div className="h-5 w-16 ansein-shimmer rounded" />
      </div>
      <div className="h-3 w-full ansein-shimmer rounded" />
      <div className="h-3 w-4/5 ansein-shimmer rounded" />
      <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-[var(--ansein-border)]">
        <div className="h-8 ansein-shimmer rounded" />
        <div className="h-8 ansein-shimmer rounded" />
        <div className="h-8 ansein-shimmer rounded" />
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="h-3 w-20 ansein-shimmer rounded" />
        <div className="h-3 w-16 ansein-shimmer rounded" />
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="mb-8 space-y-2">
        <div className="h-3 w-32 ansein-shimmer rounded" />
        <div className="h-7 w-64 ansein-shimmer rounded" />
        <div className="h-3 w-96 ansein-shimmer rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 ansein-card rounded-xl p-6">
          <div className="h-4 w-40 ansein-shimmer rounded mb-4" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 ansein-shimmer rounded" />
                  <div className="h-2 w-1/3 ansein-shimmer rounded" />
                </div>
                <div className="h-3 w-12 ansein-shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
}

export function EntityCardSkeleton() {
  return (
    <div className="ansein-card rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 ansein-shimmer rounded-md" />
        <div className="flex-1 space-y-2">
          <div className="h-2 w-16 ansein-shimmer rounded" />
          <div className="h-3 w-full ansein-shimmer rounded" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-2 w-12 ansein-shimmer rounded" />
        <div className="h-2 w-10 ansein-shimmer rounded" />
      </div>
    </div>
  )
}
