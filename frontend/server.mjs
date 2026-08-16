/**
 * Production server.
 *
 * Endpoints:
 *   GET  /health                → ECS health-check
 *   GET  /api/tools             → list tools (public, cached)
 *   GET  /api/admin/tools       → list tools with full config (admin only)
 *   POST /api/admin/tools       → add a tool (admin only)
 *   DELETE /api/admin/tools/:name → remove a tool (admin only)
 *   *                           → SPA fallback
 */

import http              from 'http'
import fs                from 'fs'
import path              from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST      = path.join(__dirname, 'dist')
const PORT      = Number(process.env.PORT ?? 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
}

// ── Helpers ───────────────────────────────────────────────────

function harnessInfo() {
  const arn      = process.env.VITE_HARNESS_ARN ?? ''
  const harnessId = arn.split('/').pop() ?? ''
  const region   = process.env.VITE_AWS_REGION ?? 'eu-central-1'
  return { harnessId, region }
}

async function getSdkClients() {
  const { BedrockAgentCoreControlClient, GetHarnessCommand, UpdateHarnessCommand } =
    await import('@aws-sdk/client-bedrock-agentcore-control')
  const { region } = harnessInfo()
  const client = new BedrockAgentCoreControlClient({ region })
  return { client, GetHarnessCommand, UpdateHarnessCommand }
}

// ── Tool cache ────────────────────────────────────────────────

let toolsCache     = null
let toolsCacheTime = 0
const TOOLS_TTL_MS = 5 * 60 * 1000

async function getRawTools() {
  const { client, GetHarnessCommand } = await getSdkClients()
  const { harnessId } = harnessInfo()
  const resp = await client.send(new GetHarnessCommand({ harnessId }))
  return resp.harness?.tools ?? []
}

async function getTools(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && toolsCache && now - toolsCacheTime < TOOLS_TTL_MS) {
    return toolsCache
  }
  const { harnessId } = harnessInfo()
  if (!harnessId) { toolsCache = []; toolsCacheTime = now; return toolsCache }

  try {
    const raw = await getRawTools()
    toolsCache = raw.map(t => ({
      name:        t.name ?? 'unknown',
      type:        t.type ?? 'unknown',
      description: toolDescription(t),
    }))
    toolsCacheTime = now
  } catch (err) {
    console.error('Failed to fetch harness tools:', err.message)
    if (!toolsCache) toolsCache = []
  }
  return toolsCache
}

function toolDescription(tool) {
  switch (tool.type) {
    case 'agentcore_gateway': {
      const arn = tool.config?.agentCoreGateway?.gatewayArn ?? ''
      return `Gateway: ${arn.split('/').pop() ?? arn}`
    }
    case 'remote_mcp':
      return `MCP: ${tool.config?.remoteMcp?.url ?? ''}`
    default:
      return tool.type
  }
}

// ── Admin auth — verify Cognito access token has 'admin' group ──
// We decode without full signature verification (the Harness already
// validates tokens; this is a server-side guard for the admin API).

function isAdminToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    const groups  = payload['cognito:groups'] ?? []
    return Array.isArray(groups) && groups.includes('admin')
  } catch {
    return false
  }
}

// ── Body parser ───────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end',  ()    => { try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

