import OriginalLogo from '@/assets/tkxel-logo-wordmark.png'
import { cn } from '@/utils/cn'

type LogoSize = 'topbar' | 'sidebar' | 'mark'

const sizeClass: Record<LogoSize, { frame: string; image: string }> = {
  topbar: {
    frame: 'h-8 w-[92px]',
    image: 'h-8 w-auto',
  },
  sidebar: {
    frame: 'h-9 w-[118px]',
    image: 'h-9 w-auto',
  },
  mark: {
    frame: 'h-10 w-10',
    image: 'h-4 w-auto',
  },
}

export function TkxelLogo({ size = 'topbar', className }: { size?: LogoSize; className?: string }) {
  const classes = sizeClass[size]

  return (
    <span className={cn('relative block shrink-0 overflow-hidden', classes.frame, className)} aria-label="tkxel">
      <img src={OriginalLogo} alt="tkxel" className={cn('object-contain', classes.image)} />
    </span>
  )
}
