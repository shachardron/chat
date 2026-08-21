/**
 * Chat client — routes all messages through /api/converse (Bedrock ConverseStream, IAM/SigV4).
 */

import { getValidAccessToken } from './auth'

// ── Types ─────────────────────────────────────────────────────

export interface AttachedFile {
  name:     string
  mimeType: string
  base64:   string
  size:     number
}

export interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
  files?:  AttachedFile[]
}

export interface StreamCallbacks {
  onToken:  (text: string) => void
  onDone:   (fullText: string) => void
  onError:  (err: Error) => void
}

// ── Helpers ───────────────────────────────────────────────────

function imageFormat(mime: string): string {
  return { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png',
           'image/gif':  'gif',  'image/webp': 'webp' }[mime] ?? 'jpeg'
}

function documentFormat(mime: string, name: string): string {
  if (mime === 'application/pdf')   return 'pdf'
  if (mime === 'text/html')         return 'html'
  if (name.endsWith('.md'))         return 'md'
  if (name.endsWith('.csv'))        return 'csv'
  if (mime.startsWith('text/'))     return 'txt'
  return 'txt'
}

function sanitizeDocName(filename: string): string {
  const noExt = filename.replace(/\.[^.]+$/, '')
  const cleaned = noExt.replace(/[^a-zA-Z0-9\s\-()\[\]]/g, ' ')
  const collapsed = cleaned.replace(/\s{2,}/g, ' ').trim()
  return (collapsed || 'document').slice(0, 200)
}

/** Build Bedrock Converse-compatible content blocks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function converseBlocks(text: string, files?: AttachedFile[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = []
  for (const f of files ?? []) {
    if (f.mimeType.startsWith('image/')) {
      blocks.push({ image: { format: imageFormat(f.mimeType), source: { bytes: f.base64 } } })
    } else {
      blocks.push({ document: {
        format: documentFormat(f.mimeType, f.name),
        name:   sanitizeDocName(f.name),
        source: { bytes: f.base64 },
      }})
    }
  }
  if (text) blocks.push({ text })
  return blocks.length > 0 ? blocks : [{ text: '' }]
}

// ── Main entry point ──────────────────────────────────────────

export function invokeHarness(
  messages: ChatMessage[],
  _sessionId: string,
  callbacks: StreamCallbacks,
  _enabledTools: string[] = [],
): AbortController {
  const controller = new AbortController()

  void (async () => {
    let accumulated = ''
    try {
      const accessToken = await getValidAccessToken()

      const serialized = messages.map(m => ({
        role:    m.role,
        content: converseBlocks(m.content, m.files),
      }))

      const resp = await fetch('/api/converse', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body:   JSON.stringify({ messages: serialized }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const t = await resp.text()
        throw new Error(`Converse ${resp.status}: ${t}`)
      }
      if (!resp.body) throw new Error('No response body')

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const ev = JSON.parse(data) as { text?: string }
            if (ev.text) { accumulated += ev.text; callbacks.onToken(ev.text) }
          } catch { /* ignore */ }
        }
      }

      callbacks.onDone(accumulated)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      callbacks.onError(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return controller
}
