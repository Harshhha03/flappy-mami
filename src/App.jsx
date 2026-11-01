import { useEffect, useRef, useState, useCallback } from 'react'

// ---------- Settings you can tweak ----------
const W = 400, H = 600            // internal game resolution
const GROUND = 60                 // ground height
const BIRD_R = 24                 // face radius (hit-box)
const GRAVITY = 0.45
const FLAP = -7.5
const PIPE_W = 70
const PIPE_GAP = 170
const PIPE_SPEED = 2.6
const PIPE_SPACING = 230
const BG_MUSIC_VOLUME = 0.35
// Put your files in /public with these names:
const FACE_SRC = '/face.png'
const BG_SRC = '/background.jpg'
const MUSIC_SRC = '/music.mp3'    // background music (loops)
const FLAP_SRC = '/flap.mp3'      // sound each time you flap
const HIT_SRC = '/hit.mp3'        // sound on game over
// --------------------------------------------

const loadImg = (src) => new Promise((res) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src
})

export default function App() {
  const canvasRef = useRef(null)
  const g = useRef({ phase: 'ready', y: H / 2, vy: 0, pipes: [], score: 0, best: 0, last: 0, bgX: 0 })
  const imgs = useRef({ face: null, bg: null })
  const audio = useRef({})
  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('flappy-best') || 0))
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)

  // load assets once
  useEffect(() => {
    loadImg(FACE_SRC).then((i) => (imgs.current.face = i))
    loadImg(BG_SRC).then((i) => (imgs.current.bg = i))
    const music = new Audio(MUSIC_SRC); music.loop = true; music.volume = BG_MUSIC_VOLUME
    audio.current = { music, flap: new Audio(FLAP_SRC), hit: new Audio(HIT_SRC) }
    g.current.best = best
    return () => music.pause()
    // eslint-disable-next-line
  }, [])

  const play = (name) => {
    if (mutedRef.current) return
    const a = audio.current[name]; if (!a) return
    a.currentTime = 0; a.play().catch(() => {})
  }

  const toggleMute = (e) => {
    e.stopPropagation()
    const m = !muted; setMuted(m); mutedRef.current = m
    const music = audio.current.music
    if (m) music.pause(); else if (g.current.phase === 'playing') music.play().catch(() => {})
  }

  const start = useCallback(() => {
    Object.assign(g.current, { phase: 'playing', y: H / 2, vy: FLAP, pipes: [], score: 0, last: 0 })
    setScore(0); setPhase('playing')
    const music = audio.current.music
    music.currentTime = 0
    if (!mutedRef.current) music.play().catch(() => {})
    play('flap')
  }, [])

  const flap = useCallback(() => {
    const s = g.current
    if (s.phase !== 'playing') return
    s.vy = FLAP; play('flap')
  }, [])

  const gameOver = () => {
    const s = g.current
    s.phase = 'over'
    if (s.score > s.best) { s.best = s.score; localStorage.setItem('flappy-best', s.best); setBest(s.best) }
    audio.current.music.pause()
    play('hit')
    setScore(s.score); setPhase('over')
  }

  // input
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        const p = g.current.phase
        if (p === 'playing') flap(); else start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap, start])

  // game loop
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf

    const update = (dt) => {
      const s = g.current
      s.vy += GRAVITY * dt
      s.y += s.vy * dt
      s.bgX = (s.bgX - PIPE_SPEED * 0.4 * dt) % W

      const last = s.pipes[s.pipes.length - 1]
      if (!last || last.x < W - PIPE_SPACING) {
        const top = 70 + Math.random() * (H - GROUND - PIPE_GAP - 140)
        s.pipes.push({ x: W, top, passed: false })
      }
      s.pipes.forEach((p) => (p.x -= PIPE_SPEED * dt))
      s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10)

      const bx = 110
      // ground / ceiling
      if (s.y + BIRD_R > H - GROUND || s.y - BIRD_R < 0) return gameOver()
      for (const p of s.pipes) {
        if (!p.passed && p.x + PIPE_W < bx) { p.passed = true; s.score++; setScore(s.score) }
        // circle vs rectangle collision
        for (const [rx, ry, rw, rh] of [
          [p.x, 0, PIPE_W, p.top],
          [p.x, p.top + PIPE_GAP, PIPE_W, H - GROUND - p.top - PIPE_GAP],
        ]) {
          const cx = Math.max(rx, Math.min(bx, rx + rw))
          const cy = Math.max(ry, Math.min(s.y, ry + rh))
          if ((bx - cx) ** 2 + (s.y - cy) ** 2 < (BIRD_R - 3) ** 2) return gameOver()
        }
      }
    }

    const drawPipe = (x, y, w, h, capTop) => {
      ctx.fillStyle = '#22a447'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#16813a'; ctx.fillRect(x + w - 10, y, 10, h)
      ctx.fillStyle = '#2fc55b'; ctx.fillRect(x + 6, y, 8, h)
      const cy = capTop ? y + h - 26 : y
      ctx.fillStyle = '#22a447'; ctx.fillRect(x - 5, cy, w + 10, 26)
      ctx.strokeStyle = '#0d5a26'; ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h); ctx.strokeRect(x - 5, cy, w + 10, 26)
    }

    const draw = () => {
      const s = g.current, { bg, face } = imgs.current
      // background
      if (bg) {
        ctx.drawImage(bg, s.bgX, 0, W, H); ctx.drawImage(bg, s.bgX + W, 0, W, H)
      } else {
        const gr = ctx.createLinearGradient(0, 0, 0, H)
        gr.addColorStop(0, '#4fc3f7'); gr.addColorStop(1, '#b3e5fc')
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H)
      }
      // pipes
      s.pipes.forEach((p) => {
        drawPipe(p.x, 0, PIPE_W, p.top, true)
        drawPipe(p.x, p.top + PIPE_GAP, PIPE_W, H - GROUND - p.top - PIPE_GAP, false)
      })
      // ground
      ctx.fillStyle = '#ded895'; ctx.fillRect(0, H - GROUND, W, GROUND)
      ctx.fillStyle = '#73bf2e'; ctx.fillRect(0, H - GROUND, W, 12)
      // face
      ctx.save()
      ctx.translate(110, s.y)
      ctx.rotate(Math.max(-0.5, Math.min(1.0, s.vy * 0.07)))
      ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.closePath()
      ctx.save(); ctx.clip()
      if (face) ctx.drawImage(face, -BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2)
      else { ctx.fillStyle = '#facc15'; ctx.fillRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2) }
      ctx.restore()
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke()
      ctx.restore()
      // live score
      if (s.phase === 'playing') {
        ctx.font = '800 56px system-ui'; ctx.textAlign = 'center'
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(s.score, W / 2, 90)
        ctx.fillStyle = '#fff'; ctx.fillText(s.score, W / 2, 90)
      }
    }

    const loop = (t) => {
      const s = g.current
      const dt = s.last ? Math.min((t - s.last) / 16.667, 2.5) : 1
      s.last = t
      if (s.phase === 'playing') update(dt)
      else if (s.phase === 'ready') { s.y = H / 2 + Math.sin(t / 250) * 8; s.bgX = (s.bgX - 0.4) % W }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onPointer = (e) => {
    e.preventDefault()
    if (g.current.phase === 'playing') flap()
  }

  return (
    <div className="wrap" onPointerDown={onPointer}>
      <button className="mute" onPointerDown={(e) => e.stopPropagation()} onClick={toggleMute}>
        {muted ? '🔇' : '🔊'}
      </button>
      <canvas ref={canvasRef} width={W} height={H} />
      {phase === 'ready' && (
        <div className="overlay">
          <h1>Flappy Face</h1>
          <p>Tap / Space to fly</p>
          <button className="btn" onPointerDown={(e) => e.stopPropagation()} onClick={start}>Play</button>
        </div>
      )}
      {phase === 'over' && (
        <div className="overlay">
          <h1>Game Over</h1>
          <p>Score</p>
          <div className="score-big">{score}</div>
          <p>Best: {best}</p>
          <button className="btn" onPointerDown={(e) => e.stopPropagation()} onClick={start}>Play Again</button>
        </div>
      )}
    </div>
  )
}
