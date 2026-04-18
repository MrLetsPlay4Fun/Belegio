import { useState } from 'react'
import { useConnectors } from '../hooks/useConnectors'
import ConnectorCard from '../components/ConnectorCard'

export default function Dashboard() {
  const {
    connectors,
    statuses,
    messages,
    selectedIds,
    globalStartDate,
    isRunningAll,
    runAll,
    updateGlobalStartDate,
    toggleSelect,
    selectAll,
    deselectAll,
    clearSession,
  } = useConnectors()

  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? connectors.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : connectors

  const allSelected = connectors.length > 0 && selectedIds.size === connectors.length
  const noneSelected = selectedIds.size === 0

  if (connectors.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <p>Keine Konnektoren gefunden.</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>
          Legen Sie JSON-Dateien im <code>connectors/</code>-Verzeichnis ab.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Steuerleiste */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
            Belege ab:
          </label>
          <input
            type="date"
            value={globalStartDate}
            onChange={e => updateGlobalStartDate(e.target.value)}
            disabled={isRunningAll}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              color: '#111',
              background: isRunningAll ? '#f9fafb' : '#fff',
              cursor: isRunningAll ? 'not-allowed' : 'text',
            }}
          />
          {connectors.length > 3 && (
            <input
              type="text"
              placeholder="Konnektoren suchen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 13,
                color: '#111',
                width: 180,
              }}
            />
          )}
        </div>

        <button
          className="primary"
          onClick={runAll}
          disabled={isRunningAll || noneSelected}
          style={{ whiteSpace: 'nowrap', padding: '7px 20px' }}
        >
          {isRunningAll
            ? '⏳ Läuft...'
            : `▶ ${selectedIds.size === connectors.length ? 'Alle' : `${selectedIds.size} von ${connectors.length}`} ausführen`}
        </button>
      </div>

      {/* Konnektorenliste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Auswahl-Steuerung */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280', paddingLeft: 2 }}>
          <span>
            {selectedIds.size} von {connectors.length} ausgewählt
            {search && filtered.length !== connectors.length && ` · ${filtered.length} angezeigt`}
          </span>
          <span style={{ margin: '0 4px' }}>·</span>
          <button
            onClick={() => allSelected ? deselectAll() : selectAll(connectors.map(c => c.id))}
            disabled={isRunningAll}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#2563eb', cursor: isRunningAll ? 'not-allowed' : 'pointer',
              fontSize: 12, textDecoration: 'underline',
            }}
          >
            {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
          </button>
        </div>

        {/* Karten */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0', fontSize: 13 }}>
            Kein Konnektor gefunden für „{search}"
          </div>
        )}
        {filtered.map(connector => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            status={statuses.get(connector.id)}
            message={messages.get(connector.id)}
            selected={selectedIds.has(connector.id)}
            onToggleSelect={() => toggleSelect(connector.id)}
            onClearSession={() => clearSession(connector.id)}
          />
        ))}
      </div>
    </div>
  )
}
