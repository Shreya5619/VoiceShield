import React from 'react'

interface NoiseTextureProps {
  /** Opacity of the noise overlay (0-1) */
  opacity?: number
  /** Size of noise pattern in pixels */
  size?: number
  /** Z-index of the overlay */
  zIndex?: number
  /** Whether to animate the noise */
  animated?: boolean
}

/**
 * NoiseTexture - Adds a subtle grain texture overlay
 * Used to add depth and premium feel to backgrounds and cards
 */
export const NoiseTexture: React.FC<NoiseTextureProps> = ({
  opacity = 0.03,
  size = 200,
  zIndex = 1,
  animated = false,
}) => {
  const noiseDataUrl = React.useMemo(() => {
    // SVG-based noise for better quality and scalability
    return `data:image/svg+xml,%3Csvg viewBox='0 0 ${size} ${size}' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E`
  }, [size])

  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{
        backgroundImage: `url("${noiseDataUrl}")`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${size}px ${size}px`,
        opacity,
        zIndex,
        mixBlendMode: 'overlay',
        animation: animated ? 'noise-drift 8s linear infinite' : undefined,
      }}
    />
  )
}

// Add keyframe animation for subtle drift
if (typeof document !== 'undefined' && !document.getElementById('noise-animation')) {
  const style = document.createElement('style')
  style.id = 'noise-animation'
  style.textContent = `
    @keyframes noise-drift {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(-5%, -5%); }
    }
  `
  document.head.appendChild(style)
}

export default NoiseTexture
