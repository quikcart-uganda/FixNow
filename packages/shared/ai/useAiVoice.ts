import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi } from '@fixnow/api'
import { newAiId } from './roleCopy'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export type VoicePhase = 'idle' | 'recording' | 'canceling' | 'transcribing' | 'denied'

const WAVE_BARS = 16
const CANCEL_SLIDE_PX = 72
const MIN_RECORD_MS = 400

export type VoiceSendPayload = {
  text: string
  audioUrl?: string
  mimeType?: string
  durationSec: number
}

export function useAiVoice(enabled: boolean) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: WAVE_BARS }, () => 0.15))
  const [slideOffset, setSlideOffset] = useState(0)
  const [willCancel, setWillCancel] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const startedAtRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const pointerStartXRef = useRef(0)
  const cancelArmedRef = useRef(false)
  const liveTranscriptRef = useRef('')
  const abortTranscribeRef = useRef<AbortController | null>(null)
  const startingRef = useRef<Promise<void> | null>(null)
  const holdActiveRef = useRef(false)

  const stopWaveform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    analyserRef.current = null
    try {
      void audioCtxRef.current?.close()
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null
    setLevels(Array.from({ length: WAVE_BARS }, () => 0.15))
  }, [])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    stopWaveform()
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
  }, [stopWaveform])

  useEffect(() => {
    return () => {
      cleanupStream()
      abortTranscribeRef.current?.abort()
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl, cleanupStream])

  const startWaveform = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        const node = analyserRef.current
        if (!node) return
        node.getByteFrequencyData(data)
        const next: number[] = []
        const step = Math.max(1, Math.floor(data.length / WAVE_BARS))
        for (let i = 0; i < WAVE_BARS; i += 1) {
          const v = data[i * step] ?? 0
          next.push(Math.max(0.12, Math.min(1, v / 180)))
        }
        setLevels(next)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      /* waveform is decorative */
    }
  }, [])

  const resetUi = useCallback(() => {
    setSlideOffset(0)
    setWillCancel(false)
    cancelArmedRef.current = false
    setDurationSec(0)
    setTranscript('')
    liveTranscriptRef.current = ''
  }, [])

  const cancel = useCallback(() => {
    holdActiveRef.current = false
    abortTranscribeRef.current?.abort()
    abortTranscribeRef.current = null
    try {
      mediaRecorderRef.current?.stop()
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    cleanupStream()
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    resetUi()
    setPhase('idle')
    setError(null)
  }, [audioUrl, cleanupStream, resetUi])

  const start = useCallback(
    async (clientX?: number) => {
      if (!enabled) return
      setError(null)
      // Soft reset previous session without clearing the new hold flag.
      abortTranscribeRef.current?.abort()
      abortTranscribeRef.current = null
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        /* ignore */
      }
      mediaRecorderRef.current = null
      chunksRef.current = []
      cleanupStream()
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      resetUi()

      holdActiveRef.current = true
      pointerStartXRef.current = clientX ?? 0
      cancelArmedRef.current = false
      setWillCancel(false)
      setSlideOffset(0)

      const run = (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (!holdActiveRef.current) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          chunksRef.current = []
          startedAtRef.current = Date.now()
          setDurationSec(0)
          tickRef.current = window.setInterval(() => {
            setDurationSec(Math.round((Date.now() - startedAtRef.current) / 1000))
          }, 250)

          const mime = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : ''
          const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
          mediaRecorderRef.current = recorder
          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) chunksRef.current.push(ev.data)
          }
          recorder.start(200)
          setPhase('recording')
          startWaveform(stream)

          const Ctor = getSpeechRecognitionCtor()
          if (Ctor) {
            const recognition = new Ctor()
            recognition.continuous = true
            recognition.interimResults = true
            recognition.lang = 'en-UG'
            recognition.onresult = (ev) => {
              const parts: string[] = []
              for (let i = 0; i < ev.results.length; i += 1) {
                const alt = ev.results[i]?.[0]
                if (alt?.transcript) parts.push(alt.transcript)
              }
              const text = parts.join(' ').trim()
              liveTranscriptRef.current = text
              setTranscript(text)
            }
            recognition.onerror = () => {
              /* optional */
            }
            recognition.onend = () => {
              /* keep recording */
            }
            recognitionRef.current = recognition
            try {
              recognition.start()
            } catch {
              /* ignore */
            }
          }
        } catch {
          if (!holdActiveRef.current) return
          setPhase('denied')
          setError(
            'Microphone access is needed for voice notes. You can still type your message instead.',
          )
          cleanupStream()
        }
      })()

      startingRef.current = run
      await run
      startingRef.current = null
    },
    [audioUrl, cleanupStream, enabled, resetUi, startWaveform],
  )

  const updateSlide = useCallback((clientX: number) => {
    if (phase !== 'recording' && phase !== 'canceling') return
    const delta = Math.min(0, clientX - pointerStartXRef.current)
    setSlideOffset(delta)
    const canceling = Math.abs(delta) >= CANCEL_SLIDE_PX
    cancelArmedRef.current = canceling
    setWillCancel(canceling)
    setPhase(canceling ? 'canceling' : 'recording')
  }, [phase])

  const finishRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        cleanupStream()
        resolve(null)
        return
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        cleanupStream()
        mediaRecorderRef.current = null
        resolve(blob.size > 0 ? blob : null)
      }
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      try {
        recorder.stop()
      } catch {
        cleanupStream()
        resolve(null)
      }
    })
  }, [cleanupStream])

  /**
   * Release the hold: cancel if slid left, otherwise upload + transcribe and return a send payload.
   */
  const release = useCallback(async (): Promise<VoiceSendPayload | null> => {
    holdActiveRef.current = false
    if (startingRef.current) {
      await startingRef.current
    }

    if (phase !== 'recording' && phase !== 'canceling' && !mediaRecorderRef.current) {
      return null
    }

    const elapsed = Date.now() - startedAtRef.current
    const cancelThis = cancelArmedRef.current

    if (cancelThis || elapsed < MIN_RECORD_MS) {
      cancel()
      if (!cancelThis && elapsed < MIN_RECORD_MS) {
        setError('Hold a little longer to record a voice note.')
      }
      return null
    }

    const duration = Math.max(1, Math.round(elapsed / 1000))
    const blob = await finishRecording()
    if (!blob) {
      setPhase('idle')
      setError('Could not capture audio. Try again or type your message.')
      return null
    }

    const localUrl = URL.createObjectURL(blob)
    setAudioUrl(localUrl)
    setPhase('transcribing')

    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voice-${Date.now()}.${ext}`, {
      type: blob.type || 'audio/webm',
    })

    const localText = liveTranscriptRef.current.trim()
    abortTranscribeRef.current?.abort()
    const ac = new AbortController()
    abortTranscribeRef.current = ac

    try {
      const result = await aiApi.transcribe(file, ac.signal)
      const text = (result.text || localText).trim()
      const payload: VoiceSendPayload = {
        text: text || 'Voice note',
        audioUrl: result.upload?.url,
        mimeType: result.upload?.mimeType || file.type,
        durationSec: duration,
      }
      resetUi()
      setPhase('idle')
      if (localUrl.startsWith('blob:')) URL.revokeObjectURL(localUrl)
      setAudioUrl(null)
      return payload
    } catch {
      const text = localText
      resetUi()
      setPhase('idle')
      if (localUrl.startsWith('blob:')) URL.revokeObjectURL(localUrl)
      setAudioUrl(null)
      if (text) {
        return { text, durationSec: duration }
      }
      setError('Could not transcribe this voice note. Try again or type your message.')
      return null
    } finally {
      abortTranscribeRef.current = null
    }
  }, [cancel, finishRecording, phase, resetUi])

  /** Legacy tap API — starts recording; prefer hold gesture. */
  const stop = useCallback(() => {
    void release()
  }, [release])

  return {
    phase,
    transcript,
    setTranscript,
    audioUrl,
    durationSec,
    error,
    levels,
    slideOffset,
    willCancel,
    start,
    stop,
    cancel,
    updateSlide,
    release,
    recordingId: phase === 'recording' || phase === 'canceling' ? newAiId('voice') : null,
  }
}
