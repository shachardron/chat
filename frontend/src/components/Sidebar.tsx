import type { ChatSession } from '../hooks/useChatHistory'

interface Props {
  sessions:       ChatSession[]
  activeId:       string
  onSelect:       (session: ChatSession) => void
  onNew:          () => void
  onDelete:       (sessionId: string) => void
  isOpen:         boolean
  onClose:        () => void
}

export default function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, isOpen, onClose }: Props) {
  // Group sessions by date
  const groups = groupByDate(sessions)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-30
          flex flex-col w-64 bg-gray-950 text-gray-100
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700
                            flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z"
                  clipRule="evenodd" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Bedrock Chat</span>
          </div>

          {/* Close on mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl
                       bg-gray-800 hover:bg-gray-700 text-sm text-gray-200
                       transition-colors border border-gray-700"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New conversation
          </button>
        </div>

        {/* Session list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-600 text-center px-4 py-8">
              Your conversations will appear here
            </p>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <p className="px-3 py-1 text-xs font-medium text-gray-600 uppercase tracking-wider">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.sessions.map(s => (
                    <SessionItem
                      key={s.sessionId}
                      session={s}
                      isActive={s.sessionId === activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>
      </aside>
    </>
  )
}

// ── Session item ─────────────────────────────

function SessionItem({
  session, isActive, onSelect, onDelete,
}: {
  session:  ChatSession
  isActive: boolean
  onSelect: (s: ChatSession) => void
  onDelete: (id: string) => void
}) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(session.sessionId)
  }

  return (
    <li>
      <button
        onClick={() => onSelect(session)}
        title={session.title}
        className={`
          group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
          transition-colors text-sm
          ${isActive
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }
        `}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>

        <span className="flex-1 truncate">{session.title}</span>

        {/* Delete button — visible on hover */}
        <span
          role="button"
          onClick={handleDelete}
          title="Delete"
          aria-label="Delete conversation"
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded
                     hover:text-red-400 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </span>
      </button>
    </li>
  )
}

// ── Date grouping helpers ─────────────────────

interface Group { label: string; sessions: ChatSession[] }

function groupByDate(sessions: ChatSession[]): Group[] {
  const today = new Date(); today.setHours(0,0,0,0)
  const todayMs     = today.getTime()
  const yesterdayMs = todayMs - 86_400_000
  const week7Ms     = todayMs - 7 * 86_400_000
  const week30Ms    = todayMs - 30 * 86_400_000

  const groups: Record<string, ChatSession[]> = {
    Today:          [],
    Yesterday:      [],
    'Last 7 days':  [],
    'Last 30 days': [],
    Older:          [],
  }

  for (const s of sessions) {
    const t = s.updatedAt
    if (t >= todayMs)         groups['Today'].push(s)
    else if (t >= yesterdayMs) groups['Yesterday'].push(s)
    else if (t >= week7Ms)    groups['Last 7 days'].push(s)
    else if (t >= week30Ms)   groups['Last 30 days'].push(s)
    else                      groups['Older'].push(s)
  }

  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, sessions]) => ({ label, sessions }))
}
