import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Shield,
  AlertTriangle,
  Clock,
  TrendingUp,
  Filter,
  Search,
  ChevronDown,
} from 'lucide-react';
import { GlassCard, GradientText, GlowBadge, PageBackground } from './ui';

// Types
export interface CallRecord {
  id: string;
  phoneNumber: string;
  callerName?: string;
  timestamp: Date;
  duration: number; // seconds
  direction: 'incoming' | 'outgoing' | 'missed';
  threatScore: number; // 0-100
  shieldScore: number; // 0-100
  scamType?: string;
  wasBlocked: boolean;
  aiDetected: boolean;
  transcript?: string;
  detectedPatterns: string[];
}

interface ActivityTabProps {
  calls?: CallRecord[];
  onCallSelect?: (call: CallRecord) => void;
}

export const ActivityTab: React.FC<ActivityTabProps> = ({
  calls: propCalls,
  onCallSelect,
}) => {
  // Demo data if no calls provided
  const demoCallsData: CallRecord[] = [
    {
      id: '1',
      phoneNumber: '+1 (202) 555-0123',
      callerName: 'IRS Department',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      duration: 180,
      direction: 'incoming',
      threatScore: 89,
      shieldScore: 89,
      scamType: 'Tax Scam',
      wasBlocked: true,
      aiDetected: true,
      detectedPatterns: ['Payment urgency', 'Government impersonation', 'Gift card request'],
    },
    {
      id: '2',
      phoneNumber: '+1 (555) 987-6543',
      callerName: 'Unknown',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      duration: 120,
      direction: 'incoming',
      threatScore: 78,
      shieldScore: 78,
      scamType: 'Family Emergency',
      wasBlocked: false,
      aiDetected: true,
      detectedPatterns: ['Identity fishing', 'Bail money request', 'AI voice cloning'],
    },
    {
      id: '3',
      phoneNumber: '+1 (425) 555-0199',
      callerName: 'Microsoft Support',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      duration: 240,
      direction: 'incoming',
      threatScore: 82,
      shieldScore: 82,
      scamType: 'Tech Support',
      wasBlocked: true,
      aiDetected: false,
      detectedPatterns: ['Remote access request', 'Fake virus warning', 'Payment pressure'],
    },
    {
      id: '4',
      phoneNumber: '+1 (555) 123-4567',
      callerName: 'Sarah Johnson',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      duration: 420,
      direction: 'outgoing',
      threatScore: 5,
      shieldScore: 5,
      wasBlocked: false,
      aiDetected: false,
      detectedPatterns: [],
    },
    {
      id: '5',
      phoneNumber: '+1 (800) 555-0100',
      callerName: 'Bank of America',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      duration: 0,
      direction: 'missed',
      threatScore: 15,
      shieldScore: 15,
      wasBlocked: false,
      aiDetected: false,
      detectedPatterns: [],
    },
    {
      id: '6',
      phoneNumber: '+1 (555) 444-8888',
      callerName: 'Lottery Winner',
      timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      duration: 90,
      direction: 'incoming',
      threatScore: 92,
      shieldScore: 92,
      scamType: 'Prize Scam',
      wasBlocked: true,
      aiDetected: true,
      detectedPatterns: ['Fake prize', 'Fee request', 'Pressure tactics'],
    },
  ];

  const [calls] = useState<CallRecord[]>(propCalls || demoCallsData);
  const [filterType, setFilterType] = useState<'all' | 'threats' | 'safe' | 'blocked'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'threat'>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort calls
  const filteredCalls = calls
    .filter((call) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          call.phoneNumber.toLowerCase().includes(query) ||
          call.callerName?.toLowerCase().includes(query) ||
          call.scamType?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .filter((call) => {
      // Type filter
      switch (filterType) {
        case 'threats':
          return call.threatScore >= 70;
        case 'safe':
          return call.threatScore < 30;
        case 'blocked':
          return call.wasBlocked;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return b.timestamp.getTime() - a.timestamp.getTime();
      } else {
        return b.threatScore - a.threatScore;
      }
    });

  // Stats
  const stats = {
    total: calls.length,
    threats: calls.filter((c) => c.threatScore >= 70).length,
    blocked: calls.filter((c) => c.wasBlocked).length,
    aiDetected: calls.filter((c) => c.aiDetected).length,
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'incoming':
        return <PhoneIncoming className="w-4 h-4" />;
      case 'outgoing':
        return <PhoneOutgoing className="w-4 h-4" />;
      case 'missed':
        return <PhoneMissed className="w-4 h-4" />;
      default:
        return <Phone className="w-4 h-4" />;
    }
  };

  const getThreatLevel = (score: number): { 
    label: string; 
    color: string; 
    glassVariant: 'success' | 'warning' | 'danger';
    badgeVariant: 'safe' | 'warning' | 'danger';
  } => {
    if (score >= 70) return { 
      label: 'HIGH RISK', 
      color: 'text-danger', 
      glassVariant: 'danger',
      badgeVariant: 'danger'
    };
    if (score >= 30) return { 
      label: 'MODERATE', 
      color: 'text-warning', 
      glassVariant: 'warning',
      badgeVariant: 'warning'
    };
    return { 
      label: 'SAFE', 
      color: 'text-safe', 
      glassVariant: 'success',
      badgeVariant: 'safe'
    };
  };

  return (
    <PageBackground grid noise>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <GradientText className="text-4xl font-bold" glow>
          Call Activity
        </GradientText>
        <p className="text-white/60">
          Complete history of analyzed calls with threat detection insights
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard variant="primary" padding="md" glow={filterType === 'all'}>
          <button
            onClick={() => setFilterType('all')}
            className="w-full text-left space-y-1"
          >
            <div className="text-3xl font-bold text-white font-mono">{stats.total}</div>
            <div className="text-sm text-white/70">Total Calls</div>
          </button>
        </GlassCard>
        
        <GlassCard variant="danger" padding="md" glow={filterType === 'threats'}>
          <button
            onClick={() => setFilterType('threats')}
            className="w-full text-left space-y-1"
          >
            <div className="text-3xl font-bold text-danger font-mono">{stats.threats}</div>
            <div className="text-sm text-white/70">Threats Detected</div>
          </button>
        </GlassCard>
        
        <GlassCard variant="warning" padding="md" glow={filterType === 'blocked'}>
          <button
            onClick={() => setFilterType('blocked')}
            className="w-full text-left space-y-1"
          >
            <div className="text-3xl font-bold text-warning font-mono">{stats.blocked}</div>
            <div className="text-sm text-white/70">Calls Blocked</div>
          </button>
        </GlassCard>
        
        <GlassCard variant="primary" padding="md">
          <div className="space-y-1">
            <div className="text-3xl font-bold text-primary font-mono">{stats.aiDetected}</div>
            <div className="text-sm text-white/70">AI Voices Found</div>
          </div>
        </GlassCard>
      </div>

      {/* Filters and Search */}
      <GlassCard padding="md">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search calls by number, name, or scam type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'threat')}
              className="appearance-none pl-4 pr-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
            >
              <option value="recent">Most Recent</option>
              <option value="threat">Highest Threat</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
          </div>
        </div>
      </GlassCard>

      {/* Call History List */}
      <div className="space-y-3">
        {filteredCalls.length === 0 ? (
          <GlassCard padding="xl">
            <div className="text-center py-12">
              <Phone className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-lg">No calls found</p>
              <p className="text-white/40 text-sm mt-2">
                {searchQuery ? 'Try a different search term' : 'Your call history will appear here'}
              </p>
            </div>
          </GlassCard>
        ) : (
          filteredCalls.map((call, index) => {
            const threat = getThreatLevel(call.shieldScore);
            
            return (
              <motion.div
                key={call.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard
                  variant={threat.glassVariant}
                  hover
                  padding="lg"
                  className="cursor-pointer"
                  onClick={() => onCallSelect?.(call)}
                >
                  <div className="flex items-start gap-4">
                    {/* Direction Icon */}
                    <div className={`p-3 rounded-xl ${
                      call.direction === 'missed' 
                        ? 'bg-warning/20 text-warning'
                        : call.direction === 'outgoing'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-white/10 text-white'
                    }`}>
                      {getDirectionIcon(call.direction)}
                    </div>

                    {/* Call Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-white truncate">
                            {call.callerName || 'Unknown Caller'}
                          </h3>
                          <p className="text-white/60 text-sm font-mono">{call.phoneNumber}</p>
                        </div>
                        
                        {/* Threat Badge */}
                        <div className="flex-shrink-0">
                          <GlowBadge variant={threat.badgeVariant} size="sm">
                            {threat.label}
                          </GlowBadge>
                        </div>
                      </div>

                      {/* Metadata Row */}
                      <div className="flex items-center gap-4 text-sm text-white/60 mb-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatTimestamp(call.timestamp)}
                        </div>
                        {call.duration > 0 && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {formatDuration(call.duration)}
                          </div>
                        )}
                        {call.aiDetected && (
                          <div className="flex items-center gap-1 text-danger">
                            <AlertTriangle className="w-4 h-4" />
                            AI Voice
                          </div>
                        )}
                      </div>

                      {/* Shield Score Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-white/60">Shield Score</span>
                          <span className={`font-mono font-bold ${threat.color}`}>
                            {call.shieldScore}/100
                          </span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              call.shieldScore >= 70
                                ? 'bg-danger'
                                : call.shieldScore >= 30
                                ? 'bg-warning'
                                : 'bg-safe'
                            }`}
                            style={{ width: `${call.shieldScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Detected Patterns */}
                      {call.detectedPatterns.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {call.detectedPatterns.map((pattern, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white/70"
                            >
                              {pattern}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Blocked Badge */}
                      {call.wasBlocked && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="text-primary font-medium">
                            Call blocked by VoiceShield
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Empty State for No Calls */}
      {calls.length === 0 && (
        <GlassCard padding="xl">
          <div className="text-center py-12">
            <TrendingUp className="w-20 h-20 text-white/10 mx-auto mb-4" />
            <GradientText className="text-2xl font-bold mb-2">
              No Call History Yet
            </GradientText>
            <p className="text-white/60 max-w-md mx-auto">
              When you start making or receiving calls with VoiceShield protection,
              they'll appear here with detailed threat analysis.
            </p>
          </div>
        </GlassCard>
      )}
      </div>
    </PageBackground>
  );
};
