import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// ── Posts ────────────────────────────────────────────────────────────────────

/** Create a new post */
router.post('/posts', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const { body } = req.body as { body?: string }

    if (!body || !body.trim()) {
      res.status(400).json({ error: { message: 'Post body is required' } })
      return
    }

    const post = await prisma.post.create({
      data: { userId, body: body.trim() },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { likes: true, comments: true } },
      },
    })

    res.json({ data: post })
  } catch (err) {
    console.error('[FEED] Create post error:', err)
    res.status(500).json({ error: { message: 'Failed to create post' } })
  }
})

/** Get feed posts (all users, with pagination) */
router.get('/posts', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20))
    const skip = (page - 1) * limit

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.post.count(),
    ])

    // Mark which posts the current user has liked
    const postsWithLiked = posts.map((p) => ({
      ...p,
      likedByMe: p.likes.some((l) => l.userId === userId),
      likes: undefined, // strip raw likes array
    }))

    res.json({
      data: {
        posts: postsWithLiked,
        total,
        page,
        pageSize: limit,
        hasMore: skip + limit < total,
      },
    })
  } catch (err) {
    console.error('[FEED] Get posts error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch posts' } })
  }
})

/** Get a single post with comments */
router.get('/posts/:postId', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const postId = parseInt(req.params.postId)

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    })

    if (!post) {
      res.status(404).json({ error: { message: 'Post not found' } })
      return
    }

    res.json({
      data: {
        ...post,
        likedByMe: post.likes.some((l) => l.userId === userId),
        likes: undefined,
      },
    })
  } catch (err) {
    console.error('[FEED] Get post error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch post' } })
  }
})

/** Delete a post (owner only) */
router.delete('/posts/:postId', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const postId = parseInt(req.params.postId)

    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      res.status(404).json({ error: { message: 'Post not found' } })
      return
    }
    if (post.userId !== userId) {
      res.status(403).json({ error: { message: 'Not authorized' } })
      return
    }

    await prisma.post.delete({ where: { id: postId } })
    res.json({ data: { deleted: true } })
  } catch (err) {
    console.error('[FEED] Delete post error:', err)
    res.status(500).json({ error: { message: 'Failed to delete post' } })
  }
})

// ── Likes ────────────────────────────────────────────────────────────────────

/** Toggle like on a post */
router.post('/posts/:postId/like', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const postId = parseInt(req.params.postId)

    const existing = await prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    })

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } })
      res.json({ data: { liked: false } })
    } else {
      await prisma.like.create({ data: { postId, userId } })
      res.json({ data: { liked: true } })
    }
  } catch (err) {
    console.error('[FEED] Toggle like error:', err)
    res.status(500).json({ error: { message: 'Failed to toggle like' } })
  }
})

// ── Comments ─────────────────────────────────────────────────────────────────

/** Add a comment to a post */
router.post('/posts/:postId/comments', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const postId = parseInt(req.params.postId)
    const { body } = req.body as { body?: string }

    if (!body || !body.trim()) {
      res.status(400).json({ error: { message: 'Comment body is required' } })
      return
    }

    const post = await prisma.post.findUnique({ where: { id: postId } })
    if (!post) {
      res.status(404).json({ error: { message: 'Post not found' } })
      return
    }

    const comment = await prisma.comment.create({
      data: { postId, userId, body: body.trim() },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    res.json({ data: comment })
  } catch (err) {
    console.error('[FEED] Add comment error:', err)
    res.status(500).json({ error: { message: 'Failed to add comment' } })
  }
})

// ── Follows ──────────────────────────────────────────────────────────────────

/** Follow a user */
router.post('/users/:targetUserId/follow', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const targetUserId = parseInt(req.params.targetUserId)

    if (userId === targetUserId) {
      res.status(400).json({ error: { message: 'Cannot follow yourself' } })
      return
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    })

    if (existing) {
      // Unfollow
      await prisma.follow.delete({ where: { id: existing.id } })
      res.json({ data: { following: false } })
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetUserId } })
      res.json({ data: { following: true } })
    }
  } catch (err) {
    console.error('[FEED] Toggle follow error:', err)
    res.status(500).json({ error: { message: 'Failed to toggle follow' } })
  }
})

/** Get followers of a user */
router.get('/users/:targetUserId/followers', async (req: any, res) => {
  try {
    const targetUserId = parseInt(req.params.targetUserId)

    const followers = await prisma.follow.findMany({
      where: { followingId: targetUserId },
      include: { follower: { select: { id: true, name: true, email: true } } },
    })

    res.json({ data: followers.map((f) => f.follower) })
  } catch (err) {
    console.error('[FEED] Get followers error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch followers' } })
  }
})

/** Get users that a user follows */
router.get('/users/:targetUserId/following', async (req: any, res) => {
  try {
    const targetUserId = parseInt(req.params.targetUserId)

    const following = await prisma.follow.findMany({
      where: { followerId: targetUserId },
      include: { following: { select: { id: true, name: true, email: true } } },
    })

    res.json({ data: following.map((f) => f.following) })
  } catch (err) {
    console.error('[FEED] Get following error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch following' } })
  }
})

/** Search users by name or email */
router.get('/users/search', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const q = (req.query.q as string || '').trim()

    if (!q) {
      res.json({ data: [] })
      return
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
            ],
          },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    })

    res.json({ data: users })
  } catch (err) {
    console.error('[FEED] Search users error:', err)
    res.status(500).json({ error: { message: 'Failed to search users' } })
  }
})

/** Get user profile with follow counts */
router.get('/users/:targetUserId/profile', async (req: any, res) => {
  try {
    const userId = req.userId as number
    const targetUserId = parseInt(req.params.targetUserId)

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        _count: { select: { followers: true, following: true, posts: true } },
      },
    })

    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } })
      return
    }

    const isFollowing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    })

    res.json({ data: { ...user, isFollowing: Boolean(isFollowing) } })
  } catch (err) {
    console.error('[FEED] Get user profile error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch user profile' } })
  }
})

export default router