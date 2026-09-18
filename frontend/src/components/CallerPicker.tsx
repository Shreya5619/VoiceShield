import React, { useState, useCallback, useMemo } from 'react'
import useFamilyContacts, { FamilyContact } from '../hooks/useFamilyContacts'
import '../styles/CallerPicker.css'

export interface CallerInfo {
  id: string            // contact id, or 'unknown'
  name: string
  phone: string
  relation?: string
  isUnknown: boolean
  familyContact?: FamilyContact  // full DynamoDB record, set for known contacts
}

interface CallerPickerProps {
  ownerPhone: string
  onStartCall: (caller: CallerInfo) => void
  onGoToContacts: () => void
}

/** Generate a random 10-digit US-style phone number */
function randomPhone(): string {
  const area = Math.floor(200 + Math.random() * 800)
  const mid  = Math.floor(100 + Math.random() * 900)
  const last = Math.floor(1000 + Math.random() * 9000)
  return `(${area}) ${mid}-${last}`
}

export const CallerPicker: React.FC<CallerPickerProps> = ({ ownerPhone, onStartCall, onGoToContacts }) => {
  const { contacts } = useFamilyContacts(ownerPhone)

  // selectedId: a contact id string, or 'unknown', or null
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // We generate the unknown number once per selection so it stays stable
  const [unknownPhone] = useState<string>(() => randomPhone())

  const selectedCaller = useMemo<CallerInfo | null>(() => {
    if (!selectedId) return null
    if (selectedId === 'unknown') {
      return { id: 'unknown', name: 'Unknown Caller', phone: unknownPhone, isUnknown: true }
    }
    const c = contacts.find((c) => c.id === selectedId)
    if (!c) return null
    return { id: c.id, name: c.name, phone: c.phone, relation: c.relation, isUnknown: false, familyContact: c }
  }, [selectedId, contacts, unknownPhone])

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id)) // toggle off if already selected
  }, [])

  const handleSimulate = useCallback(() => {
    if (selectedCaller) onStartCall(selectedCaller)
  }, [selectedCaller, onStartCall])

  return (
    <div className="caller-picker">
      {/* â”€â”€ Saved contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {contacts.length > 0 ? (
        <>
          <p className="picker-title">Select Caller</p>
          <div className="picker-grid">
            {contacts.map((c: FamilyContact) => (
              <button
                key={c.id}
                className={`picker-card ${selectedId === c.id ? 'selected' : ''}`}
                onClick={() => handleSelect(c.id)}
                aria-pressed={selectedId === c.id}
              >
                <div className="picker-avatar">{c.name.charAt(0)}</div>
                <div className="picker-info">
                  <p className="picker-name">{c.name}</p>
                  {c.relation && <span className="picker-sub relation">{c.relation}</span>}
                  <p className="picker-sub">{c.phone}</p>
                </div>
                {selectedId === c.id && <span className="picker-check">âœ“</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="picker-nudge">
          No family contacts saved.{' '}
          <a role="button" onClick={onGoToContacts}>
            Add one in the Contacts tab
          </a>{' '}
          or continue with an unknown caller below.
        </div>
      )}

      {/* â”€â”€ Divider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="picker-divider">
        <span>or</span>
      </div>

      {/* â”€â”€ Unknown caller option â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="picker-grid">
        <button
          className={`picker-card ${selectedId === 'unknown' ? 'selected' : ''}`}
          onClick={() => handleSelect('unknown')}
          aria-pressed={selectedId === 'unknown'}
        >
          <div className="picker-avatar unknown">â“</div>
          <div className="picker-info">
            <p className="picker-name">Unknown Caller</p>
            <p className="picker-sub">{unknownPhone}</p>
          </div>
          {selectedId === 'unknown' && <span className="picker-check">âœ“</span>}
        </button>
      </div>

      {/* â”€â”€ Selected preview + simulate button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {selectedCaller && (
        <>
          <div className="selected-preview">
            <div
              className={`picker-avatar ${selectedCaller.isUnknown ? 'unknown' : ''}`}
              style={{ width: 40, height: 40, fontSize: '1rem' }}
            >
              {selectedCaller.isUnknown ? 'â“' : selectedCaller.name.charAt(0)}
            </div>
            <div>
              <p className="preview-label">Incoming call from</p>
              <p className="preview-name">{selectedCaller.name}</p>
              <p className="preview-number">{selectedCaller.phone}</p>
            </div>
          </div>

          <button className="btn-simulate" onClick={handleSimulate}>
            Start call
          </button>
        </>
      )}
    </div>
  )
}

export default CallerPicker

