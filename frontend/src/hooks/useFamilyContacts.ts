/**
 * useFamilyContacts — localStorage CRUD for family contact profiles
 * Storage key: voiceshield_contacts
 */
import { useState, useCallback } from 'react'

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
  /** Base64-encoded WAV audio of the voice sample (optional) */
  voiceSampleBase64?: string
  /** Speaker embedding returned by the backend SpeechBrain model (optional) */
  speakerEmbedding?: SpeakerEmbedding
}

const STORAGE_KEY = 'voiceshield_contacts'

function loadContacts(): FamilyContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FamilyContact[]) : []
  } catch {
    return []
  }
}

function saveContacts(contacts: FamilyContact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

export function useFamilyContacts() {
  const [contacts, setContacts] = useState<FamilyContact[]>(loadContacts)

  const addContact = useCallback(
    (data: Omit<FamilyContact, 'id'>): FamilyContact => {
      const newContact: FamilyContact = {
        ...data,
        id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }
      const updated = [...contacts, newContact]
      saveContacts(updated)
      setContacts(updated)
      return newContact
    },
    [contacts],
  )

  const updateContact = useCallback(
    (id: string, data: Partial<Omit<FamilyContact, 'id'>>) => {
      const updated = contacts.map((c) => (c.id === id ? { ...c, ...data } : c))
      saveContacts(updated)
      setContacts(updated)
    },
    [contacts],
  )

  const deleteContact = useCallback(
    (id: string) => {
      const updated = contacts.filter((c) => c.id !== id)
      saveContacts(updated)
      setContacts(updated)
    },
    [contacts],
  )

  return { contacts, addContact, updateContact, deleteContact }
}

export default useFamilyContacts
