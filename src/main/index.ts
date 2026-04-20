import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { registerConnectorIpc } from './ipc/connector.ipc'
import { registerDownloadIpc } from './ipc/download.ipc'
import { registerSessionIpc } from './ipc/session.ipc'
import { closeHeadlessBrowser } from './browser/playwright-manager'
import { initAutoUpdater } from './updater'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'Belegio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  return win
}

ipcMain.on('app:version', (event) => { event.returnValue = app.getVersion() })

app.whenReady().then(() => {
  const win = createWindow()

  registerConnectorIpc(win)
  registerDownloadIpc()
  registerSessionIpc()

  // Auto-Update nur in der gepackten App prüfen
  if (!isDev) initAutoUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await closeHeadlessBrowser()
  if (process.platform !== 'darwin') app.quit()
})
