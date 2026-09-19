import React, { useMemo } from 'react'
import { GlassCard } from './ui'
import { motion } from 'framer-motion'
import { CheckCircle, AlertTriangle, Waves, Radio, BarChart3, Cpu } from 'lucide-react'

interface VoiceAuthenticityRadarProps {
  /** Human voice percentage (0-100) */
  humanVoicePercentage?: number
  /** Individual technical signals */
  signals?: {
    formantConsistency: boolean // true = normal, false = suspicious
    prosodyAnalysis: boolean
    spectralArtifacts: boolean
    voiceCloningSignal: boolean
  }
  /** Confidence level of the analysis */
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  /** Compact mode */
  compact?: boolean
}

interface SignalConfig {
  label: string
  icon: React.ReactNode
  description: string
}

const signalConfigs: Record<string, SignalConfig> = {
  formantConsistency: {
    label: 'Formant Consistency',
    icon: <Waves className="w-4 h-4" />,
    description: 'Natural resonance patterns',
  },
  prosodyAnalysis: {
    label: 'Prosody Analysis',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Speech rhythm and intonation',
  },
  spectralArtifacts: {
    label: 'Spectral Artifacts',
    icon: <Radio className="w-4 h-4" />,
    description: 'AI generation indicators',
  },
  voiceCloningSignal: {
    label: 'Voice Cloning Signal',
    icon: <Cpu className="w-4 h-4" />,
    description: 'Deepfake detection markers',
  },
}

/**
 * VoiceAuthenticityRadar - Circular radar showing AI voice detection
 * 
 * Features:
 * - Central percentage display (human vs synthetic)
 * - Four technical signals around the circle
 * - Animated radar sweep effect
 * - Color-coded indicators (green = normal, amber = suspicious)
 * - Visual feedback for deepfake detection
 */
export const VoiceAuthenticityRadar: React.FC<VoiceAuthenticityRadarProps> = ({
  humanVoicePercentage = 87,
  signals = {
    formantConsistency: true,
    prosodyAnalysis: true,
    spectralArtifacts: true,
    voiceCloningSignal: true,
  },
  confidenceLevel = 'HIGH',
  compact = false,
}) => {
  const syntheticPercentage = 100 - humanVoicePercentage

  // Determine overall status
  const isHuman = humanVoicePercentage >= 70
  const isSuspicious = humanVoicePercentage < 50

  const statusColor = isHuman ? '#35F28A' : isSuspicious ? '#FF3B5C' : '#FFB020'
  const statusText = isHuman ? 'HUMAN VOICE' : isSuspicious ? 'SYNTHETIC' : 'UNCERTAIN'

  // Calculate signal positions around circle (top, right, bottom, left)
  const signalPositions = [
    { angle: 0, x: '50%', y: '5%', translateX: '-50%', translateY: '0%' }, // top
    { angle: 90, x: '92%', y: '50%', translateX: '-50%', translateY: '-50%' }, // right
    { angle: 180, x: '50%', y: '92%', translateX: '-50%', translateY: '-100%' }, // bottom
    { angle: 270, x: '8%', y: '50%', translateX: '-50%', translateY: '-50%' }, // left
  ]

  const signalEntries = Object.entries(signals)

  if (compact) {
    return (
      <GlassCard variant="default" padding="md" className="inline-block">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className={`text-2xl font-mono font-bold`} style={{ color: statusColor }}>
              {humanVoicePercentage}%
            </div>
            <div className="text-xs text-vs-muted">Human</div>
          </div>
          <div className="flex gap-1">
            {signalEntries.map(([key, value]) => (
              <div
                key={key}
                className={`w-2 h-2 rounded-full ${value ? 'bg-vs-safe' : 'bg-vs-warning'}`}
                title={signalConfigs[key].label}
              />
            ))}
          </div>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard variant="default" noise padding="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-vs-text">Voice Authenticity</h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              confidenceLevel === 'HIGH'
                ? 'bg-vs-safe/20 text-vs-safe'
                : confidenceLevel === 'MEDIUM'
                ? 'bg-vs-warning/20 text-vs-warning'
                : 'bg-vs-muted/20 text-vs-muted'
            }`}
          >
            {confidenceLevel} CONFIDENCE
          </span>
        </div>

        {/* Radar Circle */}
        <div className="relative aspect-square max-w-xs mx-auto">
          {/* Background circles */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="1" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="1" />
            <circle cx="100" cy="100" r="50" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="1" />

            {/* Animated radar sweep */}
            <motion.line
              x1="100"
              y1="100"
              x2="100"
              y2="10"
              stroke="rgba(0,229,255,0.5)"
              strokeWidth="2"
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '100px 100px' }}
            />

            {/* Crosshairs */}
            <line x1="100" y1="0" x2="100" y2="200" stroke="rgba(0,229,255,0.05)" strokeWidth="1" />
            <line x1="0" y1="100" x2="200" y2="100" stroke="rgba(0,229,255,0.05)" strokeWidth="1" />
          </svg>

          {/* Center display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              className="text-4xl font-mono font-bold"
              style={{ color: statusColor, textShadow: `0 0 20px ${statusColor}` }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {humanVoicePercentage}%
            </motion.div>
            <div className="text-xs font-semibold mt-1" style={{ color: statusColor }}>
              {statusText}
            </div>
            <div className="text-xs text-vs-muted mt-2">
              Synthetic: {syntheticPercentage}%
            </div>
          </div>

          {/* Signal indicators positioned around circle */}
          {signalEntries.map(([key, value], index) => {
            const pos = signalPositions[index]
            const config = signalConfigs[key]

            return (
              <motion.div
                key={key}
                className="absolute"
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: `translate(${pos.translateX}, ${pos.translateY})`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * index, duration: 0.3 }}
              >
                <div
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg ${
                    value ? 'bg-vs-safe/10 border border-vs-safe/30' : 'bg-vs-warning/10 border border-vs-warning/30'
                  }`}
                >
                  <div className={value ? 'text-vs-safe' : 'text-vs-warning'}>
                    {value ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Signal Details */}
        <div className="space-y-3 pt-4 border-t border-vs-muted/10">
          <div className="text-sm font-semibold text-vs-muted uppercase tracking-wide">
            Technical Signals
          </div>

          {signalEntries.map(([key, value]) => {
            const config = signalConfigs[key]
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={value ? 'text-vs-safe' : 'text-vs-warning'}>{config.icon}</div>
                  <div>
                    <div className="text-sm text-vs-text">{config.label}</div>
                    <div className="text-xs text-vs-muted">{config.description}</div>
                  </div>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    value
                      ? 'bg-vs-safe/20 text-vs-safe'
                      : 'bg-vs-warning/20 text-vs-warning'
                  }`}
                >
                  {value ? '✓ Normal' : '⚠ Suspicious'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Additional info */}
        <div className="text-xs text-vs-muted text-center pt-2">
          {isHuman
            ? 'Voice characteristics match natural human speech patterns'
            : isSuspicious
            ? 'Multiple AI-generated speech indicators detected'
            : 'Mixed signals detected - continue monitoring'}
        </div>
      </div>
    </GlassCard>
  )
}

export default VoiceAuthenticityRadar
