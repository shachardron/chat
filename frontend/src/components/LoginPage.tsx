import { getLoginUrl } from '../lib/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-gray-900">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center space-y-6">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-brand-600 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bedrock Chat</h1>
          <p className="text-sm text-gray-500">
            Powered by Claude Opus 4.7 via Amazon Bedrock
          </p>
        </div>

        <div className="border-t border-gray-100" />

        <div className="space-y-3">
          <p className="text-gray-600 text-sm">
            Sign in with your organisation account to start chatting.
          </p>

          <a
            href={getLoginUrl()}
            className="block w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold
                       rounded-lg transition-colors duration-150 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:ring-offset-2"
          >
            Sign in with Cognito
          </a>
        </div>

        <p className="text-xs text-gray-400">
          Authentication is provided by Amazon Cognito.
          Your credentials are never stored by this application.
        </p>
      </div>
    </div>
  )
}
