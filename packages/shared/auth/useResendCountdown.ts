import { useCallback, useEffect, useRef, useState } from 'react'

export function useResendCountdown(initialSeconds = 60) {
  const [remaining, setRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(
    (seconds = initialSeconds) => {
      clear()
      const total = Math.max(0, Math.floor(seconds))
      setRemaining(total)
      if (total <= 0) return
      timerRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clear()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [clear, initialSeconds],
  )

  useEffect(() => clear, [clear])

  return {
    remaining,
    canResend: remaining <= 0,
    start,
    label: remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code',
  }
}
