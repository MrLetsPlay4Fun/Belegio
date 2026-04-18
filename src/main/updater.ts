import { autoUpdater } from 'electron-updater'
import { dialog, BrowserWindow } from 'electron'

export function initAutoUpdater(win: BrowserWindow): void {
  // Kein automatisches Download – wir fragen zuerst
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Logging nur im Dev-Modus
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    autoUpdater.logger = null
  }

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update verfügbar',
      message: `Belegio ${info.version} ist verfügbar.`,
      detail: 'Das Update wird im Hintergrund heruntergeladen und beim nächsten Start installiert.',
      buttons: ['Jetzt herunterladen', 'Später'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update bereit',
      message: 'Update heruntergeladen.',
      detail: 'Belegio wird nach dem Neustart aktualisiert. Jetzt neu starten?',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    // Stille Fehlerbehandlung – kein nerviges Dialog bei z.B. fehlender Verbindung
    console.error('[updater] Fehler:', err.message)
  })

  // Update-Check 3 Sekunden nach Start (damit das Fenster schon sichtbar ist)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {/* kein Internet – ignorieren */})
  }, 3000)
}
