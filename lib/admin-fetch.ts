/**
 * Helper for making authenticated admin API calls
 * Automatically includes Whop auth headers from localStorage
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  // In Whop iframe context, token is stored in localStorage
  if (typeof window !== 'undefined') {
    const devToken = localStorage.getItem('whop-dev-token')
    const devUserId = localStorage.getItem('whop-dev-user-id')

    if (devToken) {
      headers['x-whop-user-token'] = devToken
    }
    if (devUserId) {
      headers['x-whop-user-id'] = devUserId
    }
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
