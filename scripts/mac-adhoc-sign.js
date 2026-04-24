#!/usr/bin/env node
/**
 * afterPack-Hook: Erstellt eine korrekte ad-hoc Signatur für die macOS App.
 *
 * Ohne diesen Schritt erzeugt der Linker automatisch eine unvollständige
 * Signatur (Identifier=Electron, Info.plist not bound) → macOS zeigt "beschädigt".
 * Mit codesign --sign - erhält die App die richtige Bundle-ID und gebundene
 * Ressourcen → macOS zeigt stattdessen "unbekannter Entwickler" (Rechtsklick → Öffnen).
 */
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  console.log('[mac-sign] Ad-hoc Signatur erstellen:', appPath)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  console.log('[mac-sign] Signatur fertig.')
}
