import { useEffect, useState } from 'react'
import { exchangeCodeForTokens } from '../lib/auth'

interface Props {
  onSuccess: () => void
}

export default function CallbackPage({ onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const err    = params.get('error')

    if (err) {
      setError(`Authentication error: ${params.get('error_description') ?? err}`)
      return
    }

    if (!code) {
      setError('No authorization code found in the callback URL.')
      return
    }

    exchangeCodeForTokens(code)
      .then(onSuccess)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [onSuccess])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 max-w-md text-center space-y-4">
          <h2 className="text-lg font-semibold">Sign-in failed</h2>
          <p className="text-sm">{error}</p>
          <a href="/" className="inline-block text-brand-600 hover:underline text-sm">← Back to login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Completing sign-in…</p>
      </div>
    </div>
  )
}
