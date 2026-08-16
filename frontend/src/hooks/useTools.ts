/**
 * useTools — fetches the available tools from /api/tools (server-side)
 * and manages per-session enabled/disabled state.
 */

import { useState, useEffect, useCallback } from 'react'

export interface Tool {
  name:        string
  type:        string
  description: string
}

export interface UsedToolsReturn {
  tools:        Tool[]
  enabledTools: Set<string>
  loading:      boolean
  toggleTool:   (name: string) => void
  enabledList:  string[]   // array of enabled tool names for allowedTools
}

export function useTools(): UsedToolsReturn {
  const [tools,        setTools]        = useState<Tool[]>([])
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set())
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch('/api/tools')
      .then(r => r.json() as Promise<Tool[]>)
      .then(data => {
        if (cancelled) return
        setTools(data)
        // All tools off by default
        setEnabledTools(new Set())
      })
      .catch(() => {
        if (!cancelled) setTools([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const toggleTool = useCallback((name: string) => {
    setEnabledTools(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else                next.add(name)
      return next
    })
  }, [])

  const enabledList = Array.from(enabledTools)

  return { tools, enabledTools, loading, toggleTool, enabledList }
}
