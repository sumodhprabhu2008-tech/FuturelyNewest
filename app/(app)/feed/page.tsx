'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, FeedPost, FeedComment, FeedUserProfile } from '@/lib/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
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

// ── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onLike,
  onDelete,
  onOpenComments,
  currentUserId,
}: {
  post: FeedPost
  onLike: (id: number) => void
  onDelete: (id: number) => void
  onOpenComments: (id: number) => void
  currentUserId: number
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.avatar}>{initials(post.user)}</div>
        <div>
          <div style={styles.authorName}>{displayName(post.user)}</div>
          <div style={styles.time}>{timeAgo(post.createdAt)}</div>
        </div>
        {post.userId === currentUserId && (
          <button
            style={styles.deleteBtn}
            onClick={() => onDelete(post.id)}
            title="Delete post"
          >
            ✕
          </button>
        )}
      </div>
      <div style={styles.cardBody}>{post.body}</div>
      <div style={styles.cardActions}>
        <button
          style={{
            ...styles.actionBtn,
            color: post.likedByMe ? 'var(--error)' : 'var(--text-secondary)',
          }}
          onClick={() => onLike(post.id)}
        >
          {post.likedByMe ? '❤️' : '🤍'} {post._count.likes}
        </button>
        <button
          style={styles.actionBtn}
          onClick={() => onOpenComments(post.id)}
        >
          💬 {post._count.comments}
        </button>
      </div>
    </div>
  )
}

// ── Comment Section ──────────────────────────────────────────────────────────

function CommentSection({
  postId,
  onClose,
  onCommentAdded,
}: {
  postId: number
  onClose: () => void
  onCommentAdded: () => void
}) {
  const [comments, setComments] = useState<FeedComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('ns_token')
    fetch(`${typeof window !== 'undefined' ? 'http://localhost:3001' : ''}/api/feed/posts/${postId}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          setComments(res.data?.comments || [])
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [postId])

  async function handleAddComment() {
    if (!newComment.trim()) return
    const token = localStorage.getItem('ns_token')
    try {
      const res = await fetch(`http://localhost:3001/api/feed/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body: newComment.trim() }),
      })
      const json = await res.json()
      if (json.data) {
        setComments((prev) => [...prev, json.data])
        setNewComment('')
        onCommentAdded()
      }
    } catch (err) {
      console.error('Failed to add comment:', err)
    }
  }

  return (
    <div style={styles.commentOverlay} onClick={onClose}>
      <div style={styles.commentPanel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.commentHeader}>
          <h3 style={{ margin: 0 }}>Comments</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.commentList}>
          {loading ? (
            <div style={styles.emptyText}>Loading...</div>
          ) : comments.length === 0 ? (
            <div style={styles.emptyText}>No comments yet. Be the first!</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={styles.commentItem}>
                <div style={styles.commentAuthor}>{displayName(c.user)}</div>
                <div style={styles.commentBody}>{c.body}</div>
                <div style={styles.commentTime}>{timeAgo(c.createdAt)}</div>
              </div>
            ))
          )}
        </div>
        <div style={styles.commentInputRow}>
          <input
            style={styles.commentInput}
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
          />
          <button style={styles.commentSendBtn} onClick={handleAddComment}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ── User Search ──────────────────────────────────────────────────────────────

