import React, { useMemo } from 'react'
import { Shield, Phone, Users, Activity, AlertTriangle } from 'lucide-react'
import { GlassCard, GradientText, GlowBadge, PageBackground } from './ui'
import Shield3D from './Shield3D'
import { motion } from 'framer-motion'

interface ProtectDashboardProps {
  /** Owner's phone number for fetching stats */
  ownerPhone: string
  /** Current protection status */
  status?: 'active' | 'inactive' | 'alert'
  /** Navigation callbacks */
  onNavigate?: (tab: 'activity' | 'family') => void
}

interface ProtectionStats {
  threatsBlocked: number
  familyProtected: number
  callsAnalyzed: number
  lastThreatTime?: string
}

/**
 * ProtectDashboard - Main landing screen showing active protection status
 * 
 * Features:
 * - 3D animated shield centerpiece
 * - Real-time protection status
 * - Quick stats cards (threats blocked, family protected, calls analyzed)
 * - Grid background with noise texture
 * - Scanline effect when active
 */
export const ProtectDashboard: React.FC<ProtectDashboardProps> = ({
  ownerPhone,
  status = 'active',
  onNavigate,
}) => {
  // In a real app, fetch these from backend
  // For now, using demo data from localStorage or defaults
  const stats = useMemo<ProtectionStats>(() => {
    try {
      const stored = localStorage.getItem(`voiceshield_stats_${ownerPhone}`)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load stats:', e)
    }

    return {
      threatsBlocked: 12,
      familyProtected: 5,
      callsAnalyzed: 47,
      lastThreatTime: '2 hours ago',
    }
  }, [ownerPhone])

  const statusConfig = {
    active: {
      badge: { variant: 'safe' as const, text: 'ACTIVE', pulse: true, icon: <Shield className="w-4 h-4" /> },
      shieldThreat: 0,
      message: 'Your calls are being monitored and protected',
    },
    inactive: {
      badge: { variant: 'neutral' as const, text: 'INACTIVE', pulse: false, icon: null },
      shieldThreat: 0,
      message: 'Protection is currently disabled',
    },
    alert: {
      badge: { variant: 'danger' as const, text: 'ALERT', pulse: true, icon: <AlertTriangle className="w-4 h-4" /> },
      shieldThreat: 85,
      message: 'High-risk call detected recently',
    },
  }

  const currentStatus = statusConfig[status]

  return (
    <PageBackground grid noise scanlines={status === 'active'}>
      {/* Main content */}
      <div className="h-full p-6 md:p-8 flex flex-col">
        {/* Header */}
        <div className="text-center mb-8">
          <GradientText as="h1" className="text-4xl md:text-6xl mb-3" glow>
            VOICESHIELD
          </GradientText>
          <GradientText as="p" variant="primary" className="text-xl md:text-2xl">
            ACTIVE PROTECTION
          </GradientText>
        </div>

        {/* Status indicator */}
        <div className="flex justify-center mb-8">
          <GlowBadge
            variant={currentStatus.badge.variant}
            size="lg"
            pulse={currentStatus.badge.pulse}
            icon={currentStatus.badge.icon}
          >
            {currentStatus.badge.text}
          </GlowBadge>
        </div>

        {/* Main shield display */}
        <div className="flex-1 flex items-center justify-center mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Shield3D
              threatScore={currentStatus.shieldThreat}
              size={Math.min(350, window.innerWidth * 0.8)}
              autoRotate={status === 'active'}
              speed={status === 'alert' ? 1.5 : 1}
            />
          </motion.div>
        </div>

        {/* Status message */}
        <div className="text-center mb-8">
          <p className="text-vs-muted text-sm md:text-base">
            {currentStatus.message}
          </p>
          {stats.lastThreatTime && status === 'alert' && (
            <p className="text-vs-danger text-xs mt-2">
              Last threat: {stats.lastThreatTime}
            </p>
          )}
        </div>

        {/* Quick stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
          {/* Threats Blocked */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard
              variant="danger"
              hover
              noise
              glow={stats.threatsBlocked > 0}
              padding="lg"
              className="cursor-pointer"
              onClick={() => onNavigate?.('activity')}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-vs-danger/20">
                  <AlertTriangle className="w-6 h-6 text-vs-danger" />
                </div>
                <div className="flex-1">
                  <div className="text-3xl font-mono font-bold text-vs-danger">
                    {stats.threatsBlocked}
                  </div>
                  <div className="text-sm text-vs-muted">Threats Blocked</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Family Protected */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard
              variant="success"
              hover
              noise
              glow={stats.familyProtected > 0}
              padding="lg"
              className="cursor-pointer"
              onClick={() => onNavigate?.('family')}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-vs-safe/20">
                  <Users className="w-6 h-6 text-vs-safe" />
                </div>
                <div className="flex-1">
                  <div className="text-3xl font-mono font-bold text-vs-safe">
                    {stats.familyProtected}
                  </div>
                  <div className="text-sm text-vs-muted">Family Protected</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Calls Analyzed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard
              variant="primary"
              hover
              noise
              glow={stats.callsAnalyzed > 0}
              padding="lg"
              className="cursor-pointer"
              onClick={() => onNavigate?.('activity')}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-vs-primary/20">
                  <Activity className="w-6 h-6 text-vs-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-3xl font-mono font-bold text-vs-primary">
                    {stats.callsAnalyzed}
                  </div>
                  <div className="text-sm text-vs-muted">Calls Analyzed</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Recent activity preview (optional) */}
        {status === 'alert' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 max-w-2xl mx-auto w-full"
          >
            <GlassCard variant="danger" noise padding="md">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-vs-danger flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-vs-text font-semibold">Recent High-Risk Call</p>
                  <p className="text-xs text-vs-muted">
                    Scam detected: Bank KYC verification attempt • {stats.lastThreatTime}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate?.('activity')}
                  className="px-4 py-2 text-sm bg-vs-danger/20 border border-vs-danger/30 rounded-lg text-vs-danger hover:bg-vs-danger/30 transition-colors"
                >
                  View Details
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-vs-muted">
            Protected: {ownerPhone}
          </p>
        </div>
      </div>
    </PageBackground>
  )
}

export default ProtectDashboard
