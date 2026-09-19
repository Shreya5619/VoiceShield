import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, AlertTriangle, Shield, Users } from 'lucide-react';
import { GlassCard, GradientText } from './ui';
import { getDemoController, ScenarioType, DemoScenario } from '../services/DemoController';

interface DemoScenarioSelectorProps {
  onScenarioStart?: (scenarioId: ScenarioType) => void;
  onScenarioStop?: () => void;
}

export const DemoScenarioSelector: React.FC<DemoScenarioSelectorProps> = ({
  onScenarioStart,
  onScenarioStop,
}) => {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const demoController = getDemoController();
  const scenarios = demoController.getScenarios();

  // Update timer
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const time = demoController.getCurrentTime();
      setCurrentTime(time);
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, demoController]);

  const handleStartScenario = (scenarioId: ScenarioType) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    setSelectedScenario(scenarioId);
    setIsPlaying(true);
    setIsPaused(false);
    setDuration(scenario.duration);
    setCurrentTime(0);

    demoController.startScenario(scenarioId);
    onScenarioStart?.(scenarioId);
  };

  const handlePauseResume = () => {
    if (isPaused) {
      demoController.resume();
      setIsPaused(false);
    } else {
      demoController.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    demoController.stopScenario();
    setIsPlaying(false);
    setIsPaused(false);
    setSelectedScenario(null);
    setCurrentTime(0);
    onScenarioStop?.();
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getScenarioIcon = (id: ScenarioType) => {
    switch (id) {
      case 'irs-scam':
        return <AlertTriangle className="w-6 h-6" />;
      case 'tech-support':
        return <Shield className="w-6 h-6" />;
      case 'grandparent-scam':
        return <Users className="w-6 h-6" />;
    }
  };

  const getScenarioColor = (id: ScenarioType) => {
    switch (id) {
      case 'irs-scam':
        return 'danger';
      case 'tech-support':
        return 'warning';
      case 'grandparent-scam':
        return 'primary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Scenario Controls */}
      <AnimatePresence>
        {isPlaying && selectedScenario && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard variant={getScenarioColor(selectedScenario)} glow padding="lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getScenarioIcon(selectedScenario)}
                    <div>
                      <h3 className="font-semibold text-white">
                        {scenarios.find(s => s.id === selectedScenario)?.name}
                      </h3>
                      <p className="text-sm text-white/60">
                        {isPaused ? 'PAUSED' : 'PLAYING'}
                      </p>
                    </div>
                  </div>

                  {/* Control buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePauseResume}
                      className="p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      aria-label={isPaused ? 'Resume' : 'Pause'}
                    >
                      {isPaused ? (
                        <Play className="w-5 h-5 text-white" />
                      ) : (
                        <Pause className="w-5 h-5 text-white" />
                      )}
                    </button>
                    <button
                      onClick={handleStop}
                      className="p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      aria-label="Stop"
                    >
                      <Square className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-white/60 font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-white rounded-full"
                      style={{
                        width: `${(currentTime / duration) * 100}%`,
                        boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                      }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scenario Selection */}
      {!isPlaying && (
        <div>
          <div className="mb-4">
            <GradientText className="text-2xl font-bold" glow>
              Demo Scenarios
            </GradientText>
            <p className="text-white/60 text-sm mt-1">
              Experience VoiceShield's AI protection with realistic scam simulations
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {scenarios.map((scenario) => (
              <motion.div
                key={scenario.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <GlassCard
                  variant={getScenarioColor(scenario.id as ScenarioType)}
                  hover
                  padding="lg"
                  className="h-full cursor-pointer"
                  onClick={() => handleStartScenario(scenario.id as ScenarioType)}
                >
                  <div className="flex flex-col h-full">
                    {/* Icon */}
                    <div className="mb-4 p-3 rounded-xl bg-white/10 w-fit">
                      {getScenarioIcon(scenario.id as ScenarioType)}
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {scenario.name}
                      </h3>
                      <p className="text-sm text-white/70 mb-4">
                        {scenario.description}
                      </p>
                    </div>

                    {/* Info */}
                    <div className="pt-4 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Duration</span>
                        <span className="text-white/80 font-mono">
                          {formatTime(scenario.duration)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Caller</span>
                        <span className="text-white/80 font-mono truncate ml-2">
                          {scenario.callerName}
                        </span>
                      </div>
                    </div>

                    {/* Play button */}
                    <button className="mt-4 w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center justify-center gap-2 text-white font-semibold">
                      <Play className="w-4 h-4" />
                      Start Scenario
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Info banner */}
      <GlassCard variant="primary" padding="md">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-white/90 font-medium mb-1">
              Safe Testing Environment
            </p>
            <p className="text-white/60">
              These are pre-recorded scenarios designed to showcase VoiceShield's AI detection capabilities. 
              No actual calls are being made, and all data is simulated.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