function UserSearch({ onFollow, onOpenProfile }: {
  onFollow: (userId: number) => void
  onOpenProfile: (userId: number) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: number; name: string | null; email: string }>>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(() => {
      setSearching(true)
      api.feedSearchUsers(query.trim()).then((data) => {
        setResults(data)
        setSearching(false)
      }).catch(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div style={styles.searchSection}>
      <input
        style={styles.searchInput}
        placeholder="Search users to follow..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && <div style={styles.emptyText}>Searching...</div>}
      {results.map((u) => (
        <div key={u.id} style={styles.searchResult}>
          <div style={styles.avatarSmall}>{initials(u)}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.authorName}>{displayName(u)}</div>
            <div style={styles.time}>{u.email}</div>
          </div>
          <button style={styles.followBtn} onClick={() => onFollow(u.id)}>
            Follow
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

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

  const loadPosts = useCallback(async (p: number) => {
    try {
      const token = localStorage.getItem('ns_token')
      const res = await fetch(`http://localhost:3001/api/feed/posts?page=${p}&limit=20`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const json = await res.json()
      const data = json.data
      if (p === 1) {
        setPosts(data.posts)
      } else {
        setPosts((prev) => [...prev, ...data.posts])
      }
      setHasMore(data.hasMore)
    } catch (err) {
      console.error('Failed to load posts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Get current user ID from token
    try {
      const token = localStorage.getItem('ns_token')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setCurrentUserId(payload.sub || 0)
      }
    } catch { /* ignore */ }
    loadPosts(1)
  }, [loadPosts])

  async function handleCreatePost() {
    if (!newPostBody.trim() || posting) return
    setPosting(true)
    const token = localStorage.getItem('ns_token')
    try {
      const res = await fetch('http://localhost:3001/api/feed/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body: newPostBody.trim() }),
      })
      const json = await res.json()
      if (json.data) {
        setPosts((prev) => [json.data, ...prev])
        setNewPostBody('')
      }
    } catch (err) {
      console.error('Failed to create post:', err)
    } finally {
      setPosting(false)
    }
  }

  async function handleLike(postId: number) {
    const token = localStorage.getItem('ns_token')
    try {
      const res = await fetch(`http://localhost:3001/api/feed/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const json = await res.json()
      const result = json.data
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByMe: result.liked,
                _count: {
                  ...p._count,
                  likes: result.liked ? p._count.likes + 1 : p._count.likes - 1,
                },
              }
            : p
        )
      )
    } catch (err) {
      console.error('Failed to toggle like:', err)
    }
  }

  async function handleDelete(postId: number) {
    try {
      await api.feedDeletePost(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      console.error('Failed to delete post:', err)
    }
  }

  async function handleFollow(userId: number) {
    try {
      await api.feedToggleFollow(userId)
    } catch (err) {
      console.error('Failed to toggle follow:', err)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Study Feed</h1>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'feed' ? styles.tabActive : {}) }}
            onClick={() => setTab('feed')}
          >
            📝 Feed
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'search' ? styles.tabActive : {}) }}
            onClick={() => setTab('search')}
          >
            🔍 Find People
          </button>
        </div>
      </div>

      {tab === 'feed' ? (
        <>
          {/* New Post */}
          <div style={styles.newPostCard}>
            <textarea
              style={styles.newPostInput}
              placeholder="What are you studying today?"
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              rows={3}
            />
            <div style={styles.newPostActions}>
              <span style={styles.charCount}>{newPostBody.length}/500</span>
              <button
                style={{
                  ...styles.postBtn,
                  opacity: newPostBody.trim() && !posting ? 1 : 0.5,
                }}
                onClick={handleCreatePost}
                disabled={!newPostBody.trim() || posting}
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          {/* Posts */}
          {loading ? (
            <div style={styles.emptyText}>Loading feed...</div>
          ) : posts.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📝</div>
              <div style={styles.emptyTitle}>No posts yet</div>
              <div style={styles.emptyText}>Be the first to share what you're studying!</div>
            </div>
          ) : (
            <>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={handleLike}
                  onDelete={handleDelete}
                  onOpenComments={(id) => setCommentPostId(id)}
                  currentUserId={currentUserId}
                />
              ))}
              {hasMore && (
                <button
                  style={styles.loadMoreBtn}
                  onClick={() => {
                    setPage((p) => p + 1)
                    loadPosts(page + 1)
                  }}
                >
                  Load more
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <UserSearch onFollow={handleFollow} onOpenProfile={() => {}} />
      )}

      {/* Comment overlay */}
      {commentPostId !== null && (
        <CommentSection
          postId={commentPostId}
          onClose={() => setCommentPostId(null)}
          onCommentAdded={() => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === commentPostId
                  ? { ...p, _count: { ...p._count, comments: p._count.comments + 1 } }
                  : p
              )
            )
          }}
        />
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '680px', margin: '0 auto' },
  header: { marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: '700', marginBottom: '16px' },
  tabs: { display: 'flex', gap: '8px' },
  tab: {
    padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-secondary)', fontSize: '14px',
    fontWeight: '500', cursor: 'pointer',
  },
  tabActive: {
    background: 'rgba(0,200,150,0.12)', color: 'var(--primary)',
    borderColor: 'var(--primary)',
  },

  // New post
  newPostCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '16px', marginBottom: '20px',
  },
  newPostInput: {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '12px', color: 'var(--text)',
    resize: 'vertical' as const, minHeight: '80px', fontSize: '14px',
  },
  newPostActions: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: '10px',
  },
  charCount: { fontSize: '12px', color: 'var(--text-muted)' },
  postBtn: {
    padding: '8px 20px', borderRadius: '8px', border: 'none',
    background: 'var(--primary)', color: '#000', fontWeight: '600',
    fontSize: '14px', cursor: 'pointer',
  },

  // Post card
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '16px', marginBottom: '12px',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px',
  },
  avatar: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--primary)', color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '14px', flexShrink: 0,
  },
  avatarSmall: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'var(--primary)', color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '12px', flexShrink: 0,
  },
  authorName: { fontSize: '14px', fontWeight: '600', color: 'var(--text)' },
  time: { fontSize: '12px', color: 'var(--text-muted)' },
  deleteBtn: {
    marginLeft: 'auto', background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer',
    padding: '4px 8px',
  },
  cardBody: {
    fontSize: '15px', lineHeight: '1.6', color: 'var(--text)',
    marginBottom: '12px', whiteSpace: 'pre-wrap' as const,
  },
  cardActions: { display: 'flex', gap: '16px' },
  actionBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    fontSize: '14px', cursor: 'pointer', padding: '4px 8px',
    display: 'flex', alignItems: 'center', gap: '4px',
  },

  // Comments overlay
  commentOverlay: {
    position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  commentPanel: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', width: '90%', maxWidth: '500px',
    maxHeight: '80vh', display: 'flex', flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  commentHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px', borderBottom: '1px solid var(--border)',
  },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    fontSize: '18px', cursor: 'pointer',
  },
  commentList: { flex: 1, overflowY: 'auto' as const, padding: '12px 16px' },
  commentItem: {
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  },
  commentAuthor: { fontSize: '13px', fontWeight: '600', color: 'var(--text)' },
  commentBody: { fontSize: '14px', color: 'var(--text)', marginTop: '4px' },
  commentTime: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' },
  commentInputRow: {
    display: 'flex', gap: '8px', padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  commentInput: {
    flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '8px 12px', color: 'var(--text)',
    fontSize: '14px',
  },
  commentSendBtn: {
    padding: '8px 16px', borderRadius: '8px', border: 'none',
    background: 'var(--primary)', color: '#000', fontWeight: '600',
    fontSize: '14px', cursor: 'pointer',
  },

  // Search
  searchSection: { marginTop: '8px' },
  searchInput: {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '12px 16px', color: 'var(--text)',
    fontSize: '14px', marginBottom: '12px',
  },
  searchResult: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '8px',
  },
  followBtn: {
    padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--primary)',
    background: 'transparent', color: 'var(--primary)', fontWeight: '600',
    fontSize: '13px', cursor: 'pointer',
  },

  // Empty state
  emptyState: {
    textAlign: 'center' as const, padding: '60px 20px',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '12px' },
  emptyTitle: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' },
  emptyText: { fontSize: '14px', color: 'var(--text-secondary)' },
  loadMoreBtn: {
    width: '100%', padding: '12px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer',
    marginTop: '8px',
  },
}