import React, { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshTransmissionMaterial, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { Shield } from 'lucide-react'
import { ThreeJSErrorBoundary } from './ThreeJSErrorBoundary'

// Type declarations for React Three Fiber elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any
      mesh: any
      meshBasicMaterial: any
      ambientLight: any
      directionalLight: any
      pointLight: any
    }
  }
}

interface Shield3DProps {
  /** Threat score (0-100) - affects shield color */
  threatScore?: number
  /** Size of the canvas container */
  size?: number
  /** Enable auto-rotation */
  autoRotate?: boolean
  /** Animation speed multiplier */
  speed?: number
  /** Show fallback if WebGL not supported */
  showFallback?: boolean
}

interface ShieldMeshProps {
  threatScore: number
  autoRotate: boolean
  speed: number
}

/**
 * Shield geometry and material component
 */
const ShieldMesh: React.FC<ShieldMeshProps> = ({ threatScore, autoRotate, speed }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  // Calculate color based on threat score
  const shieldColor = useMemo(() => {
    if (threatScore < 30) {
      // Safe: Cyan to Green
      const t = threatScore / 30
      return new THREE.Color().lerpColors(
        new THREE.Color('#00E5FF'), // cyan
        new THREE.Color('#35F28A'), // green
        t
      )
    } else if (threatScore < 70) {
      // Warning: Green to Amber
      const t = (threatScore - 30) / 40
      return new THREE.Color().lerpColors(
        new THREE.Color('#35F28A'), // green
        new THREE.Color('#FFB020'), // amber
        t
      )
    } else {
      // Danger: Amber to Red
      const t = (threatScore - 70) / 30
      return new THREE.Color().lerpColors(
        new THREE.Color('#FFB020'), // amber
        new THREE.Color('#FF3B5C'), // red
        t
      )
    }
  }, [threatScore])

  // Glow intensity based on threat
  const glowIntensity = useMemo(() => {
    return 0.3 + (threatScore / 100) * 0.7 // 0.3 to 1.0
  }, [threatScore])

  // Create shield geometry (stylized shield shape)
  const shieldGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    
    // Shield outline (pointed bottom, curved top)
    shape.moveTo(0, -1.2)      // Bottom point
    shape.lineTo(-0.8, 0.2)     // Bottom left
    shape.quadraticCurveTo(-0.9, 0.8, -0.5, 1.1)  // Left curve
    shape.quadraticCurveTo(0, 1.3, 0.5, 1.1)      // Top curve
    shape.quadraticCurveTo(0.9, 0.8, 0.8, 0.2)    // Right curve
    shape.lineTo(0, -1.2)       // Back to bottom point

    // Add checkmark cutout in center
    const checkPath = new THREE.Path()
    checkPath.moveTo(-0.25, 0.1)
    checkPath.lineTo(-0.05, -0.15)
    checkPath.lineTo(0.35, 0.35)
    shape.holes.push(checkPath)

    const extrudeSettings = {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 3,
    }

    return new THREE.ExtrudeGeometry(shape, extrudeSettings)
  }, [])

  // Animation loop
  useFrame((state) => {
    if (!meshRef.current) return

    const time = state.clock.getElapsedTime() * speed

    // Floating animation
    meshRef.current.position.y = Math.sin(time * 0.5) * 0.1

    // Auto-rotation
    if (autoRotate) {
      meshRef.current.rotation.y = time * 0.3
    }

    // Subtle breathing scale
    const breathScale = 1 + Math.sin(time * 0.8) * 0.02
    meshRef.current.scale.set(breathScale, breathScale, breathScale)

    // Glow pulse
    if (glowRef.current) {
      const glowScale = 1.1 + Math.sin(time * 1.5) * 0.05
      glowRef.current.scale.set(glowScale, glowScale, glowScale)
      ;(glowRef.current.material as THREE.MeshBasicMaterial).opacity = 
        0.2 + Math.sin(time * 1.5) * 0.1
    }
  })

  return (
    <group>
      {/* Main shield mesh */}
      <mesh ref={meshRef} geometry={shieldGeometry}>
        <MeshTransmissionMaterial
          color={shieldColor}
          thickness={0.5}
          roughness={0.2}
          transmission={0.95}
          ior={1.5}
          chromaticAberration={0.1}
          backside={true}
          clearcoat={1}
          clearcoatRoughness={0.1}
          metalness={0.1}
        />
      </mesh>

      {/* Outer glow */}
      <mesh ref={glowRef} geometry={shieldGeometry}>
        <meshBasicMaterial
          color={shieldColor}
          transparent
          opacity={glowIntensity * 0.3}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Ambient light */}
      <pointLight
        position={[0, 0, 2]}
        intensity={glowIntensity * 2}
        color={shieldColor}
        distance={5}
      />
    </group>
  )
}

/**
 * 2D Fallback Shield (SVG)
 */
const FallbackShield: React.FC<{ threatScore: number; size: number }> = ({ threatScore, size }) => {
  const color = useMemo(() => {
    if (threatScore < 30) return '#00E5FF'
    if (threatScore < 70) return '#FFB020'
    return '#FF3B5C'
  }, [threatScore])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-float"
      style={{
        filter: `drop-shadow(0 0 20px ${color}80)`,
      }}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/**
 * Shield3D - Professional 3D animated shield component
 * 
 * Features:
 * - Glassmorphic 3D shield that changes color based on threat level
 * - Smooth animations: floating, rotation, breathing, glow pulse
 * - WebGL fallback to 2D SVG for unsupported devices
 * - Performance optimized with memoization
 */
export const Shield3D: React.FC<Shield3DProps> = ({
  threatScore = 0,
  size = 300,
  autoRotate = true,
  speed = 1,
  showFallback = false,
}) => {
  // Check WebGL support
  const [webglSupported, setWebglSupported] = React.useState(true)

  React.useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setWebglSupported(!!gl && !showFallback)
    } catch (e) {
      setWebglSupported(false)
    }
  }, [showFallback])

  // Use fallback if WebGL not supported
  if (!webglSupported) {
    return (
      <div 
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <FallbackShield threatScore={threatScore} size={size * 0.6} />
      </div>
    )
  }

  return (
    <ThreeJSErrorBoundary>
      <div style={{ width: size, height: size }}>
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center">
            <Shield className="w-16 h-16 text-primary animate-pulse" />
          </div>
        }>
          <Canvas
            camera={{ position: [0, 0, 4], fov: 50 }}
            gl={{ 
              alpha: true, 
              antialias: true,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0)
            }}
          >
            {/* Lighting */}
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 5, 5]} intensity={0.5} />
            <directionalLight position={[-5, -5, -5]} intensity={0.3} />

            {/* Environment for reflections */}
            <Suspense fallback={null}>
              <Environment preset="city" />
            </Suspense>

            {/* Shield */}
            <ShieldMesh 
              threatScore={threatScore} 
              autoRotate={autoRotate}
              speed={speed}
            />
          </Canvas>
        </Suspense>
      </div>
    </ThreeJSErrorBoundary>
  )
}

export default Shield3D
