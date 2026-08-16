/**
 * AgentCore Harness streaming client.
 *
 * Routes:
 *  - Messages with images/PDFs → /api/converse (server-side Bedrock ConverseStream, SigV4)
 *  - All other messages        → Harness InvokeHarness (JWT Bearer, agent loop + tools)
 *
 * Response format: application/vnd.amazon.eventstream (AWS binary event stream)
 */

import { config } from './config'
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

function hasRichFiles(files?: AttachedFile[]): boolean {
  return (files ?? []).some(f =>
    f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf'
  )
}

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

// Bedrock document name rules: alphanumeric, whitespace, hyphens, parentheses,
// square brackets only. No dots, underscores, or consecutive spaces. Max 200 chars.
function sanitizeDocName(filename: string): string {
  // Strip extension
  const noExt = filename.replace(/\.[^.]+$/, '')
  // Replace invalid chars with space
  const cleaned = noExt.replace(/[^a-zA-Z0-9\s\-()\[\]]/g, ' ')
  // Collapse consecutive spaces, trim
  const collapsed = cleaned.replace(/\s{2,}/g, ' ').trim()
  // Fallback if empty
  return (collapsed || 'document').slice(0, 200)
}

/** Build Bedrock Converse-compatible content blocks — bytes as base64 strings for JSON transport. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function converseBlocks(text: string, files?: AttachedFile[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = []
  for (const f of files ?? []) {
    if (f.mimeType.startsWith('image/')) {
      // Send base64 string — server converts to Buffer
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

/** Build Harness-compatible content blocks (text only). */
function harnessBlocks(text: string, files?: AttachedFile[]): { text: string }[] {
  const parts: string[] = []
  for (const f of files ?? []) {
    const isText = f.mimeType.startsWith('text/') ||
      ['md','csv','json','html','txt'].some(e => f.name.endsWith(`.${e}`))
    if (isText && f.base64) {
      try { parts.push(`[File: ${f.name}]\n\`\`\`\n${atob(f.base64)}\n\`\`\``) }
      catch { parts.push(`[File: ${f.name}]`) }
    } else {
      parts.push(`[Attached: ${f.name} (${f.mimeType})]`)
    }
  }
  const combined = parts.length > 0 && text
    ? `${parts.join('\n\n')}\n\n${text}`
    : parts.join('\n\n') || text
  return [{ text: combined || '' }]
}

// ── Converse path (server-side proxy, rich files) ─────────────

function invokeConverse(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  controller: AbortController,
): AbortController {
  void (async () => {
    let accumulated = ''
    try {
      const accessToken = await getValidAccessToken()

      // Serialize messages with proper content blocks
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

// ── Harness path (JWT, agent loop) ───────────────────────────

export function invokeHarness(
  messages: ChatMessage[],
  sessionId: string,
  callbacks: StreamCallbacks,
  enabledTools: string[] = [],
): AbortController {
  const controller = new AbortController()

  // Route to Converse if the latest user message has images or PDFs
  const lastMsg = messages[messages.length - 1]
  if (lastMsg?.role === 'user' && hasRichFiles(lastMsg.files)) {
    return invokeConverse(messages, callbacks, controller)
  }

  void (async () => {
    let accumulated = ''
    try {
      const accessToken = await getValidAccessToken()
      const region      = config.aws.region
      const harnessArn  = config.agentcore.harnessArn
      const endpoint    = `https://bedrock-agentcore.${region}.amazonaws.com/harnesses/invoke?harnessArn=${encodeURIComponent(harnessArn)}&qualifier=DEFAULT`

      const bodyObj: Record<string, unknown> = {
        messages: messages.map(m => ({
          role:    m.role,
          content: harnessBlocks(m.content, m.files),
        })),
      }

      if (enabledTools.length === 0) {
        bodyObj.tools        = []
        bodyObj.allowedTools = []
      } else {
        bodyObj.allowedTools = enabledTools
      }

      const response = await fetch(endpoint, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept':        'application/json',
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body:   JSON.stringify(bodyObj),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`InvokeHarness ${response.status}: ${errText}`)
      }
      if (!response.body) throw new Error('Response body is null')

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); totalBytes += value.length

        const buf = mergeChunks(chunks, totalBytes)
        let offset = 0

        while (offset + 16 <= buf.length) {
          const view       = new DataView(buf.buffer, buf.byteOffset + offset)
          const totalLen   = view.getUint32(0)
          const headersLen = view.getUint32(4)
          if (offset + totalLen > buf.length) break

          const payloadLen   = totalLen - headersLen - 16
          const headersStart = offset + 12
          const payloadStart = headersStart + headersLen
          const headers      = parseHeaders(buf, headersStart, headersLen)

          if (payloadLen > 0) {
            const payloadStr = new TextDecoder().decode(buf.slice(payloadStart, payloadStart + payloadLen))
            if (headers[':exception-type']) {
              let msg = payloadStr
              try { msg = (JSON.parse(payloadStr) as { message?: string }).message ?? payloadStr } catch { /* raw */ }
              throw new Error(msg)
            }
            if (headers[':event-type'] === 'contentBlockDelta') {
              try {
                const ev = JSON.parse(payloadStr) as { delta?: { text?: string } }
                if (ev.delta?.text) { accumulated += ev.delta.text; callbacks.onToken(ev.delta.text) }
              } catch { /* ignore */ }
            }
          }
          offset += totalLen
        }

        if (offset > 0) {
          const remaining = buf.slice(offset)
          chunks.length = 0; totalBytes = remaining.length
          if (remaining.length > 0) chunks.push(remaining)
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

// ── Binary event stream helpers ───────────────────────────────

function mergeChunks(chunks: Uint8Array[], totalLen: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]
  const merged = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length }
  return merged
}

function parseHeaders(buf: Uint8Array, start: number, len: number): Record<string, string> {
  const result: Record<string, string> = {}
  let offset = start
  const end = start + len
  while (offset < end) {
    const nameLen = buf[offset]; offset++
    const name = new TextDecoder().decode(buf.slice(offset, offset + nameLen)); offset += nameLen
    offset++ // value type byte
    const valLen = (buf[offset] << 8) | buf[offset + 1]; offset += 2
    const value = new TextDecoder().decode(buf.slice(offset, offset + valLen)); offset += valLen
    result[name] = value
  }
  return result
}
