import type { ConnectorDef, ConnectorStatus } from '../../../shared/connector.types'

interface Props {
  connector: ConnectorDef
  status?: ConnectorStatus
  message?: string
  selected: boolean
  onToggleSelect: () => void
  onClearSession: () => void
}

const STATUS_CONFIG = {
  idle:            { label: 'Bereit',           color: '#6b7280', bg: '#f3f4f6' },
  running:         { label: 'Läuft...',         color: '#2563eb', bg: '#eff6ff' },
  'waiting-login': { label: 'Warte auf Login',  color: '#d97706', bg: '#fffbeb' },
  success:         { label: 'Abgeschlossen',    color: '#16a34a', bg: '#f0fdf4' },
  error:           { label: 'Fehler',           color: '#dc2626', bg: '#fef2f2' },
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ConnectorCard({ connector, status, message, selected, onToggleSelect, onClearSession }: Props) {
  const currentStatus = status?.status ?? 'idle'
  const cfg = STATUS_CONFIG[currentStatus]
  const isRunning = currentStatus === 'running' || currentStatus === 'waiting-login'

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${selected ? '#2563eb' : '#e5e7eb'}`,
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        transition: 'border-color 0.15s',
        opacity: isRunning ? 1 : selected ? 1 : 0.7,
      }}
    >
      {/* Checkbox */}
      <div style={{ paddingTop: 2 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={isRunning}
          style={{ width: 16, height: 16, cursor: isRunning ? 'not-allowed' : 'pointer', accentColor: '#2563eb' }}
        />
      </div>

      {/* Inhalt */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Name + Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{connector.name}</span>
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: cfg.color, background: cfg.bg,
            borderRadius: 999, padding: '2px 10px',
          }}>
            {cfg.label}
          </span>
        </div>

        {/* Metadaten */}
        <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 16 }}>
          <span>Letzter Lauf: {formatDate(status?.lastRun)}</span>
          {status?.lastDownloadCount !== undefined && (
            <span>Zuletzt: {status.lastDownloadCount} Datei(en)</span>
          )}
        </div>

        {/* Fortschrittsmeldung */}
        {message && (
          <div style={{
            fontSize: 12, color: cfg.color, background: cfg.bg,
            borderRadius: 6, padding: '5px 10px',
          }}>
            {message}
          </div>
        )}

        {/* Fehler */}
        {status?.error && currentStatus === 'error' && (
          <div style={{
            fontSize: 12, color: '#dc2626', background: '#fef2f2',
            borderRadius: 6, padding: '5px 10px',
          }}>
            {status.error}
          </div>
        )}

        {/* Session löschen */}
        <div>
          <button
            className="danger"
            onClick={onClearSession}
            disabled={isRunning}
            style={{ fontSize: 12, padding: '3px 10px' }}
          >
            Session löschen
          </button>
        </div>
      </div>
    </div>
  )
}
