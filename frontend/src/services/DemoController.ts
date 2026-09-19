/**
 * DemoController - Pre-scripted scam scenario simulation
 * 
 * Provides 3 realistic scam scenarios with timed events:
 * 1. IRS Tax Scam - Threatening call demanding immediate payment
 * 2. Tech Support Scam - Fake Microsoft tech support
 * 3. Grandparent Scam - Impersonation of family member in distress
 */

export type ScenarioType = 'irs-scam' | 'tech-support' | 'grandparent-scam';

export interface DemoEvent {
  timestamp: number; // milliseconds from start
  type: 'transcript' | 'detection' | 'metric-update' | 'guardian-trigger';
  data: any;
}

export interface ScenarioMetrics {
  voiceAuthenticity: number; // 0-100 (lower = more human)
  scamLanguage: number; // 0-100
  urgencyIndicators: number; // 0-100
  financialRequests: number; // 0-100
}

export interface TranscriptSegment {
  speaker: 'caller' | 'user';
  text: string;
  timestamp: number;
}

export interface DetectionEvent {
  type: 'normal' | 'urgency' | 'financial' | 'identity' | 'scam' | 'info';
  title: string;
  description?: string;
  threatLevel: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface DemoScenario {
  id: ScenarioType;
  name: string;
  description: string;
  callerName: string;
  callerNumber: string;
  duration: number; // total duration in ms
  events: DemoEvent[];
}

export class DemoController {
  private scenario: DemoScenario | null = null;
  private startTime: number = 0;
  private eventIndex: number = 0;
  private isPlaying: boolean = false;
  private intervalId: number | null = null;
  
  // Callbacks
  private onTranscriptUpdate?: (segment: TranscriptSegment) => void;
  private onMetricsUpdate?: (metrics: ScenarioMetrics) => void;
  private onDetectionEvent?: (event: DetectionEvent) => void;
  private onGuardianTrigger?: () => void;
  private onScenarioComplete?: () => void;

  constructor() {}

