'use client'

import { useState } from 'react'
import { CheckCircle, Circle, CaretDown, CaretUp, ListChecks } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface TodoTask {
  id: number
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
}

interface TodoWidgetProps {
  tasks: TodoTask[]
  isStreaming?: boolean
}

export function TodoWidget({ tasks: initialTasks, isStreaming }: TodoWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [tasks, setTasks] = useState<TodoTask[]>(initialTasks || [])

  // Update internal state when streaming updates tasks
  if (isStreaming && initialTasks.length > tasks.length) {
    setTasks(initialTasks)
  }

  const toggleTask = async (task: TodoTask) => {
    if (isStreaming) return // Disallow interaction while streaming
    
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))

    try {
      const res = await fetch(`/api/v1/copilot/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!res.ok) throw new Error('Failed to update task')
    } catch (e) {
      // Revert on error
      toast.error('Failed to update task status')
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t))
    }
  }

  const completedCount = tasks.filter(t => t.status === 'done').length
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#161618] shadow-lg max-w-full font-sans">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between bg-white/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10"
      >
        <div className="flex items-center gap-3 text-zinc-200">
          <ListChecks weight="duotone" className="h-5 w-5 text-indigo-400" />
          <span>Investigation Plan</span>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300">
              {tasks.length} tasks
            </span>
            {isStreaming && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
            <span>{progress}%</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
              <div 
                className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {isExpanded ? <CaretUp weight="bold" className="text-zinc-500" /> : <CaretDown weight="bold" className="text-zinc-500" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-white/5 border-t border-white/5 bg-[#1C1C1F]">
              {tasks.map((task) => (
                <div 
                  key={task.id || Math.random()} 
                  className={cn(
                    "group flex items-start gap-3 p-4 transition-colors hover:bg-white/[0.02]",
                    task.status === 'done' ? "opacity-60" : ""
                  )}
                >
                  <button 
                    onClick={() => toggleTask(task)}
                    disabled={isStreaming}
                    className="mt-0.5 flex-shrink-0 transition-transform active:scale-95 disabled:cursor-not-allowed"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle weight="fill" className="h-5 w-5 text-indigo-500" />
                    ) : (
                      <Circle weight="bold" className="h-5 w-5 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                    )}
                  </button>
                  <div className="flex flex-col gap-1">
                    <span className={cn(
                      "text-sm font-medium transition-colors",
                      task.status === 'done' ? "text-zinc-500 line-through" : "text-zinc-200"
                    )}>
                      {task.title}
                    </span>
                    {task.description && (
                      <span className="text-xs text-zinc-500 leading-relaxed">
                        {task.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {tasks.length === 0 && !isStreaming && (
                <div className="p-8 text-center text-sm text-zinc-500">
                  No tasks generated.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