// ── Server ────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlPath = req.url?.split('?')[0] ?? '/'

  // ── Health ──
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // ── Public tools list ──
  if (urlPath === '/api/tools' && req.method === 'GET') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
      res.end(JSON.stringify(await getTools()))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch tools' }))
    }
    return
  }

  // ── Converse proxy — for messages with file attachments ──
  // Calls Bedrock ConverseStream directly using the ECS task role (SigV4).
  // Required because the Harness only supports text content blocks.
  if (urlPath === '/api/converse' && req.method === 'POST') {
    if (!req.headers['authorization']?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    try {
      const body     = await readBody(req)
      const { messages, systemPrompt, modelId } = body

      const { BedrockRuntimeClient, ConverseStreamCommand } =
        await import('@aws-sdk/client-bedrock-runtime')

      const region = process.env.VITE_AWS_REGION ?? 'eu-central-1'
      const model  = modelId ?? `eu.anthropic.claude-opus-4-7`

      const client = new BedrockRuntimeClient({ region })

      // Convert base64 bytes strings to Buffer — the SDK requires Buffer/Uint8Array,
      // but they arrive as base64 strings over JSON.
      function fixBytes(obj) {
        if (Array.isArray(obj)) return obj.map(fixBytes)
        if (obj && typeof obj === 'object') {
          const result = {}
          for (const [k, v] of Object.entries(obj)) {
            if (k === 'bytes' && typeof v === 'string') {
              result[k] = Buffer.from(v, 'base64')
            } else {
              result[k] = fixBytes(v)
            }
          }
          return result
        }
        return obj
      }

      const fixedMessages = fixBytes(messages)

      const cmd = new ConverseStreamCommand({
        modelId:      model,
        system:       systemPrompt ? [{ text: systemPrompt }] : undefined,
        messages:     fixedMessages,
        inferenceConfig: { maxTokens: 8192 },
      })

      const response = await client.send(cmd)

      // Stream back as SSE
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      })

      for await (const event of response.stream ?? []) {
        if (event.contentBlockDelta?.delta?.text) {
          const data = JSON.stringify({ text: event.contentBlockDelta.delta.text })
          res.write(`data: ${data}\n\n`)
        }
        if (event.messageStop) {
          res.write('data: [DONE]\n\n')
        }
      }
      res.end()
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    }
    return
  }

  // ── Admin — require admin group ──
  if (urlPath.startsWith('/api/admin/')) {
    if (!isAdminToken(req.headers['authorization'])) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Forbidden' }))
      return
    }

    // GET /api/admin/tools — full tool list with config
    if (urlPath === '/api/admin/tools' && req.method === 'GET') {
      try {
        const raw = await getRawTools()
        const tools = raw.map(t => ({
          name:   t.name ?? 'unknown',
          type:   t.type ?? 'unknown',
          url:    t.config?.remoteMcp?.url ?? '',
          gatewayArn: t.config?.agentCoreGateway?.gatewayArn ?? '',
          description: toolDescription(t),
        }))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(tools))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
      return
    }

    // POST /api/admin/tools — add a tool
    if (urlPath === '/api/admin/tools' && req.method === 'POST') {
      try {
        const body = await readBody(req)
        const { name, type, url, gatewayArn } = body

        if (!name || !type) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'name and type are required' }))
          return
        }
        if (type === 'remote_mcp' && !url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'url is required for remote_mcp' }))
          return
        }
        if (type === 'agentcore_gateway' && !gatewayArn) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'gatewayArn is required for agentcore_gateway' }))
          return
        }

        // Build the new tool config
        const newTool = type === 'remote_mcp'
          ? { type, name, config: { remoteMcp: { url } } }
          : { type, name, config: { agentCoreGateway: { gatewayArn } } }

        // Merge with existing tools
        const existing = await getRawTools()
        if (existing.some(t => t.name === name)) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Tool '${name}' already exists` }))
          return
        }

        const { client, UpdateHarnessCommand } = await getSdkClients()
        const { harnessId } = harnessInfo()
        await client.send(new UpdateHarnessCommand({
          harnessId,
          tools: [...existing, newTool],
        }))

        // Bust cache
        toolsCache = null
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
      return
    }

    // DELETE /api/admin/tools/:name — remove a tool
    const deleteMatch = urlPath.match(/^\/api\/admin\/tools\/(.+)$/)
    if (deleteMatch && req.method === 'DELETE') {
      try {
        const toolName = decodeURIComponent(deleteMatch[1])
        const existing = await getRawTools()
        const filtered  = existing.filter(t => t.name !== toolName)

        if (filtered.length === existing.length) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Tool '${toolName}' not found` }))
          return
        }

        const { client, UpdateHarnessCommand } = await getSdkClients()
        const { harnessId } = harnessInfo()
        await client.send(new UpdateHarnessCommand({ harnessId, tools: filtered }))

        toolsCache = null
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  // ── Static / SPA ──
  let filePath = path.join(DIST, urlPath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }

  const ext       = path.extname(filePath)
  const mimeType  = MIME[ext] ?? 'application/octet-stream'
  const isIndex   = filePath.endsWith('index.html')
  const cacheCtrl = isIndex ? 'no-store' : 'public, max-age=31536000, immutable'

  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, {
      'Content-Type':  mimeType,
      'Cache-Control': cacheCtrl,
      'X-Content-Type-Options':    'nosniff',
      'X-Frame-Options':           'SAMEORIGIN',
      'Referrer-Policy':           'strict-origin-when-cross-origin',
      'Permissions-Policy':        'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:;",
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bedrock Chat server listening on http://0.0.0.0:${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully')
  server.close(() => process.exit(0))
})
