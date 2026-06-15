import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { broadcast, sendToUser } from '../lib/websocket';
import { filterContent } from '../lib/contentFilter';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function hasDevPowers(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.role === 'ADMIN' || user?.tag === 'DEV';
}

const USER_SELECT = {
  id: true, name: true, email: true,
  tag: true, tagColor: true,
  nameColor: true, pfpEffect: true,
  chatBanned: true, chatMutedUntil: true,
  deletedAt: true, role: true, allTags: true,
} as const;

type RawUser = {
  id: number; name: string | null; email: string;
  tag: string | null; tagColor: string | null;
  nameColor: string | null; pfpEffect: string | null;
  chatBanned: boolean; chatMutedUntil: Date | null;
  deletedAt: Date | null; role: string; allTags: unknown;
};

function toFeedUser(u: RawUser) {
  if (u.deletedAt) return { id: u.id, name: u.name, email: u.email, tag: 'DELETED', tagColor: '#6B7280', nameColor: null as string | null, pfpEffect: null as string | null };
  if (u.chatBanned) return { id: u.id, name: u.name, email: u.email, tag: 'BANNED', tagColor: '#EF4444', nameColor: null as string | null, pfpEffect: null as string | null };
  if (u.chatMutedUntil && u.chatMutedUntil > new Date()) return { id: u.id, name: u.name, email: u.email, tag: 'MUTED', tagColor: '#f97316', nameColor: null as string | null, pfpEffect: null as string | null };
  // DEV/ADMIN role always shows as DEV regardless of display tag
  if (u.role === 'ADMIN') return { id: u.id, name: u.name, email: u.email, tag: 'DEV', tagColor: 'lightblue', nameColor: u.nameColor, pfpEffect: u.pfpEffect };
  return { id: u.id, name: u.name, email: u.email, tag: u.tag, tagColor: u.tagColor, nameColor: u.nameColor, pfpEffect: u.pfpEffect };
}

function parseAllTags(raw: unknown): Array<{ tag: string; tagColor: string }> {
  if (Array.isArray(raw)) return (raw as Array<{ tag?: unknown; tagColor?: unknown }>).filter(t => t?.tag).map(t => ({ tag: String(t.tag), tagColor: String(t.tagColor ?? 'grey') }))
  try { return JSON.parse(String(raw ?? '[]')) as Array<{ tag: string; tagColor: string }>; } catch { return []; }
}

/* ---------- helpers: giveaway auto-draw ---------- */
async function autoDrawExpiredGiveaways() {
  const now = new Date();
  const expired = await prisma.post.findMany({
    where: { type: 'giveaway', giveawayEndsAt: { lt: now }, giveawayWinnerId: null },
    include: { giveawayEntries: { select: { userId: true } } },
  });
  for (const ga of expired) {
    if (ga.giveawayEntries.length === 0) continue;
    const winner = ga.giveawayEntries[Math.floor(Math.random() * ga.giveawayEntries.length)];
    await prisma.post.update({ where: { id: ga.id }, data: { giveawayWinnerId: winner.userId } });
    if (ga.giveawayCoinAmount) {
      await prisma.user.update({
        where: { id: winner.userId },
        data: { coins: { increment: ga.giveawayCoinAmount } },
      });
    } else if (ga.giveawayTag) {
      const winnerUser = await prisma.user.findUnique({ where: { id: winner.userId } });
      if (winnerUser) {
        const existing = parseAllTags(winnerUser.allTags || '[]');
        const filtered = existing.filter(t => t.tag !== ga.giveawayTag);
        const newAllTags = [...filtered, { tag: ga.giveawayTag, tagColor: ga.giveawayTagColor || 'grey' }];
        await prisma.user.update({
          where: { id: winner.userId },
          data: {
            allTags: JSON.stringify(newAllTags),
            ...(!winnerUser.tag || winnerUser.tag === 'Student' || winnerUser.tag === 'Parent'
              ? { tag: ga.giveawayTag, tagColor: ga.giveawayTagColor || 'grey' }
              : {}),
          },
        });
      }
    }
  }
}

