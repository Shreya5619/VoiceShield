import React, { useState, useCallback } from 'react'
import useFamilyContacts, { FamilyContact, SpeakerEmbedding } from '../hooks/useFamilyContacts'
import { VoiceSampleRecorder } from './VoiceSampleRecorder'
import '../styles/ContactsTab.css'

/* ── Blank form shape ────────────────────────────────────── */
const BLANK_FORM = { name: '', relation: '', phone: '', securityQuestion: '' }

type FormData = typeof BLANK_FORM

interface FormErrors {
  name?: string
  phone?: string
}

/* ── Small inline form ───────────────────────────────────── */
interface ContactFormProps {
  initial?: FormData
  initialBase64?: string
  initialEmbedding?: SpeakerEmbedding
  title: string
  onSave: (data: FormData, voiceSampleBase64: string | null, speakerEmbedding: SpeakerEmbedding | null) => void
  onCancel: () => void
}

const ContactForm: React.FC<ContactFormProps> = ({
  initial = BLANK_FORM,
  initialBase64,
  initialEmbedding,
  title,
  onSave,
  onCancel,
}) => {
  const [form, setForm] = useState<FormData>({ ...initial })
  const [errors, setErrors] = useState<FormErrors>({})
  const [voiceBase64, setVoiceBase64] = useState<string | null>(initialBase64 ?? null)
  const [voiceEmbedding, setVoiceEmbedding] = useState<SpeakerEmbedding | null>(initialEmbedding ?? null)

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.phone.trim()) {
      newErrors.phone = 'Phone is required'
    } else if (!/^\d[\d\s\-().+]{6,}$/.test(form.phone.trim())) {
      newErrors.phone = 'Enter a valid phone number'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (validate()) onSave(form, voiceBase64, voiceEmbedding)
  }

  const handleEmbeddingReady = useCallback(
    (base64: string | null, embedding: SpeakerEmbedding | null) => {
      setVoiceBase64(base64)
      setVoiceEmbedding(embedding)
    },
    [],
  )

  return (
    <div className="contact-form-card">
      <p className="contact-form-title">{title}</p>
      <div className="form-grid">
        {/* Name */}
        <div className="form-field">
          <label className="form-label">Name *</label>
          <input
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="e.g. Mom"
            value={form.name}
            onChange={set('name')}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        {/* Relation */}
        <div className="form-field">
          <label className="form-label">Relation</label>
          <input
            className="form-input"
            placeholder="e.g. Mother"
            value={form.relation}
            onChange={set('relation')}
          />
        </div>

        {/* Phone */}
        <div className="form-field">
          <label className="form-label">Phone Number *</label>
          <input
            className={`form-input ${errors.phone ? 'error' : ''}`}
            placeholder="e.g. 555-123-4567"
            value={form.phone}
            onChange={set('phone')}
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>

        {/* Security question */}
        <div className="form-field">
          <label className="form-label">Security Question</label>
          <input
            className="form-input"
            placeholder="e.g. Pet's name?"
            value={form.securityQuestion}
            onChange={set('securityQuestion')}
          />
        </div>

        {/* Voice sample — spans both columns */}
        <div className="form-field full-width">
          <label className="form-label">Voice Sample</label>
          <VoiceSampleRecorder
            onEmbeddingReady={handleEmbeddingReady}
            initialBase64={initialBase64}
            initialEmbedding={initialEmbedding}
          />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-save" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  )
}

/* ── Contact card ────────────────────────────────────────── */
interface ContactCardProps {
  contact: FamilyContact
  onEdit: () => void
  onDelete: () => void
  isEditing: boolean
  onSaveEdit: (data: FormData, voiceSampleBase64: string | null, speakerEmbedding: SpeakerEmbedding | null) => void
  onCancelEdit: () => void
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}) => {
  if (isEditing) {
    return (
      <div className="contact-card editing">
        <ContactForm
          title="✏️ Edit Contact"
          initial={{
            name: contact.name,
            relation: contact.relation,
            phone: contact.phone,
            securityQuestion: contact.securityQuestion,
          }}
          initialBase64={contact.voiceSampleBase64}
          initialEmbedding={contact.speakerEmbedding}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      </div>
    )
  }

  return (
    <div className="contact-card">
      <div className="contact-avatar" aria-hidden="true">
        {contact.name.charAt(0).toUpperCase()}
      </div>

      <div className="contact-info">
        <p className="contact-name">{contact.name}</p>
        <div className="contact-meta">
          {contact.relation && <span className="contact-relation">{contact.relation}</span>}
          <span className="contact-phone">{contact.phone}</span>
        </div>
        {contact.securityQuestion && (
          <p className="contact-security">🔐 {contact.securityQuestion}</p>
        )}
        {contact.speakerEmbedding && (
          <p className="contact-voice-badge" title={`${contact.speakerEmbedding.dim}d embedding · ${contact.speakerEmbedding.generatedAt}`}>
            🎙️ Voice sample on file
          </p>
        )}
      </div>

      <div className="contact-actions">
        <button className="btn-icon edit" title="Edit" onClick={onEdit} aria-label={`Edit ${contact.name}`}>
          ✏️
        </button>
        <button
          className="btn-icon delete"
          title="Delete"
          onClick={onDelete}
          aria-label={`Delete ${contact.name}`}
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

/* ── Main ContactsTab ────────────────────────────────────── */
export const ContactsTab: React.FC = () => {
  const { contacts, addContact, updateContact, deleteContact } = useFamilyContacts()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAdd = useCallback(
    (data: FormData, voiceSampleBase64: string | null, speakerEmbedding: SpeakerEmbedding | null) => {
      addContact({
        ...data,
        ...(voiceSampleBase64 ? { voiceSampleBase64 } : {}),
        ...(speakerEmbedding ? { speakerEmbedding } : {}),
      })
      setShowAddForm(false)
    },
    [addContact],
  )

  const handleUpdate = useCallback(
    (id: string, data: FormData, voiceSampleBase64: string | null, speakerEmbedding: SpeakerEmbedding | null) => {
      updateContact(id, {
        ...data,
        voiceSampleBase64: voiceSampleBase64 ?? undefined,
        speakerEmbedding: speakerEmbedding ?? undefined,
      })
      setEditingId(null)
    },
    [updateContact],
  )

  const handleDelete = useCallback(
    (id: string) => {
      if (editingId === id) setEditingId(null)
      deleteContact(id)
    },
    [deleteContact, editingId],
  )

  return (
    <div className="contacts-tab">
      {/* Header */}
      <div className="contacts-header">
        <h2 className="contacts-title">
          <span>👨‍👩‍👧</span> Family Contacts
        </h2>
        {!showAddForm && (
          <button
            className="btn-add-contact"
            onClick={() => {
              setEditingId(null)
              setShowAddForm(true)
            }}
          >
            <span>＋</span> Add Contact
          </button>
        )}
      </div>

      {showAddForm && (
        <ContactForm
          title="➕ New Contact"
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Empty state */}
      {contacts.length === 0 && !showAddForm && (
        <div className="contacts-empty">
          <div className="contacts-empty-icon">👥</div>
          <p>No family contacts yet.</p>
          <p style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
            Add contacts to quickly select them when simulating a call.
          </p>
        </div>
      )}

      {/* Contact list */}
      <div className="contacts-list">
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            isEditing={editingId === contact.id}
            onEdit={() => {
              setShowAddForm(false)
              setEditingId(contact.id)
            }}
            onDelete={() => handleDelete(contact.id)}
            onSaveEdit={(data, base64, emb) => handleUpdate(contact.id, data, base64, emb)}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  )
}

export default ContactsTab
