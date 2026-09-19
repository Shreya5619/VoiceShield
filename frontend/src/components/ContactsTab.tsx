import React, { useState, useCallback } from 'react'
import useFamilyContacts, { FamilyContact, SpeakerEmbedding } from '../hooks/useFamilyContacts'
import { VoiceSampleRecorder } from './VoiceSampleRecorder'
import { apiUrl } from '../config/api'
import '../styles/ContactsTab.css'

/* ── Icon Components ─────────────────────────────────────── */
const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const UserXIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="18" y1="8" x2="23" y2="13" />
    <line x1="23" y1="8" x2="18" y2="13" />
  </svg>
)

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
  initialEmbedding?: SpeakerEmbedding
  title: string
  titleIcon: React.ReactNode
  onSave: (data: FormData, speakerEmbedding: SpeakerEmbedding | null) => void
  onCancel: () => void
}

const ContactForm: React.FC<ContactFormProps> = ({
  initial = BLANK_FORM,
  initialEmbedding,
  title,
  titleIcon,
  onSave,
  onCancel,
}) => {
  const [form, setForm] = useState<FormData>({ ...initial })
  const [errors, setErrors] = useState<FormErrors>({})
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
    if (validate()) onSave(form, voiceEmbedding)
  }

  const handleEmbeddingReady = useCallback(
    (embedding: SpeakerEmbedding | null) => {
      setVoiceEmbedding(embedding)
    },
    [],
  )

  return (
    <div className="contact-form-card">
      <div className="contact-form-header">
        <div className="contact-form-icon">{titleIcon}</div>
        <p className="contact-form-title">{title}</p>
      </div>
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
          <label className="form-label">Voice Sample (Optional)</label>
          <VoiceSampleRecorder
            onEmbeddingReady={handleEmbeddingReady}
            initialEmbedding={initialEmbedding}
          />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-save" onClick={handleSave}>
          Save Contact
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
  onSaveEdit: (data: FormData, speakerEmbedding: SpeakerEmbedding | null) => void
  onCancelEdit: () => void
  onToggleEmergency: () => void
}

