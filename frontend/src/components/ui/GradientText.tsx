import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

interface GradientTextProps extends Omit<HTMLMotionProps<'span'>, 'ref'> {
  /** Color variant for gradient */
  variant?: 'primary' | 'danger' | 'warning' | 'success'
  /** Text content */
  children: React.ReactNode
  /** HTML tag to render */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p'
  /** Enable glow effect */
  glow?: boolean
  /** Enable animation on mount */
  animate?: boolean
}

const gradientVariants = {
  primary: 'from-vs-primary via-vs-primary/80 to-vs-safe',
  danger: 'from-vs-warning via-vs-danger to-vs-danger',
  warning: 'from-yellow-400 via-vs-warning to-orange-500',
  success: 'from-green-400 via-vs-safe to-emerald-400',
}

const glowVariants = {
  primary: 'drop-shadow-[0_0_20px_rgba(0,229,255,0.6)]',
  danger: 'drop-shadow-[0_0_20px_rgba(255,59,92,0.6)]',
  warning: 'drop-shadow-[0_0_20px_rgba(255,176,32,0.6)]',
  success: 'drop-shadow-[0_0_20px_rgba(53,242,138,0.6)]',
}

export const GradientText: React.FC<GradientTextProps> = ({
  variant = 'primary',
  children,
  as = 'span',
  glow = false,
  animate = true,
  className = '',
  ...props
}) => {
  const Component = motion[as] as any

  const baseClasses = [
    'bg-gradient-to-r',
    gradientVariants[variant],
    'bg-clip-text',
    'text-transparent',
    'font-bold',
    glow && glowVariants[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const animationProps = animate
    ? {
        initial: { opacity: 0, y: -10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: 'easeOut' },
      }
    : {}

  return (
    <Component className={baseClasses} {...animationProps} {...props}>
      {children}
    </Component>
  )
}

export default GradientText
