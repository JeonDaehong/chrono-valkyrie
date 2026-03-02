import { useEffect, useRef, useState } from 'react'
import {
  idleGlbPromise, runGlbPromise, attackGlbPromise, qAttackGlbPromise,
  wAttackGlbPromise, eAttackGlbPromise,
  enemy1IdleFbxPromise, enemy1RunFbxPromise, enemy1AttackFbxPromise, enemy1DeathFbxPromise,
  enemy2IdleFbxPromise, enemy2RunFbxPromise, enemy2AttackFbxPromise, enemy2DeathFbxPromise,
  fireballFbxPromise,
  boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
  boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
} from './preloader'

interface Props { onReady: () => void }

export function LoadingScreen({ onReady }: Props) {
  const onReadyRef = useRef(onReady)
  useEffect(() => { onReadyRef.current = onReady }, [onReady])

  const [progress, setProgress] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes ls-scan { 0%{top:-4px} 100%{top:100%} }
      @keyframes ls-glow { 0%,100%{opacity:0.7;text-shadow:0 0 8px #00ffff,0 0 18px #00aaff} 50%{opacity:1;text-shadow:0 0 18px #00ffff,0 0 36px #00ffff,0 0 60px #0066ff} }
      @keyframes ls-glitch1 { 0%,95%,100%{transform:translate(0)} 96%{transform:translate(-3px,1px)} 97%{transform:translate(3px,-1px)} 98%{transform:translate(-2px,0)} }
      @keyframes ls-glitch2 { 0%,93%,100%{clip-path:inset(100% 0 0 0)} 94%{clip-path:inset(20% 0 60% 0)} 95%{clip-path:inset(70% 0 10% 0)} }
      @keyframes ls-bar    { 0%,100%{opacity:1} 90%{opacity:1} 91%{opacity:0.3} 92%{opacity:1} }
      @keyframes ls-blink  { 0%,49%{opacity:1} 50%,100%{opacity:0} }
    `
    document.head.appendChild(style)

    // 진행률: rAF로 0→95% 시뮬레이션, 완료 후 100% 점프
    let rafId: number
    let sim = 0
    const tick = () => {
      sim = Math.min(sim + 0.008, 0.95)
      setProgress(sim)
      if (sim < 0.95) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    const minWait = new Promise<void>(r => setTimeout(r, 1400))
    Promise.all([
      minWait,
      Promise.allSettled([
        idleGlbPromise, runGlbPromise, attackGlbPromise, qAttackGlbPromise,
        wAttackGlbPromise, eAttackGlbPromise,
        enemy1IdleFbxPromise, enemy1RunFbxPromise, enemy1AttackFbxPromise, enemy1DeathFbxPromise,
        enemy2IdleFbxPromise, enemy2RunFbxPromise, enemy2AttackFbxPromise, enemy2DeathFbxPromise,
        fireballFbxPromise,
        boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
        boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
      ]),
    ]).then(() => {
      cancelAnimationFrame(rafId)
      setProgress(1)
      setTimeout(() => {
        setFadeOut(true)
        setTimeout(() => onReadyRef.current(), 500)
      }, 300)
    })

    return () => {
      cancelAnimationFrame(rafId)
      if (document.head.contains(style)) document.head.removeChild(style)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#020508',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.5s ease',
      fontFamily: '"Courier New", monospace',
    }}>

      {/* 스캔라인 오버레이 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,255,0.015) 3px,rgba(0,255,255,0.015) 4px)',
      }} />

      {/* 이동하는 전기 스캔선 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 2, pointerEvents: 'none',
        background: 'linear-gradient(90deg,transparent 0%,rgba(0,200,255,0.0) 10%,#00ffff 50%,rgba(0,200,255,0.0) 90%,transparent 100%)',
        boxShadow: '0 0 16px #00ccff, 0 0 32px #0088ff',
        animation: 'ls-scan 2.4s linear infinite',
      }} />

      {/* 코너 장식 */}
      {([['0,0,6px 0,0 -6px', '0 0'], ['0,0,-6px 0,0 -6px', '0 auto 0 0'], ['0,0,6px 0,0 6px', 'auto 0 0'], ['0,0,-6px 0,0 6px', 'auto']] as const).map(([b, m], i) => (
        <div key={i} style={{
          position: 'absolute', width: 24, height: 24, margin: m,
          border: `1px solid rgba(0,255,255,0.3)`,
          borderRight: i % 2 === 0 ? 'none' : '1px solid rgba(0,255,255,0.3)',
          borderLeft: i % 2 !== 0 ? 'none' : '1px solid rgba(0,255,255,0.3)',
          borderBottom: i < 2 ? 'none' : '1px solid rgba(0,255,255,0.3)',
          borderTop: i >= 2 ? 'none' : '1px solid rgba(0,255,255,0.3)',
          [i===0?'top':i===1?'top':i===2?'bottom':'bottom']: 24,
          [i===0?'left':i===1?'right':i===2?'left':'right']: 24,
        }} />
      ))}

      {/* 상단 라벨 */}
      <div style={{ fontSize: 10, letterSpacing: 6, color: '#004455', marginBottom: 32, textTransform: 'uppercase' }}>
        SYSTEM&nbsp;&nbsp;BOOT&nbsp;&nbsp;SEQUENCE
      </div>

      {/* 메인 타이틀 */}
      <div style={{ position: 'relative', marginBottom: 52 }}>
        <div style={{
          fontSize: 58, fontWeight: 900, letterSpacing: 14, color: '#00ffff',
          animation: 'ls-glow 1.8s ease-in-out infinite, ls-glitch1 4s step-end infinite',
        }}>
          LOADING
        </div>
        {/* 글리치 레이어 */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          fontSize: 58, fontWeight: 900, letterSpacing: 14, color: '#ff0055',
          mixBlendMode: 'screen', opacity: 0.6,
          animation: 'ls-glitch2 5s step-end infinite',
        }}>
          LOADING
        </div>
      </div>

      {/* 진행 바 */}
      <div style={{ width: 340, marginBottom: 10 }}>
        <div style={{
          width: '100%', height: 4,
          background: 'rgba(0,40,60,0.8)',
          border: '1px solid rgba(0,100,140,0.5)',
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            background: 'linear-gradient(90deg,#0055aa,#00aaff,#00ffff)',
            boxShadow: '0 0 10px #00ccff, 0 0 20px #0088ff',
            borderRadius: 2,
            transition: 'width 0.25s ease',
            animation: 'ls-bar 1.5s step-end infinite',
          }} />
        </div>
      </div>

      {/* 퍼센트 + 커서 */}
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#0099bb', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{String(Math.round(progress * 100)).padStart(3, '0')}%</span>
        <span style={{ animation: 'ls-blink 0.8s step-end infinite', color: '#00ffff' }}>█</span>
      </div>

      {/* 하단 상태 텍스트 */}
      <div style={{
        position: 'absolute', bottom: 36, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 32,
        fontSize: 9, letterSpacing: 3, color: '#003344',
        textTransform: 'uppercase',
      }}>
        <span>INITIALIZING&nbsp;RENDERER</span>
        <span style={{ color: '#005566' }}>◆</span>
        <span>LOADING&nbsp;ASSETS</span>
        <span style={{ color: '#005566' }}>◆</span>
        <span>SPAWNING&nbsp;ENTITIES</span>
      </div>
    </div>
  )
}
