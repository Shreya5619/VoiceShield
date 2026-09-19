import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, Volume2, VolumeX, AlertTriangle, PhoneOff, Eye } from 'lucide-react';
import { GlassCard, GradientText } from './ui';

interface AIGuardianPanelProps {
  isVisible: boolean;
  threatScore: number;
  threatReason: string;
  detectedPatterns: string[];
  recommendations: string[];
  onDismiss: () => void;
  onEndCall: () => void;
  onContinueMonitoring: () => void;
  autoTTS?: boolean;
}

export const AIGuardianPanel: React.FC<AIGuardianPanelProps> = ({
  isVisible,
  threatScore,
  threatReason,
  detectedPatterns,
  recommendations,
  onDismiss,
  onEndCall,
  onContinueMonitoring,
  autoTTS = true,
}) => {
  const [ttsEnabled, setTtsEnabled] = useState(autoTTS);
  const [hasSpoken, setHasSpoken] = useState(false);

  // Text-to-speech warning
  useEffect(() => {
    if (isVisible && ttsEnabled && !hasSpoken && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        `Warning: High risk call detected. ${threatReason}. Consider ending the call.`
      );
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      window.speechSynthesis.cancel(); // Clear any existing speech
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 500); // Small delay for dramatic effect
      
      setHasSpoken(true);
    }

    // Cleanup
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isVisible, ttsEnabled, hasSpoken, threatReason]);

  // Reset spoken state when panel closes
  useEffect(() => {
    if (!isVisible) {
      setHasSpoken(false);
    }
  }, [isVisible]);

  const toggleTTS = () => {
    setTtsEnabled(!ttsEnabled);
    if (ttsEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const getThreatLevel = () => {
    if (threatScore >= 80) return 'CRITICAL';
    if (threatScore >= 70) return 'HIGH';
    return 'ELEVATED';
  };

  const getThreatColor = () => {
    if (threatScore >= 80) return 'text-danger';
    if (threatScore >= 70) return 'text-danger';
    return 'text-warning';
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          style={{
            background: 'radial-gradient(circle at center, rgba(255, 59, 92, 0.15) 0%, rgba(5, 7, 11, 0.95) 70%)',
          }}
        >
          {/* Background pulse effect */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0.1 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
            className="absolute inset-0 bg-danger rounded-full blur-3xl"
          />

          {/* Main panel */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.1 }}
            className="relative z-10 max-w-2xl w-full mx-4"
          >
            <GlassCard variant="danger" glow className="p-8 md:p-12">
              {/* Close button */}
              <button
                onClick={onDismiss}
                className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                aria-label="Dismiss alert"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>

              {/* TTS toggle */}
              <button
                onClick={toggleTTS}
                className="absolute top-4 right-16 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                aria-label={ttsEnabled ? 'Mute voice alert' : 'Enable voice alert'}
              >
                {ttsEnabled ? (
                  <Volume2 className="w-5 h-5 text-primary" />
                ) : (
                  <VolumeX className="w-5 h-5 text-white/60" />
                )}
              </button>

              {/* Header with animated shield */}
              <div className="flex flex-col items-center mb-8">
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, -5, 5, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }}
                  className="mb-6"
                >
                  <div className="relative">
                    <Shield className="w-24 h-24 text-danger drop-shadow-[0_0_20px_rgba(255,59,92,0.5)]" strokeWidth={1.5} />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <AlertTriangle className="w-10 h-10 text-white" strokeWidth={2.5} />
                    </motion.div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center"
                >
                  <div className={`text-sm font-mono font-bold mb-2 ${getThreatColor()}`}>
                    {getThreatLevel()} RISK DETECTED
                  </div>
                  <GradientText className="text-3xl md:text-4xl font-bold mb-3">
                    AI GUARDIAN INTERVENTION
                  </GradientText>
                  <p className="text-white/80 text-lg max-w-md">
                    {threatReason}
                  </p>
                </motion.div>
              </div>

              {/* Threat Score */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="mb-8"
              >
                <div className="bg-white/5 rounded-xl p-6 border border-danger/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white/60 text-sm font-medium">THREAT SCORE</span>
                    <span className={`text-3xl font-bold font-mono ${getThreatColor()}`}>
                      {threatScore}/100
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${threatScore}%` }}
                      transition={{ delay: 0.5, duration: 1, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-warning via-danger to-danger rounded-full"
                      style={{
                        boxShadow: '0 0 20px rgba(255, 59, 92, 0.5)',
                      }}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Detected Patterns */}
              {detectedPatterns.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mb-8"
                >
                  <h3 className="text-white/80 font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger" />
                    Detected Threat Patterns
                  </h3>
                  <div className="space-y-2">
                    {detectedPatterns.map((pattern, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + index * 0.1 }}
                        className="bg-danger/10 border border-danger/20 rounded-lg px-4 py-3 flex items-start gap-3"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-danger mt-2 flex-shrink-0" />
                        <span className="text-white/90 text-sm">{pattern}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="mb-8"
                >
                  <h3 className="text-white/80 font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Recommended Actions
                  </h3>
                  <div className="space-y-2">
                    {recommendations.map((recommendation, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + index * 0.1 }}
                        className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-start gap-3"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <span className="text-white/90 text-sm">{recommendation}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <button
                  onClick={onEndCall}
                  className="flex-1 px-6 py-4 bg-danger hover:bg-danger/80 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-danger/20 hover:shadow-danger/40"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Call Now
                </button>
                <button
                  onClick={onContinueMonitoring}
                  className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 border border-white/20"
                >
                  <Eye className="w-5 h-5" />
                  Continue Monitoring
                </button>
              </motion.div>

              {/* Disclaimer */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-white/40 text-xs text-center mt-6"
              >
                This is an automated alert based on AI analysis. Use your judgment when making decisions.
              </motion.p>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
