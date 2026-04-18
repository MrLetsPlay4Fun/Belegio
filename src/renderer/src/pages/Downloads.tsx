import { useDownloads } from '../hooks/useDownloads'
import { api } from '../api/ipc'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Downloads() {
  const { downloads } = useDownloads()

  if (downloads.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📥</div>
        <p>Noch keine Downloads vorhanden.</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Führen Sie einen Konnektor aus, um Belege herunterzuladen.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, color: '#374151' }}>
        Downloads ({downloads.length})
      </h2>
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Dateiname', 'Konnektor', 'Datum', 'Größe', 'Aktionen'].map(h => (
                <th key={h} style={{
                  textAlign: 'left',
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {downloads.map((d, i) => (
              <tr key={d.id} style={{
                borderBottom: i < downloads.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>
                  {d.filename}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
                  {d.connectorId}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
                  {formatDate(d.downloadedAt)}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
                  {formatBytes(d.size)}
                </td>
                <td style={{ padding: '10px 16px', display: 'flex', gap: 6 }}>
                  <button className="secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => api.openFile(d.filePath)}>
                    Öffnen
                  </button>
                  <button className="secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => api.openFolder(d.filePath)}>
                    Im Ordner zeigen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
