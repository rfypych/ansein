import Link from 'next/link'
import { ArrowLeft, Home, FolderSearch } from 'lucide-react'
import { Brand } from '@/components/ansein/brand'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #14b8a6 1px, transparent 1px), linear-gradient(to bottom, #14b8a6 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, black, transparent)',
        }}
      />
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <Brand size={36} />
        </div>
        <div className="bg-card border border-border rounded-xl p-10 max-w-md">
          <p className="ansein-mono text-[10px] uppercase tracking-widest text-rose-400 mb-2">
            Error 404
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-3">
            Signal lost
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            The page you're looking for doesn't exist, has been moved, or you don't have permission
            to view it.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to app
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
