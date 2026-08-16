import { useState, useRef, type KeyboardEvent } from 'react'
import type { Tool } from '../hooks/useTools'
import type { AttachedFile } from '../lib/harness'

interface Props {
  onSend:       (text: string, enabledTools: string[], files: AttachedFile[]) => void
  onStop:       () => void
  isStreaming:  boolean
  disabled:     boolean
  tools:        Tool[]
  enabledTools: Set<string>
  onToggleTool: (name: string) => void
  loadingTools: boolean
}

// Accepted file types
const ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv', 'text/html',
].join(',')

const MAX_FILE_SIZE_MB = 10

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📄'
  if (mime.startsWith('text/'))   return '📝'
  return '📎'
}

function ToolIcon({ type }: { type: string }) {
  if (type === 'agentcore_gateway') return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
      <path strokeLinecap="round" strokeWidth={1.5} d="M11 7a9 9 0 010 8M7 11h8" />
    </svg>
  )
  if (type === 'remote_mcp') return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" strokeWidth={2} />
    </svg>
  )
}

function toolLabel(tool: Tool): string {
  if (tool.name === 'web-search') return 'Web search'
  if (tool.name === 'aws-docs')   return 'AWS docs'
  return tool.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function ChatInput({
  onSend, onStop, isStreaming, disabled,
  tools, enabledTools, onToggleTool, loadingTools,
}: Props) {
  const [draft,   setDraft]   = useState('')
  const [files,   setFiles]   = useState<AttachedFile[]>([])
  const [fileErr, setFileErr] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSend = (draft.trim().length > 0 || files.length > 0) && !isStreaming && !disabled

  const handleSend = () => {
    if (!canSend) return
    onSend(draft, Array.from(enabledTools), files)
    setDraft('')
    setFiles([])
    setFileErr(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const handleFiles = async (selected: FileList | null) => {
    if (!selected) return
    setFileErr(null)
    const next = [...files]

    for (const file of Array.from(selected)) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setFileErr(`"${file.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit`)
        continue
      }
      if (next.length >= 5) {
        setFileErr('Maximum 5 files per message')
        break
      }
      try {
        const base64 = await fileToBase64(file)
        next.push({ name: file.name, mimeType: file.type || 'text/plain', base64, size: file.size })
      } catch {
        setFileErr(`Failed to read "${file.name}"`)
      }
    }
    setFiles(next)
    // Reset input so same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={e => void handleFiles(e.target.files)}
      />

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {files.map((f, i) => (
            <div key={i}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border
                         border-gray-200 text-xs text-gray-700 shadow-sm max-w-[200px]"
            >
              <span className="text-base leading-none flex-shrink-0">{fileIcon(f.mimeType)}</span>
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-gray-400 flex-shrink-0">
                {(f.size / 1024).toFixed(0)}KB
              </span>
              <button
                onClick={() => removeFile(i)}
                className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                aria-label="Remove file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {fileErr && (
        <p className="text-xs text-red-500 px-1">{fileErr}</p>
      )}

      {/* Main input box */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="flex items-end gap-2 bg-white rounded-2xl border border-gray-200 shadow-sm
                   focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100
                   transition-all px-3 py-3"
      >
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || files.length >= 5}
          title="Attach file (image, PDF, text — max 10MB)"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg
                     text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask anything… or drop a file"
          rows={1}
          disabled={disabled}
          aria-label="Chat message input"
          dir="auto"
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none min-h-[24px] max-h-[200px] leading-6 py-0.5"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            title="Stop generation"
            aria-label="Stop generating response"
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                       bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <rect x="4" y="4" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
            aria-label="Send message"
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-all
              ${canSend
                ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Toolbar — tool toggles */}
      <div className="flex items-center gap-2 px-1 flex-wrap">
        {loadingTools ? (
          <span className="text-xs text-gray-400">Loading tools…</span>
        ) : tools.length === 0 ? null : (
          tools.map(tool => {
            const on = enabledTools.has(tool.name)
            return (
              <button
                key={tool.name}
                onClick={() => onToggleTool(tool.name)}
                title={`${on ? 'Disable' : 'Enable'} ${tool.description}`}
                aria-pressed={on}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                            border transition-all select-none
                  ${on
                    ? 'bg-brand-50 border-brand-300 text-brand-700 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
              >
                <span className={on ? 'text-brand-600' : 'text-gray-400'}>
                  <ToolIcon type={tool.type} />
                </span>
                {toolLabel(tool)}
                {on && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-0.5" />}
              </button>
            )
          })
        )}
        <span className="text-xs text-gray-300 hidden sm:block">
          Enter to send · Shift+Enter for newline · drag &amp; drop files
        </span>
      </div>
    </div>
  )
}
