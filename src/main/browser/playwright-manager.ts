import { chromium, BrowserContext } from 'playwright'
import { app } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

function findExecutablePath(): string | undefined {
  if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      path.join(os.homedir(), 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
    ]
    const found = macPaths.find(p => fs.existsSync(p))
    if (found) { console.log('[Browser] Nutze System-Browser:', found); return found }
    console.log('[Browser] Nutze Playwright-Browser')
    return undefined
  }

  // Windows
  const edgePaths = [
    path.join('C:\\', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join('C:\\', 'Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  const edge = edgePaths.find(p => fs.existsSync(p))
  if (edge) { console.log('[Browser] Nutze Edge:', edge); return edge }

  const chromePaths = [
    path.join('C:\\', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join('C:\\', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  const chrome = chromePaths.find(p => fs.existsSync(p))
  if (chrome) { console.log('[Browser] Nutze Chrome:', chrome); return chrome }

  console.log('[Browser] Nutze Playwright-Browser')
  return undefined
}

/** Gibt den Pfad zum persistenten Browser-Profil eines Konnektors zurück. */
export function getProfileDir(connectorId: string): string {
  return path.join(app.getPath('userData'), 'profiles', connectorId)
}

/**
 * Öffnet einen persistenten Browser-Context mit dem gespeicherten Profil des Konnektors.
 * Cookies, LocalStorage und Session bleiben zwischen Starts erhalten —
 * kein manuelles Cookie-Speichern mehr nötig.
 */
export async function openPersistentContext(
  connectorId: string,
  headless: boolean
): Promise<BrowserContext> {
  const profileDir = getProfileDir(connectorId)
  fs.mkdirSync(profileDir, { recursive: true })
  console.log(`[Browser] ${headless ? 'Headless' : 'Sichtbar'} — Profil: ${profileDir}`)

  return chromium.launchPersistentContext(profileDir, {
    headless,
    acceptDownloads: true,
    executablePath: findExecutablePath(),
    args: process.platform === 'darwin'
      ? (headless ? [] : ['--start-maximized'])
      : (headless ? ['--no-sandbox'] : ['--no-sandbox', '--start-maximized']),
  })
}

/** Löscht das gespeicherte Profil eines Konnektors (entspricht "Session löschen"). */
export function deleteProfile(connectorId: string): void {
  const profileDir = getProfileDir(connectorId)
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true })
    console.log(`[Browser] Profil gelöscht: ${profileDir}`)
  }
}

// Für Abwärtskompatibilität mit index.ts
export async function closeHeadlessBrowser(): Promise<void> {
  // Persistent contexts werden in runner.ts selbst geschlossen — nichts zu tun
}
