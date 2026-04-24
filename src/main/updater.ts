import { autoUpdater } from 'electron-updater'
import { dialog, shell, BrowserWindow } from 'electron'
import log from 'electron-log'

export function initAutoUpdater(win: BrowserWindow): void {
  // macOS: Squirrel.Mac erfordert Code-Signatur (Apple Developer Account).
  // Ohne Signatur schlägt die Installation fehl → nur Hinweis mit Download-Link.
  if (process.platform === 'darwin') {
    initMacUpdateHint(win)
    return
  }

  // Windows: vollständiger Auto-Updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.logger = log
  log.transports.file.level = 'info'

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update verfügbar',
      message: `Belegio ${info.version} ist verfügbar.`,
      detail: 'Soll das Update jetzt heruntergeladen werden? (ca. 80 MB)',
      buttons: ['Jetzt herunterladen', 'Später'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
        win.setTitle('Belegio – Update wird heruntergeladen…')
      }
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    win.setProgressBar(progress.percent / 100)
    win.setTitle(`Belegio – Update: ${percent}%`)
    log.info(`[updater] Download: ${percent}% (${Math.round(progress.transferred / 1024 / 1024)} MB / ${Math.round(progress.total / 1024 / 1024)} MB)`)
  })

  autoUpdater.on('update-downloaded', () => {
    win.setProgressBar(-1)
    win.setTitle('Belegio')
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update bereit',
      message: 'Update wurde heruntergeladen.',
      detail: 'Belegio wird nach dem Neustart auf die neue Version aktualisiert.',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    win.setProgressBar(-1)
    win.setTitle('Belegio')
    if (err.message?.includes('404') || err.message?.includes('Cannot find')) {
      log.warn('[updater] Kein Update-Artefakt gefunden:', err.message)
      return
    }
    log.error('[updater] Fehler:', err)
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'Update-Fehler',
      message: 'Das Update konnte nicht heruntergeladen werden.',
      detail: err.message,
      buttons: ['OK'],
    })
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[updater] Kein Update-Check möglich:', err.message)
    })
  }, 3000)
}

/** macOS: nur auf neue Version hinweisen, Download-Link öffnen. */
function initMacUpdateHint(win: BrowserWindow): void {
  autoUpdater.autoDownload = false
  autoUpdater.logger = log

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update verfügbar',
      message: `Belegio ${info.version} ist verfügbar.`,
      detail: 'Bitte lade die neue Version manuell herunter und installiere sie.',
      buttons: ['Zu den Downloads', 'Später'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        shell.openExternal('https://github.com/AxonByteDev/Belegio/releases/latest')
      }
    })
  })

  autoUpdater.on('error', (err) => {
    if (err.message?.includes('404') || err.message?.includes('Cannot find')) {
      log.warn('[updater] Kein macOS-Release gefunden:', err.message)
      return
    }
    log.warn('[updater] macOS Update-Check fehlgeschlagen:', err.message)
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[updater] Kein Update-Check möglich:', err.message)
    })
  }, 3000)
}
