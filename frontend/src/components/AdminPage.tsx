import { useState, useEffect, useCallback } from 'react'
import { getValidAccessToken, signOut, getEmailFromToken } from '../lib/auth'

interface AdminTool {
  name:        string
  type:        string
  url:         string
  gatewayArn:  string
  description: string
}

type ToolType = 'remote_mcp' | 'agentcore_gateway'

function typeLabel(type: string) {
  if (type === 'remote_mcp')        return 'Remote MCP'
  if (type === 'agentcore_gateway') return 'AgentCore Gateway'
  return type
}

function typeBadge(type: string) {
  const base = 'px-2 py-0.5 rounded-full text-xs font-medium'
  if (type === 'remote_mcp')        return `${base} bg-purple-100 text-purple-700`
  if (type === 'agentcore_gateway') return `${base} bg-blue-100 text-blue-700`
  return `${base} bg-gray-100 text-gray-600`
}

export default function AdminPage() {
  const [tools,    setTools]   = useState<AdminTool[]>([])
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState<string | null>(null)
  const [saving,   setSaving]  = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const email = getEmailFromToken()

  // Add form state
  const [showAdd,    setShowAdd]    = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newType,    setNewType]    = useState<ToolType>('remote_mcp')
  const [newUrl,     setNewUrl]     = useState('')
  const [newGwArn,   setNewGwArn]   = useState('')
  const [addError,   setAddError]   = useState<string | null>(null)

  const fetchTools = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const token = await getValidAccessToken()
      const r = await fetch('/api/admin/tools', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      setTools(await r.json() as AdminTool[])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchTools() }, [fetchTools])

  const handleAdd = async () => {
    setAddError(null)
    if (!newName.trim()) { setAddError('Name is required'); return }
    if (newType === 'remote_mcp' && !newUrl.trim()) { setAddError('URL is required'); return }
    if (newType === 'agentcore_gateway' && !newGwArn.trim()) { setAddError('Gateway ARN is required'); return }

    setSaving(true)
    try {
      const token = await getValidAccessToken()
      const r = await fetch('/api/admin/tools', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       newName.trim(),
          type:       newType,
          url:        newUrl.trim(),
          gatewayArn: newGwArn.trim(),
        }),
      })
      const data = await r.json() as { error?: string }
      if (!r.ok) throw new Error(data.error ?? r.statusText)
      // Reset form and refresh
      setNewName(''); setNewUrl(''); setNewGwArn(''); setShowAdd(false)
      await fetchTools()
    } catch (e) {
      setAddError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete tool "${name}"?`)) return
    setDeleting(name)
    try {
      const token = await getValidAccessToken()
      const r = await fetch(`/api/admin/tools/${encodeURIComponent(name)}`, {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!r.ok) {
        const d = await r.json() as { error?: string }
        throw new Error(d.error ?? r.statusText)
      }
      await fetchTools()
    } catch (e) {
      alert(`Failed to delete: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700
                          flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Admin Dashboard</h1>
            <p className="text-xs text-gray-400">Manage MCP tools &amp; Gateways</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a href="/" className="text-xs text-brand-600 hover:underline">← Back to chat</a>
          {email && <span className="text-xs text-gray-500">{email}</span>}
          <button onClick={signOut}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">

        {/* Tools card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Configured Tools</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Tools available to users in the chat — changes take effect immediately
              </p>
            </div>
            <button
              onClick={() => { setShowAdd(v => !v); setAddError(null) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white
                         text-xs font-medium hover:bg-brand-700 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add tool
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                New Tool
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Name <span className="text-red-400">*</span></label>
                  <input
                    value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. aws-docs"
                    className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none
                               focus:border-brand-400 focus:ring-1 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Type <span className="text-red-400">*</span></label>
                  <select
                    value={newType} onChange={e => setNewType(e.target.value as ToolType)}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none
                               focus:border-brand-400 bg-white"
                  >
                    <option value="remote_mcp">Remote MCP server</option>
                    <option value="agentcore_gateway">AgentCore Gateway</option>
                  </select>
                </div>

                {newType === 'remote_mcp' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">MCP Server URL <span className="text-red-400">*</span></label>
                    <input
                      value={newUrl} onChange={e => setNewUrl(e.target.value)}
                      placeholder="https://your-mcp-server.example.com/mcp"
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none
                                 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 font-mono"
                    />
                    <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      ⚠️ The MCP server must be publicly reachable without authentication, or use AWS SigV4.
                      Servers that require OAuth (e.g. Canva, GitHub) will fail with 401 — use an AgentCore Gateway with credential provider instead.
                    </p>
                  </div>
                )}

                {newType === 'agentcore_gateway' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Gateway ARN <span className="text-red-400">*</span></label>
                    <input
                      value={newGwArn} onChange={e => setNewGwArn(e.target.value)}
                      placeholder="arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/my-gateway-id"
                      className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none
                                 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 font-mono"
                    />
                  </div>
                )}
              </div>

              {addError && (
                <p className="mt-2 text-xs text-red-600">{addError}</p>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAdd} disabled={saving}
                  className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-medium
                             hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Adding…' : 'Add tool'}
                </button>
                <button
                  onClick={() => { setShowAdd(false); setAddError(null) }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs
                             hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tool list */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500 text-sm">
              {error}
              <button onClick={fetchTools} className="ml-2 underline">Retry</button>
            </div>
          ) : tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <p className="text-sm">No tools configured yet</p>
              <p className="text-xs mt-1">Click "Add tool" to get started</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint / ARN</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tools.map(tool => (
                  <tr key={tool.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{tool.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={typeBadge(tool.type)}>{typeLabel(tool.type)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-gray-500 truncate block max-w-xs" title={tool.url || tool.gatewayArn}>
                        {tool.url || tool.gatewayArn || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(tool.name)}
                        disabled={deleting === tool.name}
                        title="Remove tool"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                                   disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Info card */}
        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <p className="text-xs text-blue-700">
            <strong>Tool changes take effect immediately</strong> — the Harness is updated in real-time.
            Users will see new toggles appear within 5 minutes (server cache TTL).
            The Harness execution role needs <code className="bg-blue-100 px-1 rounded">InvokeGateway</code> or
            relevant IAM permissions for each new tool.
          </p>
        </div>
      </main>
    </div>
  )
}
