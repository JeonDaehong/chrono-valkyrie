const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs').promises
const os = require('os')

const isDev = process.env.NODE_ENV === 'development'
const SAVE_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'TopDownRPG')

async function ensureSaveDir() {
  try {
    await fs.mkdir(SAVE_DIR, { recursive: true })
  } catch {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: false,
    fullscreen: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// IPC: 세이브 로드
ipcMain.handle('save:load', async (_, slot) => {
  await ensureSaveDir()
  const filePath = path.join(SAVE_DIR, `savefile_${slot}.json`)
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return { ok: true, data: JSON.parse(data) }
  } catch {
    return { ok: false, data: null }
  }
})

// IPC: 세이브 저장
ipcMain.handle('save:write', async (_, slot, saveData) => {
  await ensureSaveDir()
  const filePath = path.join(SAVE_DIR, `savefile_${slot}.json`)
  try {
    await fs.writeFile(filePath, JSON.stringify(saveData, null, 2), 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

// IPC: 세이브 삭제
ipcMain.handle('save:delete', async (_, slot) => {
  const filePath = path.join(SAVE_DIR, `savefile_${slot}.json`)
  try {
    await fs.unlink(filePath)
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
