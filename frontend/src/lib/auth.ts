/**
 * Cognito authentication helpers using amazon-cognito-identity-js.
 *
 * Flow:
 *   1. User is redirected to the Cognito Hosted UI for login.
 *   2. Cognito redirects back to /callback with an authorization code.
 *   3. The app exchanges the code for tokens (ID + access + refresh).
 *   4. The ID token is attached as a Bearer token on every InvokeHarness call.
 *   5. Tokens are stored in sessionStorage (not localStorage) to limit exposure.
 */

import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js'
import { config } from './config'

// ── Pool singleton ────────────────────────────────────────────

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId:   config.cognito.clientId,
})

// ── Session storage keys ──────────────────────────────────────

const KEYS = {
  idToken:      'bc_id_token',
  accessToken:  'bc_access_token',
  refreshToken: 'bc_refresh_token',
  expiresAt:    'bc_expires_at',
} as const

// ── Hosted UI helpers ─────────────────────────────────────────

export function getLoginUrl(): string {
  const base = `https://${config.cognito.domain}.auth.${config.cognito.region}.amazoncognito.com`
  const params = new URLSearchParams({
    client_id:     config.cognito.clientId,
    response_type: 'code',
    scope:         'openid email profile',
    redirect_uri:  `${window.location.origin}/callback`,
  })
  return `${base}/oauth2/authorize?${params.toString()}`
}

export function getLogoutUrl(): string {
  const base = `https://${config.cognito.domain}.auth.${config.cognito.region}.amazoncognito.com`
  const params = new URLSearchParams({
    client_id:  config.cognito.clientId,
    logout_uri: `${window.location.origin}/logout`,
  })
  return `${base}/logout?${params.toString()}`
}

/**
 * Exchange the authorization code (from /callback) for tokens.
 * Uses the Cognito token endpoint directly (PKCE not required for
 * server-side/SPA flows using the hosted UI code grant).
 */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const base = `https://${config.cognito.domain}.auth.${config.cognito.region}.amazoncognito.com`
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    client_id:    config.cognito.clientId,
    code,
    redirect_uri: `${window.location.origin}/callback`,
  })

  const response = await fetch(`${base}/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  const data = await response.json() as {
    id_token:      string
    access_token:  string
    refresh_token: string
    expires_in:    number
  }

  storeTokens(data.id_token, data.access_token, data.refresh_token, data.expires_in)
}

function storeTokens(
  idToken: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): void {
  const expiresAt = Date.now() + expiresIn * 1000
  sessionStorage.setItem(KEYS.idToken,      idToken)
  sessionStorage.setItem(KEYS.accessToken,  accessToken)
  sessionStorage.setItem(KEYS.refreshToken, refreshToken)
  sessionStorage.setItem(KEYS.expiresAt,    String(expiresAt))
}

export function getStoredIdToken(): string | null {
  return sessionStorage.getItem(KEYS.idToken)
}

export function isTokenExpired(): boolean {
  const expiresAt = sessionStorage.getItem(KEYS.expiresAt)
  if (!expiresAt) return true
  return Date.now() >= Number(expiresAt) - 60_000 // 1-min buffer
}

export function isAuthenticated(): boolean {
  return Boolean(getStoredIdToken()) && !isTokenExpired()
}

/**
 * Refresh the ID token using the stored refresh token.
 * Returns the new ID token on success.
 */
export async function refreshIdToken(): Promise<string> {
  const refreshTokenValue = sessionStorage.getItem(KEYS.refreshToken)
  if (!refreshTokenValue) throw new Error('No refresh token stored')

  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: 'placeholder', // required by the SDK but not used for refresh
      Pool:     userPool,
    })

    const refreshToken = new CognitoRefreshToken({ RefreshToken: refreshTokenValue })

    cognitoUser.refreshSession(refreshToken, (err, session: CognitoUserSession) => {
      if (err) return reject(err)

      const newIdToken      = session.getIdToken().getJwtToken()
      const newAccessToken  = session.getAccessToken().getJwtToken()
      const expiresIn       = session.getIdToken().getExpiration() - Math.floor(Date.now() / 1000)

      storeTokens(newIdToken, newAccessToken, refreshTokenValue, Math.max(expiresIn, 0))
      resolve(newIdToken)
    })
  })
}

/**
 * Get a valid ID token, refreshing if necessary.
 */
export async function getValidIdToken(): Promise<string> {
  if (!isTokenExpired()) {
    return getStoredIdToken()!
  }
  return refreshIdToken()
}

/**
 * Get a valid Access token, refreshing if necessary.
 * The Harness JWT authorizer checks the `client_id` claim which is only
 * present in the Cognito access token, not the ID token.
 */
export async function getValidAccessToken(): Promise<string> {
  if (isTokenExpired()) {
    await refreshIdToken() // refreshes all tokens including access token
  }
  return sessionStorage.getItem(KEYS.accessToken)!
}

export function signOut(): void {
  sessionStorage.removeItem(KEYS.idToken)
  sessionStorage.removeItem(KEYS.accessToken)
  sessionStorage.removeItem(KEYS.refreshToken)
  sessionStorage.removeItem(KEYS.expiresAt)
  window.location.href = getLogoutUrl()
}

/** Extract the email claim from the (non-verified) ID token payload. */
export function getEmailFromToken(): string | null {
  const token = getStoredIdToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { email?: string }
    return payload.email ?? null
  } catch {
    return null
  }
}

/** Check if the current user is in the Cognito 'admin' group. */
export function isAdmin(): boolean {
  const token = sessionStorage.getItem(KEYS.accessToken)
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as {
      'cognito:groups'?: string[]
    }
    return (payload['cognito:groups'] ?? []).includes('admin')
  } catch {
    return false
  }
}
