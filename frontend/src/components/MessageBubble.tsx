import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Message } from '../hooks/useChat'

interface Props {
  message: Message
}

// Detect if the text is predominantly RTL (Hebrew, Arabic, etc.)
function isRTL(text: string): boolean {
  const rtlPattern = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g
  const ltrPattern = /[A-Za-z]/g
  const rtlCount = (text.match(rtlPattern) ?? []).length
  const ltrCount = (text.match(ltrPattern) ?? []).length
  return rtlCount > 0 && rtlCount >= ltrCount
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'
  const rtl    = isRTL(message.content)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-3 group`}>
      {/* Avatar — assistant only */}
      {!isUser && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center mt-1">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm-1 4h2v5H9V9z" />
            </svg>
          </div>
          {/* Copy button — shows on hover */}
          <button
            onClick={handleCopy}
            title="Copy message"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-brand-600
                       p-1 rounded-md hover:bg-gray-100"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      )}

      <div className={`max-w-[95%] sm:max-w-[92%] lg:max-w-[88%] ${isUser ? 'order-first' : ''}`}>
        {/* File attachments — shown above the bubble */}
        {isUser && message.files && message.files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {message.files.map((f, i) => (
              <div key={i}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                           bg-brand-500 text-white text-xs max-w-[180px]"
              >
                <span className="text-sm leading-none flex-shrink-0">
                  {f.mimeType.startsWith('image/') ? '🖼️' : f.mimeType === 'application/pdf' ? '📄' : '📝'}
                </span>
                {/* Show image thumbnail if base64 available */}
                {f.mimeType.startsWith('image/') && f.base64 && (
                  <img
                    src={`data:${f.mimeType};base64,${f.base64}`}
                    alt={f.name}
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                )}
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}
        {/* Bubble */}
        <div
          dir={rtl ? 'rtl' : 'ltr'}
          className={`
            rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? 'bg-brand-600 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
            }
            ${message.error ? 'border-red-300 bg-red-50 text-red-700' : ''}
            ${rtl ? 'text-right' : ''}
          `}
        >
          {message.error ? (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{message.error}</span>
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={`prose prose-sm max-w-none ${message.streaming && !message.content ? 'streaming-cursor' : ''}`}>
              {message.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // Open links in new tab
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                    // Style code blocks
                    code: ({ node, className, children, ...props }) => {
                      const isInline = !className
                      return isInline
                        ? <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                        : <code className={className} {...props}>{children}</code>
                    },
                  }}
                >
                  {message.content + (message.streaming ? '▋' : '')}
                </ReactMarkdown>
              ) : (
                <span className="streaming-cursor" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Avatar — user only */}
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center mt-1">
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  )
}
