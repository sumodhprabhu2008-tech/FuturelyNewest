import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { broadcast, sendToUser } from '../index';

const router = Router();

/* ---------- Get Feed Posts ---------- */
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, tag: true, tagColor: true } },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.post.count(),
    ]);

    const userId = (req as any).userId as number;
    const postsWithLiked = posts.map(p => ({
      ...p,
      likedByMe: p.likes.some(l => l.userId === userId),
    }));

    res.json({
      data: {
        posts: postsWithLiked,
        total,
        page,
        pageSize: limit,
        hasMore: skip + limit < total,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

/* ---------- Create New Post ---------- */
router.post('/posts', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return res.status(400).json({ error: 'Body is required' });

    const post = await prisma.post.create({
      data: { body: body.trim(), userId },
      include: {
        user: { select: { id: true, name: true, email: true, tag: true, tagColor: true } },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    // Broadcast new post
    broadcast('NEW_POST', post);
    res.json({ data: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

/* ---------- Get Single Post ---------- */
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true, tag: true } } },
        },
        user: { select: { id: true, name: true, email: true, tag: true, tagColor: true } },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ data: post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/* ---------- Add Comment ---------- */
router.post('/posts/:id/comments', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const comment = await prisma.comment.create({
      data: { body: body.trim(), postId: id, userId },
      include: { user: { select: { id: true, name: true, email: true, tag: true } } },
    });

    broadcast('NEW_COMMENT', { postId: id, comment });

    // Notify post owner if someone else commented
    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (post && post.userId !== userId) {
      const notif = await prisma.notification.create({
        data: { userId: post.userId, fromUserId: userId, type: 'COMMENT', postId: id, preview: body.trim().slice(0, 80) },
        include: { sender: { select: { id: true, name: true, email: true, tag: true, tagColor: true } } },
      });
      sendToUser(post.userId, 'NOTIFICATION', notif);
    }

    res.json({ data: comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

/* ---------- Toggle Like ---------- */
router.post('/posts/:id/like', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).userId as number;

    // Use findFirst since we don't have a composite unique ID in the schema for Like
    const existingLike = await prisma.like.findFirst({
      where: { userId, postId: id },
    });

    let liked = false;
    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.like.create({ data: { userId, postId: id } });
      liked = true;
    }

    const likedPost = await prisma.post.findUnique({
      where: { id },
      include: { _count: { select: { likes: true } } },
    });

    broadcast('LIKE_UPDATE', { postId: id, liked, count: likedPost?._count.likes || 0 });

    // Notify post owner when someone likes (not when un-liking, not self-like)
    if (liked && likedPost && likedPost.userId !== userId) {
      const notif = await prisma.notification.create({
        data: { userId: likedPost.userId, fromUserId: userId, type: 'LIKE', postId: id },
        include: { sender: { select: { id: true, name: true, email: true, tag: true, tagColor: true } } },
      });
      sendToUser(likedPost.userId, 'NOTIFICATION', notif);
    }

    res.json({ data: { liked, count: likedPost?._count.likes || 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

/* ---------- Delete Post ---------- */
router.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post || post.userId !== userId) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.post.delete({ where: { id } });
    broadcast('POST_DELETED', { postId: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

/* ---------- Get User Posts ---------- */
router.get('/user/posts', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string);
    const posts = await prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

/* ---------- Get Current User Profile ---------- */
router.get('/user/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { followers: true, following: true, posts: true } },
      },
    });
    if (!profile) return res.status(404).json({ error: 'User not found' });

    const totalLikes = await prisma.like.count({
      where: { post: { userId } },
    });

    res.json({ ...profile, totalLikes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Get User Profile by ID ---------- */
router.get('/user/profile/:id', async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const profile = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        _count: { select: { followers: true, following: true, posts: true } },
      },
    });
    if (!profile) return res.status(404).json({ error: 'User not found' });

    const totalLikes = await prisma.like.count({
      where: { post: { userId: targetId } },
    });

    const isFollowing = await prisma.follow.findFirst({
      where: { followerId: userId, followingId: targetId },
    });

    res.json({ ...profile, totalLikes, isFollowing: !!isFollowing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Toggle Follow ---------- */
router.post('/user/follow', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { targetId } = req.body as { targetId: number };
    const existing = await prisma.follow.findFirst({
      where: { followerId: userId, followingId: targetId },
    });

    let following = false;
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetId } });
      following = true;
    }
    res.json({ following });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

/* ---------- Search Users ---------- */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json({ data: [] });

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { tag: { contains: q } },
            ],
          },
        ],
      },
      take: 20,
    });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

/* ---------- Admin: Update User Tag ---------- */
router.put('/user/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { tag, tagColor } = req.body as { tag?: string; tagColor?: string };

    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (admin?.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { tag, tagColor },
    });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

/* ---------- Admin: Reset User Tag ---------- */
router.delete('/user/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (admin?.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { tag: 'Student', tagColor: 'grey' },
    });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset tag' });
  }
});

// ── /users/* routes — new URL structure matching lib/api.ts ──────────────────
// These mirror the old /user/* routes but use the URL shape the frontend expects.

/* ---------- Users: Search ---------- */
router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json({ data: [] });
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          { OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { tag: { contains: q } },
          ]},
        ],
      },
      take: 20,
    });
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

/* ---------- Users: Get Profile by ID ---------- */
router.get('/users/:id/profile', async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const profile = await prisma.user.findUnique({
      where: { id: targetId },
      include: { _count: { select: { followers: true, following: true, posts: true } } },
    });
    if (!profile) return res.status(404).json({ error: 'User not found' });
    const totalLikes = await prisma.like.count({ where: { post: { userId: targetId } } });
    const isFollowing = await prisma.follow.findFirst({
      where: { followerId: userId, followingId: targetId },
    });
    res.json({ data: { ...profile, totalLikes, isFollowing: !!isFollowing } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Users: Get Posts by User (paginated) ---------- */
router.get('/users/:id/posts', async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const requesterId = (req as any).userId as number;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, tag: true, tagColor: true } },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.post.count({ where: { userId: targetId } }),
    ]);
    const postsWithLiked = posts.map(p => ({
      ...p,
      likedByMe: p.likes.some((l: { userId: number }) => l.userId === requesterId),
    }));
    res.json({ data: { posts: postsWithLiked, total, page, pageSize: limit, hasMore: skip + limit < total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

/* ---------- Users: Toggle Follow ---------- */
router.post('/users/:id/follow', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const existing = await prisma.follow.findFirst({
      where: { followerId: userId, followingId: targetId },
    });
    let following = false;
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetId } });
      following = true;
    }

    // Notify the followed user (only on new follow, not unfollow)
    if (following) {
      const notif = await prisma.notification.create({
        data: { userId: targetId, fromUserId: userId, type: 'FOLLOW' },
        include: { sender: { select: { id: true, name: true, email: true, tag: true, tagColor: true } } },
      });
      sendToUser(targetId, 'NOTIFICATION', notif);
    }

    res.json({ data: { following } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

/* ---------- Users: Award Tag (admin) ---------- */
router.put('/users/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { tag, tagColor } = req.body as { tag?: string; tagColor?: string };
    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (admin?.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });
    const updated = await prisma.user.update({ where: { id: targetId }, data: { tag, tagColor } });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

/* ---------- Users: Reset Tag (admin) ---------- */
router.delete('/users/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (admin?.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { tag: 'Student', tagColor: 'grey' },
    });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset tag' });
  }
});

export default router;