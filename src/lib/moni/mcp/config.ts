export const MONI_MCP_VERSION = '1.0.0'
export const MONI_MCP_PROTOCOL_VERSION = '2025-06-18'
export const MONI_BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()

export const MONI_MCP_SCOPES = ['moni:read', 'offline_access'] as const
export type MoniMcpScope = typeof MONI_MCP_SCOPES[number]

export function moniPublicBaseUrl() {
  const configured = String(process.env.MONI_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  return process.env.VERCEL_ENV === 'production'
    ? 'https://moni-sigma.vercel.app'
    : `https://${String(process.env.VERCEL_URL || 'moni-sigma.vercel.app').trim()}`
}

export function moniMcpResource() {
  return `${moniPublicBaseUrl()}/mcp`
}

export function oauthMetadataUrl() {
  return `${moniPublicBaseUrl()}/.well-known/oauth-authorization-server`
}

export function protectedResourceMetadataUrl() {
  return `${moniPublicBaseUrl()}/.well-known/oauth-protected-resource`
}

export function parseScopes(value: unknown) {
  const requested = String(value || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const allowed = new Set<string>(MONI_MCP_SCOPES)
  const scopes = requested.filter((item) => allowed.has(item))
  return Array.from(new Set(scopes.length ? scopes : ['moni:read']))
}

export function isSafeRelativePath(value: unknown) {
  const path = String(value || '').trim()
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
}

export function isAllowedChatGptRedirectUri(value: unknown) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:'
      && url.hostname === 'chatgpt.com'
      && url.pathname.startsWith('/connector/oauth/')
      && !url.username
      && !url.password
  } catch {
    return false
  }
}
