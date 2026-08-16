import { useEffect } from 'react'
import { getLoginUrl } from '../lib/auth'

export default function LogoutPage() {
  useEffect(() => {
    // Clear all session storage on the logout landing page
    sessionStorage.clear()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">You've been signed out</h2>
        <p className="text-gray-500 text-sm">Thanks for using Bedrock Chat.</p>
        <a
          href={getLoginUrl()}
          className="inline-block px-5 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700
                     transition-colors text-sm font-medium"
        >
          Sign in again
        </a>
      </div>
    </div>
  )
}
