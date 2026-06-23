'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

/**
 * Markdown renderer with AnseIn-themed styling.
 * Supports GitHub-flavored markdown (tables, strikethrough, task lists, etc.)
 */
export function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null
  return (
    <div
      className={cn(
        'prose-ansein',
        'text-sm leading-relaxed text-foreground',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold text-foreground mt-5 mb-3 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-3 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 text-muted-foreground leading-relaxed">
              {children}
            </p>
          ),
          // Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Italic
          em: ({ children }) => (
            <em className="italic text-muted-foreground">{children}</em>
          ),
          // Inline code
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes('language-')
            if (isBlock) {
              return (
                <code className={cn('block ansein-mono text-xs', cls)}>
                  {children}
                </code>
              )
            }
            return (
              <code className="ansein-mono text-[11px] px-1.5 py-0.5 rounded bg-card border border-border text-primary">
                {children}
              </code>
            )
          },
          // Code blocks
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md bg-background border border-border p-3 my-3 text-xs ansein-mono">
              {children}
            </pre>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-none space-y-1.5 mb-3 last:mb-0 pl-4">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1.5 mb-3 last:mb-0 pl-5 marker:text-muted-foreground/50">
              {children}
            </ol>
          ),
          li: ({ children }) => {
            return (
              <li className="text-muted-foreground leading-relaxed relative pl-2">
                {children}
              </li>
            )
          },
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:text-primary/90 underline decoration-dotted underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-4 my-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="text-left py-2 px-3 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="py-2 px-3 border-b border-border text-muted-foreground">
              {children}
            </td>
          ),
          // Horizontal rule
          hr: () => (
            <hr className="my-4 border-border" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
