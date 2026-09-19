import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getDemoController,
  ScenarioType,
  ScenarioMetrics,
  TranscriptSegment,
  DetectionEvent,
  DemoScenario,
} from '../services/DemoController';

interface UseDemoModeReturn {
  // State
  isActive: boolean;
  currentScenario: DemoScenario | null;
  metrics: ScenarioMetrics;
  transcript: TranscriptSegment[];
  detectionEvents: DetectionEvent[];
  showGuardian: boolean;
  
  // Actions
  startScenario: (scenarioId: ScenarioType) => void;
  stopScenario: () => void;
  pauseScenario: () => void;
  resumeScenario: () => void;
  dismissGuardian: () => void;
  
  // Computed
  shieldScore: number;
}

/**
 * React hook for integrating demo mode into components
 * 
 * Usage:
 * ```tsx
 * const demo = useDemoMode();
 * 
 * // Start a scenario
 * demo.startScenario('irs-scam');
 * 
 * // Use the demo data
 * <ShieldScore metrics={demo.metrics} />
 * <ThreatTimeline events={demo.detectionEvents} />
 * ```
 */
export const useDemoMode = (): UseDemoModeReturn => {
  const demoController = getDemoController();
  const [isActive, setIsActive] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<DemoScenario | null>(null);
  const [metrics, setMetrics] = useState<ScenarioMetrics>({
    voiceAuthenticity: 0,
    scamLanguage: 0,
    urgencyIndicators: 0,
    financialRequests: 0,
  });
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [detectionEvents, setDetectionEvents] = useState<DetectionEvent[]>([]);
  const [showGuardian, setShowGuardian] = useState(false);

  // Use refs to avoid stale closures in callbacks
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const detectionEventsRef = useRef<DetectionEvent[]>([]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    detectionEventsRef.current = detectionEvents;
  }, [detectionEvents]);

  // Calculate shield score from metrics
  const shieldScore = Math.round(
    metrics.voiceAuthenticity * 0.25 +
    metrics.scamLanguage * 0.35 +
    metrics.urgencyIndicators * 0.20 +
    metrics.financialRequests * 0.20
  );

  // Start scenario
  const startScenario = useCallback((scenarioId: ScenarioType) => {
    // Reset state
    setMetrics({
      voiceAuthenticity: 0,
      scamLanguage: 0,
      urgencyIndicators: 0,
      financialRequests: 0,
    });
    setTranscript([]);
    setDetectionEvents([]);
    setShowGuardian(false);
    transcriptRef.current = [];
    detectionEventsRef.current = [];

    // Set current scenario
    const scenario = demoController.getScenarios().find(s => s.id === scenarioId);
    setCurrentScenario(scenario || null);
    setIsActive(true);

    // Register callbacks
    demoController.onTranscript((segment) => {
      const newTranscript = [...transcriptRef.current, segment];
      transcriptRef.current = newTranscript;
      setTranscript(newTranscript);
    });

    demoController.onMetrics((newMetrics) => {
      setMetrics(newMetrics);
    });

    demoController.onDetection((event) => {
      const newEvents = [...detectionEventsRef.current, event];
      detectionEventsRef.current = newEvents;
      setDetectionEvents(newEvents);
    });

    demoController.onGuardian(() => {
      setShowGuardian(true);
    });

    demoController.onComplete(() => {
      setIsActive(false);
    });

    // Start the scenario
    demoController.startScenario(scenarioId);
  }, [demoController]);

  // Stop scenario
  const stopScenario = useCallback(() => {
    demoController.stopScenario();
    setIsActive(false);
    setCurrentScenario(null);
  }, [demoController]);

  // Pause scenario
  const pauseScenario = useCallback(() => {
    demoController.pause();
  }, [demoController]);

  // Resume scenario
  const resumeScenario = useCallback(() => {
    demoController.resume();
  }, [demoController]);

  // Dismiss guardian
  const dismissGuardian = useCallback(() => {
    setShowGuardian(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      demoController.destroy();
    };
  }, [demoController]);

  return {
    isActive,
    currentScenario,
    metrics,
    transcript,
    detectionEvents,
    showGuardian,
    startScenario,
    stopScenario,
    pauseScenario,
    resumeScenario,
    dismissGuardian,
    shieldScore,
  };
};
