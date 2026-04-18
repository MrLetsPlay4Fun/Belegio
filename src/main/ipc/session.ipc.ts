import { ipcMain } from 'electron'
import { deleteProfile } from '../browser/playwright-manager'
import { clearSessionCookies } from '../store/app-store'

export function registerSessionIpc(): void {
  ipcMain.handle('session:clear', (_event, { connectorId }: { connectorId: string }) => {
    // Browser-Profil löschen (enthält alle Cookies/Session-Daten)
    deleteProfile(connectorId)
    // Auch alte Cookie-Einträge im Store bereinigen (Abwärtskompatibilität)
    clearSessionCookies(connectorId)
  })
}
