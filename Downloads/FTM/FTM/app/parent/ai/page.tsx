'use client'

import { useRef, useState } from 'react'
import { api } from '../../../lib/api'

interface Msg { id: string; role: 'user' | 'ai'; text: string }

const CHIPS = [
  'How is my child doing overall?',
  'Any at-risk grades?',
  'What assignments are overdue?',
  'College readiness tips',
  'How to improve GPA?',
]

export default function ParentAIChatPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || sending) return
    setInput('')
    setMessages(p => [...p, { id: Date.now().toString(), role: 'user', text: msg }])
    setSending(true)
    try {
      const { reply } = await api.chat(msg)
      setMessages(p => [...p, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
    } catch {
      setMessages(p => [...p, { id: (Date.now() + 1).toString(), role: 'ai', text: 'Something went wrong. Please try again.' }])
    } finally {
      setSending(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }

  return (
    <div className="fade-up" style={S.shell}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <p style={S.sidebarLabel}>Quick Questions</p>
        {CHIPS.map(chip => (
          <button key={chip} className="ns-chip" onClick={() => void handleSend(chip)}>{chip}</button>
        ))}
        <p style={S.sidebarHint}>For student-specific insights, open their profile and use the AI Chat tab.</p>
      </div>

      {/* Chat */}
      <div style={S.chat}>
        {/* Header */}
        <div style={S.chatHeader}>
          <div style={S.aiLogo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
            </svg>
          </div>
          <div>
            <div style={S.aiName}>NextStep AI</div>
            <div style={S.aiSub}>Parent advisor</div>
          </div>
        </div>

        {/* Messages */}
        <div style={S.messages}>
          {messages.length === 0 && (
            <div style={S.empty}>
              <div style={S.emptyLogo}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                </svg>
              </div>
              <p style={S.emptyTitle}>How can I help you today?</p>
              <p style={S.emptySub}>Ask about grades, college planning, or academic support strategies.</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} style={m.role === 'user' ? S.bubbleUser : S.bubbleAi}>
              {m.text}
            </div>
          ))}
          {sending && (
            <div style={{ ...S.bubbleAi, color: 'var(--text-muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={S.dot} /><span style={S.dot} /><span style={S.dot} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={S.inputBar}>
          <input
            className="ns-input"
            style={{ flex: 1, height: 46, fontSize: 14 }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
            placeholder="Ask about your child's academics…"
            disabled={sending}
          />
          <button className="ns-btn-primary"
            style={{ height: 46, padding: '0 22px', flexShrink: 0, opacity: sending ? 0.5 : 1 }}
            onClick={() => void handleSend()} disabled={sending}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  shell:      { display: 'flex', gap: 24, height: 'calc(100vh - 64px)' },
  sidebar:    { width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 },
  sidebarLabel:{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 4 },
  sidebarHint: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 },

  chat:       { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  chatHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' },
  aiLogo:     { width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#00A3CC,#4DC8E0)', color: '#060D10', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  aiName:     { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  aiSub:      { fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 },

  messages:   { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, marginBottom: 16 },
  empty:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' as const, padding: '20px 40px' },
  emptyLogo:  { width: 60, height: 60, borderRadius: 18, background: 'rgba(0,163,204,0.1)', border: '1px solid rgba(0,163,204,0.2)', color: '#00A3CC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: 700, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },

  bubbleUser: { maxWidth: '72%', padding: '11px 16px', borderRadius: '16px 16px 4px 16px', fontSize: 14, lineHeight: 1.55, background: 'var(--primary)', color: '#060D10', alignSelf: 'flex-end', fontWeight: 500 },
  bubbleAi:   { maxWidth: '72%', padding: '11px 16px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.55, background: 'var(--surface-2)', border: '1px solid var(--border)', alignSelf: 'flex-start', color: 'var(--text)', whiteSpace: 'pre-wrap' as const },
  dot:        { width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' },

  inputBar:   { display: 'flex', gap: 10 },
}