/* ---------- Social Feed (all posts, ranked) ---------- */
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const userId = (req as any).userId as number;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Auto-draw any giveaways that have expired
    await autoDrawExpiredGiveaways();

    // Social feed: last 24h posts, active giveaways, and currently-pinned posts
    const allPosts = await prisma.post.findMany({
      where: {
        user: { deletedAt: null },
        OR: [
          { createdAt: { gte: cutoff } },
          { type: 'giveaway' },
          { pinnedUntil: { gt: now } },
        ],
      },
      take: 1000,
      include: {
        user: {
          select: {
            id: true, name: true, email: true,
            tag: true, tagColor: true, nameColor: true, pfpEffect: true,
            chatBanned: true, chatMutedUntil: true, deletedAt: true,
            role: true, allTags: true,
            _count: { select: { followers: true } },
          },
        },
        likes: { select: { userId: true } },
        giveawayEntries: { select: { userId: true } },
        giveawayWinner: { select: { id: true, name: true, email: true } },
        _count: { select: { likes: true, comments: true, giveawayEntries: true } },
      },
    });

    // Ranking: pinned first (sort by pinnedUntil desc), then engagement score.
    // DEV/BOT get a moderate boost (not always-first).
    const ranked = allPosts
      .map(p => {
        const isPinned = p.pinnedUntil && p.pinnedUntil > now;
        const isPromoted = p.user.tag === 'DEV' || p.user.tag === 'BOT';
        const score =
          (isPinned ? 10_000_000 : 0) +
          (isPromoted ? 30 : 0) +
          p.user._count.followers * 3 +
          p._count.likes * 2 +
          p._count.comments;
        return { ...p, _score: score };
      })
      .sort((a, b) => b._score - a._score);

    const total = ranked.length;
    const skip = (page - 1) * limit;
    const paged = ranked.slice(skip, skip + limit);

    const postsOut = paged.map(post => {
      const { _score, user, giveawayEntries, ...rest } = post;
      const { _count: _uc, ...userRest } = user;
      return {
        ...rest,
        user: toFeedUser(userRest),
        likedByMe: post.likes.some(l => l.userId === userId),
        enteredByMe: post.giveawayEntries.some(e => e.userId === userId),
      };
    });

    res.json({ data: { posts: postsOut, total, page, pageSize: limit, hasMore: skip + limit < total } });
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

    const poster = await prisma.user.findUnique({ where: { id: userId } });
    if (poster?.chatBanned) return res.status(403).json({ error: 'You are banned from posting.' });
    if (poster?.chatMutedUntil && poster.chatMutedUntil > new Date())
      return res.status(403).json({ error: `You are muted until ${poster.chatMutedUntil.toLocaleString()}.` });

    const contentCheck = filterContent(body.trim());
    if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.reason });

    const post = await prisma.post.create({
      data: { body: body.trim(), userId },
      include: {
        user: { select: USER_SELECT },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const postOut = { ...post, user: toFeedUser(post.user), likedByMe: false };
    broadcast('NEW_POST', postOut);
    res.json({ data: postOut });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

/* ---------- Create Giveaway Post (DEV/admin only) ---------- */
router.post('/posts/giveaway', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { body, giveawayTag, giveawayTagColor, giveawayCoinAmount, durationMinutes } = req.body as {
      body?: string; giveawayTag?: string; giveawayTagColor?: string; giveawayCoinAmount?: number; durationMinutes?: number;
    };
    if (!body?.trim()) return res.status(400).json({ error: 'Body is required' });
    if (!durationMinutes || durationMinutes < 1) return res.status(400).json({ error: 'Duration must be at least 1 minute' });
    const isCoinGiveaway = typeof giveawayCoinAmount === 'number' && giveawayCoinAmount > 0;
    if (!isCoinGiveaway && !giveawayTag?.trim()) return res.status(400).json({ error: 'Tag name or coin amount is required' });

    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Only DEV/admin can create giveaways' });

    const giveawayEndsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const post = await prisma.post.create({
      data: {
        body: body.trim(),
        userId,
        type: 'giveaway',
        ...(isCoinGiveaway
          ? { giveawayCoinAmount }
          : { giveawayTag: giveawayTag!.trim(), giveawayTagColor: (giveawayTagColor || 'gold').trim() }),
        giveawayEndsAt,
      },
      include: {
        user: { select: USER_SELECT },
        likes: { select: { userId: true } },
        giveawayEntries: { select: { userId: true } },
        giveawayWinner: { select: { id: true, name: true, email: true } },
        _count: { select: { likes: true, comments: true, giveawayEntries: true } },
      },
    });
    const postOut = { ...post, user: toFeedUser(post.user), likedByMe: false, enteredByMe: false };
    broadcast('NEW_POST', postOut);
    res.json({ data: postOut });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create giveaway' });
  }
});

/* ---------- Following Feed (posts from followed users, newest first) ---------- */
router.get('/posts/following', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const follows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = follows.map(f => f.followingId);

    if (followingIds.length === 0) {
      return res.json({ data: { posts: [], total: 0, page, pageSize: limit, hasMore: false } });
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId: { in: followingIds }, user: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: {
          user: { select: USER_SELECT },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.post.count({ where: { userId: { in: followingIds }, user: { deletedAt: null } } }),
    ]);

    const postsOut = posts.map(p => ({
      ...p,
      user: toFeedUser(p.user),
      likedByMe: p.likes.some(l => l.userId === userId),
    }));

    res.json({ data: { posts: postsOut, total, page, pageSize: limit, hasMore: skip + limit < total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch following posts' });
  }
});

/* ---------- Get Single Post ---------- */
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const requesterId = (req as any).userId as number;
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: USER_SELECT },
            commentLikes: { select: { userId: true } },
          },
        },
        user: { select: USER_SELECT },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const commentsWithMeta = post.comments.map(c => ({
      ...c,
      user: toFeedUser(c.user),
      likedByMe: c.commentLikes.some((l: { userId: number }) => l.userId === requesterId),
      _count: { likes: c.commentLikes.length },
    }));
    res.json({ data: { ...post, user: toFeedUser(post.user), comments: commentsWithMeta } });
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

    const commenter = await prisma.user.findUnique({ where: { id: userId } });
    if (commenter?.chatBanned) return res.status(403).json({ error: 'You are banned from posting.' });
    if (commenter?.chatMutedUntil && commenter.chatMutedUntil > new Date())
      return res.status(403).json({ error: 'You are currently muted.' });

    const contentCheck = filterContent(body.trim());
    if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.reason });

    const comment = await prisma.comment.create({
      data: { body: body.trim(), postId: id, userId },
      include: {
        user: { select: USER_SELECT },
        commentLikes: { select: { userId: true } },
      },
    });

    const commentOut = { ...comment, user: toFeedUser(comment.user), likedByMe: false, _count: { likes: 0 } };
    broadcast('NEW_COMMENT', { postId: id, comment: commentOut });

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (post && post.userId !== userId) {
      const notif = await prisma.notification.create({
        data: { userId: post.userId, fromUserId: userId, type: 'COMMENT', postId: id, preview: body.trim().slice(0, 80) },
        include: { sender: { select: USER_SELECT } },
      });
      sendToUser(post.userId, 'NOTIFICATION', { ...notif, sender: toFeedUser(notif.sender) });
    }

    res.json({ data: commentOut });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

