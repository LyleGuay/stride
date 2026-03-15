/* habitEffects — particle burst system + Web Audio feedback for the habit tracker.
   Manages a singleton canvas overlay and AudioContext so they're created once on
   first use and shared across all habit interactions. */

/* ─── Types ────────────────────────────────────────────────────────────── */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  r: number
  color: string
  decay: number
  shape: 'circle' | 'square' | 'sparkle' | 'star'
  rotation: number
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const PARTICLE_COLORS: Record<1 | 2 | 3, { base: string; light: string }> = {
  1: { base: '#4f46e5', light: '#818cf8' },
  2: { base: '#10b981', light: '#6ee7b7' },
  3: { base: '#f59e0b', light: '#fcd34d' },
}

/* ─── Canvas singleton ───────────────────────────────────────────────────── */

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let rafId: number | null = null

// Lazily create the canvas overlay on first use.
function getCtx(): CanvasRenderingContext2D {
  if (canvas && ctx) return ctx

  canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)

  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // Keep canvas sized to viewport.
  window.addEventListener('resize', () => {
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    ctx.scale(dpr, dpr)
  })

  return ctx
}

/* ─── Particle loop ──────────────────────────────────────────────────────── */

function kickParticles() {
  if (!rafId) rafId = requestAnimationFrame(tick)
}

function tick() {
  const c = getCtx()
  c.clearRect(0, 0, window.innerWidth, window.innerHeight)

  particles = particles.filter(p => p.alpha > 0.01)

  for (const p of particles) {
    c.save()
    c.globalAlpha = p.alpha

    if (p.shape === 'circle') {
      c.fillStyle = p.color
      c.beginPath()
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      c.fill()
    } else if (p.shape === 'square') {
      c.fillStyle = p.color
      c.translate(p.x, p.y)
      c.rotate(p.rotation)
      c.fillRect(-p.r, -p.r, p.r * 2, p.r * 2)
    } else if (p.shape === 'sparkle') {
      // 4-pointed sparkle: two thin crossed rectangles.
      c.fillStyle = p.color
      c.translate(p.x, p.y)
      c.rotate(p.rotation)
      c.fillRect(-p.r, -p.r * 0.25, p.r * 2, p.r * 0.5)
      c.rotate(Math.PI / 2)
      c.fillRect(-p.r, -p.r * 0.25, p.r * 2, p.r * 0.5)
    } else {
      // 5-pointed star: 10-point polygon alternating outer/inner radius.
      c.fillStyle = p.color
      c.translate(p.x, p.y)
      c.rotate(p.rotation)
      c.beginPath()
      for (let k = 0; k < 10; k++) {
        const angle = (k * Math.PI) / 5 - Math.PI / 2
        const radius = k % 2 === 0 ? p.r : p.r * 0.45
        if (k === 0) c.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
        else c.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      }
      c.closePath()
      c.fill()
    }

    c.restore()

    p.x += p.vx
    p.y += p.vy
    // Weekly celebration particles have lower decay (0.010) so they stay lighter in the air longer.
    p.vy += p.decay < 0.015 ? 0.15 : 0.2   // slower gravity for weekly particles
    p.vx *= 0.96     // air resistance
    p.vy *= 0.96
    p.rotation += 0.08
    p.alpha -= p.decay
  }

  rafId = particles.length > 0 ? requestAnimationFrame(tick) : null
}

/* ─── Shape picker ───────────────────────────────────────────────────────── */

