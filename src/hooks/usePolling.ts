import { useEffect, useRef, useCallback } from 'react'

interface UsePollingOptions {
  interval: number
  enabled: boolean
  immediate?: boolean
}

export function usePolling(
  callback: () => Promise<void> | void,
  options: UsePollingOptions
) {
  const { interval, enabled, immediate = true } = options
  const savedCallback = useRef(callback)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const poll = useCallback(async () => {
    if (isPollingRef.current) return

    isPollingRef.current = true

    try {
      await savedCallback.current()
    } catch (error) {
      console.error('Polling error:', error)
    } finally {
      isPollingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    if (immediate) {
      poll()
    }

    timerRef.current = setInterval(poll, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, interval, immediate, poll])

  const trigger = useCallback(() => {
    poll()
  }, [poll])

  return { trigger, isPolling: isPollingRef.current }
}