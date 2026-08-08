/**
 * Server-side speech-to-text for AI voice notes.
 * Uses OpenAI Whisper when AI_PROVIDER=openai (or an OpenAI key is present).
 * Returns an empty transcript (not an error) when STT is unavailable so the
 * client can fall back to on-device SpeechRecognition text.
 */

import fs from 'node:fs';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

export type TranscribeResult = {
  text: string
  provider: 'openai-whisper' | 'none'
  model?: string
}

function openaiKey(): string {
  return env.OPENAI_API_KEY || env.AI_API_KEY || ''
}

export async function transcribeAudioFile(input: {
  filePath: string
  mimeType: string
  originalName?: string
}): Promise<TranscribeResult> {
  const key = openaiKey()
  if (!key || !env.AI_ENABLED) {
    return { text: '', provider: 'none' }
  }

  if (!fs.existsSync(input.filePath)) {
    throw AppError.badRequest('Audio file missing')
  }

  const bytes = fs.readFileSync(input.filePath)
  const filename =
    input.originalName && /\.[a-z0-9]+$/i.test(input.originalName)
      ? input.originalName
      : guessFilename(input.mimeType)

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: input.mimeType || 'audio/webm' }), filename)
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('response_format', 'json')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT_MS || 45_000)

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as {
      text?: string
      error?: { message?: string }
    }
    if (!response.ok) {
      throw AppError.badRequest(payload.error?.message || `Transcription failed (${response.status})`)
    }
    return {
      text: String(payload.text || '').trim().slice(0, 2000),
      provider: 'openai-whisper',
      model: 'whisper-1',
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    const aborted = err instanceof Error && err.name === 'AbortError'
    throw AppError.badRequest(aborted ? 'Transcription timed out' : 'Transcription failed')
  } finally {
    clearTimeout(timer)
  }
}

function guessFilename(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'voice.m4a'
  if (mime.includes('ogg')) return 'voice.ogg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'voice.mp3'
  if (mime.includes('wav')) return 'voice.wav'
  return 'voice.webm'
}
