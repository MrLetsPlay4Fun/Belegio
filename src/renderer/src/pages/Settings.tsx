import { useState, useEffect } from 'react'
import { api } from '../api/ipc'

export default function Settings() {
  const [downloadRoot, setDownloadRootState] = useState('')
  const [connectorsDir, setConnectorsDir] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getDownloadRoot().then(p => { if (p) setDownloadRootState(p) })
    api.getUserConnectorsDir().then(p => { if (p) setConnectorsDir(p) })
  }, [])

  async function save(path: string) {
    await api.setDownloadRoot(path)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSelectFolder() {
    const chosen = await api.selectFolder()
    if (chosen) {
      setDownloadRootState(chosen)
      await save(chosen)
    }
  }

  async function handleBlur() {
    if (downloadRoot) await save(downloadRoot)
  }

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ fontWeight: 600, fontSize: 16, color: '#374151', margin: 0 }}>
        Einstellungen
      </h2>

      {/* Speicherordner */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Speicherordner</span>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
            Belege werden in diesem Ordner gespeichert. Unterordner werden automatisch nach Konnektor und Jahr angelegt.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={downloadRoot}
            onChange={e => setDownloadRootState(e.target.value)}
            onBlur={handleBlur}
            placeholder="Pfad zum Speicherordner..."
            style={{
              flex: 1,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '7px 10px',
              fontSize: 13,
              color: '#111',
              minWidth: 0,
            }}
          />
          <button className="secondary" onClick={handleSelectFolder} style={{ whiteSpace: 'nowrap' }}>
            Ordner wählen
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="secondary"
            onClick={() => api.openFolder(downloadRoot)}
            disabled={!downloadRoot}
            style={{ fontSize: 12 }}
          >
            Im Explorer öffnen
          </button>
          {saved && (
            <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Gespeichert</span>
          )}
        </div>
      </div>
      {/* Eigene Konnektoren */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Eigene Konnektoren</span>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
            Eigene Konnektor-Dateien (.json) in diesen Ordner legen — sie werden beim nächsten App-Start automatisch erkannt.
          </p>
        </div>

        <div style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 12,
          color: '#374151',
          fontFamily: 'monospace',
          wordBreak: 'break-all',
        }}>
          {connectorsDir || '…'}
        </div>

        <div>
          <button
            className="secondary"
            onClick={() => api.openFolder(connectorsDir)}
            disabled={!connectorsDir}
            style={{ fontSize: 12 }}
          >
            Ordner öffnen
          </button>
        </div>
      </div>
    </div>
  )
}
