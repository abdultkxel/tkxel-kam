import { useEffect, useRef, useState } from 'react'

export function useAnimatedNumber(value: number, duration = 600): number {
  const previous = useRef(value)
  const [displayed, setDisplayed] = useState(value)

  useEffect(() => {
    const startValue = previous.current
    const delta = value - startValue
    const start = performance.now()
    let frame = 0

    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(startValue + delta * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else previous.current = value
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, value])

  return displayed
}