function randomShape(level: 1 | 2 | 3): Particle['shape'] {
  const r = Math.random()
  if (level === 3) return r < 0.5 ? 'circle' : r < 0.75 ? 'square' : 'sparkle'
  return r < 0.6 ? 'circle' : r < 0.85 ? 'square' : 'sparkle'
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/** Spawn a radial burst of particles from the center of `el`. Called on each level-up tap. */
export function spawnBurst(el: HTMLElement, level: 1 | 2 | 3, count = 24): void {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  const { base, light } = PARTICLE_COLORS[level]
  const isL3 = level === 3

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 3 + Math.random() * 7
    const p: Particle = {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,   // slight upward bias
      alpha: 1,
      r: 2.5 + Math.random() * 3.5,
      color: Math.random() > 0.45 ? base : light,
      decay: 0.032 + Math.random() * 0.02,
      shape: randomShape(level),
      rotation: Math.random() * Math.PI * 2,
    }
    if (isL3) {
      // Apply gold glow — just use the lighter particle color; true shadowBlur is set per-draw.
      p.color = Math.random() > 0.3 ? base : light
    }
    particles.push(p)
  }

  // L3: give the canvas shadowBlur temporarily by tagging particles; applied in tick.
  // (We do it by drawing in a loop that checks level — simplest single-canvas approach.)
  if (isL3 && ctx) {
    ctx.shadowBlur = 8
    ctx.shadowColor = '#f59e0b'
    setTimeout(() => { if (ctx) { ctx.shadowBlur = 0 } }, 600)
  }

  getCtx()
  kickParticles()
}

/** Spawn a fountain burst for the all-habits-same-level celebration. */
export function spawnCelebration(el: HTMLElement, level: 1 | 2 | 3): void {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  const { base, light } = PARTICLE_COLORS[level]

  // Dense upward fountain — 80 particles spread across a wide upward arc.
  for (let i = 0; i < 80; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2
    const speed = 5 + Math.random() * 11
    particles.push({
      x: cx + (Math.random() - 0.5) * 20,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      r: 3 + Math.random() * 5,
      color: Math.random() > 0.4 ? base : light,
      decay: 0.018 + Math.random() * 0.015,
      shape: randomShape(level),
      rotation: Math.random() * Math.PI * 2,
    })
  }

  // Secondary ring of sideways particles for breadth.
  for (let i = 0; i < 20; i++) {
    const side = Math.random() > 0.5 ? 1 : -1
    const angle = side * (Math.PI / 6 + Math.random() * Math.PI / 4)
    const speed = 4 + Math.random() * 6
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      alpha: 1,
      r: 2 + Math.random() * 3,
      color: Math.random() > 0.5 ? base : light,
      decay: 0.025 + Math.random() * 0.02,
      shape: 'circle',
      rotation: 0,
    })
  }

  getCtx()
  kickParticles()
}

/* ─── Audio singleton ────────────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null

// Lazily initialize AudioContext on first gesture (browser requirement).
function getAudioCtx(): AudioContext | null {
  // Respect mute preference stored in localStorage.
  if (localStorage.getItem('habits_mute') === '1') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioCtx
}

/** Two-note rising chime for a single habit level-up. Pitch varies by level. */
export function playCheckSound(level: 1 | 2 | 3): void {
  const a = getAudioCtx()
  if (!a) return

  // Rising interval pairs: lower, brighter pitches per level.
  const freqPairs: Record<1 | 2 | 3, [number, number]> = {
    1: [523.25, 783.99],   // C5 + G5
    2: [659.25, 987.77],   // E5 + B5
    3: [880, 1318.51],     // A5 + E6
  }
  const freqs = freqPairs[level]

  freqs.forEach((freq, i) => {
    try {
      const osc = a.createOscillator()
      const gain = a.createGain()
      osc.connect(gain)
      gain.connect(a.destination)
      osc.type = 'sine'

      const t = a.currentTime + i * 0.06
      osc.frequency.setValueAtTime(freq, t)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.3, t + 0.08)
      gain.gain.setValueAtTime(0.22, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.start(t)
      osc.stop(t + 0.25)
    } catch { /* ignore AudioContext errors in restricted environments */ }
  })
}

/** Dual confetti-cannon burst for the weekly level celebration.
 *  200 particles total — 100 launched from left edge (x=0), 100 from right edge,
 *  both angled upward and inward. Shadow glow applied for 1200ms. */
/** Spawn a dual confetti-cannon burst for the weekly level milestone celebration.
 *  anchor is accepted for API consistency but unused — the weekly effect launches
 *  from screen edges rather than a focal element. */
