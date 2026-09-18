self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'VoiceShield', body: 'You have a new alert.' }
  event.waitUntil(
    self.registration.showNotification(data.title || 'VoiceShield', {
      body: data.body || 'You have a new alert.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
