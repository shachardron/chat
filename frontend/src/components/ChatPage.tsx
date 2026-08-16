import { useRef, useEffect, useState } from 'react'
import { getEmailFromToken, signOut, isAdmin } from '../lib/auth'
import { useChat } from '../hooks/useChat'
import { useChatHistory } from '../hooks/useChatHistory'
import { useTools } from '../hooks/useTools'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import Sidebar from './Sidebar'

export default function ChatPage() {
  const { messages, isStreaming, sessionId, sendMessage, stopStream, newSession, loadSession } = useChat()
  const { sessions, saveSession, deleteSession } = useChatHistory()
  const { tools, enabledTools, loading: loadingTools, toggleTool } = useTools()
  const bottomRef   = useRef<HTMLDivElement>(null)
  const email       = getEmailFromToken()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Save to history whenever messages change (debounced via the effect)
  useEffect(() => {
    if (messages.length > 0 && !isStreaming) {
      saveSession(sessionId, messages)
    }
  }, [messages, isStreaming, sessionId, saveSession])

  const handleNewSession = () => {
    newSession()
    setSidebarOpen(false)
  }

  const handleSelectSession = (session: { sessionId: string; messages: typeof messages }) => {
    loadSession(session.sessionId, session.messages)
    setSidebarOpen(false)
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">

      {/* ── Sidebar ── */}
      <Sidebar
        sessions={sessions}
        activeId={sessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={deleteSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="flex-none bg-white/80 backdrop-blur border-b border-gray-100 px-4 py-3
                           flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger — opens sidebar on mobile, or shows logo on desktop */}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-400 hover:text-gray-700
                         hover:bg-gray-100 transition-colors"
              aria-label="Open sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="hidden lg:flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700
                              flex items-center justify-center shadow-sm flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z"
                    clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">Bedrock Chat</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* New chat */}
            <button
              onClick={handleNewSession}
              title="New conversation"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Admin link — only for admins */}
            {isAdmin() && (
              <a
                href="/admin"
                title="Admin dashboard"
                className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" strokeWidth={2} />
                </svg>
              </a>
            )}

            {email && (
              <div className="hidden sm:flex items-center gap-2 mx-1">
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-brand-700">
                    {email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-500 truncate max-w-[160px]">{email}</span>
              </div>
            )}

            <button
              onClick={signOut}
              title="Sign out"
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={text => sendMessage(text, [], [])} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map(m => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* Input */}
        <footer className="flex-none bg-white/80 backdrop-blur border-t border-gray-100 px-4 pt-3 pb-4">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSend={(text, tools, files) => sendMessage(text, tools, files)}
              onStop={stopStream}
              isStreaming={isStreaming}
              disabled={false}
              tools={tools}
              enabledTools={enabledTools}
              onToggleTool={toggleTool}
              loadingTools={loadingTools}
            />
          </div>
        </footer>
      </div>
    </div>
  )
}

// ── Empty state ──────────────────────────────

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600
                      flex items-center justify-center shadow-lg mb-5">
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z"
            clipRule="evenodd" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-1">How can I help you today?</h2>
      <p className="text-sm text-gray-500 mb-8 text-center max-w-sm">
        Powered by Claude Opus 4.7 via Amazon Bedrock AgentCore.
        Enable web search to get up-to-date information.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
        {SUGGESTIONS.map(s => (
          <button
            key={s.text}
            onClick={() => onSuggestion(s.text)}
            className="flex items-start gap-3 text-left p-4 rounded-2xl bg-white border border-gray-200
                       hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <span className="text-lg leading-none mt-0.5">{s.icon}</span>
            <span className="text-sm text-gray-700 group-hover:text-gray-900">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  { icon: '🤖', text: "What's new in AI this week?" },
  { icon: '☁️', text: 'Explain how AgentCore Harness works' },
  { icon: '🔍', text: 'Compare Claude Opus vs Sonnet models' },
  { icon: '💡', text: 'Write a Python function to reverse a string' },
]
