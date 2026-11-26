import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (b) => parseInt(b, 16))
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
const SESSION_COOKIE = 'cloudphone_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60
// The Workers runtime caps Web Crypto PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000

async function passwordDigest(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations: ITERATIONS }, key, 256)
  return hex(new Uint8Array(bits))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2-sha512$${ITERATIONS}$${hex(salt)}$${await passwordDigest(password, salt)}`
}

function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

export async function verifyPassword(password: string, stored: string) {
  const parts = /^pbkdf2-sha512\$100000\$([a-f\d]{32})\$([a-f\d]{64})$/.exec(stored)
  if (parts) return { valid: sameDigest(await passwordDigest(password, unhex(parts[1])), parts[2]), legacy: false }
  const legacy = /^[a-f\d]{64}$/.test(stored)
  return { valid: legacy && sameDigest(await digest(password + ':mobix_salt_2026'), stored), legacy }
}

const cookieOptions = (c: Context) => ({
  path: '/', httpOnly: true, sameSite: 'Strict' as const, secure: new URL(c.req.url).protocol === 'https:',
})

async function sessionDigest(c: Context): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE)
  return token && /^[a-f\d]{64}$/.test(token) ? digest(token) : null
}

export async function endSession(c: Context, db: D1Database) {
  const key = await sessionDigest(c)
  if (key) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(key).run()
  setCookie(c, SESSION_COOKIE, '', { ...cookieOptions(c), maxAge: 0 })
}

export async function startSession(c: Context, db: D1Database, userId: number) {
  const previous = await sessionDigest(c)
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?').bind(now, previous),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await digest(token), userId, now + SESSION_SECONDS * 1000),
  ])
  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions(c), maxAge: SESSION_SECONDS })
}

export async function sessionUserId(c: Context, db: D1Database): Promise<number | null> {
  const key = await sessionDigest(c)
  if (!key) return null
  const session = await db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(key, Date.now()).first<{ user_id: number }>()
  return session?.user_id ?? null
}