export function spawnWeeklyCelebration(anchor: HTMLElement | null): void {
  void anchor  // intentionally unused — weekly animation fires from screen edges
  getCtx()     // ensure canvas overlay is initialized

  // 6-color multi-hue palette: gold, rose, violet, teal, sky, emerald.
  const palette = [
    '#f59e0b', '#fcd34d',
    '#f43f5e', '#fb7185',
    '#7c3aed', '#a78bfa',
    '#0d9488', '#2dd4bf',
    '#0284c7', '#38bdf8',
    '#059669', '#34d399',
  ]

  const randomColor = () => palette[Math.floor(Math.random() * palette.length)]
  const randomWeeklyShape = (): Particle['shape'] => {
    const r = Math.random()
    return r < 0.3 ? 'circle' : r < 0.55 ? 'square' : r < 0.77 ? 'sparkle' : 'star'
  }

  const w = window.innerWidth

  // Left cannon: shoot upward and rightward from x=0.
  for (let i = 0; i < 100; i++) {
    // Angle centered at -70° from horizontal (mostly upward, slightly right); spread ±40°.
    const angle = (-Math.PI * 7) / 18 + (Math.random() - 0.5) * (Math.PI * 80 / 180)
    const speed = 6 + Math.random() * 10
    particles.push({
      x: 0,
      y: window.innerHeight * (0.4 + Math.random() * 0.4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      r: 3 + Math.random() * 5,
      color: randomColor(),
      decay: 0.010 + Math.random() * 0.008,
      shape: randomWeeklyShape(),
      rotation: Math.random() * Math.PI * 2,
    })
  }

  // Right cannon: shoot upward and leftward from x=width.
  for (let i = 0; i < 100; i++) {
    // Mirror of left cannon — angle centered at -110° from horizontal.
    const angle = (-Math.PI * 11) / 18 + (Math.random() - 0.5) * (Math.PI * 80 / 180)
    const speed = 6 + Math.random() * 10
    particles.push({
      x: w,
      y: window.innerHeight * (0.4 + Math.random() * 0.4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      r: 3 + Math.random() * 5,
      color: randomColor(),
      decay: 0.010 + Math.random() * 0.008,
      shape: randomWeeklyShape(),
      rotation: Math.random() * Math.PI * 2,
    })
  }

  // Slower gravity for weekly particles (override applied in tick via lower gravity constant).
  // Shadow glow — applied globally for 1200ms.
  if (ctx) {
    ctx.shadowBlur = 10
    ctx.shadowColor = '#f59e0b'
    setTimeout(() => { if (ctx) ctx.shadowBlur = 0 }, 1200)
  }

  kickParticles()
}

/** Ascending 4-note arpeggio for the all-same-level celebration. */
export function playCelebrationSound(level: 1 | 2 | 3): void {
  const a = getAudioCtx()
  if (!a) return

  // Major chords per level — L1 warm, L2 bright, L3 high+brilliant.
  const chords: Record<1 | 2 | 3, number[]> = {
    1: [523.25, 659.25, 783.99, 1046.5],   // C E G C
    2: [659.25, 830.61, 987.77, 1318.51],  // E G# B E
    3: [880, 1108.73, 1318.51, 1760],      // A C# E A
  }

  chords[level].forEach((freq, i) => {
    try {
      const osc = a.createOscillator()
      const gain = a.createGain()
      osc.connect(gain)
      gain.connect(a.destination)
      osc.type = 'sine'

      const t = a.currentTime + i * 0.09
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.2, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      osc.start(t)
      osc.stop(t + 0.6)
    } catch { /* ignore AudioContext errors in restricted environments */ }
  })
}

/** 6-note ascending arpeggio for the weekly level celebration.
 *  Higher root pitch, longer spacing (110ms), and longer decay than the daily sound. */
export function playWeeklyCelebrationSound(): void {
  const a = getAudioCtx()
  if (!a) return

  // C major arpeggio two octaves — bright and ascending, clearly distinct from daily.
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]  // C5 E5 G5 C6 E6 G6

  notes.forEach((freq, i) => {
    try {
      const osc = a.createOscillator()
      const gain = a.createGain()
      osc.connect(gain)
      gain.connect(a.destination)
      osc.type = 'sine'

      const t = a.currentTime + i * 0.11
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
      osc.start(t)
      osc.stop(t + 0.8)
    } catch { /* ignore AudioContext errors in restricted environments */ }
  })
}
