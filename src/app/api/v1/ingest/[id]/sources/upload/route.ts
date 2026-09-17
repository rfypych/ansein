import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  created,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  getClientIp,
} from '@/lib/api'
import { persistSource } from '@/lib/services/source-intake'

export const dynamic = 'force-dynamic'

const UploadSchema = z.object({
  filename: z.string().max(255).optional().default('upload.txt'),
  mime_type: z.string().max(100).optional().default('application/octet-stream'),
  // ~5 MB binary -> ~6.8 MB base64
  content_b64: z.string().min(1).max(7_000_000),
  title: z.string().max(255).optional().default(''),
})

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * POST /ingest/[id]/sources/upload — file intake for the SourcesTab
 * "Upload file" button (which previously pointed at a route that did not
 * exist, so every upload failed). Accepts text-based files (.txt/.csv/.md/
 * .json/.log/.xml/.yaml and friends) decoded as UTF-8.
 *
 * Honest boundary: binary formats (PDF/DOCX/images) are rejected with 415.
 * There is no server-side document parser by design (it would need heavy
 * native deps on serverless); the error message says exactly what to do
 * instead (paste text or upload a text export).
 */
export const POST = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = UploadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }

  let buf: Buffer
  try {
    buf = Buffer.from(parsed.data.content_b64, 'base64')
  } catch {
    return jsonError(400, 'invalid_encoding', 'content_b64 is not valid base64')
  }
  if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
    return jsonError(413, 'too_large', 'File must be non-empty and at most 5 MB')
  }
  if (buf.includes(0)) {
    return jsonError(
      415,
      'binary_not_supported',
      'Binary files (PDF, DOCX, images) are not supported. Upload a text export (.txt, .csv, .md, .json, .log) or paste the text directly.'
    )
  }
  const content = buf.toString('utf8')
  if (!content.trim()) {
    return jsonError(422, 'empty_file', 'File contains no text content')
  }

  try {
    const s = await persistSource(invId, user.id, getClientIp(req), {
      sourceType: 'file',
      title: parsed.data.title || parsed.data.filename,
      content: content.slice(0, 2_000_000),
      mimeType: 'text/plain',
    })
    return created({
      id: s.id,
      investigation_id: s.investigationId,
      source_type: s.sourceType,
      title: s.title,
      content_hash: s.contentHash,
      mime_type: s.mimeType,
      size_bytes: s.sizeBytes,
      created_at: s.createdAt.toISOString(),
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
})
