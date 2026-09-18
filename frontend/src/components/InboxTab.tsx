import React, { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../config/api'
import { SpeakerEmbedding } from '../hooks/useFamilyContacts'
import '../styles/InboxTab.css'

interface InboxItem {
  id: string
  item_type: string
  title: string
  message: string
  share_id?: string
  sender_phone?: string
  sender_name?: string
  speaker_embedding?: SpeakerEmbedding
  status: string
  created_at: string
}

interface InboxTabProps { ownerPhone: string }

export const InboxTab: React.FC<InboxTabProps> = ({ ownerPhone }) => {
  const [items, setItems] = useState<InboxItem[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pushMessage, setPushMessage] = useState('')

  const refresh = useCallback(async () => {
    const response = await fetch(`${apiUrl('/api/inbox')}?recipient_phone=${encodeURIComponent(ownerPhone)}`)
    if (!response.ok) throw new Error(await response.text())
    setItems(await response.json())
  }, [ownerPhone])

  useEffect(() => { refresh().catch((err) => setError(String(err))) }, [refresh])

  const enableNotifications = async () => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Browser notifications are not supported here.')
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.register('/push-sw.js')
      const vapidKey = ((import.meta as any).env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
      if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not configured.')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const response = await fetch(apiUrl('/api/push-subscriptions'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_phone: ownerPhone, subscription }),
      })
      if (!response.ok) throw new Error(await response.text())
      setPushMessage('Browser notifications enabled.')
    } catch (err) { setPushMessage(String(err)) }
  }

  const decide = async (item: InboxItem, action: 'accept' | 'reject') => {
    if (!item.share_id) return
    setBusyId(item.id)
    try {
      const payload: Record<string, string> = { recipient_phone: ownerPhone, action }
      if (action === 'accept') {
        payload.name = window.prompt('Name for this family member:', item.sender_name || '') || item.sender_name || 'Family member'
        payload.phone = item.sender_phone || ''
        payload.relation = window.prompt('Relation (optional):', '') || ''
      }
      const response = await fetch(apiUrl(`/api/voice-shares/${item.share_id}/decision`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await response.text())
      await refresh()
    } catch (err) { setError(String(err)) } finally { setBusyId(null) }
  }

  return <div className="inbox-tab">
    <div className="inbox-header"><h2>Inbox</h2><div><button onClick={enableNotifications}>Enable notifications</button> <button onClick={() => refresh().catch((err) => setError(String(err)))}>Refresh</button></div></div>
    {pushMessage && <p className="inbox-status">{pushMessage}</p>}

    {error && <p className="inbox-error">{error}</p>}
    {items.length === 0 && <p className="inbox-empty">No messages yet.</p>}
    <div className="inbox-list">
      {items.map((item) => <article className="inbox-item" key={item.id}>
        <div><strong>{item.title}</strong><p>{item.message}</p><time>{new Date(item.created_at).toLocaleString()}</time></div>
        {item.status === 'pending' && item.share_id && <div className="inbox-actions">
          <button disabled={busyId === item.id} onClick={() => decide(item, 'accept')}>Accept voice</button>
          <button disabled={busyId === item.id} onClick={() => decide(item, 'reject')}>Reject</button>
        </div>}
        {item.status !== 'pending' && <span className="inbox-status">{item.status}</span>}
      </article>)}
    </div>
  </div>
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

export default InboxTab