import OriginalLogo from '@/assets/tkxel-logo-wordmark.png'
import { cn } from '@/utils/cn'

type LogoSize = 'topbar' | 'sidebar' | 'mark'
type LogoTone = 'blue' | 'white'

const sizeClass: Record<LogoSize, { frame: string; image: string }> = {
  topbar: {
    frame: 'h-8 w-[92px]',
    image: 'h-8 w-auto',
  },
  sidebar: {
    frame: 'h-10 w-[132px]',
    image: 'h-8 w-auto',
  },
  mark: {
    frame: 'h-10 w-12',
    image: 'h-5 w-auto',
  },
}

export function TkxelLogo({ size = 'topbar', tone = 'blue', className }: { size?: LogoSize; tone?: LogoTone; className?: string }) {
  const classes = sizeClass[size]

  return (
    <span className={cn('relative block shrink-0 overflow-hidden', classes.frame, className)} aria-label="tkxel">
      <img src={OriginalLogo} alt="tkxel" className={cn('object-contain', classes.image, tone === 'white' ? 'brightness-0 invert' : '')} />
    </span>
  )
}
