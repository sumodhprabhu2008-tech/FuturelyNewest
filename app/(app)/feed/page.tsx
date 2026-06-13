'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api, FeedPost, FeedComment, FeedUserProfile, AppNotification } from '@/lib/api'

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function displayName(user: { name: string | null; email: string }): string {
  return user.name || user.email.split('@')[0]
}

function initials(user: { name: string | null; email: string }): string {
  const n = user.name || user.email
  return n.slice(0, 2).toUpperCase()
}

function notifLabel(n: AppNotification): string {
  const name = n.sender.name ?? n.sender.email.split('@')[0]
  if (n.type === 'FOLLOW')  return `${name} started following you`
  if (n.type === 'LIKE')    return `${name} liked your post`
  if (n.type === 'COMMENT') return n.preview ? `${name}: "${n.preview}"` : `${name} commented on your post`
  return ''
}

function notifTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── User Profile Overlay ──────────────────────────────────────────────────────

function UserProfileOverlay({ userId, onClose, currentUserId }: { userId: number; onClose: () => void; currentUserId: number }) {
  const [profile, setProfile] = useState<FeedUserProfile | null>(null)
  const [userPosts, setUserPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.feedUserProfile(userId).then((data) => {
      if (!cancelled) { setProfile(data); setFollowing(data.isFollowing); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    api.feedUserPosts(userId).then((data) => {
      if (!cancelled) { setUserPosts(data.posts); setPostsLoading(false) }
    }).catch(() => { if (!cancelled) setPostsLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  async function handleFollow() {
    try {
      const result = await api.feedToggleFollow(userId)
      setFollowing(result.following)
      setProfile((prev) => prev ? { ...prev, isFollowing: result.following, _count: { ...prev._count, followers: result.following ? prev._count.followers + 1 : prev._count.followers - 1 } } : prev)
    } catch { /* ignore */ }
  }

  async function handleLike(postId: number) {
    try {
      const result = await api.feedToggleLike(postId)
      setUserPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likedByMe: result.liked, _count: { ...p._count, likes: result.liked ? p._count.likes + 1 : p._count.likes - 1 } } : p))
    } catch { /* ignore */ }
  }

  return (
    <div style={O.overlay} onClick={onClose}>
      <div style={O.panel} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Loading profile…</div>
        ) : !profile ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>User not found</div>
        ) : (
          <>
            <div style={O.header}>
              <div style={O.avatar}>{initials(profile)}</div>
              <div style={{ flex: 1 }}>
                <div style={O.name}>{displayName(profile)}</div>
                {profile.tag && (
                  <span className={profile.tag === 'DEV' ? 'tag-rainbow' : ''} style={profile.tag === 'DEV' ? O.tagDev : { ...O.tag, color: profile.tagColor || 'var(--primary)', background: profile.tagColor ? `${profile.tagColor}22` : 'rgba(0,200,150,0.1)' }}>
                    [{profile.tag}]
                  </span>
                )}
                <div style={O.email}>{profile.email}</div>
              </div>
              <button style={O.closeBtn} onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={O.stats}>
              {[{ v: profile._count.followers, l: 'Followers' }, { v: profile._count.following, l: 'Following' }, { v: profile._count.posts, l: 'Posts' }, { v: profile.totalLikes, l: 'Likes' }].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' as const }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>{s.l}</div>
                </div>
              ))}
            </div>

            {userId !== currentUserId && (
              <button className={following ? 'ns-btn-ghost' : 'ns-btn-primary'} style={{ width: '100%', height: 40, marginBottom: 20, fontSize: 14 }} onClick={handleFollow}>
                {following ? 'Following' : 'Follow'}
              </button>
            )}

            {/* Admin tag panel */}
            <AdminTagPanel profile={profile} userId={userId} currentUserId={currentUserId} onUpdate={updated => setProfile(prev => prev ? { ...prev, tag: updated.tag, tagColor: updated.tagColor } : prev)} />

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p style={O.postsTitle}>Posts</p>
              {postsLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading posts…</div>
              ) : userPosts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No posts yet.</div>
              ) : userPosts.map(post => (
                <div key={post.id} style={O.postCard}>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' as const }}>{post.body}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{timeAgo(post.createdAt)}</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: post.likedByMe ? '#EF4444' : 'var(--text-secondary)', padding: 0 }} onClick={() => void handleLike(post.id)}>
                      {post.likedByMe ? '♥' : '♡'} {post._count.likes}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AdminTagPanel({ profile, userId, currentUserId, onUpdate }: { profile: FeedUserProfile; userId: number; currentUserId: number; onUpdate: (u: { tag: string | null; tagColor: string | null }) => void }) {
  const [localTag, setLocalTag] = useState(profile.tag || '')
  const [localColor, setLocalColor] = useState(profile.tagColor || '')
  const [saving, setSaving] = useState(false)
  const [myRole, setMyRole] = useState<string | null>(null)

  useEffect(() => {
    api.feedUserProfile(currentUserId).then((p) => setMyRole(p.role)).catch(() => {})
  }, [currentUserId])

  if (myRole !== 'ADMIN') return null

  async function handleSet() {
    if (!localTag.trim() || saving) return
    setSaving(true)
    try {
      const updated = await api.feedAwardTag(userId, localTag.trim(), localColor.trim() || undefined)
      onUpdate(updated)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  async function handleReset() {
    if (saving) return
    setSaving(true)
    try {
      const updated = await api.feedResetTag(userId)
      onUpdate(updated)
      setLocalTag(updated.tag || '')
      setLocalColor('')
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'rgba(255,200,50,0.06)', border: '1px solid rgba(255,200,50,0.2)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#ffc832', marginBottom: 8 }}>Admin — Manage Tag</p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <input className="ns-input" style={{ flex: 1, minWidth: 80, height: 34, fontSize: 12 }} placeholder="Tag (DEV, VIP…)" value={localTag} onChange={e => setLocalTag(e.target.value)} />
        <input className="ns-input" style={{ width: 80, height: 34, fontSize: 12 }} placeholder="Color" value={localColor} onChange={e => setLocalColor(e.target.value)} />
        <button style={{ background: '#ffc832', color: '#000', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }} onClick={handleSet} disabled={saving}>{saving ? '…' : 'Set'}</button>
        <button className="ns-btn-ghost" style={{ height: 34, padding: '0 10px', fontSize: 12 }} onClick={handleReset} disabled={saving}>Reset</button>
      </div>
    </div>
  )
}

// ── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, onLike, onDelete, onOpenComments, onOpenProfile, onFollow, currentUserId, followedUsers }: { post: FeedPost; onLike: (id: number) => void; onDelete: (id: number) => void; onOpenComments: (id: number) => void; onOpenProfile: (userId: number) => void; onFollow: (userId: number) => void; currentUserId: number; followedUsers: Set<number> }) {
  const tagColor = (post.user as { tagColor?: string }).tagColor || 'grey'
  const isDevTag = post.user.tag === 'DEV'
  const isFollowing = followedUsers.has(post.userId)
  return (
    <div className="ns-card" style={{ padding: 16, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={P.avatar}>{initials(post.user)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
            <span style={P.authorName} onClick={() => onOpenProfile(post.user.id)}>{displayName(post.user)}</span>
            {post.userId !== currentUserId && (
              <button
                style={{ ...P.followBtn, ...(isFollowing ? { background: 'var(--primary)', color: '#060D10', border: '1px solid var(--primary)' } : {}) }}
                onClick={e => { e.stopPropagation(); onFollow(post.userId) }}
              >{isFollowing ? 'Following' : 'Follow'}</button>
            )}
            {post.user.tag && (
              <span className={isDevTag ? 'tag-rainbow' : ''} style={isDevTag ? P.tagDev : { ...P.tag, color: tagColor, border: `1px solid ${tagColor}`, background: tagColor === 'grey' ? 'rgba(128,128,128,0.1)' : `${tagColor}22` }}>
                [{post.user.tag}]
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{timeAgo(post.createdAt)}</div>
        </div>
        {post.userId === currentUserId && (
          <button style={P.deleteBtn} onClick={() => onDelete(post.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--text)', marginBottom: 14, whiteSpace: 'pre-wrap' as const }}>{post.body}</div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button style={{ ...P.actionBtn, color: post.likedByMe ? '#EF4444' : 'var(--text-secondary)' }} onClick={() => onLike(post.id)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={post.likedByMe ? '#EF4444' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          {post._count.likes}
        </button>
        <button style={P.actionBtn} onClick={() => onOpenComments(post.id)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          {post._count.comments}
        </button>
      </div>
    </div>
  )
}

// ── Comment Section ───────────────────────────────────────────────────────────

function CommentSection({ postId, onClose, onCommentAdded }: { postId: number; onClose: () => void; onCommentAdded: () => void }) {
  const [comments, setComments] = useState<FeedComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.feedPostDetail(postId).then(data => {
      if (!cancelled) { setComments((data as FeedPost & { comments: FeedComment[] }).comments || []); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [postId])

  async function handleAdd() {
    if (!newComment.trim()) return
    try {
      const comment = await api.feedAddComment(postId, newComment.trim())
      setComments(prev => [...prev, comment])
      setNewComment('')
      onCommentAdded()
    } catch { /* ignore */ }
  }

  return (
    <div style={O.overlay} onClick={onClose}>
      <div style={{ ...O.panel, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Comments</h3>
          <button style={O.closeBtn} onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : comments.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No comments yet. Be the first!</div>
          ) : comments.map(c => (
            <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName(c.user)}</span>
                {c.user.tag && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>[{c.user.tag}]</span>}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(c.createdAt)}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>{c.body}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="ns-input" style={{ flex: 1, height: 42 }} placeholder="Write a comment…" value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleAdd()} />
          <button className="ns-btn-primary" style={{ height: 42, padding: '0 18px' }} onClick={handleAdd}>Send</button>
        </div>
      </div>
    </div>
  )
}

// ── User Search ───────────────────────────────────────────────────────────────

function UserSearch({ currentUserId, onOpenProfile, followedUsers, onFollow }: { currentUserId: number; onOpenProfile: (userId: number) => void; followedUsers: Set<number>; onFollow: (userId: number) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: number; name: string | null; email: string; tag: string | null; tagColor: string | null }>>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(() => {
      setSearching(true)
      api.feedSearchUsers(query.trim()).then((data) => { setResults(data); setSearching(false) }).catch(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input className="ns-input" style={{ paddingLeft: 40, height: 44 }} placeholder="Search users to follow…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {searching && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Searching…</div>}
      {results.map(u => (
        <div key={u.id} className="ns-card" style={{ padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...P.avatar, width: 36, height: 36, fontSize: 12, cursor: 'pointer' }} onClick={() => onOpenProfile(u.id)}>
            {initials(u)}
          </div>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onOpenProfile(u.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{displayName(u)}</span>
              {u.tag && (
                <span
                  className={u.tag === 'DEV' ? 'tag-rainbow' : ''}
                  style={u.tag === 'DEV' ? P.tagDev : { ...P.tag, color: u.tagColor || 'grey', border: `1px solid ${u.tagColor || 'grey'}`, background: u.tagColor ? `${u.tagColor}22` : 'rgba(128,128,128,0.1)' }}
                >[{u.tag}]</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
          </div>
          <button style={{ ...P.followBtn, padding: '6px 14px', fontSize: 12.5, background: followedUsers.has(u.id) ? 'var(--primary)' : 'transparent', color: followedUsers.has(u.id) ? '#060D10' : 'var(--primary)' }} onClick={() => onFollow(u.id)}>
            {followedUsers.has(u.id) ? 'Following' : 'Follow'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface Toast { id: string; notif: AppNotification }

export default function StudyFeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [newPostBody, setNewPostBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [commentPostId, setCommentPostId] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState<number>(0)
  const [tab, setTab] = useState<'feed' | 'search'>('feed')
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [followedUsers, setFollowedUsers] = useState<Set<number>>(new Set())

  // Notifications
  const [notifs, setNotifs]       = useState<AppNotification[]>([])
  const [unread, setUnread]       = useState(0)
  const [showPanel, setShowPanel] = useState(false)
  const [toasts, setToasts]       = useState<Toast[]>([])
  const panelRef                  = useRef<HTMLDivElement>(null)
  const bellRef                   = useRef<HTMLButtonElement>(null)

  const loadPosts = useCallback(async (p: number) => {
    try {
      const data = await api.feedPosts(p, 20)
      if (p === 1) setPosts(data.posts)
      else setPosts((prev) => [...prev, ...data.posts])
      setHasMore(data.hasMore)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    try {
      const token = localStorage.getItem('ns_token')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setCurrentUserId(payload.sub || 0)
      }
    } catch { /* ignore */ }
    loadPosts(1)
  }, [loadPosts])

  // Fetch existing notifications
  useEffect(() => {
    api.getNotifications().then(d => {
      setNotifs(d.notifications)
      setUnread(d.unreadCount)
    }).catch(() => null)
  }, [])

  // WebSocket for real-time notifications
  const pushToast = useCallback((notif: AppNotification) => {
    const id = `${Date.now()}-${notif.id}`
    setToasts(prev => [...prev, { id, notif }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('ns_token')
    if (!token) return
    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'
    let ws: WebSocket
    let dead = false
    function connect() {
      if (dead) return
      ws = new WebSocket(wsBase)
      ws.onopen = () => ws.send(JSON.stringify({ type: 'AUTH', token }))
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { event: string; data: AppNotification }
          if (msg.event === 'NOTIFICATION') {
            setNotifs(prev => [msg.data, ...prev])
            setUnread(c => c + 1)
            pushToast(msg.data)
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => { if (!dead) setTimeout(connect, 3000) }
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [pushToast])

  // Close panel on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) setShowPanel(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  async function handleOpenBell() {
    setShowPanel(v => !v)
    if (!showPanel && unread > 0) {
      setUnread(0)
      setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      await api.markAllNotificationsRead().catch(() => null)
    }
  }

  async function handleCreatePost() {
    if (!newPostBody.trim() || posting) return
    setPosting(true)
    try {
      const post = await api.feedCreatePost(newPostBody.trim())
      setPosts(prev => [{ ...post, likedByMe: false }, ...prev])
      setNewPostBody('')
    } catch { /* ignore */ }
    finally { setPosting(false) }
  }

  async function handleLike(postId: number) {
    try {
      const result = await api.feedToggleLike(postId)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likedByMe: result.liked, _count: { ...p._count, likes: result.liked ? p._count.likes + 1 : p._count.likes - 1 } } : p))
    } catch { /* ignore */ }
  }

  async function handleDelete(postId: number) {
    try {
      await api.feedDeletePost(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch { /* ignore */ }
  }

  async function handleFollow(userId: number) {
    try {
      const result = await api.feedToggleFollow(userId)
      setFollowedUsers(prev => { const n = new Set(prev); result.following ? n.add(userId) : n.delete(userId); return n })
    } catch { /* ignore */ }
  }

  return (
    <div className="fade-up" style={{ padding: '0 var(--page-px) 32px' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: 16, position: 'relative' }}>
        {([['feed', 'Feed'], ['search', 'Find People']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: 'none', border: 'none', padding: '14px 16px', fontSize: 14, fontWeight: tab === key ? 600 : 500, color: tab === key ? 'var(--primary)' : 'var(--text-secondary)', borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />

        {/* Bell button */}
        <div style={{ position: 'relative' }}>
          <button
            ref={bellRef}
            onClick={handleOpenBell}
            title="Notifications"
            style={{ background: 'none', border: 'none', padding: '10px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: 8, color: 'var(--text-secondary)', position: 'relative' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unread > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 6, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {showPanel && (
            <div ref={panelRef} style={N.panel}>
              <div style={N.header}>
                <span style={N.title}>Notifications</span>
                {notifs.some(n => !n.read) && (
                  <button style={N.markAll} onClick={async () => {
                    setUnread(0)
                    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
                    await api.markAllNotificationsRead().catch(() => null)
                  }}>Mark all read</button>
                )}
              </div>
              <div style={N.list}>
                {notifs.length === 0 ? (
                  <div style={N.empty}>No notifications yet</div>
                ) : notifs.map(n => (
                  <div key={n.id} style={{ ...N.item, background: n.read ? 'transparent' : 'rgba(75,110,255,0.07)' }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>
                      {n.type === 'FOLLOW' ? '👤' : n.type === 'LIKE' ? '❤️' : '💬'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={N.text}>{notifLabel(n)}</div>
                      <div style={N.time}>{notifTimeAgo(n.createdAt)}</div>
                    </div>
                    {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, alignSelf: 'center' as const }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => currentUserId ? setProfileUserId(currentUserId) : null}
          style={{ background: 'none', border: 'none', padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 8 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          My Profile
        </button>
      </div>

      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column-reverse', gap: 10, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={N.toast}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>
              {t.notif.type === 'FOLLOW' ? '👤' : t.notif.type === 'LIKE' ? '❤️' : '💬'}
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.35, fontWeight: 500 }}>
              {notifLabel(t.notif)}
            </div>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: 0, pointerEvents: 'auto' }}
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>

      {tab === 'feed' ? (
        <>
          {/* New post composer */}
          <div className="ns-card" style={{ padding: 16, marginBottom: 20 }}>
            <textarea className="ns-input" style={{ width: '100%', resize: 'vertical' as const, height: 'auto', minHeight: 80, fontSize: 14, lineHeight: 1.6, padding: 14 }}
              placeholder="What are you studying today?"
              value={newPostBody}
              onChange={e => setNewPostBody(e.target.value)}
              rows={3}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{newPostBody.length}/500</span>
              <button className="ns-btn-primary" style={{ height: 38, padding: '0 20px', opacity: newPostBody.trim() && !posting ? 1 : 0.5 }}
                onClick={handleCreatePost} disabled={!newPostBody.trim() || posting}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>

          {/* Posts */}
          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Loading feed…</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No posts yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Be the first to share what you&apos;re studying!</p>
            </div>
          ) : (
            <>
              {posts.map(post => (
                <PostCard key={post.id} post={post} onLike={handleLike} onDelete={handleDelete}
                  onOpenComments={id => setCommentPostId(id)} onOpenProfile={id => setProfileUserId(id)}
                  onFollow={handleFollow} currentUserId={currentUserId} followedUsers={followedUsers} />
              ))}
              {hasMore && (
                <button className="ns-btn-ghost" style={{ width: '100%', height: 42, marginTop: 8 }}
                  onClick={() => { setPage(p => p + 1); loadPosts(page + 1) }}>
                  Load more
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <UserSearch currentUserId={currentUserId} onOpenProfile={id => setProfileUserId(id)}
          followedUsers={followedUsers} onFollow={handleFollow} />
      )}

      {commentPostId !== null && (
        <CommentSection postId={commentPostId} onClose={() => setCommentPostId(null)}
          onCommentAdded={() => setPosts(prev => prev.map(p => p.id === commentPostId ? { ...p, _count: { ...p._count, comments: p._count.comments + 1 } } : p))} />
      )}

      {profileUserId !== null && (
        <UserProfileOverlay userId={profileUserId} onClose={() => setProfileUserId(null)} currentUserId={currentUserId} />
      )}
    </div>
  )
}

// ── Style objects ──────────────────────────────────────────────────────────────

const P: Record<string, React.CSSProperties> = {
  avatar:     { width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#00C896,#00A3CC)', color: '#060D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 },
  authorName: { fontSize: 14, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 },
  tag:        { fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4 },
  tagDev:     { fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, border: '1px solid #ff6b6b', color: '#ff6b6b', background: 'rgba(255,107,107,0.12)' },
  followBtn:  { padding: '2px 9px', borderRadius: 5, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  deleteBtn:  { marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' },
  actionBtn:  { background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, fontWeight: 600 },
}

const N: Record<string, React.CSSProperties> = {
  panel:   { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', zIndex: 300, overflow: 'hidden' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' },
  title:   { fontSize: 13.5, fontWeight: 700, color: 'var(--text)' },
  markAll: { fontSize: 11.5, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 },
  list:    { maxHeight: 360, overflowY: 'auto' },
  empty:   { padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 },
  item:    { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' },
  text:    { fontSize: 13, color: 'var(--text)', lineHeight: 1.4 },
  time:    { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  toast:   { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--primary)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', minWidth: 260, maxWidth: 340, pointerEvents: 'auto', animation: 'fadeUp 0.25s ease' },
}

const O: Record<string, React.CSSProperties> = {
  overlay:    { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel:      { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '90%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' as const },
  header:     { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' },
  avatar:     { width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,#00C896,#00A3CC)', color: '#060D10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, flexShrink: 0 },
  name:       { fontSize: 19, fontWeight: 800, color: 'var(--text)', marginBottom: 3 },
  tag:        { fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'rgba(0,200,150,0.1)', padding: '2px 8px', borderRadius: 4, display: 'inline-block' },
  tagDev:     { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, border: '1px solid #ff6b6b', color: '#ff6b6b', background: 'rgba(255,107,107,0.12)', display: 'inline-block' },
  email:      { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  closeBtn:   { marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0 },
  stats:      { display: 'flex', justifyContent: 'space-around', padding: '14px 0', borderBottom: '1px solid var(--border)', marginBottom: 16 },
  postsTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 },
  postCard:   { padding: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 },
}
