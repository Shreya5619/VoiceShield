import React, { useRef, useEffect } from 'react'
import { GlassCard } from './ui'
import { motion } from 'framer-motion'
import { AlertTriangle, DollarSign, Shield, Phone, User, Clock } from 'lucide-react'

export interface ThreatEvent {
  /** Timestamp in seconds from call start */
  timestamp: number
  /** Event type */
  type: 'normal' | 'urgency' | 'financial' | 'identity' | 'scam' | 'info'
  /** Event description */
  description: string
  /** Optional transcript excerpt */
  transcript?: string
  /** Threat level for this event */
  threatLevel?: 'low' | 'medium' | 'high'
}

interface ThreatTimelineProps {
  /** Array of events */
  events: ThreatEvent[]
  /** Current call duration in seconds */
  currentTime?: number
  /** Auto-scroll to latest event */
  autoScroll?: boolean
  /** Compact mode */
  compact?: boolean
  /** Maximum height */
  maxHeight?: string
}

const eventConfig = {
  normal: {
    icon: <Shield className="w-4 h-4" />,
    color: '#7B8794',
    bgColor: 'bg-vs-muted/10',
    borderColor: 'border-vs-muted/30',
  },
  urgency: {
    icon: <Clock className="w-4 h-4" />,
    color: '#FFB020',
    bgColor: 'bg-vs-warning/10',
    borderColor: 'border-vs-warning/30',
  },
  financial: {
    icon: <DollarSign className="w-4 h-4" />,
    color: '#FF3B5C',
    bgColor: 'bg-vs-danger/10',
    borderColor: 'border-vs-danger/30',
  },
  identity: {
    icon: <User className="w-4 h-4" />,
    color: '#FF3B5C',
    bgColor: 'bg-vs-danger/10',
    borderColor: 'border-vs-danger/30',
  },
  scam: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: '#FF3B5C',
    bgColor: 'bg-vs-danger/10',
    borderColor: 'border-vs-danger/30',
  },
  info: {
    icon: <Phone className="w-4 h-4" />,
    color: '#00E5FF',
    bgColor: 'bg-vs-primary/10',
    borderColor: 'border-vs-primary/30',
  },
}

/**
 * Format seconds as MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * TimelineEvent - Individual event in the timeline
 */
const TimelineEvent: React.FC<{
  event: ThreatEvent
  index: number
  isLatest: boolean
}> = ({ event, index, isLatest }) => {
  const config = eventConfig[event.type]

  return (
    <motion.div
      className="flex gap-3 relative"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      {/* Timeline line */}
      <div className="relative flex flex-col items-center">
        {/* Dot */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor} border-2 ${config.borderColor} z-10`}
          style={{ color: config.color }}
        >
          {config.icon}
        </div>

        {/* Connecting line */}
        {!isLatest && (
          <div
            className="w-0.5 flex-1 mt-1"
            style={{ backgroundColor: `${config.color}40` }}
          />
        )}
      </div>

      {/* Event content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: config.color }}
          >
            {formatTime(event.timestamp)}
          </span>
          {event.threatLevel && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                event.threatLevel === 'high'
                  ? 'bg-vs-danger/20 text-vs-danger'
                  : event.threatLevel === 'medium'
                  ? 'bg-vs-warning/20 text-vs-warning'
                  : 'bg-vs-safe/20 text-vs-safe'
              }`}
            >
              {event.threatLevel.toUpperCase()}
            </span>
          )}
        </div>

        <div className="text-sm font-medium text-vs-text mb-1">{event.description}</div>

        {event.transcript && (
          <div className="text-xs text-vs-muted italic bg-vs-card/30 rounded p-2 mt-2 border border-vs-muted/10">
            "{event.transcript}"
          </div>
        )}
      </div>
    </motion.div>
  )
}

/**
 * ThreatTimeline - Visual timeline showing threat evolution during call
 * 
 * Features:
 * - Chronological event list with timestamps
 * - Color-coded events by type
 * - Icons for each event category
 * - Optional transcript excerpts
 * - Auto-scroll to latest event
 * - Threat level indicators
 * - Connecting lines between events
 */
export const ThreatTimeline: React.FC<ThreatTimelineProps> = ({
  events,
  currentTime,
  autoScroll = true,
  compact = false,
  maxHeight = '500px',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events are added
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length, autoScroll])

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp)

  if (compact) {
    return (
      <GlassCard variant="default" padding="sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-vs-muted">Events:</span>
          <div className="flex gap-1">
            {sortedEvents.slice(-5).map((event, i) => {
              const config = eventConfig[event.type]
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${config.bgColor}`}
                  style={{ color: config.color }}
                  title={event.description}
                >
                  {config.icon}
                </div>
              )
            })}
          </div>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard variant="default" noise padding="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-vs-text">Threat Timeline</h3>
          {currentTime !== undefined && (
            <span className="text-sm font-mono text-vs-primary">
              {formatTime(currentTime)}
            </span>
          )}
        </div>

        {/* Timeline */}
        <div
          ref={scrollRef}
          className="overflow-y-auto custom-scrollbar pr-2"
          style={{ maxHeight }}
        >
          {sortedEvents.length === 0 ? (
            <div className="text-center py-8 text-vs-muted text-sm">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No events detected yet</p>
              <p className="text-xs mt-1">Call is being monitored</p>
            </div>
          ) : (
            <div className="space-y-0">
              {sortedEvents.map((event, index) => (
                <TimelineEvent
                  key={`${event.timestamp}-${index}`}
                  event={event}
                  index={index}
                  isLatest={index === sortedEvents.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {sortedEvents.length > 0 && (
          <div className="pt-4 border-t border-vs-muted/10">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-vs-muted">Total Events</div>
                <div className="text-lg font-mono font-bold text-vs-text">
                  {sortedEvents.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-vs-muted">High Risk</div>
                <div className="text-lg font-mono font-bold text-vs-danger">
                  {sortedEvents.filter((e) => e.threatLevel === 'high').length}
                </div>
              </div>
              <div>
                <div className="text-xs text-vs-muted">Duration</div>
                <div className="text-lg font-mono font-bold text-vs-primary">
                  {formatTime(sortedEvents[sortedEvents.length - 1]?.timestamp || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

export default ThreatTimeline
