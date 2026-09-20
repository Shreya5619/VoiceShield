# VoiceShield Design System — "Signal" Theme

A dark, high-contrast security interface built around a single confident
accent. The look is professional and distinctive: near-black surfaces, one
signal-yellow accent, quiet muted text, and iconography instead of emoji.

## 1. Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#0D0D0D` | App background, page canvas |
| `--color-card` | `#171717` | Cards, panels, overlays, inputs' container surfaces |
| `--color-accent` | `#F5C542` | Primary accent — buttons, active states, highlights, focus rings |
| `--color-text` | `#F5F5F0` | Primary text, headings |
| `--color-muted` | `#A3A3A3` | Secondary text, labels, captions |

### Semantic status colors

The accent is yellow, so status colors are kept distinct and used sparingly:

| Token | Value | Meaning |
|-------|-------|---------|
| `--color-safe` | `#35F28A` | Verified / safe / success |
| `--color-warning` | `#F5C542` | Caution — reuses the accent |
| `--color-danger` | `#FF4D4D` | High risk / failure / scam |

### Accent tints (for glows, borders, fills)

- `rgba(245, 197, 66, 0.28)` — button glow
- `rgba(245, 197, 66, 0.15)` — focus ring
- `rgba(245, 197, 66, 0.12)` — soft chip / icon background
- `rgba(245, 245, 240, 0.08)` — hairline card border on dark

## 2. Typography

- Sans: `Inter, -apple-system, "Segoe UI", system-ui, sans-serif`
- Mono: `"Space Mono", "Courier New", monospace` (timers, percentages, IDs)

Scale (see `--text-*` usage in components):

| Role | Size | Weight | Letter-spacing |
|------|------|--------|----------------|
| Display / hero | `clamp(2.4rem, 5vw, 3.6rem)` | 800 | `-0.03em` |
| Title | `1.6rem` | 700 | `-0.02em` |
| Body | `1rem` | 400 | normal, `line-height 1.6` |
| Label / caption | `0.8125rem` | 600 | `0.01em` |

## 3. Spacing & radius

Spacing tokens: `--spacing-xs 0.25rem` → `--spacing-2xl 3rem` (0.25 / 0.5 / 1 /
1.5 / 2 / 3 rem). Radius: `--radius-sm .375` → `--radius-xl 1rem`, plus
`--radius-full 9999px`. Cards use `12–18px`, pills use `full`.

## 4. Elevation

Dark UI uses shadow for depth and a subtle accent glow for emphasis, never
heavy borders.

- `--shadow-lg: 0 8px 24px rgba(0,0,0,0.5)`
- `--shadow-xl: 0 24px 60px rgba(0,0,0,0.55)` (modals / auth card)
- `--glow-accent: 0 0 20px rgba(245,197,66,0.4)` (active / focus emphasis)

## 5. Iconography — no emoji

The UI uses **no emoji**. All glyphs are [lucide-react](https://lucide.dev)
icons, rendered at `currentColor` so they inherit the theme. This keeps the
interface crisp, consistent across platforms, and accessible.

Common mappings used across the app:

| Concept | Icon |
|---------|------|
| Answer / call | `Phone` |
| Decline / end call | `PhoneOff` |
| Mic on / off | `Mic` / `MicOff` |
| Speaker on / off | `Volume2` / `Volume1` |
| Shield / protection | `Shield`, `ShieldCheck`, `ShieldAlert` |
| Scam alert | `ShieldAlert`, `Siren` |
| Warning | `AlertTriangle` |
| Verified / success | `CheckCircle`, `Check` |
| Failure / clear | `XCircle`, `X` |
| Privacy / locked | `Lock` |
| Person / caller | `User`, `UserRound` |
| AI response | `Bot` |
| Language | `Languages` |
| Signal / battery | `SignalHigh` / `BatteryFull` |
| Play audio | `Volume2` |
| Searching / listening | `Search`, `Loader` |

Guidelines:
- Size icons `16–22px` inline; `18px` inside buttons.
- Give icon-only buttons an `aria-label`.
- Pair status icons with the semantic color, e.g. danger icon in
  `var(--color-danger)`.

## 6. Backgrounds

- **App / pages:** flat `--color-background` with an optional faint accent
  radial glow and a low-opacity grid (see `.vs-landing::before`).
- **Call screens:** a dark "command" backdrop — layered radial accent glows
  over near-black plus a faint grid, so the call UI reads as a focused,
  secure environment rather than a plain flat screen. Implemented as the
  `.call-screen-bg` layers in `ActiveCallScreen.css` / `IncomingCallScreen.css`.

## 7. Where tokens live

- Source of truth: `frontend/src/styles/theme.css` (`:root` custom properties),
  imported globally through `frontend/src/index.css`.
- Landing / auth screen styles: `frontend/src/App.css` (`.vs-*` classes).
- Per-component styling: co-located files under `frontend/src/styles/` and
  `frontend/src/components/*.css`.

When adding UI, reference the tokens (`var(--color-accent)`, etc.) rather than
hard-coding hex values so the whole app stays consistent.
