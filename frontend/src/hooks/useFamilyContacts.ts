/**
 * useFamilyContacts — DynamoDB-backed family contact profiles with a local cache.
 */
import { useState, useCallback, useEffect } from 'react'
import { apiUrl } from '../config/api'

export interface SpeakerEmbedding {
  /** Raw 192-dimensional ECAPA-TDNN vector */
  vector: number[]
  /** Dimension count (should always be 192) */
  dim: number
  /** ISO timestamp when the embedding was generated */
  generatedAt: string
}

export interface FamilyContact {
  id: string
  name: string
  relation: string
  phone: string
  securityQuestion: string
  /** Speaker embedding returned by the backend SpeechBrain model (optional) */
  speakerEmbedding?: SpeakerEmbedding
}

function storageKey(ownerPhone: string): string {
  return `voiceshield_contacts_${ownerPhone}`
}

function loadContacts(ownerPhone: string): FamilyContact[] {
  try {
    const raw = localStorage.getItem(storageKey(ownerPhone))
    if (!raw) return []
    const contacts = JSON.parse(raw) as FamilyContact[]
    return contacts.map(({ ...contact }) => {
      delete (contact as FamilyContact & { voiceSampleBase64?: string }).voiceSampleBase64
      return contact
    })
  } catch {
    return []
  }
}

function saveContacts(ownerPhone: string, contacts: FamilyContact[]): void {
  localStorage.setItem(storageKey(ownerPhone), JSON.stringify(contacts))
}

function toApiContact(contact: Omit<FamilyContact, 'id'>, ownerPhone: string) {
  return {
    owner_phone: ownerPhone,
    name: contact.name,
    relation: contact.relation,
    phone: contact.phone,
    security_question: contact.securityQuestion,
    speaker_embedding: contact.speakerEmbedding,
  }
}

function fromApiContact(item: any): FamilyContact {
  return {
    id: item.id,
    name: item.name,
    relation: item.relation ?? '',
    phone: item.phone,
    securityQuestion: item.security_question ?? '',
    speakerEmbedding: item.speaker_embedding,
  }
}

export function useFamilyContacts(ownerPhone: string) {
  const [contacts, setContacts] = useState<FamilyContact[]>(() => loadContacts(ownerPhone))

  const refresh = useCallback(async () => {
    const response = await fetch(
      `${apiUrl('/api/family-members')}?owner_phone=${encodeURIComponent(ownerPhone)}`,
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `Could not load family contacts (HTTP ${response.status})`)
    }
    const data = (await response.json()) as any[]
    const loaded = data.map(fromApiContact)
    saveContacts(ownerPhone, loaded)
    setContacts(loaded)
  }, [ownerPhone])

  useEffect(() => {
    refresh().catch(() => {
      // Keep the local cache available when the API is temporarily offline.
    })
  }, [refresh])

  const addContact = useCallback(
    async (data: Omit<FamilyContact, 'id'>): Promise<FamilyContact> => {
      const response = await fetch(apiUrl('/api/family-members'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toApiContact(data, ownerPhone)),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Could not save family contact (HTTP ${response.status})`)
      }
      const newContact = fromApiContact(await response.json())
      setContacts((current) => {
        const updated = [...current, newContact]
        saveContacts(ownerPhone, updated)
        return updated
      })
      return newContact
    },
    [ownerPhone],
  )

  const updateContact = useCallback(
    async (id: string, data: Partial<Omit<FamilyContact, 'id'>>) => {
      const current = contacts.find((contact) => contact.id === id)
      if (!current) throw new Error('Family contact not found')
      const merged = { ...current, ...data }
      const response = await fetch(apiUrl(`/api/family-members/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toApiContact(merged, ownerPhone)),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Could not update family contact (HTTP ${response.status})`)
      }
      const updatedContact = fromApiContact(await response.json())
      setContacts((currentContacts) => {
        const updated = currentContacts.map((c) => (c.id === id ? updatedContact : c))
        saveContacts(ownerPhone, updated)
        return updated
      })
    },
    [contacts, ownerPhone],
  )

  const deleteContact = useCallback(
    async (id: string) => {
      const response = await fetch(
        `${apiUrl(`/api/family-members/${id}`)}?owner_phone=${encodeURIComponent(ownerPhone)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Could not delete family contact (HTTP ${response.status})`)
      }
      setContacts((current) => {
        const updated = current.filter((c) => c.id !== id)
        saveContacts(ownerPhone, updated)
        return updated
      })
    },
    [ownerPhone],
  )

  return { contacts, addContact, updateContact, deleteContact, refresh }
}

export default useFamilyContacts
