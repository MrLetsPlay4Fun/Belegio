#!/usr/bin/env node
/**
 * Befüllt den electron-builder winCodeSign-Cache manuell, um den Symlink-Fehler
 * auf Windows ohne Developer Mode zu umgehen.
 *
 * Problem: winCodeSign.7z enthält macOS-Symlinks. 7zip kann diese auf Windows
 * ohne SeCreateSymbolicLinkPrivilege nicht erstellen → Exitcode 2 → Build schlägt fehl.
 * Lösung: Extraktion manuell durchführen, fehlende Symlinks als leere Dateien anlegen.
 */

const { execFileSync, spawnSync } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

if (process.platform !== 'win32') {
  console.log('[setup] Nicht Windows — winCodeSign-Cache-Setup wird übersprungen.')
  process.exit(0)
}

const VERSION    = 'winCodeSign-2.6.0'
const URL        = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`
const CACHE_DIR  = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
const TARGET_DIR = path.join(CACHE_DIR, VERSION)
const SEVEN_ZA   = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

// Symlinks die 7zip ohne Privileg nicht anlegen kann (macOS-Bibliotheken, für Windows-Builds irrelevant)
const STUB_SYMLINKS = [
  'darwin/10.12/lib/libcrypto.dylib',
  'darwin/10.12/lib/libssl.dylib',
]

function download(url, dest) {
  // curl -L follows redirects, -f fails on HTTP errors, --silent suppresses progress bar
  const result = spawnSync('curl', ['-L', '-f', '-o', dest, url], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  })
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : ''
    throw new Error(`curl fehlgeschlagen (exit ${result.status}): ${stderr}`)
  }
}

function main() {
  if (fs.existsSync(TARGET_DIR)) {
    console.log(`[setup] winCodeSign-Cache vorhanden: ${TARGET_DIR}`)
    return
  }

  console.log('[setup] Befülle winCodeSign-Cache...')
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const archivePath = path.join(CACHE_DIR, `${VERSION}.7z`)
  if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
    console.log(`[setup] Lade ${VERSION}.7z herunter...`)
    download(URL, archivePath)
    console.log(`[setup] Download abgeschlossen (${(fs.statSync(archivePath).size / 1024 / 1024).toFixed(1)} MB).`)
  }

  console.log('[setup] Extrahiere Windows-Dateien (darwin wird separat behandelt)...')
  fs.mkdirSync(TARGET_DIR, { recursive: true })

  // Schritt 1: Alles außer darwin extrahieren (darwin enthält problematische Symlinks)
  try {
    execFileSync(SEVEN_ZA, ['x', archivePath, `-o${TARGET_DIR}`, '-xr!darwin', '-y'], { stdio: 'pipe' })
    console.log('[setup] Windows-Dateien extrahiert.')
  } catch (e) {
    console.error('[setup] Fehler bei der Extraktion:', e.message)
    throw e
  }

  // Schritt 2: darwin-Verzeichnis minimal anlegen (Stubs für die Symlinks die fehlen würden)
  for (const sym of STUB_SYMLINKS) {
    const p = path.join(TARGET_DIR, sym.split('/').join(path.sep))
    fs.mkdirSync(path.dirname(p), { recursive: true })
    if (!fs.existsSync(p)) fs.writeFileSync(p, '')
  }
  console.log('[setup] darwin-Stubs angelegt.')

  // Heruntergeladenes Archiv aufräumen
  try { fs.unlinkSync(archivePath) } catch {}

  console.log(`[setup] ✓ winCodeSign-Cache bereit: ${TARGET_DIR}`)
}

try { main() } catch (err) { console.error('[setup] Fehler:', err.message); process.exit(1) }
