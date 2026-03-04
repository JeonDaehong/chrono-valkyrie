import React from 'react'
import ReactDOM from 'react-dom/client'
import { createGame } from './game/index'
import { App } from './ui/App'
// preloader는 LoadingScreen에서 startPreload() 호출 시 시작 (메뉴 버벅임 방지)

// Phaser 게임 인스턴스 생성 (canvas → #game-container)
const game = createGame('game-container')

// React UI 마운트 (HUD, 메뉴 오버레이 → #ui-root)
const uiRoot = document.getElementById('ui-root')!
ReactDOM.createRoot(uiRoot).render(
  <React.StrictMode>
    <App game={game} />
  </React.StrictMode>
)
