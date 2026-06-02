import { useAnimatedNumber } from '@/hooks/useAnimatedNumber'
import { cn } from '@/utils/cn'

interface Props {
  value: number
  format?: (n: number) => string
  className?: string
}

export function AnimatedNumber({ value, format, className }: Props) {
  const displayed = useAnimatedNumber(value, 600)
  return <span className={cn('font-display', className)}>{format ? format(Math.round(displayed)) : Math.round(displayed)}</span>
}
