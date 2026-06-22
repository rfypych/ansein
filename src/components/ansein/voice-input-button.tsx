'use client'

/**
 * VoiceInputButton — speech-to-text mic button for chat inputs.
 *
 * Uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` API
 * (Chrome/Edge). Click to start listening, click again to stop. While
 * listening the button pulses red. Transcribed chunks are streamed into the
 * parent's input via `onTranscript` (interim) and `onFinal` (final).
 *
 * Gracefully degrades: when the API isn't available, the button renders
 * disabled with a tooltip "Voice input not supported in this browser".
 *
 * Errors (no-speech, not-allowed, audio-capture, network) surface as a brief
 * Sonner toast and reset the listening state.
 */
import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Minimal TS typings for the unprefixed/prefixed SpeechRecognition API.
// The DOM lib doesn't ship these by default.
interface SpeechRecognitionAlternativeLike {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
  message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

interface Props {
  /**
   * Called with each interim transcript chunk (latest cumulative chunk for
   * the current utterance). The parent typically appends/replaces the input.
   * We pass the *delta* since the last final result so the parent can append
   * without duplicating.
   */
  onTranscript?: (text: string) => void
  /** Called once when the recognition engine finalises a phrase. */
  onFinal?: (text: string) => void
  /** Optional tooltip override when speech recognition is unsupported. */
  unsupportedTitle?: string
  /** Tailwind classes for sizing/colour. Defaults to a 9x9 square. */
  className?: string
  /** Disable the button (e.g. while a request is in flight). */
  disabled?: boolean
}

// useSyncExternalStore adapters for client-only feature detection.
// `getServerSnapshot` returns false during SSR; the client snapshot returns
// true if window.SpeechRecognition (or webkit-prefixed) exists. This avoids
// hydration mismatches and the "setState in effect" anti-pattern.
function subscribeNoop() {
  return () => {}
}
function getClientSnapshot() {
  return getRecognitionCtor() !== null
}
function getServerSnapshot() {
  return false
}

export function VoiceInputButton({
  onTranscript,
  onFinal,
  unsupportedTitle = 'Voice input not supported in this browser',
  className,
  disabled = false,
}: Props) {
  // Detect support client-side without setState-in-effect.
  const supported = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot,
  )
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // The accumulated *final* text for the current session — we use it to
  // compute the delta we pass to onTranscript so the parent doesn't render
  // the same words twice.
  const finalAccumulatorRef = useRef('')

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore
      }
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      toast.error('Voice input is not supported in this browser. Try Chrome or Edge.')
      return
    }
    const rec = new Ctor()
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    finalAccumulatorRef.current = ''

    rec.onstart = () => {
      setListening(true)
    }

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) {
          finalChunk += transcript
        } else {
          interim += transcript
        }
      }
      if (finalChunk) {
        finalAccumulatorRef.current = (finalAccumulatorRef.current + ' ' + finalChunk).trim()
        onFinal?.(finalChunk.trim())
      }
      if (interim) {
        onTranscript?.(interim)
      }
    }

    rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const err = event.error || 'unknown'
      // Friendly messages for the common cases.
      const messages: Record<string, string> = {
        'no-speech': 'No speech detected — try again.',
        'not-allowed': 'Microphone permission denied.',
        'service-not-allowed': 'Microphone permission denied.',
        'audio-capture': 'No microphone found.',
        'network': 'Voice recognition network error.',
        'aborted': '',
      }
      const msg = messages[err]
      if (msg) toast.error(msg)
      setListening(false)
    }

    rec.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch {
      // start() throws if called twice in a row — safe to ignore.
      setListening(false)
    }
  }, [onFinal, onTranscript])

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setListening(false)
  }, [])

  function handleClick() {
    if (disabled || supported === false) return
    if (listening) {
      stop()
    } else {
      start()
    }
  }

  const isDisabled = disabled || supported === false

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title={
        supported === false
          ? unsupportedTitle
          : listening
            ? 'Stop listening'
            : 'Start voice input'
      }
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={listening}
      className={cn(
        'inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors flex-shrink-0',
        listening
          ? 'bg-rose-500/15 text-rose-400 border-rose-500/40'
          : 'bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] border-[var(--ansein-border)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)]',
        isDisabled && 'opacity-40 cursor-not-allowed hover:text-[var(--ansein-text-muted)] hover:border-[var(--ansein-border)]',
        className,
      )}
    >
      {listening ? (
        <span className="relative flex h-4 w-4 items-center justify-center">
          {/* Pulsing ring */}
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500/60 animate-ping" />
          <Mic className="relative h-4 w-4" />
        </span>
      ) : supported === false ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  )
}
