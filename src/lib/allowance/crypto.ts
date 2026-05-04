import crypto from 'node:crypto'

function keySource() {
  return (
    process.env.ALLOWANCE_ENCRYPTION_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    'moni-allowance-dev-key'
  )
}

function getAesKey() {
  return crypto.createHash('sha256').update(keySource()).digest()
}

export function encryptText(plainText: string): string {
  if (!plainText) return ''

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptText(encryptedText: string): string {
  if (!encryptedText) return ''

  const [ivText, tagText, cipherText] = encryptedText.split('.')
  if (!ivText || !tagText || !cipherText) return ''

  try {
    const iv = Buffer.from(ivText, 'base64url')
    const tag = Buffer.from(tagText, 'base64url')
    const encrypted = Buffer.from(cipherText, 'base64url')

    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
