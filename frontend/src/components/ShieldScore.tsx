import React, { useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import { GlassCard } from './ui'
import { Shield, Volume2, AlertTriangle, DollarSign, Clock } from 'lucide-react'

interface ShieldScoreProps {
  /** Voice authenticity score (0-100) - higher is more human */
  voiceAuthenticity?: number
  /** Scam language detection score (0-100) - higher is more suspicious */
  scamLanguage?: number
  /** Urgency indicators score (0-100) - higher is more urgent */
  urgency?: number
  /** Financial request flags (0-100) - higher is more suspicious */
  financialRequest?: number
  /** Compact mode (smaller display) */
  compact?: boolean
  /** Show breakdown details */
  showBreakdown?: boolean
}

interface MetricConfig {
  label: string
  icon: React.ReactNode
  color: string
  description: string
}

const metrics: Record<string, MetricConfig> = {
  voiceAuthenticity: {
    label: 'Voice Authenticity',
    icon: <Volume2 className="w-4 h-4" />,
    color: '#35F28A',
    description: 'Human voice characteristics analysis',
  },
  scamLanguage: {
    label: 'Scam Language',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: '#FF3B5C',
    description: 'Suspicious phrases and tactics detection',
  },
  urgency: {
    label: 'Urgency Indicators',
    icon: <Clock className="w-4 h-4" />,
    color: '#FFB020',
    description: 'Pressure tactics and time constraints',
  },
  financialRequest: {
    label: 'Financial Requests',
    icon: <DollarSign className="w-4 h-4" />,
    color: '#FF3B5C',
    description: 'Money, payment, or account details',
  },
}

/**
 * Calculate overall Shield Score from component metrics
 * Lower is better (safer)
 */
function calculateShieldScore(
  voiceAuth: number,
  scamLang: number,
  urgency: number,
  financial: number
): number {
  // Invert voice authenticity (high authenticity = low threat)
  const voiceThreat = 100 - voiceAuth
  
  // Weighted average
  const weights = {
    voice: 0.25,
    scam: 0.35,
    urgency: 0.20,
    financial: 0.20,
  }
  
  const score =
    voiceThreat * weights.voice +
    scamLang * weights.scam +
    urgency * weights.urgency +
    financial * weights.financial
  
  return Math.round(score)
}

/**
 * Get threat level and color based on score
 */
function getThreatLevel(score: number): {
  level: string
  color: string
  bgColor: string
  textColor: string
} {
  if (score < 30) {
    return {
      level: 'LOW RISK',
      color: '#35F28A',
      bgColor: 'bg-vs-safe/20',
      textColor: 'text-vs-safe',
    }
  } else if (score < 70) {
    return {
      level: 'ELEVATED',
      color: '#FFB020',
      bgColor: 'bg-vs-warning/20',
      textColor: 'text-vs-warning',
    }
  } else {
    return {
      level: 'HIGH RISK',
      color: '#FF3B5C',
      bgColor: 'bg-vs-danger/20',
      textColor: 'text-vs-danger',
    }
  }
}

/**
 * AnimatedNumber - Smooth number animation
 */
const AnimatedNumber: React.FC<{ value: number; className?: string }> = ({
  value,
  className,
}) => {
  const spring = useSpring(value, { stiffness: 100, damping: 30 })
  const display = useTransform(spring, (current) => Math.round(current))
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    spring.set(value)
    const unsubscribe = display.on('change', setDisplayValue)
    return () => unsubscribe()
  }, [value, spring, display])

  return <span className={className}>{displayValue}</span>
}

/**
 * MetricBar - Individual metric progress bar
 */
const MetricBar: React.FC<{
  label: string
  value: number
  icon: React.ReactNode
  color: string
  description: string
}> = ({ label, value, icon, color, description }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-vs-muted">{icon}</div>
          <span className="text-sm font-medium text-vs-text">{label}</span>
        </div>
        <span className="text-sm font-mono font-bold text-vs-text">
          <AnimatedNumber value={value} />%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-vs-card/50 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        {/* Glow effect */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full opacity-50 blur-sm"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      {/* Description */}
      <p className="text-xs text-vs-muted">{description}</p>
    </div>
  )
}

/**
 * ShieldScore - Primary threat metric with component breakdown
 * 
 * Features:
 * - Large animated overall score (0-100, lower is safer)
 * - Color-coded threat level (green/amber/red)
 * - Four component metrics with progress bars
 * - Smooth number animations
 * - Compact mode for smaller displays
 * - Tooltips with explanations
 */
export const ShieldScore: React.FC<ShieldScoreProps> = ({
  voiceAuthenticity = 0,
  scamLanguage = 0,
  urgency = 0,
  financialRequest = 0,
  compact = false,
  showBreakdown = true,
}) => {
  const overallScore = calculateShieldScore(
    voiceAuthenticity,
    scamLanguage,
    urgency,
    financialRequest
  )

  const threat = getThreatLevel(overallScore)

  if (compact) {
    return (
      <GlassCard variant="default" padding="md" className="inline-block">
        <div className="flex items-center gap-3">
          <Shield className={`w-5 h-5 ${threat.textColor}`} />
          <div>
            <div className={`text-2xl font-mono font-bold ${threat.textColor}`}>
              <AnimatedNumber value={overallScore} />
            </div>
            <div className="text-xs text-vs-muted">Shield Score</div>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-semibold ${threat.bgColor} ${threat.textColor}`}>
            {threat.level}
          </div>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard variant="default" noise padding="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className={`w-6 h-6 ${threat.textColor}`} />
          <h3 className="text-lg font-semibold text-vs-text">Shield Score</h3>
        </div>

        {/* Overall Score Display */}
        <div className="text-center py-6">
          <motion.div
            className={`text-6xl font-mono font-bold ${threat.textColor}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              textShadow: `0 0 30px ${threat.color}`,
            }}
          >
            <AnimatedNumber value={overallScore} className="inline-block" />
          </motion.div>
          <div className="mt-2">
            <span className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold ${threat.bgColor} ${threat.textColor}`}>
              {threat.level}
            </span>
          </div>
          <p className="text-sm text-vs-muted mt-3">
            {overallScore < 30
              ? 'Call appears safe with normal patterns'
              : overallScore < 70
              ? 'Some suspicious indicators detected'
              : 'High-risk call with multiple threat signals'}
          </p>
        </div>

        {/* Component Breakdown */}
        {showBreakdown && (
          <div className="space-y-6 pt-6 border-t border-vs-muted/10">
            <div className="text-sm font-semibold text-vs-muted uppercase tracking-wide">
              Threat Analysis Breakdown
            </div>

            <MetricBar
              label={metrics.voiceAuthenticity.label}
              value={voiceAuthenticity}
              icon={metrics.voiceAuthenticity.icon}
              color={metrics.voiceAuthenticity.color}
              description={metrics.voiceAuthenticity.description}
            />

            <MetricBar
              label={metrics.scamLanguage.label}
              value={scamLanguage}
              icon={metrics.scamLanguage.icon}
              color={metrics.scamLanguage.color}
              description={metrics.scamLanguage.description}
            />

            <MetricBar
              label={metrics.urgency.label}
              value={urgency}
              icon={metrics.urgency.icon}
              color={metrics.urgency.color}
              description={metrics.urgency.description}
            />

            <MetricBar
              label={metrics.financialRequest.label}
              value={financialRequest}
              icon={metrics.financialRequest.icon}
              color={metrics.financialRequest.color}
              description={metrics.financialRequest.description}
            />
          </div>
        )}
      </div>
    </GlassCard>
  )
}

export default ShieldScore
