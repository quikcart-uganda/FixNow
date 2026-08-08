import { useCallback, useRef, useState } from 'react'

/**
 * Double-submit lock with busy UI that prefers aria-busy over sticky native disabled
 * (mobile Safari can leave disabled buttons untappable after await).
 */
export function useAuthSubmit() {
  const pendingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (pendingRef.current) return undefined
    pendingRef.current = true
    setSubmitting(true)
    try {
      return await task()
    } finally {
      pendingRef.current = false
      setSubmitting(false)
    }
  }, [])

  return { submitting, run }
}
