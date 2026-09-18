const env = (import.meta as any).env
const configuredApiUrl = (env.VITE_API_URL as string | undefined)?.trim()

// Local development keeps the existing backend default. Production must set
// VITE_API_URL to the publicly reachable FastAPI origin.
export const API_BASE_URL = configuredApiUrl || (env.DEV ? 'http://localhost:5000' : window.location.origin)

export function apiUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}