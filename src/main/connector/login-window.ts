import fs from 'fs'
import path from 'path'
import type { ConnectorDef } from '../../shared/connector.types'
import { checkLogin } from './session-manager'
import { openPersistentContext, getProfileDir } from '../browser/playwright-manager'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000 // 5 Minuten
const POLL_INTERVAL_MS = 2000

export class LoginCancelledError extends Error {
  constructor() { super('Login abgebrochen') }
}

export class LoginTimeoutError extends Error {
  constructor() { super('Login-Timeout') }
}

/**
 * Öffnet ein sichtbares Browser-Fenster mit demselben Profil-Ordner wie der headless Context.
 * Nach dem Login schließt sich das Fenster — das Profil (Cookies etc.) bleibt gespeichert
 * und wird beim nächsten headless Start automatisch wiederverwendet.
 */
export async function waitForManualLogin(
  connector: ConnectorDef,
  onStatus?: (msg: string) => void
): Promise<void> {
  // Sichtbaren Context mit demselben Profil öffnen → Cookies landen im Profil-Ordner
  const context = await openPersistentContext(connector.id, false)
  const page = await context.newPage()
  await page.goto(connector.loginUrl, { waitUntil: 'domcontentloaded' })

  onStatus?.('Bitte melden Sie sich im Browser-Fenster an...')

  const checkUrl = connector.loginCheckUrl ?? connector.baseUrl
  const startTime = Date.now()

  try {
    while (true) {
      await page.waitForTimeout(POLL_INTERVAL_MS)

      // Prüfen ob Browser vom Nutzer geschlossen wurde
      if (!context.browser()?.isConnected()) {
        throw new LoginCancelledError()
      }

      // Solange wir im Amazon Auth-Flow sind (/ap/), nicht navigieren
      const currentUrl = page.url()
      const authPatterns = connector.authUrlPatterns ?? ['/ap/', 'signin', 'sign-in', 'auth-challenge', 'authentication']
      const onAuthPage = authPatterns.some(p => currentUrl.includes(p))

      if (!onAuthPage) {
        // Zur Check-URL navigieren und Login-Element suchen
        try {
          await page.goto(checkUrl, { waitUntil: 'load', timeout: 15000 })
          await page.waitForTimeout(1000)
        } catch {
          // Navigation-Fehler ignorieren
        }

        const loggedIn = await checkLogin(page, connector.loginCheck)
        console.log(`[Login-Fenster] Check auf ${page.url()} → eingeloggt: ${loggedIn}`)

        if (loggedIn) {
          onStatus?.('Anmeldung erkannt, schließe Browser...')
          // Cookies explizit sichern — Session-Cookies (ohne Ablaufdatum) werden
          // vom Browser nicht auf die Festplatte geschrieben und gehen sonst verloren.
          try {
            const cookies = await context.cookies()
            const cookiePath = path.join(getProfileDir(connector.id), 'saved-cookies.json')
            fs.writeFileSync(cookiePath, JSON.stringify(cookies))
            console.log(`[Login-Fenster] ${cookies.length} Cookies gesichert`)
          } catch (e) {
            console.log(`[Login-Fenster] Cookie-Sicherung fehlgeschlagen: ${e}`)
          }
          await context.close()
          return
        }
      }

      // Timeout prüfen
      if (Date.now() - startTime > LOGIN_TIMEOUT_MS) {
        await context.close().catch(() => null)
        throw new LoginTimeoutError()
      }
    }
  } catch (err) {
    await context.close().catch(() => null)
    throw err
  }
}