  // Scenario definitions
  private scenarios: Record<ScenarioType, DemoScenario> = {
    'irs-scam': {
      id: 'irs-scam',
      name: 'IRS Tax Scam',
      description: 'Threatening call claiming you owe back taxes with immediate arrest threatened',
      callerName: 'IRS Department',
      callerNumber: '+1 (202) 555-0123',
      duration: 45000, // 45 seconds
      events: [
        {
          timestamp: 0,
          type: 'transcript',
          data: { speaker: 'caller', text: 'This is Officer David Johnson from the Internal Revenue Service.' }
        },
        {
          timestamp: 1000,
          type: 'detection',
          data: { type: 'info', title: 'Call started', description: 'IRS Department', threatLevel: 'low' }
        },
        {
          timestamp: 3000,
          type: 'metric-update',
          data: { voiceAuthenticity: 15, scamLanguage: 20, urgencyIndicators: 10, financialRequests: 5 }
        },
        {
          timestamp: 4000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'We have been trying to reach you about a serious issue with your tax returns for 2023.' }
        },
        {
          timestamp: 7000,
          type: 'detection',
          data: { type: 'scam', title: 'Authority impersonation detected', description: 'Claims to be from IRS', threatLevel: 'medium' }
        },
        {
          timestamp: 8000,
          type: 'metric-update',
          data: { voiceAuthenticity: 25, scamLanguage: 35, urgencyIndicators: 25, financialRequests: 10 }
        },
        {
          timestamp: 9000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'You owe $8,742 in back taxes and penalties. This is your final notice before legal action.' }
        },
        {
          timestamp: 12000,
          type: 'detection',
          data: { type: 'financial', title: 'Large payment request', description: '$8,742 demand', threatLevel: 'high' }
        },
        {
          timestamp: 13000,
          type: 'detection',
          data: { type: 'urgency', title: 'Threat language detected', description: '"Final notice", "Legal action"', threatLevel: 'high' }
        },
        {
          timestamp: 14000,
          type: 'metric-update',
          data: { voiceAuthenticity: 35, scamLanguage: 55, urgencyIndicators: 60, financialRequests: 45 }
        },
        {
          timestamp: 15000,
          type: 'transcript',
          data: { speaker: 'user', text: 'I don\'t remember receiving any notices about this.' }
        },
        {
          timestamp: 18000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Our records show multiple attempts to contact you. If you don\'t pay immediately, the local police will be dispatched to your address for arrest.' }
        },
        {
          timestamp: 22000,
          type: 'detection',
          data: { type: 'urgency', title: 'Extreme pressure tactics', description: 'Arrest threat, immediate payment', threatLevel: 'high' }
        },
        {
          timestamp: 23000,
          type: 'metric-update',
          data: { voiceAuthenticity: 45, scamLanguage: 70, urgencyIndicators: 85, financialRequests: 60 }
        },
        {
          timestamp: 25000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'You need to purchase gift cards immediately to settle this debt. Go to your nearest store and buy $8,742 in iTunes gift cards.' }
        },
        {
          timestamp: 29000,
          type: 'detection',
          data: { type: 'financial', title: 'Gift card payment request', description: 'Classic scam payment method', threatLevel: 'high' }
        },
        {
          timestamp: 30000,
          type: 'detection',
          data: { type: 'identity', title: 'AI-generated voice detected', description: 'Voice synthesis indicators present', threatLevel: 'high' }
        },
        {
          timestamp: 31000,
          type: 'metric-update',
          data: { voiceAuthenticity: 78, scamLanguage: 88, urgencyIndicators: 92, financialRequests: 95 }
        },
        {
          timestamp: 32000,
          type: 'guardian-trigger',
          data: {}
        },
        {
          timestamp: 35000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Time is running out. Do you understand the seriousness of this situation?' }
        },
        {
          timestamp: 40000,
          type: 'transcript',
          data: { speaker: 'user', text: 'This doesn\'t sound right. The IRS doesn\'t work this way.' }
        }
      ]
    },

    'tech-support': {
      id: 'tech-support',
      name: 'Tech Support Scam',
      description: 'Fake Microsoft support claiming your computer has viruses',
      callerName: 'Microsoft Support',
      callerNumber: '+1 (425) 555-0199',
      duration: 50000,
      events: [
        {
          timestamp: 0,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Hello, this is Steve from Microsoft Windows Security Department.' }
        },
        {
          timestamp: 1000,
          type: 'detection',
          data: { type: 'info', title: 'Call started', description: 'Microsoft Support', threatLevel: 'low' }
        },
        {
          timestamp: 2000,
          type: 'metric-update',
          data: { voiceAuthenticity: 12, scamLanguage: 15, urgencyIndicators: 8, financialRequests: 0 }
        },
        {
          timestamp: 4000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'We detected multiple viruses and malicious software on your Windows computer.' }
        },
        {
          timestamp: 7000,
          type: 'detection',
          data: { type: 'scam', title: 'Unsolicited tech support', description: 'Claims to detect remote issues', threatLevel: 'medium' }
        },
        {
          timestamp: 8000,
          type: 'metric-update',
          data: { voiceAuthenticity: 20, scamLanguage: 30, urgencyIndicators: 25, financialRequests: 5 }
        },
        {
          timestamp: 10000,
          type: 'transcript',
          data: { speaker: 'user', text: 'How did you know about my computer?' }
        },
        {
          timestamp: 13000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Your computer is sending us error reports. We can see you have 47 critical security threats right now.' }
        },
        {
          timestamp: 17000,
          type: 'detection',
          data: { type: 'urgency', title: 'Fabricated urgency', description: 'False threat count to create panic', threatLevel: 'medium' }
        },
        {
          timestamp: 18000,
          type: 'metric-update',
          data: { voiceAuthenticity: 32, scamLanguage: 45, urgencyIndicators: 40, financialRequests: 15 }
        },
        {
          timestamp: 20000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'If you don\'t fix this immediately, hackers will steal your banking information and personal data.' }
        },
        {
          timestamp: 24000,
          type: 'detection',
          data: { type: 'urgency', title: 'Fear-based tactics', description: 'Hacking and data theft threats', threatLevel: 'high' }
        },
        {
          timestamp: 25000,
          type: 'metric-update',
          data: { voiceAuthenticity: 48, scamLanguage: 60, urgencyIndicators: 65, financialRequests: 25 }
        },
        {
          timestamp: 27000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'I need you to go to your computer right now and download our remote access tool.' }
        },
        {
          timestamp: 31000,
          type: 'detection',
          data: { type: 'identity', title: 'Remote access request', description: 'Attempting to gain computer control', threatLevel: 'high' }
        },
        {
          timestamp: 32000,
          type: 'metric-update',
          data: { voiceAuthenticity: 58, scamLanguage: 72, urgencyIndicators: 70, financialRequests: 40 }
        },
        {
          timestamp: 35000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'The one-time cleaning service will cost $399, but we can offer you lifetime protection for $1,299.' }
        },
        {
          timestamp: 39000,
          type: 'detection',
          data: { type: 'financial', title: 'Large service fee request', description: '$1,299 for fake service', threatLevel: 'high' }
        },
        {
          timestamp: 40000,
          type: 'metric-update',
          data: { voiceAuthenticity: 72, scamLanguage: 85, urgencyIndicators: 78, financialRequests: 88 }
        },
        {
          timestamp: 41000,
          type: 'guardian-trigger',
          data: {}
        },
        {
          timestamp: 44000,
          type: 'transcript',
          data: { speaker: 'user', text: 'I think this is a scam. Microsoft doesn\'t make calls like this.' }
        },
        {
          timestamp: 48000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'No, no, this is legitimate! You must act now or lose everything!' }
        }
      ]
    },

    'grandparent-scam': {
      id: 'grandparent-scam',
      name: 'Grandparent Scam',
      description: 'Scammer impersonating family member claiming to be in emergency',
      callerName: 'Unknown',
      callerNumber: '+1 (555) 987-6543',
      duration: 40000,
      events: [
        {
          timestamp: 0,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Grandma? It\'s me... I\'m in trouble.' }
        },
        {
          timestamp: 1000,
          type: 'detection',
          data: { type: 'info', title: 'Call started', description: 'Unknown caller', threatLevel: 'low' }
        },
        {
          timestamp: 2000,
          type: 'metric-update',
          data: { voiceAuthenticity: 18, scamLanguage: 10, urgencyIndicators: 20, financialRequests: 0 }
        },
        {
          timestamp: 3000,
          type: 'transcript',
          data: { speaker: 'user', text: 'Who is this? Tommy?' }
        },
        {
          timestamp: 5000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Yes, it\'s Tommy! I\'m so glad you answered. I need your help right away.' }
        },
        {
          timestamp: 8000,
          type: 'detection',
          data: { type: 'identity', title: 'Identity confirmation fishing', description: 'Caller confirmed suggested identity', threatLevel: 'medium' }
        },
        {
          timestamp: 9000,
          type: 'metric-update',
          data: { voiceAuthenticity: 35, scamLanguage: 25, urgencyIndicators: 40, financialRequests: 10 }
        },
        {
          timestamp: 11000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'I was in a car accident. I hit someone\'s car and the police arrested me.' }
        },
        {
          timestamp: 15000,
          type: 'detection',
          data: { type: 'urgency', title: 'Emergency scenario', description: 'Arrest and accident claims', threatLevel: 'medium' }
        },
        {
          timestamp: 16000,
          type: 'metric-update',
          data: { voiceAuthenticity: 48, scamLanguage: 40, urgencyIndicators: 60, financialRequests: 25 }
        },
        {
          timestamp: 18000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'The lawyer says I need $5,000 for bail or I\'ll spend the weekend in jail. Please don\'t tell mom and dad!' }
        },
        {
          timestamp: 22000,
          type: 'detection',
          data: { type: 'financial', title: 'Bail money request', description: '$5,000 demanded urgently', threatLevel: 'high' }
        },
        {
          timestamp: 23000,
          type: 'detection',
          data: { type: 'urgency', title: 'Secrecy requested', description: '"Don\'t tell parents" - isolation tactic', threatLevel: 'high' }
        },
        {
          timestamp: 24000,
          type: 'metric-update',
          data: { voiceAuthenticity: 65, scamLanguage: 62, urgencyIndicators: 80, financialRequests: 75 }
        },
        {
          timestamp: 26000,
          type: 'transcript',
          data: { speaker: 'user', text: 'This doesn\'t sound like Tommy. What\'s your mother\'s maiden name?' }
        },
        {
          timestamp: 29000,
          type: 'transcript',
          data: { speaker: 'caller', text: 'Grandma, I don\'t have time for security questions! My lawyer needs you to wire the money in the next hour through Western Union.' }
        },
        {
          timestamp: 33000,
          type: 'detection',
          data: { type: 'financial', title: 'Wire transfer urgency', description: 'Western Union - difficult to trace', threatLevel: 'high' }
        },
        {
          timestamp: 34000,
          type: 'detection',
          data: { type: 'identity', title: 'Voice synthesis detected', description: 'AI voice cloning indicators', threatLevel: 'high' }
        },
        {
          timestamp: 35000,
          type: 'metric-update',
          data: { voiceAuthenticity: 82, scamLanguage: 78, urgencyIndicators: 88, financialRequests: 92 }
        },
        {
          timestamp: 36000,
          type: 'guardian-trigger',
          data: {}
        },
        {
          timestamp: 38000,
          type: 'transcript',
          data: { speaker: 'user', text: 'I\'m going to call Tommy\'s real number to verify this.' }
        }
      ]
    }
  };

  // Start a scenario
  startScenario(scenarioId: ScenarioType): void {
    this.scenario = this.scenarios[scenarioId];
    this.startTime = Date.now();
    this.eventIndex = 0;
    this.isPlaying = true;

    // Start event loop
    this.intervalId = window.setInterval(() => {
      this.processEvents();
    }, 100); // Check every 100ms
  }

  // Process events based on elapsed time
  private processEvents(): void {
    if (!this.scenario || !this.isPlaying) return;

    const elapsed = Date.now() - this.startTime;

    // Process all events that should have occurred by now
    while (
      this.eventIndex < this.scenario.events.length &&
      this.scenario.events[this.eventIndex].timestamp <= elapsed
    ) {
      const event = this.scenario.events[this.eventIndex];
      this.handleEvent(event);
      this.eventIndex++;
    }

    // Check if scenario is complete
    if (elapsed >= this.scenario.duration) {
      this.stopScenario();
      this.onScenarioComplete?.();
    }
  }

  // Handle individual event
  private handleEvent(event: DemoEvent): void {
    switch (event.type) {
      case 'transcript':
        this.onTranscriptUpdate?.(event.data);
        break;
      case 'metric-update':
        this.onMetricsUpdate?.(event.data);
        break;
      case 'detection':
        this.onDetectionEvent?.(event.data);
        break;
      case 'guardian-trigger':
        this.onGuardianTrigger?.();
        break;
    }
  }

  // Stop current scenario
  stopScenario(): void {
    this.isPlaying = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Pause scenario
  pause(): void {
    this.isPlaying = false;
  }

  // Resume scenario
  resume(): void {
    if (this.scenario) {
      this.isPlaying = true;
      // Adjust start time to account for pause
      const elapsed = this.getCurrentTime();
      this.startTime = Date.now() - elapsed;
    }
  }

  // Get current playback time
  getCurrentTime(): number {
    return Date.now() - this.startTime;
  }

  // Get all available scenarios
  getScenarios(): DemoScenario[] {
    return Object.values(this.scenarios);
  }

  // Get current scenario info
  getCurrentScenario(): DemoScenario | null {
    return this.scenario;
  }

  // Check if playing
  isActive(): boolean {
    return this.isPlaying;
  }

  // Register callbacks
  onTranscript(callback: (segment: TranscriptSegment) => void): void {
    this.onTranscriptUpdate = callback;
  }

  onMetrics(callback: (metrics: ScenarioMetrics) => void): void {
    this.onMetricsUpdate = callback;
  }

  onDetection(callback: (event: DetectionEvent) => void): void {
    this.onDetectionEvent = callback;
  }

  onGuardian(callback: () => void): void {
    this.onGuardianTrigger = callback;
  }

  onComplete(callback: () => void): void {
    this.onScenarioComplete = callback;
  }

  // Cleanup
  destroy(): void {
    this.stopScenario();
    this.onTranscriptUpdate = undefined;
    this.onMetricsUpdate = undefined;
    this.onDetectionEvent = undefined;
    this.onGuardianTrigger = undefined;
    this.onScenarioComplete = undefined;
  }
}

// Singleton instance
let demoControllerInstance: DemoController | null = null;

export const getDemoController = (): DemoController => {
  if (!demoControllerInstance) {
    demoControllerInstance = new DemoController();
  }
  return demoControllerInstance;
};
