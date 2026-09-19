import React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

interface GlowBadgeProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  /** Status variant */
  variant?: 'safe' | 'warning' | 'danger' | 'info' | 'neutral'
  /** Badge size */
  size?: 'sm' | 'md' | 'lg'
  /** Enable pulse animation */
  pulse?: boolean
  /** Icon element (optional) */
  icon?: React.ReactNode
  /** Badge content */
  children: React.ReactNode
}

const variantStyles = {
  safe: {
    bg: 'bg-vs-safe/10',
    border: 'border-vs-safe/30',
    text: 'text-vs-safe',
    glow: 'shadow-[0_0_15px_rgba(53,242,138,0.3)]',
    dot: 'bg-vs-safe',
  },
  warning: {
    bg: 'bg-vs-warning/10',
    border: 'border-vs-warning/30',
    text: 'text-vs-warning',
    glow: 'shadow-[0_0_15px_rgba(255,176,32,0.3)]',
    dot: 'bg-vs-warning',
  },
  danger: {
    bg: 'bg-vs-danger/10',
    border: 'border-vs-danger/30',
    text: 'text-vs-danger',
    glow: 'shadow-[0_0_15px_rgba(255,59,92,0.3)]',
    dot: 'bg-vs-danger',
  },
  info: {
    bg: 'bg-vs-primary/10',
    border: 'border-vs-primary/30',
    text: 'text-vs-primary',
    glow: 'shadow-[0_0_15px_rgba(0,229,255,0.3)]',
    dot: 'bg-vs-primary',
  },
  neutral: {
    bg: 'bg-vs-muted/10',
    border: 'border-vs-muted/30',
    text: 'text-vs-muted',
    glow: 'shadow-[0_0_15px_rgba(123,135,148,0.2)]',
    dot: 'bg-vs-muted',
  },
}

const sizeStyles = {
  sm: {
    padding: 'px-2 py-1',
    text: 'text-xs',
    icon: 'w-3 h-3',
    dot: 'w-1.5 h-1.5',
  },
  md: {
    padding: 'px-3 py-1.5',
    text: 'text-sm',
    icon: 'w-4 h-4',
    dot: 'w-2 h-2',
  },
  lg: {
    padding: 'px-4 py-2',
    text: 'text-base',
    icon: 'w-5 h-5',
    dot: 'w-2.5 h-2.5',
  },
}

export const GlowBadge: React.FC<GlowBadgeProps> = ({
  variant = 'info',
  size = 'md',
  pulse = false,
  icon,
  children,
  className = '',
  ...props
}) => {
  const variantStyle = variantStyles[variant]
  const sizeStyle = sizeStyles[size]

  const baseClasses = [
    'inline-flex',
    'items-center',
    'gap-1.5',
    'rounded-full',
    'border',
    'font-semibold',
    'backdrop-blur-sm',
    variantStyle.bg,
    variantStyle.border,
    variantStyle.text,
    variantStyle.glow,
    sizeStyle.padding,
    sizeStyle.text,
    'transition-all',
    'duration-200',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={baseClasses}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      {...props}
    >
      {/* Pulse dot indicator */}
      {pulse && (
        <span className="relative flex">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${variantStyle.dot}`}
          />
          <span className={`relative inline-flex rounded-full ${sizeStyle.dot} ${variantStyle.dot}`} />
        </span>
      )}

      {/* Icon */}
      {icon && <span className={sizeStyle.icon}>{icon}</span>}

      {/* Content */}
      <span className="leading-none">{children}</span>
    </motion.div>
  )
}

export default GlowBadge
