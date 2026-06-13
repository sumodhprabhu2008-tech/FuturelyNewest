'use client'

import { useRef, useState } from 'react'
import { api } from '../../../lib/api'

interface ChatMessage { id: string; role: 'user' | 'ai'; text: string }

const CHIPS = ['How is my child doing overall?', 'Any at-risk grades?', 'What assignments are overdue?', 'College readiness tips', 'How to improve GPA?']

export default function ParentAIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return
    setInput('')
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }])
    setSending(true)
    try {
      const { reply } = await api.chat(text)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setSending(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  return (
    <div style={styles.shell}>
      <div style={styles.sidebar}>
        <h2 style={styles.sidebarTitle}>Quick Questions</h2>
        {CHIPS.map(chip => (
          <button key={chip} style={styles.chip} onClick={() => void handleSend(chip)}>{chip}</button>
        ))}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
          For student-specific questions, open their profile and use the AI Chat tab there.
        </p>
      </div>
      <div style={styles.chatArea}>
        <h1 style={styles.heading}>NextStep AI</h1>
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.emptyChat}>
              <div style={styles.logo}>N</div>
              <p style={{ color: 'var(--text-secondary)' }}>Ask general academic questions or open a student profile for personalized insights.</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} style={{ ...styles.bubble, ...(m.role === 'user' ? styles.bubbleUser : styles.bubbleAi) }}>{m.text}</div>
          ))}
          {sending && <div style={{ ...styles.bubble, ...styles.bubbleAi, color: 'var(--text-muted)' }}>Thinking...</div>}
          <div ref={bottomRef} />
        </div>
        <div style={styles.inputBar}>
          <input style={styles.input} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSend() }}
            placeholder="Ask NextStep AI..." disabled={sending} />
          <button style={{ ...styles.sendBtn, opacity: sending ? 0.6 : 1 }} onClick={() => void handleSend()} disabled={sending}>Send</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell:      { display: 'flex', gap: 24, height: 'calc(100vh - 64px)' },
  sidebar:    { width: 220, flexShrink: 0 },
  sidebarTitle:{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 },
  chip:       { display: 'block', width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--text)', marginBottom: 8, textAlign: 'left' as const, cursor: 'pointer' },
  chatArea:   { flex: 1, display: 'flex', flexDirection: 'column' },
  heading:    { fontSize: 24, fontWeight: 700, marginBottom: 16 },
  messages:   { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  emptyChat:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-secondary)', textAlign: 'center' as const, maxWidth: 400, margin: 'auto' },
  logo:       { width: 56, height: 56, borderRadius: 16, background: 'var(--primary)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 },
  bubble:     { maxWidth: '70%', padding: '12px 16px', borderRadius: 16, fontSize: 14, lineHeight: 1.5 },
  bubbleUser: { background: 'var(--primary)', color: 'var(--bg)', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAi:   { background: 'var(--surface)', border: '1px solid var(--border)', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  inputBar:   { display: 'flex', gap: 12 },
  input:      { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', color: 'var(--text)', outline: 'none', fontSize: 15 },
  sendBtn:    { background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
}
