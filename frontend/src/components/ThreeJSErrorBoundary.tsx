import React, { Component, ReactNode } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary specifically for Three.js/React Three Fiber components
 * Catches rendering errors and shows a fallback UI
 */
export class ThreeJSErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Three.js rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback: 2D animated shield
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative">
            <Shield 
              className="w-32 h-32 text-primary animate-pulse"
              strokeWidth={1.5}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-xs text-white/60 text-center max-w-[120px]">
                3D rendering unavailable
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
