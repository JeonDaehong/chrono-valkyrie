import { useCallback, useEffect, useState } from 'react'
import { GameWorld } from './GameWorld'
import { LoadingScreen } from './LoadingScreen'
import styles from './App.module.css'

interface AppProps {
  game: Phaser.Game
}

type Phase = 'menu' | 'loading' | 'game'

export function App({ game }: AppProps) {
  const [phase, setPhase] = useState<Phase>('menu')

  useEffect(() => {
    const handleStartWorld = () => setPhase('loading')
    window.addEventListener('game:startWorld', handleStartWorld as EventListener)
    return () => window.removeEventListener('game:startWorld', handleStartWorld as EventListener)
  }, [])

  const handleReady = useCallback(() => setPhase('game'), [])

  const handleExitWorld = useCallback(() => {
    setPhase('menu')
    game.scene.start('MenuScene')
  }, [game])

  return (
    <div className={styles.root}>
      {phase === 'loading' && <LoadingScreen onReady={handleReady} />}
      {phase === 'game' && <GameWorld onExit={handleExitWorld} />}
    </div>
  )
}
