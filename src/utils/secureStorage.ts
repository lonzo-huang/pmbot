/**
 * Secure local storage with encryption
 * Uses Web Crypto API for AES-GCM encryption
 */

const STORAGE_PREFIX = 'pmbot_'

interface EncryptedData {
  iv: string
  data: string
}

/**
 * Generate encryption key from password
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  const salt = encoder.encode(STORAGE_PREFIX)

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data
 */
export async function encrypt(data: string, password: string): Promise<string> {
  const key = await deriveKey(password)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )

  const encryptedData: EncryptedData = {
    iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join(''),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  }

  return JSON.stringify(encryptedData)
}

/**
 * Decrypt data
 */
export async function decrypt(encryptedString: string, password: string): Promise<string> {
  const key = await deriveKey(password)
  const encryptedData: EncryptedData = JSON.parse(encryptedString)

  const iv = new Uint8Array(
    encryptedData.iv.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  )
  const data = Uint8Array.from(atob(encryptedData.data), (c) => c.charCodeAt(0))

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  return new TextDecoder().decode(decrypted)
}

/**
 * Secure storage class
 */
export class SecureStorage {
  private password: string | null = null

  async initialize(password: string): Promise<void> {
    this.password = password
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.password) throw new Error('Storage not initialized')

    const stringValue = JSON.stringify(value)
    const encrypted = await encrypt(stringValue, this.password)
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, encrypted)
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.password) throw new Error('Storage not initialized')

    const encrypted = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!encrypted) return null

    try {
      const decrypted = await decrypt(encrypted, this.password)
      return JSON.parse(decrypted) as T
    } catch (error) {
      console.error('Failed to decrypt storage:', error)
      return null
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  }

  async clear(): Promise<void> {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key))
  }

  async keys(): Promise<string[]> {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .map((key) => key.replace(STORAGE_PREFIX, ''))
  }
}

// Export singleton instance
export const secureStorage = new SecureStorage()