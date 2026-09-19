import React, { useRef, useEffect, useCallback, useState } from 'react'

interface WaveformVisualizerProps {
  /** Width of the canvas */
  width?: number
  /** Height of the canvas */
  height?: number
  /** Number of frequency bars */
  barCount?: number
  /** Bar color (can be gradient) */
  barColor?: string | CanvasGradient
  /** Background color */
  backgroundColor?: string
  /** Minimum bar height (0-1) */
  minBarHeight?: number
  /** Smoothing factor for animations (0-1) */
  smoothing?: number
  /** Gap between bars in pixels */
  barGap?: number
  /** Audio source for visualization */
  audioSource?: MediaStream | HTMLAudioElement | null
  /** Demo mode: use simulated data */
  demoMode?: boolean
  /** Demo data array (0-255 values) */
  demoData?: number[]
  /** Threat level (0-100) affects colors */
  threatLevel?: number
  /** Show scanning effect */
  showScanline?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * WaveformVisualizer - Professional real-time audio waveform visualization
 * 
 * Features:
 * - Real-time frequency spectrum analysis using Web Audio API
 * - Smooth bar animations with configurable decay
 * - Gradient colors based on threat level
 * - Scanning effect overlay
 * - Demo mode for testing without audio input
 * - Optimized 60fps canvas rendering
 */
export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  width = 800,
  height = 150,
  barCount = 64,
  barColor,
  backgroundColor = 'transparent',
  minBarHeight = 0.05,
  smoothing = 0.8,
  barGap = 2,
  audioSource,
  demoMode = false,
  demoData,
  threatLevel = 0,
  showScanline = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const smoothedDataRef = useRef<number[]>([])
  const scanPositionRef = useRef(0)

  // Initialize smoothed data array
  useEffect(() => {
    smoothedDataRef.current = new Array(barCount).fill(0)
  }, [barCount])

  // Generate gradient based on threat level
  const generateGradient = useCallback((ctx: CanvasRenderingContext2D): CanvasGradient => {
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    
    if (threatLevel < 30) {
      // Safe: Cyan to Green
      gradient.addColorStop(0, '#00E5FF')
      gradient.addColorStop(0.5, '#35F28A')
      gradient.addColorStop(1, '#35F28A')
    } else if (threatLevel < 70) {
      // Warning: Green to Amber
      gradient.addColorStop(0, '#35F28A')
      gradient.addColorStop(0.5, '#FFB020')
      gradient.addColorStop(1, '#FFB020')
    } else {
      // Danger: Amber to Red
      gradient.addColorStop(0, '#FFB020')
      gradient.addColorStop(0.5, '#FF3B5C')
      gradient.addColorStop(1, '#FF3B5C')
    }
    
    return gradient
  }, [threatLevel, height])

  // Setup audio analysis
  useEffect(() => {
    if (demoMode || !audioSource) return

    const setupAudio = async () => {
      try {
        // Create audio context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = audioContext

        // Create analyser
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        analyserRef.current = analyser

        // Connect source
        let source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode

        if (audioSource instanceof MediaStream) {
          source = audioContext.createMediaStreamSource(audioSource)
        } else if (audioSource instanceof HTMLAudioElement) {
          source = audioContext.createMediaElementSource(audioSource)
        } else {
          return
        }

        source.connect(analyser)

        // Create data array
        const bufferLength = analyser.frequencyBinCount
        dataArrayRef.current = new Uint8Array(bufferLength) as Uint8Array

        console.log('[WaveformVisualizer] Audio analysis setup complete')
      } catch (error) {
        console.error('[WaveformVisualizer] Failed to setup audio:', error)
      }
    }

    setupAudio()

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [audioSource, demoMode])

  // Generate demo data (simulated audio)
  const generateDemoData = useCallback((): number[] => {
    if (demoData && demoData.length === barCount) {
      return demoData
    }

    const data: number[] = []
    const time = Date.now() / 1000

    for (let i = 0; i < barCount; i++) {
      // Create realistic audio-like pattern
      const frequency = (i / barCount) * Math.PI * 2
      const amplitude = Math.sin(time * 2 + frequency) * 0.5 + 0.5
      const bass = i < barCount * 0.2 ? Math.sin(time * 3) * 0.3 + 0.7 : 1
      const noise = Math.random() * 0.2
      
      data.push((amplitude * bass + noise) * 255)
    }

    return data
  }, [barCount, demoData])

  // Render waveform
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)

    // Get frequency data
    let frequencyData: number[]

    if (demoMode) {
      frequencyData = generateDemoData()
    } else if (analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current as any)
      
      // Downsample to barCount
      const step = Math.floor(dataArrayRef.current.length / barCount)
      frequencyData = []
      for (let i = 0; i < barCount; i++) {
        const index = i * step
        frequencyData.push(dataArrayRef.current[index] || 0)
      }
    } else {
      // No data available, show minimal activity
      frequencyData = new Array(barCount).fill(minBarHeight * 255)
    }

    // Apply smoothing
    for (let i = 0; i < barCount; i++) {
      const target = frequencyData[i] / 255
      const current = smoothedDataRef.current[i] || 0
      smoothedDataRef.current[i] = current + (target - current) * (1 - smoothing)
    }

    // Calculate bar dimensions
    const barWidth = (width - (barCount - 1) * barGap) / barCount
    const gradient = barColor || generateGradient(ctx)

    // Draw bars
    ctx.fillStyle = gradient
    for (let i = 0; i < barCount; i++) {
      const value = Math.max(smoothedDataRef.current[i], minBarHeight)
      const barHeight = value * height
      const x = i * (barWidth + barGap)
      const y = height - barHeight

      // Add subtle glow effect
      ctx.shadowBlur = 10
      ctx.shadowColor = typeof gradient === 'string' ? gradient : '#00E5FF'

      // Draw bar with rounded top
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0])
      ctx.fill()
    }

    // Reset shadow
    ctx.shadowBlur = 0

    // Draw scanning effect
    if (showScanline) {
      scanPositionRef.current = (scanPositionRef.current + 2) % width
      
      const scanGradient = ctx.createLinearGradient(
        scanPositionRef.current - 50,
        0,
        scanPositionRef.current + 50,
        0
      )
      scanGradient.addColorStop(0, 'rgba(0, 229, 255, 0)')
      scanGradient.addColorStop(0.5, 'rgba(0, 229, 255, 0.3)')
      scanGradient.addColorStop(1, 'rgba(0, 229, 255, 0)')

      ctx.fillStyle = scanGradient
      ctx.fillRect(0, 0, width, height)
    }

    // Continue animation
    animationFrameRef.current = requestAnimationFrame(render)
  }, [
    width,
    height,
    barCount,
    barColor,
    backgroundColor,
    minBarHeight,
    smoothing,
    barGap,
    demoMode,
    generateDemoData,
    generateGradient,
    showScanline,
  ])

  // Start/stop animation
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [render])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded-lg ${className}`}
      style={{
        width: '100%',
        height: 'auto',
        maxWidth: width,
      }}
    />
  )
}

export default WaveformVisualizer
