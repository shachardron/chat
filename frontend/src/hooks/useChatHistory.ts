/**
 * useChatHistory — persists and manages chat sessions in localStorage.
 *
 * Each session stores:
 *   - sessionId  (the AgentCore session ID)
 *   - title      (first user message, truncated)
 *   - messages   (full message array)
 *   - updatedAt  (timestamp for sorting)
 */

import { useState, useCallback, useEffect } from 'react'
import type { Message } from './useChat'

const STORAGE_KEY = 'bc_chat_history'
const MAX_SESSIONS = 50

export interface ChatSession {
  sessionId: string
  title:     string
  messages:  Message[]
  updatedAt: number
}

function load(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatSession[]) : []
  } catch {
    return []
  }
}

function save(sessions: ChatSession[]): void {
  try {
    // Keep only the most recent MAX_SESSIONS
    const trimmed = sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore storage quota errors
  }
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>(load)

  // Persist to localStorage whenever sessions change
  useEffect(() => {
    save(sessions)
  }, [sessions])

  const saveSession = useCallback((sessionId: string, messages: Message[]) => {
    if (messages.length === 0) return
    const firstUser = messages.find(m => m.role === 'user')
    if (!firstUser) return

    const title = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '')

    setSessions(prev => {
      const existing = prev.findIndex(s => s.sessionId === sessionId)
      const updated: ChatSession = { sessionId, title, messages, updatedAt: Date.now() }
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = updated
        return next
      }
      return [updated, ...prev]
    })
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
  }, [])

  const clearAll = useCallback(() => {
    setSessions([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { sessions, saveSession, deleteSession, clearAll }
}
