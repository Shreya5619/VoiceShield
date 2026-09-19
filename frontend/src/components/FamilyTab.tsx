import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Shield,
  Plus,
  Phone,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingDown,
  UserPlus,
  Edit,
  MoreVertical,
} from 'lucide-react';
import { GlassCard, GradientText, GlowBadge, PageBackground } from './ui';

// Types
export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  phoneNumber: string;
  avatarColor: string;
  protectionStatus: 'active' | 'paused' | 'inactive';
  stats: {
    totalCalls: number;
    threatsBlocked: number;
    lastActivity?: Date;
    riskScore: number; // 0-100, lower is better
  };
}

interface FamilyTabProps {
  members?: FamilyMember[];
  onAddMember?: () => void;
  onEditMember?: (member: FamilyMember) => void;
  onViewDetails?: (member: FamilyMember) => void;
}

export const FamilyTab: React.FC<FamilyTabProps> = ({
  members: propMembers,
  onAddMember,
  onEditMember,
  onViewDetails,
}) => {
  // Demo data
  const demoMembers: FamilyMember[] = [
    {
      id: '1',
      name: 'Margaret Thompson',
      relationship: 'Mother',
      phoneNumber: '+1 (555) 234-5678',
      avatarColor: '#FF6B9D',
      protectionStatus: 'active',
      stats: {
        totalCalls: 47,
        threatsBlocked: 12,
        lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
        riskScore: 8,
      },
    },
    {
      id: '2',
      name: 'Robert Thompson',
      relationship: 'Father',
      phoneNumber: '+1 (555) 345-6789',
      avatarColor: '#4A90E2',
      protectionStatus: 'active',
      stats: {
        totalCalls: 32,
        threatsBlocked: 5,
        lastActivity: new Date(Date.now() - 5 * 60 * 60 * 1000),
        riskScore: 3,
      },
    },
    {
      id: '3',
      name: 'Emily Chen',
      relationship: 'Spouse',
      phoneNumber: '+1 (555) 456-7890',
      avatarColor: '#9B59B6',
      protectionStatus: 'active',
      stats: {
        totalCalls: 89,
        threatsBlocked: 3,
        lastActivity: new Date(Date.now() - 30 * 60 * 1000),
        riskScore: 2,
      },
    },
    {
      id: '4',
      name: 'David Thompson',
      relationship: 'Son',
      phoneNumber: '+1 (555) 567-8901',
      avatarColor: '#E67E22',
      protectionStatus: 'paused',
      stats: {
        totalCalls: 156,
        threatsBlocked: 1,
        lastActivity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        riskScore: 1,
      },
    },
  ];

  const [members] = useState<FamilyMember[]>(propMembers || demoMembers);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);

  // Calculate aggregate stats
  const totalMembers = members.length;
  const activeMembers = members.filter((m) => m.protectionStatus === 'active').length;
  const totalThreatsBlocked = members.reduce((sum, m) => sum + m.stats.threatsBlocked, 0);
  const avgRiskScore = Math.round(
    members.reduce((sum, m) => sum + m.stats.riskScore, 0) / members.length
  );

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <GlowBadge variant="safe" size="sm" pulse>ACTIVE</GlowBadge>;
      case 'paused':
        return <GlowBadge variant="warning" size="sm">PAUSED</GlowBadge>;
      case 'inactive':
        return <GlowBadge variant="danger" size="sm">INACTIVE</GlowBadge>;
      default:
        return null;
    }
  };

  const getRiskLevel = (score: number): { label: string; color: string; variant: 'safe' | 'warning' | 'danger' } => {
    if (score >= 50) return { label: 'HIGH RISK', color: 'text-danger', variant: 'danger' };
    if (score >= 20) return { label: 'MODERATE', color: 'text-warning', variant: 'warning' };
    return { label: 'LOW RISK', color: 'text-safe', variant: 'safe' };
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <PageBackground grid noise glow>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <GradientText className="text-4xl font-bold" glow>
            Family Protection
          </GradientText>
          <p className="text-white/60">
            Monitor and manage VoiceShield protection for your family members
          </p>
        </div>

        <button
          onClick={onAddMember}
          className="px-6 py-3 bg-primary/20 border border-primary/50 rounded-xl text-primary font-semibold hover:bg-primary/30 transition-all hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Member
        </button>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard variant="primary" padding="md" glow>
          <div className="space-y-1">
            <div className="text-3xl font-bold text-primary font-mono">{totalMembers}</div>
            <div className="text-sm text-white/70">Family Members</div>
          </div>
        </GlassCard>

        <GlassCard variant="success" padding="md" glow>
          <div className="space-y-1">
            <div className="text-3xl font-bold text-safe font-mono">{activeMembers}</div>
            <div className="text-sm text-white/70">Protected Now</div>
          </div>
        </GlassCard>

        <GlassCard variant="danger" padding="md" glow>
          <div className="space-y-1">
            <div className="text-3xl font-bold text-danger font-mono">{totalThreatsBlocked}</div>
            <div className="text-sm text-white/70">Threats Blocked</div>
          </div>
        </GlassCard>

        <GlassCard variant="primary" padding="md">
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-safe font-mono">{avgRiskScore}</div>
              <div className="text-lg text-white/60">/100</div>
            </div>
            <div className="text-sm text-white/70">Avg Risk Score</div>
          </div>
        </GlassCard>
      </div>

      {/* Family Members Grid */}
      {members.length === 0 ? (
        <GlassCard padding="xl">
          <div className="text-center py-12">
            <Users className="w-20 h-20 text-white/10 mx-auto mb-4" />
            <GradientText className="text-2xl font-bold mb-2">
              No Family Members Added
            </GradientText>
            <p className="text-white/60 max-w-md mx-auto mb-6">
              Start protecting your loved ones by adding family members to VoiceShield.
              Monitor their calls and block scams automatically.
            </p>
            <button
              onClick={onAddMember}
              className="px-6 py-3 bg-primary/20 border border-primary/50 rounded-xl text-primary font-semibold hover:bg-primary/30 transition-all inline-flex items-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Add First Family Member
            </button>
          </div>
        </GlassCard>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-4">
          {members.map((member, index) => {
            const riskLevel = getRiskLevel(member.stats.riskScore);

            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard
                  variant={member.protectionStatus === 'active' ? 'primary' : 'default'}
                  hover
                  padding="lg"
                  className="cursor-pointer h-full"
                  onClick={() => onViewDetails?.(member)}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
                          style={{
                            background: `linear-gradient(135deg, ${member.avatarColor}cc, ${member.avatarColor}ff)`,
                            boxShadow: `0 0 20px ${member.avatarColor}40`,
                          }}
                        >
                          {getInitials(member.name)}
                        </div>

                        {/* Name & Relationship */}
                        <div>
                          <h3 className="text-xl font-semibold text-white mb-1">
                            {member.name}
                          </h3>
                          <p className="text-white/60 text-sm">{member.relationship}</p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {getStatusBadge(member.protectionStatus)}
                    </div>

                    {/* Phone Number */}
                    <div className="flex items-center gap-2 text-white/70">
                      <Phone className="w-4 h-4" />
                      <span className="font-mono text-sm">{member.phoneNumber}</span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white font-mono">
                          {member.stats.totalCalls}
                        </div>
                        <div className="text-xs text-white/60 mt-1">Calls</div>
                      </div>

                      <div className="text-center">
                        <div className="text-2xl font-bold text-danger font-mono">
                          {member.stats.threatsBlocked}
                        </div>
                        <div className="text-xs text-white/60 mt-1">Blocked</div>
                      </div>

                      <div className="text-center">
                        <div className={`text-2xl font-bold font-mono ${riskLevel.color}`}>
                          {member.stats.riskScore}
                        </div>
                        <div className="text-xs text-white/60 mt-1">Risk</div>
                      </div>
                    </div>

                    {/* Risk Bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-white/60">Risk Level</span>
                        <span className={`font-semibold ${riskLevel.color}`}>
                          {riskLevel.label}
                        </span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${member.stats.riskScore}%` }}
                          transition={{ delay: 0.3 + index * 0.05, duration: 0.8 }}
                          className={`h-full rounded-full ${
                            member.stats.riskScore >= 50
                              ? 'bg-danger'
                              : member.stats.riskScore >= 20
                              ? 'bg-warning'
                              : 'bg-safe'
                          }`}
                          style={{
                            boxShadow: `0 0 10px ${
                              member.stats.riskScore >= 50
                                ? 'rgba(255, 59, 92, 0.5)'
                                : member.stats.riskScore >= 20
                                ? 'rgba(255, 176, 32, 0.5)'
                                : 'rgba(53, 242, 138, 0.5)'
                            }`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Last Activity */}
                    {member.stats.lastActivity && (
                      <div className="flex items-center gap-2 text-sm text-white/50">
                        <Clock className="w-4 h-4" />
                        Last activity {formatTimestamp(member.stats.lastActivity)}
                      </div>
                    )}

                    {/* Protection Status Message */}
                    {member.protectionStatus === 'active' && member.stats.threatsBlocked > 0 && (
                      <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg px-3 py-2">
                        <Shield className="w-4 h-4" />
                        <span>
                          Protected from {member.stats.threatsBlocked} threat
                          {member.stats.threatsBlocked !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}

                    {member.protectionStatus === 'paused' && (
                      <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Protection is paused</span>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info Banner */}
      <GlassCard variant="primary" padding="md">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-white/90 font-medium mb-1">Family Protection Features</p>
            <p className="text-white/60">
              VoiceShield monitors calls in real-time, detects AI voices and scam patterns,
              and automatically blocks high-risk calls. Each family member gets their own
              protection dashboard with detailed threat analysis.
            </p>
          </div>
        </div>
      </GlassCard>
      </div>
    </PageBackground>
  );
};
