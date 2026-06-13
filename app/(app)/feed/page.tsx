'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, FeedPost, FeedComment, FeedUserProfile, FeedUser } from '@/lib/api'

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

// ── User Profile Overlay ─────────────────────────────────────────────────────

function UserProfileOverlay({
  userId,
  onClose,
  currentUserId,
}: {
  userId: number
  onClose: () => void
  currentUserId: number
}) {
  const [profile, setProfile] = useState<FeedUserProfile | null>(null)
  const [userPosts, setUserPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.feedUserProfile(userId).then((data) => {
      if (!cancelled) {
        setProfile(data)
        setFollowing(data.isFollowing)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })

    setPostsLoading(true)
    api.feedUserPosts(userId).then((data) => {
      if (!cancelled) {
        setUserPosts(data.posts)
        setPostsLoading(false)
      }
    }).catch(() => { if (!cancelled) setPostsLoading(false) })

    return () => { cancelled = true }
  }, [userId])

  async function handleFollow() {
    try {
      const result = await api.feedToggleFollow(userId)
      setFollowing(result.following)
      setProfile((prev) => prev ? {
        ...prev,
        isFollowing: result.following,
        _count: {
          ...prev._count,
          followers: result.following ? prev._count.followers + 1 : prev._count.followers - 1,
        },
      } : prev)
    } catch (err) {
      console.error('Failed to toggle follow:', err)
    }
  }

  async function handleLike(postId: number) {
    try {
      const result = await api.feedToggleLike(postId)
      setUserPosts((prev) =>
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
      setProfile((prev) => prev ? {
        ...prev,
        totalLikes: result.liked ? prev.totalLikes + 1 : prev.totalLikes - 1,
      } : prev)
    } catch (err) {
      console.error('Failed to toggle like:', err)
    }
  }

  if (loading) {
    return (
      <div style={styles.profileOverlay} onClick={onClose}>
        <div style={styles.profilePanel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.emptyText}>Loading profile...</div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={styles.profileOverlay} onClick={onClose}>
        <div style={styles.profilePanel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.emptyText}>User not found</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.profileOverlay} onClick={onClose}>
      <div style={styles.profilePanel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.profileHeader}>
          <div style={styles.profileAvatar}>{initials(profile)}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.profileName}>{displayName(profile)}</div>
            {profile.tag && (
              <div style={styles.profileTag}>[{profile.tag}]</div>
            )}
            <div style={styles.profileEmail}>{profile.email}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Stats */}
        <div style={styles.profileStats}>
          <div style={styles.profileStat}>
            <div style={styles.profileStatNum}>{profile._count.followers}</div>
            <div style={styles.profileStatLabel}>Followers</div>
          </div>
          <div style={styles.profileStat}>
            <div style={styles.profileStatNum}>{profile._count.following}</div>
            <div style={styles.profileStatLabel}>Following</div>
          </div>
          <div style={styles.profileStat}>
            <div style={styles.profileStatNum}>{profile._count.posts}</div>
            <div style={styles.profileStatLabel}>Posts</div>
          </div>
          <div style={styles.profileStat}>
            <div style={styles.profileStatNum}>{profile.totalLikes}</div>
            <div style={styles.profileStatLabel}>Likes</div>
          </div>
        </div>

        {/* Follow button */}
        {userId !== currentUserId && (
          <button
            style={{
              ...styles.profileFollowBtn,
              background: following ? 'transparent' : 'var(--primary)',
              color: following ? 'var(--primary)' : '#000',
              borderColor: 'var(--primary)',
            }}
            onClick={handleFollow}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}

        {/* User's posts */}
        <div style={styles.profilePostsSection}>
          <h3 style={styles.profilePostsTitle}>Posts</h3>
          {postsLoading ? (
            <div style={styles.emptyText}>Loading posts...</div>
          ) : userPosts.length === 0 ? (
            <div style={styles.emptyText}>No posts yet.</div>
          ) : (
            userPosts.map((post) => (
              <div key={post.id} style={styles.profilePostCard}>
                <div style={styles.profilePostBody}>{post.body}</div>
                <div style={styles.profilePostMeta}>
                  <span style={styles.profilePostTime}>{timeAgo(post.createdAt)}</span>
                  <span style={styles.profilePostLikes}>
                    {post.likedByMe ? '❤️' : '🤍'} {post._count.likes}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onLike,
  onDelete,
  onOpenComments,
  onOpenProfile,
  currentUserId,
}: {
  post: FeedPost
  onLike: (id: number) => void
  onDelete: (id: number) => void
  onOpenComments: (id: number) => void
  onOpenProfile: (userId: number) => void
  currentUserId: number
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.avatar}>{initials(post.user)}</div>
        <div>
          <div style={styles.authorNameRow}>
            <span
              style={styles.authorNameClickable}
              onClick={() => onOpenProfile(post.user.id)}
            >
              {displayName(post.user)}
            </span>
            {post.user.tag && (
              <span style={styles.postTag}>[{post.user.tag}]</span>
            )}
          </div>
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
                <div style={styles.commentAuthor}>
                  {displayName(c.user)}
                  {c.user.tag && <span style={styles.commentTag}> [{c.user.tag}]</span>}
                </div>
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

function UserSearch({
  currentUserId,
  onOpenProfile,
  followedUsers,
  onFollow,
}: {
  currentUserId: number
  onOpenProfile: (userId: number) => void
  followedUsers: Set<number>
  onFollow: (userId: number) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: number; name: string | null; email: string; tag: string | null }>>([])
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
          <div
            style={{ ...styles.avatarSmall, cursor: 'pointer' }}
            onClick={() => onOpenProfile(u.id)}
          >
            {initials(u)}
          </div>
          <div
            style={{ flex: 1, cursor: 'pointer' }}
            onClick={() => onOpenProfile(u.id)}
          >
            <div style={styles.authorNameRow}>
              <span style={styles.authorName}>{displayName(u)}</span>
              {u.tag && <span style={styles.postTag}>[{u.tag}]</span>}
            </div>
            <div style={styles.time}>{u.email}</div>
          </div>
          <button
            style={{
              ...styles.followBtn,
              background: followedUsers.has(u.id) ? 'var(--primary)' : 'transparent',
              color: followedUsers.has(u.id) ? '#000' : 'var(--primary)',
            }}
            onClick={() => onFollow(u.id)}
          >
            {followedUsers.has(u.id) ? 'Following' : 'Follow'}
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
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [followedUsers, setFollowedUsers] = useState<Set<number>>(new Set())
  const [tagInput, setTagInput] = useState('')
  const [myTag, setMyTag] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState(false)

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
        const userId = payload.sub || 0
        setCurrentUserId(userId)
        // Load current user's profile to get their tag
        api.feedUserProfile(userId).then((data) => {
          setMyTag(data.tag)
          setTagInput(data.tag || '')
        }).catch(() => {})
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
      const result = await api.feedToggleFollow(userId)
      setFollowedUsers((prev) => {
        const next = new Set(prev)
        if (result.following) {
          next.add(userId)
        } else {
          next.delete(userId)
        }
        return next
      })
    } catch (err) {
      console.error('Failed to toggle follow:', err)
    }
  }

  async function handleSaveTag() {
    if (!tagInput.trim()) return
    try {
      const updated = await api.feedUpdateTag(tagInput.trim())
      setMyTag(updated.tag)
      setEditingTag(false)
      // Update posts to reflect new tag
      setPosts((prev) =>
        prev.map((p) =>
          p.userId === currentUserId
            ? { ...p, user: { ...p.user, tag: updated.tag } }
            : p
        )
      )
    } catch (err) {
      console.error('Failed to update tag:', err)
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
          {/* Tag management */}
          <div style={styles.tagBar}>
            {editingTag ? (
              <div style={styles.tagEditRow}>
                <input
                  style={styles.tagInput}
                  placeholder="Your tag (e.g. Senior)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  maxLength={20}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
                />
                <button style={styles.tagSaveBtn} onClick={handleSaveTag}>Save</button>
                <button
                  style={styles.tagCancelBtn}
                  onClick={() => { setEditingTag(false); setTagInput(myTag || '') }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={styles.tagDisplayRow}>
                <span style={styles.tagLabel}>
                  Your tag: {myTag ? <span style={styles.tagBadge}>[{myTag}]</span> : <span style={styles.tagNone}>None set</span>}
                </span>
                <button style={styles.tagEditBtn} onClick={() => setEditingTag(true)}>
                  {myTag ? 'Edit' : 'Set Tag'}
                </button>
              </div>
            )}
          </div>

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
                  onOpenProfile={(id) => setProfileUserId(id)}
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
        <UserSearch
          currentUserId={currentUserId}
          onOpenProfile={(id) => setProfileUserId(id)}
          followedUsers={followedUsers}
          onFollow={handleFollow}
        />
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

      {/* Profile overlay */}
      {profileUserId !== null && (
        <UserProfileOverlay
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          currentUserId={currentUserId}
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

  // Tag management
  tagBar: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
    fontSize: '13px',
  },
  tagDisplayRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  tagLabel: { color: 'var(--text-secondary)' },
  tagBadge: { color: 'var(--primary)', fontWeight: '600' },
  tagNone: { color: 'var(--text-muted)', fontStyle: 'italic' },
  tagEditBtn: {
    padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px',
    cursor: 'pointer',
  },
  tagEditRow: {
    display: 'flex', gap: '8px', alignItems: 'center',
  },
  tagInput: {
    flex: 1, padding: '6px 10px', borderRadius: '6px',
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: '13px',
  },
  tagSaveBtn: {
    padding: '6px 12px', borderRadius: '6px', border: 'none',
    background: 'var(--primary)', color: '#000', fontWeight: '600',
    fontSize: '12px', cursor: 'pointer',
  },
  tagCancelBtn: {
    padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-secondary)',
    fontSize: '12px', cursor: 'pointer',
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
  authorNameRow: {
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  authorNameClickable: {
    fontSize: '14px', fontWeight: '600', color: 'var(--text)',
    cursor: 'pointer', textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  authorName: { fontSize: '14px', fontWeight: '600', color: 'var(--text)' },
  postTag: {
    fontSize: '12px', fontWeight: '600', color: 'var(--primary)',
    background: 'rgba(0,200,150,0.1)', padding: '1px 6px',
    borderRadius: '4px',
  },
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
  commentTag: { fontSize: '11px', color: 'var(--primary)', fontWeight: '600' },
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

  // Profile overlay
  profileOverlay: {
    position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  profilePanel: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', width: '90%', maxWidth: '480px',
    maxHeight: '85vh', overflow: 'auto' as const, padding: '24px',
  },
  profileHeader: {
    display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px',
  },
  profileAvatar: {
    width: '56px', height: '56px', borderRadius: '50%',
    background: 'var(--primary)', color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '700', fontSize: '20px', flexShrink: 0,
  },
  profileName: {
    fontSize: '20px', fontWeight: '700', color: 'var(--text)',
  },
  profileTag: {
    fontSize: '13px', fontWeight: '600', color: 'var(--primary)',
    background: 'rgba(0,200,150,0.1)', padding: '2px 8px',
    borderRadius: '4px', display: 'inline-block', marginTop: '2px',
  },
  profileEmail: {
    fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px',
  },
  profileStats: {
    display: 'flex', justifyContent: 'space-around', marginBottom: '16px',
    padding: '12px 0', borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
  },
  profileStat: { textAlign: 'center' as const },
  profileStatNum: {
    fontSize: '20px', fontWeight: '700', color: 'var(--text)',
  },
  profileStatLabel: {
    fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px',
  },
  profileFollowBtn: {
    width: '100%', padding: '10px', borderRadius: '8px',
    border: '1px solid var(--primary)', fontWeight: '600',
    fontSize: '14px', cursor: 'pointer', marginBottom: '20px',
  },
  profilePostsSection: {
    borderTop: '1px solid var(--border)', paddingTop: '16px',
  },
  profilePostsTitle: {
    fontSize: '16px', fontWeight: '600', color: 'var(--text)',
    marginBottom: '12px',
  },
  profilePostCard: {
    padding: '12px', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px',
  },
  profilePostBody: {
    fontSize: '14px', color: 'var(--text)', lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
  },
  profilePostMeta: {
    display: 'flex', justifyContent: 'space-between', marginTop: '8px',
    fontSize: '12px',
  },
  profilePostTime: { color: 'var(--text-muted)' },
  profilePostLikes: { color: 'var(--text-secondary)' },

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