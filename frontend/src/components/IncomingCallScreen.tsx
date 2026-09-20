import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Phone, PhoneOff, PhoneIncoming, HelpCircle } from 'lucide-react'
import { CallerInfo } from './CallerPicker'
import '../styles/IncomingCallScreen.css'

interface IncomingCallScreenProps {
  caller: CallerInfo
  onAnswer: () => void
  onDecline: () => void
}

/** How far (px) from center the pill must travel to trigger an action */
const THRESHOLD = 110

export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({
  caller,
  onAnswer,
  onDecline,
}) => {
  // ── drag state ──────────────────────────────────────────
  const [dragX, setDragX] = useState(0)         // offset in px from centre
  const [isDragging, setIsDragging] = useState(false)
  const [isSnapping, setIsSnapping] = useState(false)

  const trackRef  = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)                    // pointer X when drag began
  const animRef   = useRef<number | null>(null)
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null)

  // ── derived ─────────────────────────────────────────────
  const progress = Math.abs(dragX) / THRESHOLD   // 0 → 1
  const direction = dragX > 0 ? 'right' : dragX < 0 ? 'left' : 'none'

  // ── pointer helpers ──────────────────────────────────────
  const getTrackWidth = (): number =>
    trackRef.current ? trackRef.current.getBoundingClientRect().width : 320

  const clamp = (val: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, val))

  // ── Start ringtone on mount, stop on unmount ────────────
  useEffect(() => {
    // Create and play ringtone audio
    try {
      const audio = new Audio('/Vivo Ringtone Download Mp3.mp3')
      audio.loop = true
      audio.volume = 0.7
      
      // Play with user gesture handling
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Ringtone autoplay prevented:', err)
        })
      }
      
      ringtoneAudioRef.current = audio
    } catch (err) {
      console.warn('Ringtone playback failed:', err)
    }
    
    // Cleanup on unmount
    return () => {
      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause()
        ringtoneAudioRef.current.currentTime = 0
        ringtoneAudioRef.current = null
      }
    }
  }, [])

  const onDragStart = useCallback((clientX: number) => {
    setIsSnapping(false)
    setIsDragging(true)
    startXRef.current = clientX
  }, [])

  const onDragMove = useCallback(
    (clientX: number) => {
      if (!isDragging) return
      const raw    = clientX - startXRef.current
      const maxOff = getTrackWidth() / 2 - 34   // pill radius + margin
      setDragX(clamp(raw, -maxOff, maxOff))
    },
    [isDragging],
  )

  const onDragEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    if (dragX >= THRESHOLD) {
      // answered — stop ringtone and call handler
      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause()
        ringtoneAudioRef.current.currentTime = 0
      }
      setTimeout(() => onAnswer(), 180)
      return
    }
    if (dragX <= -THRESHOLD) {
      // declined — stop ringtone and call handler
      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause()
        ringtoneAudioRef.current.currentTime = 0
      }
      setTimeout(() => onDecline(), 180)
      return
    }

    // snap back
    setIsSnapping(true)
    setDragX(0)
    setTimeout(() => setIsSnapping(false), 400)
  }, [isDragging, dragX, onAnswer, onDecline])

  // ── Mouse events ─────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    onDragStart(e.clientX)
  }

  useEffect(() => {
    if (!isDragging) return
    const move = (e: MouseEvent) => onDragMove(e.clientX)
    const up   = () => onDragEnd()
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [isDragging, onDragMove, onDragEnd])

  // ── Touch events ─────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    onDragStart(e.touches[0].clientX)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    onDragMove(e.touches[0].clientX)
  }
  const handleTouchEnd = () => onDragEnd()

  // ── Derived visual styles ────────────────────────────────
  const pillClass = [
    'swipe-pill',
    isDragging || isSnapping ? '' : '',
    isSnapping ? 'snapping' : '',
    direction === 'right' && progress > 0.2 ? 'dragging-right' : '',
    direction === 'left'  && progress > 0.2 ? 'dragging-left'  : '',
  ]
    .filter(Boolean)
    .join(' ')

  const fillStyle: React.CSSProperties = {
    left:    dragX > 0 ? '50%' : undefined,
    right:   dragX < 0 ? '50%' : undefined,
    width:   `${clamp(Math.abs(dragX), 0, getTrackWidth() / 2)}px`,
    background:
      direction === 'right'
        ? `rgba(34,197,94,${Math.min(progress * 0.35, 0.35)})`
        : direction === 'left'
        ? `rgba(239,68,68,${Math.min(progress * 0.35, 0.35)})`
        : 'transparent',
  }

  // ── Pill icon ────────────────────────────────────────────
  const pillIcon =
    direction === 'right' && progress > 0.2
      ? <Phone size={26} strokeWidth={2.2} />
      : direction === 'left' && progress > 0.2
      ? <PhoneOff size={26} strokeWidth={2.2} />
      : <PhoneIncoming size={26} strokeWidth={2.2} />

  return (
    <div className="incoming-screen">
      {/* Background expanding rings */}
      <div className="incoming-bg-ring" />
      <div className="incoming-bg-ring" />
      <div className="incoming-bg-ring" />

      {/* ── Top section ─────────────────────────────── */}
      <div className="incoming-top">
        <p className="incoming-status">Incoming call…</p>

        {/* Avatar with pulse rings */}
        <div className="incoming-avatar-wrap">
          <div className="incoming-avatar-pulse" />
          <div className="incoming-avatar-pulse" />
          <div className="incoming-avatar-pulse" />
          <div className={`incoming-avatar ${caller.isUnknown ? 'unknown' : ''}`}>
            {caller.isUnknown ? <HelpCircle size={44} strokeWidth={1.8} /> : caller.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Caller info */}
        <div className="incoming-caller-info">
          <h2 className="incoming-name">{caller.name}</h2>
          {caller.relation && <p className="incoming-relation">{caller.relation}</p>}
          <p className="incoming-number">{caller.phone}</p>
        </div>
      </div>

      {/* ── Bottom swipe section ─────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%', zIndex: 1 }}>
        {/* Labels */}
        <div className="swipe-hint">
          <div className="swipe-label decline">
            <span className="swipe-label-icon"><PhoneOff size={16} /></span>
            <span>Decline</span>
          </div>
          <div className="swipe-label answer">
            <span className="swipe-label-icon"><Phone size={16} /></span>
            <span>Answer</span>
          </div>
        </div>

        {/* Track */}
        <div className="swipe-track" ref={trackRef}>
          <div className="swipe-fill" style={fillStyle} />

          <span
            className="swipe-track-label"
            style={{ opacity: 1 - progress * 2 }}
          >
            ← slide to decline &nbsp;&nbsp; slide to answer →
          </span>

          {/* Draggable pill */}
          <div
            className={pillClass}
            style={{ transform: `translateX(${dragX}px)` }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            aria-label="Slide to answer or decline"
            role="slider"
            aria-valuenow={dragX}
          >
            {pillIcon}
          </div>
        </div>
      </div>
    </div>
  )
}

export default IncomingCallScreen