/* ---------- Toggle Like ---------- */
router.post('/posts/:id/like', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).userId as number;

    const existingLike = await prisma.like.findFirst({ where: { userId, postId: id } });
    let liked = false;
    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.like.create({ data: { userId, postId: id } });
      liked = true;
    }

    const likedPost = await prisma.post.findUnique({ where: { id }, include: { _count: { select: { likes: true } } } });
    broadcast('LIKE_UPDATE', { postId: id, liked, count: likedPost?._count.likes || 0 });

    if (liked && likedPost && likedPost.userId !== userId) {
      const notif = await prisma.notification.create({
        data: { userId: likedPost.userId, fromUserId: userId, type: 'LIKE', postId: id },
        include: { sender: { select: USER_SELECT } },
      });
      sendToUser(likedPost.userId, 'NOTIFICATION', { ...notif, sender: toFeedUser(notif.sender) });
    }

    res.json({ data: { liked, count: likedPost?._count.likes || 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

/* ---------- Toggle Comment Like ---------- */
router.post('/posts/:id/comments/:commentId/like', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const commentId = parseInt(req.params.commentId);
    const userId = (req as any).userId as number;

    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { userId: true, postId: true } });
    if (!comment || comment.postId !== postId) return res.status(404).json({ error: 'Comment not found' });

    const existingLike = await prisma.commentLike.findFirst({ where: { userId, commentId } });
    let liked = false;
    if (existingLike) {
      await prisma.commentLike.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.commentLike.create({ data: { userId, commentId } });
      liked = true;
    }

    const likedComment = await prisma.comment.findUnique({ where: { id: commentId }, include: { commentLikes: { select: { userId: true } } } });
    broadcast('COMMENT_LIKE_UPDATE', { postId, commentId, liked, count: likedComment?.commentLikes?.length || 0 });
    res.json({ data: { liked, count: likedComment?.commentLikes?.length || 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle comment like' });
  }
});

/* ---------- Delete Post ---------- */
router.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isDev = await hasDevPowers(userId);
    if (post.userId !== userId && !isDev) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.post.delete({ where: { id } });
    broadcast('POST_DELETED', { postId: id });
    res.json({ data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

/* ---------- Enter Giveaway ---------- */
router.post('/posts/:id/giveaway/enter', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = (req as any).userId as number;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.type !== 'giveaway') return res.status(404).json({ error: 'Giveaway not found' });
    if (post.giveawayEndsAt && post.giveawayEndsAt <= new Date())
      return res.status(400).json({ error: 'This giveaway has ended' });

    const existing = await prisma.giveawayEntry.findFirst({ where: { postId, userId } });
    if (existing) return res.status(400).json({ error: 'Already entered' });

    await prisma.giveawayEntry.create({ data: { postId, userId } });
    const count = await prisma.giveawayEntry.count({ where: { postId } });
    res.json({ data: { entered: true, count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to enter giveaway' });
  }
});

/* ---------- Draw Giveaway Winner (DEV/admin) ---------- */
router.post('/posts/:id/giveaway/draw', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const actorId = (req as any).userId as number;

    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { giveawayEntries: { select: { userId: true } } },
    });
    if (!post || post.type !== 'giveaway') return res.status(404).json({ error: 'Giveaway not found' });
    if (post.giveawayWinnerId) return res.status(400).json({ error: 'Winner already drawn' });
    if (post.giveawayEntries.length === 0) return res.status(400).json({ error: 'No entries yet' });

    const winnerEntry = post.giveawayEntries[Math.floor(Math.random() * post.giveawayEntries.length)];
    await prisma.post.update({ where: { id: postId }, data: { giveawayWinnerId: winnerEntry.userId } });

    if (post.giveawayCoinAmount) {
      await prisma.user.update({
        where: { id: winnerEntry.userId },
        data: { coins: { increment: post.giveawayCoinAmount } },
      });
    } else if (post.giveawayTag) {
      const winnerUser = await prisma.user.findUnique({ where: { id: winnerEntry.userId } });
      if (winnerUser) {
        const existing = parseAllTags(winnerUser.allTags || '[]');
        const filtered = existing.filter(t => t.tag !== post.giveawayTag);
        const newAllTags = [...filtered, { tag: post.giveawayTag, tagColor: post.giveawayTagColor || 'grey' }];
        await prisma.user.update({
          where: { id: winnerEntry.userId },
          data: {
            allTags: JSON.stringify(newAllTags),
            ...(!winnerUser.tag || winnerUser.tag === 'Student' || winnerUser.tag === 'Parent'
              ? { tag: post.giveawayTag, tagColor: post.giveawayTagColor || 'grey' }
              : {}),
          },
        });
      }
    }

    const winner = await prisma.user.findUnique({ where: { id: winnerEntry.userId }, select: { id: true, name: true, email: true } });
    broadcast('GIVEAWAY_WINNER', { postId, winner });
    res.json({ data: { winnerId: winner?.id, winnerName: winner?.name ?? winner?.email } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to draw winner' });
  }
});

/* ---------- Pin Post for 24h (DEV/admin) ---------- */
router.put('/posts/:id/pin', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const actorId = (req as any).userId as number;

    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });

    const pinnedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updated = await prisma.post.update({ where: { id: postId }, data: { pinnedUntil } });
    broadcast('POST_PINNED', { postId, pinnedUntil: pinnedUntil.toISOString() });
    res.json({ data: { pinnedUntil: updated.pinnedUntil?.toISOString() ?? null } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin post' });
  }
});

