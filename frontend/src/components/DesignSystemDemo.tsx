import React, { useState } from 'react'
import { Shield, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { GlassCard, GradientText, GlowBadge, NoiseTexture } from './ui'
import Shield3D from './Shield3D'
import WaveformVisualizer from './WaveformVisualizer'
import ProtectDashboard from './ProtectDashboard'
import { AIGuardianPanel } from './AIGuardianPanel'
import { DemoScenarioSelector } from './DemoScenarioSelector'
import { ActivityTab } from './ActivityTab'
import { FamilyTab } from './FamilyTab'
import { AppShellDemo } from './AppShellDemo'
import { useDemoMode } from '../hooks/useDemoMode'

/**
 * DesignSystemDemo - Showcase of all design system components
 * Temporary component for testing visual design
 */
export const DesignSystemDemo: React.FC = () => {
  const [threatScore, setThreatScore] = useState(0)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showGuardian, setShowGuardian] = useState(false)
  const [showDemoMode, setShowDemoMode] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showFamily, setShowFamily] = useState(false)
  const [showAppShell, setShowAppShell] = useState(false)
  
  // Demo mode hook
  const demoMode = useDemoMode()

  // Show full app shell
  if (showAppShell) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowAppShell(false)}
          className="fixed top-4 left-4 z-50 px-4 py-2 bg-vs-card/80 backdrop-blur-xl border border-vs-primary/30 rounded-lg text-vs-primary hover:bg-vs-card transition-colors"
        >
          ← Back to Components
        </button>
        <AppShellDemo />
      </div>
    )
  }

  // Show full dashboard demo
  if (showDashboard) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDashboard(false)}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-vs-card/80 backdrop-blur-xl border border-vs-primary/30 rounded-lg text-vs-primary hover:bg-vs-card transition-colors"
        >
          ← Back to Components
        </button>
        <ProtectDashboard
          ownerPhone="+1 (555) 123-4567"
          status="active"
          onNavigate={(tab) => console.log('Navigate to:', tab)}
        />
      </div>
    )
  }

  // Show activity tab demo
  if (showActivity) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowActivity(false)}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-vs-card/80 backdrop-blur-xl border border-vs-primary/30 rounded-lg text-vs-primary hover:bg-vs-card transition-colors"
        >
          ← Back to Components
        </button>
        <ActivityTab
          onCallSelect={(call) => console.log('Selected call:', call)}
        />
      </div>
    )
  }

  // Show family tab demo
  if (showFamily) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowFamily(false)}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-vs-card/80 backdrop-blur-xl border border-vs-primary/30 rounded-lg text-vs-primary hover:bg-vs-card transition-colors"
        >
          ← Back to Components
        </button>
        <FamilyTab
          onAddMember={() => console.log('Add member')}
          onViewDetails={(member) => console.log('View details:', member)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-vs-background p-8 overflow-auto">
      <NoiseTexture opacity={0.03} animated />
      
      {/* Grid background */}
      <div className="fixed inset-0 grid-background opacity-50" style={{ zIndex: 0 }} />
      
      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <GradientText as="h1" className="text-6xl" glow>
            VoiceShield Sentinel
          </GradientText>
          <GradientText as="p" variant="primary" className="text-2xl">
            Design System Components
          </GradientText>
          
          {/* Dashboard Demo Button */}
          <div className="pt-4 flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => setShowAppShell(true)}
              className="px-8 py-4 bg-gradient-to-r from-primary/30 to-primary/20 border-2 border-primary/60 rounded-xl text-primary font-bold hover:from-primary/40 hover:to-primary/30 transition-all hover:shadow-[0_0_30px_rgba(0,229,255,0.5)] text-lg"
            >
              🚀 Launch Full App
            </button>
          </div>
          
          <div className="pt-2 flex gap-3 justify-center flex-wrap">
            <button
              onClick={() => setShowDashboard(true)}
              className="px-5 py-2.5 bg-vs-primary/20 border border-vs-primary/50 rounded-lg text-vs-primary text-sm font-semibold hover:bg-vs-primary/30 transition-all hover:shadow-[0_0_15px_rgba(0,229,255,0.4)]"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => setShowActivity(true)}
              className="px-5 py-2.5 bg-vs-success/20 border border-vs-success/50 rounded-lg text-vs-success text-sm font-semibold hover:bg-vs-success/30 transition-all hover:shadow-[0_0_15px_rgba(53,242,138,0.4)]"
            >
              📊 Activity
            </button>
            <button
              onClick={() => setShowFamily(true)}
              className="px-5 py-2.5 bg-purple-500/20 border border-purple-500/50 rounded-lg text-purple-300 text-sm font-semibold hover:bg-purple-500/30 transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]"
            >
              👨‍👩‍👧‍👦 Family
            </button>
            <button
              onClick={() => setShowGuardian(true)}
              className="px-5 py-2.5 bg-vs-danger/20 border border-vs-danger/50 rounded-lg text-vs-danger text-sm font-semibold hover:bg-vs-danger/30 transition-all hover:shadow-[0_0_15px_rgba(255,59,92,0.4)]"
            >
              🚨 Guardian
            </button>
            <button
              onClick={() => setShowDemoMode(true)}
              className="px-5 py-2.5 bg-vs-warning/20 border border-vs-warning/50 rounded-lg text-vs-warning text-sm font-semibold hover:bg-vs-warning/30 transition-all hover:shadow-[0_0_15px_rgba(255,176,32,0.4)]"
            >
              🎬 Demo
            </button>
          </div>
        </div>

        {/* 3D Shield Showcase */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">3D Animated Shield</h2>
          <GlassCard variant="primary" noise glow padding="xl">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Shield Display */}
              <div className="flex-shrink-0">
                <Shield3D threatScore={threatScore} size={300} autoRotate />
              </div>

              {/* Controls */}
              <div className="flex-1 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-vs-text font-semibold">
                      Threat Score: {threatScore}%
                    </label>
                    <GlowBadge
                      variant={threatScore < 30 ? 'safe' : threatScore < 70 ? 'warning' : 'danger'}
                      pulse
                    >
                      {threatScore < 30 ? 'Safe' : threatScore < 70 ? 'Warning' : 'High Risk'}
                    </GlowBadge>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={threatScore}
                    onChange={(e) => setThreatScore(parseInt(e.target.value))}
                    className="w-full h-2 bg-vs-card/50 rounded-lg appearance-none cursor-pointer accent-vs-primary"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setThreatScore(10)}
                    className="px-4 py-2 bg-vs-safe/20 border border-vs-safe/30 rounded-lg text-vs-safe hover:bg-vs-safe/30 transition-colors"
                  >
                    Safe (10%)
                  </button>
                  <button
                    onClick={() => setThreatScore(50)}
                    className="px-4 py-2 bg-vs-warning/20 border border-vs-warning/30 rounded-lg text-vs-warning hover:bg-vs-warning/30 transition-colors"
                  >
                    Warning (50%)
                  </button>
                  <button
                    onClick={() => setThreatScore(85)}
                    className="px-4 py-2 bg-vs-danger/20 border border-vs-danger/30 rounded-lg text-vs-danger hover:bg-vs-danger/30 transition-colors"
                  >
                    Danger (85%)
                  </button>
                </div>

                <div className="text-vs-muted text-sm space-y-2">
                  <p>• Glassmorphic 3D shield with real-time color transitions</p>
                  <p>• Smooth floating, rotation, and breathing animations</p>
                  <p>• Dynamic glow that intensifies with threat level</p>
                  <p>• Automatic fallback to 2D SVG if WebGL unavailable</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Demo Mode Scenarios */}
        {showDemoMode && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-vs-text">Demo Mode Scenarios</h2>
              <button
                onClick={() => setShowDemoMode(false)}
                className="px-4 py-2 bg-vs-card/80 backdrop-blur-xl border border-vs-primary/30 rounded-lg text-vs-primary hover:bg-vs-card transition-colors text-sm"
              >
                Hide Demo Mode
              </button>
            </div>
            <DemoScenarioSelector
              onScenarioStart={(scenarioId) => {
                console.log('Started scenario:', scenarioId);
              }}
              onScenarioStop={() => {
                console.log('Stopped scenario');
              }}
            />
          </section>
        )}

        {/* Waveform Visualizer */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Real-Time Waveform Visualizer</h2>
          <GlassCard variant="default" noise padding="lg">
            <div className="space-y-6">
              {/* Large waveform display */}
              <div className="bg-black/30 rounded-lg p-4">
                <WaveformVisualizer
                  width={800}
                  height={150}
                  barCount={64}
                  demoMode
                  threatLevel={threatScore}
                  showScanline
                />
              </div>

              {/* Variations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-vs-muted text-sm mb-2">Compact (32 bars)</p>
                  <div className="bg-black/30 rounded-lg p-3">
                    <WaveformVisualizer
                      width={400}
                      height={80}
                      barCount={32}
                      demoMode
                      threatLevel={threatScore}
                      showScanline={false}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-vs-muted text-sm mb-2">Dense (128 bars)</p>
                  <div className="bg-black/30 rounded-lg p-3">
                    <WaveformVisualizer
                      width={400}
                      height={80}
                      barCount={128}
                      barGap={1}
                      demoMode
                      threatLevel={threatScore}
                    />
                  </div>
                </div>
              </div>

              <div className="text-vs-muted text-sm space-y-2">
                <p>• Real-time frequency spectrum analysis via Web Audio API</p>
                <p>• Smooth animations with configurable decay and smoothing</p>
                <p>• Color gradients adapt to threat level automatically</p>
                <p>• Optional scanning effect for active monitoring feel</p>
                <p>• Demo mode for testing without audio source</p>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* GlassCard Variants */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Glass Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <GlassCard variant="default" noise>
              <h3 className="text-lg font-semibold text-vs-text mb-2">Default Card</h3>
              <p className="text-vs-muted text-sm">
                Standard glassmorphic card with subtle border and backdrop blur
              </p>
            </GlassCard>

            <GlassCard variant="primary" noise glow>
              <h3 className="text-lg font-semibold text-vs-primary mb-2">Primary Card</h3>
              <p className="text-vs-muted text-sm">
                Emphasized card with cyan glow effect
              </p>
            </GlassCard>

            <GlassCard variant="danger" noise glow>
              <h3 className="text-lg font-semibold text-vs-danger mb-2">Danger Card</h3>
              <p className="text-vs-muted text-sm">
                Alert card with red glow for high-risk situations
              </p>
            </GlassCard>

            <GlassCard variant="warning" noise hover>
              <h3 className="text-lg font-semibold text-vs-warning mb-2">Warning Card</h3>
              <p className="text-vs-muted text-sm">
                Hoverable card with amber styling
              </p>
            </GlassCard>

            <GlassCard variant="success" noise glow>
              <h3 className="text-lg font-semibold text-vs-safe mb-2">Success Card</h3>
              <p className="text-vs-muted text-sm">
                Safe/verified state with green glow
              </p>
            </GlassCard>

            <GlassCard variant="default" hover padding="lg">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-vs-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-vs-text">Interactive</h3>
                  <p className="text-vs-muted text-sm">Hover to see effect</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Gradient Text Variants */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Gradient Text</h2>
          <GlassCard noise padding="lg">
            <div className="space-y-4">
              <GradientText as="h2" variant="primary" className="text-4xl" glow>
                Primary Gradient - Cyan to Green
              </GradientText>
              <GradientText as="h2" variant="danger" className="text-4xl" glow>
                Danger Gradient - Warning to Red
              </GradientText>
              <GradientText as="h2" variant="warning" className="text-4xl">
                Warning Gradient - Yellow to Orange
              </GradientText>
              <GradientText as="h2" variant="success" className="text-4xl">
                Success Gradient - Green Spectrum
              </GradientText>
            </div>
          </GlassCard>
        </section>

        {/* Glow Badges */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Glow Badges</h2>
          <GlassCard noise padding="lg">
            <div className="space-y-6">
              {/* Status badges with pulse */}
              <div className="flex flex-wrap gap-3">
                <GlowBadge variant="safe" pulse icon={<CheckCircle />}>
                  Protected
                </GlowBadge>
                <GlowBadge variant="warning" pulse icon={<AlertTriangle />}>
                  Medium Risk
                </GlowBadge>
                <GlowBadge variant="danger" pulse icon={<AlertTriangle />}>
                  High Risk
                </GlowBadge>
                <GlowBadge variant="info" pulse icon={<Info />}>
                  Analyzing
                </GlowBadge>
                <GlowBadge variant="neutral">Inactive</GlowBadge>
              </div>

              {/* Size variants */}
              <div>
                <p className="text-vs-muted text-sm mb-2">Size Variants:</p>
                <div className="flex flex-wrap items-center gap-3">
                  <GlowBadge variant="info" size="sm" icon={<Shield />}>
                    Small
                  </GlowBadge>
                  <GlowBadge variant="info" size="md" icon={<Shield />}>
                    Medium
                  </GlowBadge>
                  <GlowBadge variant="info" size="lg" icon={<Shield />}>
                    Large
                  </GlowBadge>
                </div>
              </div>

              {/* Status examples */}
              <div>
                <p className="text-vs-muted text-sm mb-2">Status Examples:</p>
                <div className="flex flex-wrap gap-3">
                  <GlowBadge variant="safe">Voice Verified ✓</GlowBadge>
                  <GlowBadge variant="warning">87% Human Voice</GlowBadge>
                  <GlowBadge variant="danger">Scam Detected</GlowBadge>
                  <GlowBadge variant="info" pulse>Live Analysis</GlowBadge>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Combined Example */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Combined Example</h2>
          <GlassCard variant="primary" noise glow padding="xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <GradientText as="h2" className="text-3xl" glow>
                  Active Protection
                </GradientText>
                <GlowBadge variant="safe" pulse icon={<Shield />}>
                  Online
                </GlowBadge>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-vs-safe">12</div>
                  <div className="text-sm text-vs-muted">Threats Blocked</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-vs-primary">5</div>
                  <div className="text-sm text-vs-muted">Family Protected</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-vs-warning">24</div>
                  <div className="text-sm text-vs-muted">Calls Analyzed</div>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Typography Scale */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-vs-text">Typography</h2>
          <GlassCard noise padding="lg">
            <div className="space-y-3">
              <div className="text-display text-vs-text">Display Text (3rem)</div>
              <div className="text-hero text-vs-text">Hero Text (2rem)</div>
              <div className="text-title text-vs-text">Title Text (1.5rem)</div>
              <div className="text-body text-vs-text">Body Text (1rem)</div>
              <div className="text-small text-vs-muted">Small Text (0.875rem)</div>
              <div className="text-mono text-vs-primary">Mono: 00:42:15 | +1 (555) 123-4567</div>
            </div>
          </GlassCard>
        </section>
      </div>

      {/* AI Guardian Panel Demo */}
      <AIGuardianPanel
        isVisible={showGuardian}
        threatScore={87}
        threatReason="Multiple high-risk scam indicators detected in this call"
        detectedPatterns={[
          "Urgent payment request within first 2 minutes",
          "Request for banking credentials (account number, PIN)",
          "Caller refuses to provide callback number",
          "AI-generated voice detected (78% confidence)",
          "Spoofed caller ID from known scam number database"
        ]}
        recommendations={[
          "End the call immediately - this matches known scam patterns",
          "Do not share any financial information",
          "Report this number to the FTC at reportfraud.ftc.gov",
          "Block this number to prevent future calls"
        ]}
        onDismiss={() => setShowGuardian(false)}
        onEndCall={() => {
          setShowGuardian(false);
          alert('Call ended by AI Guardian');
        }}
        onContinueMonitoring={() => {
          setShowGuardian(false);
          alert('Continuing monitoring - Stay alert!');
        }}
        autoTTS={false}
      />
    </div>
  )
}

export default DesignSystemDemo
