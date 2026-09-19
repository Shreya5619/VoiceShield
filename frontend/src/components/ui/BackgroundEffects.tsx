import React from 'react';
import { NoiseTexture } from './NoiseTexture';

interface BackgroundEffectsProps {
  /** Show grid background */
  grid?: boolean;
  /** Show noise texture */
  noise?: boolean;
  /** Show animated scanlines */
  scanlines?: boolean;
  /** Show radial gradient glow */
  glow?: boolean;
  /** Glow color (defaults to primary) */
  glowColor?: string;
  /** Children content */
  children?: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * BackgroundEffects - Consistent background styling wrapper
 * 
 * Provides noise texture, grid, scanlines, and glow effects
 * that can be applied to any screen or section
 */
export const BackgroundEffects: React.FC<BackgroundEffectsProps> = ({
  grid = true,
  noise = true,
  scanlines = false,
  glow = false,
  glowColor = 'rgba(0, 229, 255, 0.15)',
  children,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      {/* Noise texture */}
      {noise && <NoiseTexture opacity={0.03} animated />}

      {/* Grid background */}
      {grid && (
        <div 
          className="fixed inset-0 opacity-30 pointer-events-none" 
          style={{ 
            zIndex: 0,
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }} 
        />
      )}

      {/* Radial glow */}
      {glow && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 0,
            background: `radial-gradient(circle at 50% 20%, ${glowColor} 0%, transparent 50%)`,
          }}
        />
      )}

      {/* Scanlines effect */}
      {scanlines && (
        <div
          className="fixed inset-0 pointer-events-none opacity-20"
          style={{
            zIndex: 1,
            background: 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0px, transparent 2px, transparent 4px)',
          }}
        >
          <div
            className="w-full h-24 bg-gradient-to-b from-transparent via-primary/20 to-transparent animate-scan"
            style={{
              filter: 'blur(20px)',
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

/**
 * PageBackground - Full-page background wrapper
 * Automatically adds min-h-screen and bg-vs-background
 */
export const PageBackground: React.FC<BackgroundEffectsProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <BackgroundEffects 
      {...props}
      className={`min-h-screen bg-vs-background ${className}`}
    >
      {children}
    </BackgroundEffects>
  );
};

/**
 * SectionBackground - Section-level background wrapper
 * For use within pages for specific sections
 */
export const SectionBackground: React.FC<BackgroundEffectsProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <BackgroundEffects 
      {...props}
      className={`relative ${className}`}
    >
      {children}
    </BackgroundEffects>
  );
};