const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
  onToggleEmergency,
}) => {
  if (isEditing) {
    return (
      <div className="contact-card editing">
        <ContactForm
          title="Edit Contact"
          titleIcon={<EditIcon />}
          initial={{
            name: contact.name,
            relation: contact.relation,
            phone: contact.phone,
            securityQuestion: contact.securityQuestion,
          }}
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
          <p className="contact-security">
            <LockIcon />
            <span>{contact.securityQuestion}</span>
          </p>
        )}
        {contact.speakerEmbedding && (
          <p className="contact-voice-badge" title={`${contact.speakerEmbedding.dim}d embedding · ${contact.speakerEmbedding.generatedAt}`}>
            <MicIcon />
            <span>Voice sample on file</span>
          </p>
        )}
      </div>

      <div className="contact-actions">
        <button
          className={`btn-icon emergency ${contact.isEmergencyContact ? 'active' : ''}`}
          title={contact.isEmergencyContact ? "Remove from emergency contacts" : "Set as emergency contact"}
          onClick={onToggleEmergency}
          aria-label={`Toggle emergency contact for ${contact.name}`}
        >
          {contact.isEmergencyContact ? (
            <>
              <AlertIcon />
              <span>Emergency</span>
            </>
          ) : (
            <>
              <ShieldIcon />
              <span>Set emergency</span>
            </>
          )}
        </button>
        <button className="btn-icon edit" title="Edit contact" onClick={onEdit} aria-label={`Edit ${contact.name}`}>
          <EditIcon />
        </button>
        <button
          className="btn-icon delete"
          title="Delete contact"
          onClick={onDelete}
          aria-label={`Delete ${contact.name}`}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

/* ── Main ContactsTab ────────────────────────────────────── */
interface ContactsTabProps {
  ownerPhone: string
}

export const ContactsTab: React.FC<ContactsTabProps> = ({ ownerPhone }) => {
  const { contacts, addContact, updateContact, deleteContact } = useFamilyContacts(ownerPhone)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sharePhone, setSharePhone] = useState('')
  const [shareEmbedding, setShareEmbedding] = useState<SpeakerEmbedding | null>(null)
  const [shareMessage, setShareMessage] = useState('')

  const handleAdd = useCallback(
    async (data: FormData, speakerEmbedding: SpeakerEmbedding | null) => {
      addContact({
        ...data,
        ...(speakerEmbedding ? { speakerEmbedding } : {}),
      }).catch(console.error)
      setShowAddForm(false)
    },
    [addContact],
  )

  const handleUpdate = useCallback(
    (id: string, data: FormData, speakerEmbedding: SpeakerEmbedding | null) => {
      updateContact(id, {
        ...data,
        speakerEmbedding: speakerEmbedding ?? undefined,
      }).catch(console.error)
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

  const sendVoice = async () => {
    if (!sharePhone.trim() || !shareEmbedding) {
      setShareMessage('Enter a phone number and record your voice first.')
      return
    }
    const response = await fetch(apiUrl('/api/voice-shares'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_phone: ownerPhone, sender_name: ownerPhone,
        recipient_phone: sharePhone.trim(), speaker_embedding: shareEmbedding,
      }),
    })
    if (!response.ok) { setShareMessage(await response.text()); return }
    setSharePhone(''); setShareEmbedding(null); setShareMessage('Voice sent to their inbox.')
  }

  return (
    <div className="contacts-tab">
      {/* Header */}
      <div className="contacts-header">
        <h2 className="contacts-title">
          <UsersIcon />
          <span>Family Contacts</span>
        </h2>
        {!showAddForm && (
          <button
            className="btn-add-contact"
            onClick={() => {
              setEditingId(null)
              setShowAddForm(true)
            }}
          >
            <PlusIcon />
            <span>Add Contact</span>
          </button>
        )}
      </div>

      {showAddForm && (
        <ContactForm
          title="New Contact"
          titleIcon={<PlusIcon />}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <section className="contact-form-card">
        <div className="contact-form-header">
          <div className="contact-form-icon">
            <SendIcon />
          </div>
          <p className="contact-form-title">Send Your Voice</p>
        </div>
        <p className="contact-form-description">
          Share your voice profile with family members so they can verify it's really you calling.
        </p>
        <div className="form-grid">
          <div className="form-field full-width">
            <label className="form-label">Family member's phone number</label>
            <input className="form-input" type="tel" value={sharePhone} onChange={(e) => setSharePhone(e.target.value)} placeholder="Enter their phone number" />
          </div>
          <div className="form-field full-width">
            <label className="form-label">Record your voice</label>
            <VoiceSampleRecorder onEmbeddingReady={setShareEmbedding} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn-save" onClick={sendVoice}>
            <SendIcon />
            <span>Send Voice Profile</span>
          </button>
        </div>
        {shareMessage && <p className={shareMessage.includes('sent') ? 'share-success' : 'field-error'}>{shareMessage}</p>}
      </section>

      {/* Empty state */}
      {contacts.length === 0 && !showAddForm && (
        <div className="contacts-empty">
          <div className="contacts-empty-icon">
            <UserXIcon />
          </div>
          <h3>No family contacts yet</h3>
          <p>Add contacts to quickly select them when receiving calls and enable voice verification.</p>
          <button className="btn-add-contact" onClick={() => setShowAddForm(true)}>
            <PlusIcon />
            <span>Add Your First Contact</span>
          </button>
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
            onSaveEdit={(data, emb) => handleUpdate(contact.id, data, emb)}
            onCancelEdit={() => setEditingId(null)}
            onToggleEmergency={() => updateContact(contact.id, { isEmergencyContact: !contact.isEmergencyContact }).catch(console.error)}
          />
        ))}
      </div>
    </div>
  )
}

export default ContactsTab
