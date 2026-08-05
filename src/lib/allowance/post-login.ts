export const POST_LOGIN_COOKIE_NAME = 'moni_post_login_return'

export function safePostLoginPath(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return ''
  try {
    const url = new URL(raw, 'https://moni.local')
    if (url.origin !== 'https://moni.local' || url.pathname !== '/oauth/authorize') return ''
    return `${url.pathname}${url.search}`
  } catch {
    return ''
  }
}
