import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db'

export function getAgentTools({ sessionId }: { sessionId: number }) {
  return {
    create_task: tool({
      description: 'Create a new task in the agent\'s task list. Use this to break down complex requests into steps.',
      parameters: z.object({
        title: z.string().describe('Short, descriptive title for the task'),
        description: z.string().describe('Detailed description or notes about what needs to be done'),
      }),
      execute: async ({ title, description }) => {
        try {
          const task = await db.agentTask.create({
            data: {
              sessionId,
              title,
              description,
              status: 'todo',
            }
          })
          return { success: true, task: { id: task.id, title: task.title, status: task.status } }
        } catch (e) {
          return { error: `Failed to create task: ${e instanceof Error ? e.message : String(e)}` }
        }
      }
    }),

    list_tasks: tool({
      description: 'List all tasks currently assigned to this investigation/session.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const tasks = await db.agentTask.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' }
          })
          if (tasks.length === 0) return { result: 'No tasks found. You have a clean slate.' }
          return { tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, description: t.description })) }
        } catch (e) {
          return { error: `Failed to list tasks: ${e instanceof Error ? e.message : String(e)}` }
        }
      }
    }),

    update_task_status: tool({
      description: 'Update the status of an existing task.',
      parameters: z.object({
        task_id: z.number().describe('The ID of the task to update'),
        status: z.enum(['todo', 'in_progress', 'done']).describe('The new status of the task'),
      }),
      execute: async ({ task_id, status }) => {
        try {
          const existing = await db.agentTask.findFirst({ where: { id: task_id, sessionId } })
          if (!existing) return { error: `Task ID ${task_id} not found in this session.` }

          const updated = await db.agentTask.update({
            where: { id: task_id },
            data: { status }
          })
          return { success: true, task: { id: updated.id, title: updated.title, status: updated.status } }
        } catch (e) {
          return { error: `Failed to update task: ${e instanceof Error ? e.message : String(e)}` }
        }
      }
    }),
  }
}
