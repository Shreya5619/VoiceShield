import React, { forwardRef } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  /** Visual variant of the card */
  variant?: 'default' | 'primary' | 'danger' | 'warning' | 'success'
  /** Enable hover effect */
  hover?: boolean
  /** Add noise texture overlay */
  noise?: boolean
  /** Add glow effect */
  glow?: boolean
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
}

const variantStyles = {
  default: {
    border: 'border-vs-primary/10',
    glow: 'shadow-[0_0_20px_rgba(0,229,255,0.2)]',
  },
  primary: {
    border: 'border-vs-primary/30',
    glow: 'shadow-[0_0_30px_rgba(0,229,255,0.4)]',
  },
  danger: {
    border: 'border-vs-danger/30',
    glow: 'shadow-[0_0_30px_rgba(255,59,92,0.4)]',
  },
  warning: {
    border: 'border-vs-warning/30',
    glow: 'shadow-[0_0_30px_rgba(255,176,32,0.4)]',
  },
  success: {
    border: 'border-vs-safe/30',
    glow: 'shadow-[0_0_30px_rgba(53,242,138,0.4)]',
  },
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      variant = 'default',
      hover = false,
      noise = false,
      glow = false,
      padding = 'md',
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const variantStyle = variantStyles[variant as keyof typeof variantStyles]

    const baseClasses = [
      'relative',
      'rounded-xl',
      'border',
      variantStyle.border,
      'bg-vs-card/70',
      'backdrop-blur-xl',
      'shadow-lg',
      paddingMap[padding as keyof typeof paddingMap],
      hover && 'transition-all duration-200 hover:-translate-y-1',
      hover && `hover:${variantStyle.border.replace('/30', '/50')}`,
      glow && variantStyle.glow,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <motion.div
        ref={ref}
        className={baseClasses}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        {...props}
      >
        {/* Noise texture overlay */}
        {noise && (
          <div
            className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: '200px 200px',
            }}
          />
        )}
        
        {/* Content */}
        <div className="relative z-10">{children}</div>
      </motion.div>
    )
  }
)

GlassCard.displayName = 'GlassCard'

export default GlassCard