/* ---------- Unpin Post (DEV/admin) ---------- */
router.put('/posts/:id/unpin', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const actorId = (req as any).userId as number;

    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.post.update({ where: { id: postId }, data: { pinnedUntil: null } });
    broadcast('POST_UNPINNED', { postId });
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpin post' });
  }
});

/* ---------- Get User Posts (legacy) ---------- */
router.get('/user/posts', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string);
    const posts = await prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { likes: { select: { userId: true } }, _count: { select: { likes: true, comments: true } } },
    });
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

/* ---------- Get Current User Profile (legacy) ---------- */
router.get('/user/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const profile = await prisma.user.findUnique({ where: { id: userId }, include: { _count: { select: { followers: true, following: true, posts: true } } } });
    if (!profile) return res.status(404).json({ error: 'User not found' });
    const totalLikes = await prisma.like.count({ where: { post: { userId } } });
    res.json({ ...profile, totalLikes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Get User Profile by ID (legacy) ---------- */
router.get('/user/profile/:id', async (req: Request, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const userId = (req as any).userId as number;
    const profile = await prisma.user.findUnique({ where: { id: targetId }, include: { _count: { select: { followers: true, following: true, posts: true } } } });
    if (!profile) return res.status(404).json({ error: 'User not found' });
    const totalLikes = await prisma.like.count({ where: { post: { userId: targetId } } });
    const isFollowing = await prisma.follow.findFirst({ where: { followerId: userId, followingId: targetId } });
    res.json({ ...profile, totalLikes, isFollowing: !!isFollowing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Toggle Follow (legacy) ---------- */
router.post('/user/follow', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { targetId } = req.body as { targetId: number };
    const existing = await prisma.follow.findFirst({ where: { followerId: userId, followingId: targetId } });
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

/* ---------- Search (legacy) ---------- */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json({ data: [] });
    const isDev = await hasDevPowers(userId);
    const users = await prisma.user.findMany({
      where: { AND: [{ id: { not: userId } }, ...(isDev ? [] : [{ deletedAt: null }]), { OR: [{ name: { contains: q } }, { email: { contains: q } }, { tag: { contains: q } }] }] },
      take: 20,
      select: { id: true, name: true, email: true, tag: true, tagColor: true, nameColor: true, pfpEffect: true, chatBanned: true, chatMutedUntil: true, deletedAt: true, role: true, allTags: true },
    });
    res.json({ data: users.map(toFeedUser) });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

/* ---------- Admin: Update User Tag (legacy) ---------- */
router.put('/user/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { tag, tagColor } = req.body as { tag?: string; tagColor?: string };
    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const updated = await prisma.user.update({ where: { id: targetId }, data: { tag, tagColor } });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

/* ---------- Admin: Reset User Tag (legacy) ---------- */
router.delete('/user/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const defaultTag = target?.role === 'PARENT' ? 'Parent' : 'Student';
    const updated = await prisma.user.update({ where: { id: targetId }, data: { tag: defaultTag, tagColor: 'grey', allTags: '[]' } });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset tag' });
  }
});

// ── /users/* routes ──────────────────────────────────────────────────────────

/* ---------- Users: Search ---------- */
router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json({ data: [] });
    const isDev = await hasDevPowers(userId);
    const users = await prisma.user.findMany({
      where: { AND: [{ id: { not: userId } }, ...(isDev ? [] : [{ deletedAt: null }]), { OR: [{ name: { contains: q } }, { email: { contains: q } }, { tag: { contains: q } }] }] },
      take: 20,
      select: { id: true, name: true, email: true, tag: true, tagColor: true, nameColor: true, pfpEffect: true, chatBanned: true, chatMutedUntil: true, deletedAt: true, role: true, allTags: true },
    });
    res.json({ data: users.map(toFeedUser) });
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
    if (profile.deletedAt) {
      const isDev = await hasDevPowers(userId);
      if (!isDev) return res.status(404).json({ error: 'User not found' });
    }

    const [totalLikes, isFollowingRow] = await Promise.all([
      prisma.like.count({ where: { post: { userId: targetId } } }),
      prisma.follow.findFirst({ where: { followerId: userId, followingId: targetId } }),
    ]);

    // Compute effective tag for display
    let effectiveTag = profile.tag;
    let effectiveTagColor = profile.tagColor;
    if (profile.deletedAt) { effectiveTag = 'DELETED'; effectiveTagColor = '#6B7280'; }
    else if (profile.chatBanned) { effectiveTag = 'BANNED'; effectiveTagColor = '#EF4444'; }
    else if (profile.chatMutedUntil && profile.chatMutedUntil > new Date()) { effectiveTag = 'MUTED'; effectiveTagColor = '#f97316'; }
    else if (profile.role === 'ADMIN') { effectiveTag = 'DEV'; effectiveTagColor = 'lightblue'; }

    const { passwordHash, allTags: rawAllTags, ...rest } = profile as typeof profile & { passwordHash: string; allTags: string };
    res.json({
      data: {
        ...rest,
        tag: effectiveTag,
        tagColor: effectiveTagColor,
        allTags: parseAllTags(rawAllTags || '[]'),
        totalLikes,
        isFollowing: !!isFollowingRow,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* ---------- Users: Get Posts by User ---------- */
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
        skip, take: limit,
        include: {
          user: { select: USER_SELECT },
          likes: { select: { userId: true } },
          giveawayEntries: { select: { userId: true } },
          giveawayWinner: { select: { id: true, name: true, email: true } },
          _count: { select: { likes: true, comments: true, giveawayEntries: true } },
        },
      }),
      prisma.post.count({ where: { userId: targetId } }),
    ]);
    const postsOut = posts.map(p => ({
      ...p,
      user: toFeedUser(p.user),
      likedByMe: p.likes.some((l: { userId: number }) => l.userId === requesterId),
      enteredByMe: (p.giveawayEntries as { userId: number }[]).some(e => e.userId === requesterId),
    }));
    res.json({ data: { posts: postsOut, total, page, pageSize: limit, hasMore: skip + limit < total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

/* ---------- Users: Toggle Follow ---------- */
router.post('/users/:id/follow', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const existing = await prisma.follow.findFirst({ where: { followerId: userId, followingId: targetId } });
    let following = false;
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetId } });
      following = true;
    }
    if (following) {
      const notif = await prisma.notification.create({
        data: { userId: targetId, fromUserId: userId, type: 'FOLLOW' },
        include: { sender: { select: USER_SELECT } },
      });
      sendToUser(targetId, 'NOTIFICATION', { ...notif, sender: toFeedUser(notif.sender) });
    }
    res.json({ data: { following } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

/* ---------- Users: Award Tag (DEV/admin) — adds to allTags ---------- */
router.put('/users/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { tag, tagColor } = req.body as { tag?: string; tagColor?: string };
    if (!tag) return res.status(400).json({ error: 'Tag is required' });

    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const existing = parseAllTags(target?.allTags || '[]');
    // Replace entry if same tag name exists, otherwise append
    const filtered = existing.filter(t => t.tag !== tag);
    const newAllTags = [...filtered, { tag, tagColor: tagColor || 'grey' }];

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        allTags: JSON.stringify(newAllTags),
        // Also set as display tag if user currently has no display tag (or Student/Parent default)
        ...((!target?.tag || target.tag === 'Student' || target.tag === 'Parent') ? { tag, tagColor: tagColor || 'grey' } : {}),
      },
    });
    res.json({ data: { tag: updated.tag, tagColor: updated.tagColor, allTags: parseAllTags(updated.allTags) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

/* ---------- Users: Reset All Tags (DEV/admin) ---------- */
router.delete('/users/:id/tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const defaultTag = target?.role === 'PARENT' ? 'Parent' : 'Student';
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { tag: defaultTag, tagColor: 'grey', allTags: '[]' },
    });
    res.json({ data: { tag: updated.tag, tagColor: updated.tagColor, allTags: [] } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset tag' });
  }
});

/* ---------- Users: Remove Specific Tag (DEV/admin) ---------- */
router.delete('/users/:id/tags/:tagname', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const tagname = decodeURIComponent(req.params.tagname);
    const isDev = await hasDevPowers(userId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const existing = parseAllTags(target?.allTags || '[]');
    const newAllTags = existing.filter(t => t.tag !== tagname);

    // If the removed tag was the display tag, fall back to next or clear
    const next = newAllTags[0] ?? null;
    const wasDisplay = target?.tag === tagname;

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        allTags: JSON.stringify(newAllTags),
        ...(wasDisplay ? { tag: next?.tag ?? null, tagColor: next?.tagColor ?? null } : {}),
      },
    });
    res.json({ data: { tag: updated.tag, tagColor: updated.tagColor, allTags: newAllTags } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

/* ---------- Users: Set Display Tag (current user) ---------- */
router.put('/users/me/display-tag', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as number;
    const { tag, tagColor } = req.body as { tag?: string; tagColor?: string };

    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (me?.chatBanned || (me?.chatMutedUntil && me.chatMutedUntil > new Date()))
      return res.status(403).json({ error: 'Cannot change display tag while banned or muted' });

    const allTags = parseAllTags(me?.allTags || '[]');
    if (tag && !allTags.some(t => t.tag === tag))
      return res.status(400).json({ error: 'Tag not in your awarded tags' });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { tag: tag ?? undefined, tagColor: tagColor ?? null },
    });
    res.json({ data: { tag: updated.tag, tagColor: updated.tagColor } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set display tag' });
  }
});

/* ---------- Users: Ban from chat ---------- */
router.put('/users/:id/ban', async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { banned } = req.body as { banned: boolean };
    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const updated = await prisma.user.update({ where: { id: targetId }, data: { chatBanned: banned } });
    res.json({ data: { banned: updated.chatBanned } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

/* ---------- Users: Mute from chat ---------- */
router.put('/users/:id/mute', async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    const { minutes } = req.body as { minutes?: number | null };
    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const mutedUntil = (minutes != null && minutes > 0)
      ? new Date(Date.now() + minutes * 60 * 1000)
      : null;
    const updated = await prisma.user.update({ where: { id: targetId }, data: { chatMutedUntil: mutedUntil } });
    res.json({ data: { mutedUntil: updated.chatMutedUntil?.toISOString() ?? null } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mute status' });
  }
});

/* ---------- Users: Set role (DEV only) ---------- */
router.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).userId as number;
    const targetId = parseInt(req.params.id);
    if (actorId === targetId) return res.status(400).json({ error: 'Cannot change your own role' });
    const { role } = req.body as { role: string };
    if (!['STUDENT', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const isDev = await hasDevPowers(actorId);
    if (!isDev) return res.status(403).json({ error: 'Unauthorized' });
    const updated = await prisma.user.update({ where: { id: targetId }, data: { role } });
    res.json({ data: { role: updated.role } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

export default router;
