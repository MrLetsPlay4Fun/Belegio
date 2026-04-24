import { autoUpdater } from 'electron-updater'
import { dialog, BrowserWindow } from 'electron'
import log from 'electron-log'

export function initAutoUpdater(win: BrowserWindow): void {
  // Kein automatisches Download – wir fragen zuerst
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Logging in Datei — hilft bei der Fehlersuche
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
    // 404 / "Cannot find" = kein Release-Artefakt hochgeladen — kein Dialog
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

  // Update-Check 3 Sekunden nach Start (damit das Fenster schon sichtbar ist)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[updater] Kein Update-Check möglich:', err.message)
    })
  }, 3000)
}
