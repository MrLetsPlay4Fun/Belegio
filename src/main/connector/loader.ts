import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { ConnectorDef } from '../../shared/connector.types'

export function getUserConnectorsDir(): string {
  const userDir = path.join(app.getPath('userData'), 'connectors')
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })
  return userDir
}

function getConnectorDirs(): string[] {
  const dirs: string[] = []

  // Bundled connectors — app.getAppPath() zeigt auf den App-Ordner (dev) bzw.
  // die asar-Datei (packaged). Electron patcht fs transparent, sodass
  // Dateizugriffe innerhalb der asar ohne Änderung funktionieren.
  const bundledDir = path.join(app.getAppPath(), 'connectors')
  dirs.push(bundledDir)

  // User connectors in AppData
  const userDir = path.join(app.getPath('userData'), 'connectors')
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true })
  }
  dirs.push(userDir)

  return dirs
}

export function loadConnectors(): ConnectorDef[] {
  const connectors: ConnectorDef[] = []
  const seen = new Set<string>()

  for (const dir of getConnectorDirs()) {
    if (!fs.existsSync(dir)) continue

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
        const connector = JSON.parse(raw) as ConnectorDef
        if (connector.id && !seen.has(connector.id)) {
          seen.add(connector.id)
          connectors.push(connector)
        }
      } catch (err) {
        console.error(`Konnektor-Datei ${file} konnte nicht geladen werden:`, err)
      }
    }
  }

  return connectors
}
