/**
 * Shared source-intake persistence: PII-redact, store, audit.
 * Used by both text intake and file-upload intake so the two paths can
 * never drift apart (same redaction, same hashing, same audit shape).
 */
import { db } from '@/lib/db'
import { contentHash } from '@/lib/engines/extraction'
import { redactPII } from '@/lib/pii-redact'

export interface SourceIntakeInput {
  sourceType: string
  title: string
  content: string
  mimeType: string
}

export async function persistSource(
  invId: number,
  userId: number,
  ip: string,
  input: SourceIntakeInput
) {
  // PII auto-redaction: scan content before persistence. The original
  // text is discarded — only the redacted payload ever reaches the DB or
  // downstream extraction/LLM stages.
  const piiResult = redactPII(input.content)
  const content = piiResult.redacted
  const piiNote =
    piiResult.found > 0
      ? `[PII REDACTED: ${piiResult.found} items]`
      : ''
  const title = piiNote
    ? input.title
      ? `${input.title} ${piiNote}`
      : piiNote
    : input.title

  const s = await db.source.create({
    data: {
      investigationId: invId,
      sourceType: input.sourceType,
      title,
      content,
      contentHash: contentHash(content),
      mimeType: input.mimeType,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    },
  })
  // Audit: source added (redaction count logged in metadata)
  await db.auditLog.create({
    data: {
      userId,
      action: 'source.add',
      targetType: 'investigation',
      targetId: invId,
      ipAddress: ip,
      extraMetadata: {
        investigation_id: invId,
        source_id: s.id,
        source_type: s.sourceType,
        size_bytes: s.sizeBytes,
        pii_redacted_count: piiResult.found,
        pii_redacted_types: piiResult.types,
      },
    },
  }).catch(() => {})
  return s
}
