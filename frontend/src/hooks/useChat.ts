/**
 * useChat — manages the conversation state and streams responses
 * from the AgentCore Harness.
 */

import { useState, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { invokeHarness, type ChatMessage, type AttachedFile } from '../lib/harness'

export interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  streaming: boolean
  error?:    string
  files?:    AttachedFile[]   // files attached to this user message
}

export interface UseChatReturn {
  messages:    Message[]
  isStreaming:  boolean
  sessionId:   string
  sendMessage: (text: string, enabledTools?: string[], files?: AttachedFile[]) => void
  stopStream:  () => void
  clearChat:   () => void
  newSession:  () => void
  loadSession: (sessionId: string, messages: Message[]) => void
}

function newSessionId(): string {
  return uuidv4() + '-' + uuidv4().slice(0, 4)
}

export function useChat(): UseChatReturn {
  const [messages, setMessages]      = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId]    = useState(newSessionId)
  const abortRef                      = useRef<AbortController | null>(null)

  const appendToken = useCallback((assistantId: string, token: string) => {
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, content: m.content + token } : m
    ))
  }, [])

  const finaliseMessage = useCallback((assistantId: string, fullText: string) => {
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, content: fullText, streaming: false } : m
    ))
    setIsStreaming(false)
  }, [])

  const markError = useCallback((assistantId: string, err: Error) => {
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, streaming: false, error: err.message } : m
    ))
    setIsStreaming(false)
  }, [])

  const sendMessage = useCallback(
    (text: string, enabledTools: string[] = [], files: AttachedFile[] = []) => {
      if (isStreaming || (!text.trim() && files.length === 0)) return

      const userMsg: Message = {
        id:        uuidv4(),
        role:      'user',
        content:   text.trim(),
        streaming: false,
        files:     files.length > 0 ? files : undefined,
      }
      const assistantId = uuidv4()
      const assistantPlaceholder: Message = {
        id:        assistantId,
        role:      'assistant',
        content:   '',
        streaming: true,
      }

      setMessages(prev => [...prev, userMsg, assistantPlaceholder])
      setIsStreaming(true)

      const history: ChatMessage[] = [...messages, userMsg]
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role, content: m.content, files: m.files }))

      abortRef.current = invokeHarness(history, sessionId, {
        onToken:  token => appendToken(assistantId, token),
        onDone:   full  => finaliseMessage(assistantId, full),
        onError:  err   => markError(assistantId, err),
      }, enabledTools)
    },
    [isStreaming, messages, sessionId, appendToken, finaliseMessage, markError],
  )

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m))
  }, [])

  const clearChat = useCallback(() => { stopStream(); setMessages([]) }, [stopStream])

  const newSession = useCallback(() => {
    stopStream(); setMessages([]); setSessionId(newSessionId())
  }, [stopStream])

  const loadSession = useCallback((sid: string, msgs: Message[]) => {
    stopStream()
    // Strip base64 data from files when restoring history (keep metadata only)
    setMessages(msgs.map(m => ({
      ...m, streaming: false,
      files: m.files?.map(f => ({ ...f, base64: '' })),
    })))
    setSessionId(sid)
  }, [stopStream])

  return { messages, isStreaming, sessionId, sendMessage, stopStream, clearChat, newSession, loadSession }
}
