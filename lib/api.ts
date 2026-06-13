const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ns_token') : null
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  const { data } = await res.json() as { data: T }
  return data
}

interface LoginResult {
  token: string
  user: { id: number; name: string | null; role: string }
}

interface StudentData {
  id: number
  name: string | null
  email: string
  role: string
  profile: {
    weightedGpa: number
    unweightedGpa: number
    gradeLevel: number
    graduationYear: number
    futureDecision: string | null
    satScore: number | null
    actScore: number | null
    counselorName: string | null
  } | null
  courses: Array<{
    id: number
    name: string
    teacher: string
    period: number
    courseType: string
    semester: string
    creditHours: number
    grade: { letterGrade: string; percentage: number } | null
  }>
  assignments: Array<{
    id: number
    title: string
    subject: string
    dueDate: string
    estimatedMinutes: number
    completed: boolean
    completedAt: string | null
  }>
  stats: {
    totalCourses: number
    pendingAssignments: number
    assignmentsDueToday: number
    assignmentsDueThisWeek: number
  }
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    request<LoginResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<StudentData>('/api/students/me'),
  roadmap: () => request<{
    gradeLevel: number
    creditsCompleted: number
    creditsRequired: number
    percentComplete: number
    weightedGpa: number
    unweightedGpa: number
    futureDecision: string | null
  }>('/api/roadmap'),
  chat: (message: string) =>
    request<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  studyPlan: () => request<{
    plan: Array<{
      id: number
      title: string
      subject: string
      dueDate: string
      estimatedMinutes: number
      priority: string
    }>
  }>('/api/ai/study-plan'),

  // ── School Portal Integration ──────────────────────────────────────────────

  portalStatus: () =>
    request<{
      connected: boolean
      systemType: string | null
      districtUrl: string | null
      sessionExpiresIn: number
      lastSynced: string | null
    }>('/api/integrations/grades/status'),

  portalLoginHAC: (baseUrl: string, username: string, password: string) =>
    request<{
      sessionToken: string
      systemType: string
      districtUrl: string
      expiresIn: number
    }>('/api/integrations/grades/hac/login', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, username, password }),
    }),

  portalLoginPS: (baseUrl: string, username: string, password: string) =>
    request<{
      sessionToken: string
      systemType: string
      districtUrl: string
      expiresIn: number
    }>('/api/integrations/grades/powerschool/login', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, username, password }),
    }),

  portalDisconnect: () =>
    request<{ disconnected: boolean }>(
      '/api/integrations/grades/session',
      { method: 'DELETE' },
    ),

  portalGrades: () =>
    request<{
      systemType: string
      grades: NormalizedCourse[]
    }>('/api/integrations/grades/current'),

  portalTranscript: () =>
    request<{ systemType: string; transcript: unknown }>(
      '/api/integrations/grades/transcript',
    ),

  // ── Study Feed ──────────────────────────────────────────────────────────────

  feedPosts: (page = 1, limit = 20) =>
    request<{
      posts: FeedPost[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
    }>(`/api/feed/posts?page=${page}&limit=${limit}`),

  feedCreatePost: (body: string) =>
    request<FeedPost>('/api/feed/posts', {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  feedDeletePost: (postId: number) =>
    request<{ deleted: boolean }>(`/api/feed/posts/${postId}`, {
      method: 'DELETE',
    }),

  feedToggleLike: (postId: number) =>
    request<{ liked: boolean }>(`/api/feed/posts/${postId}/like`, {
      method: 'POST',
    }),

  feedAddComment: (postId: number, body: string) =>
    request<FeedComment>(`/api/feed/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  feedPostDetail: (postId: number) =>
    request<FeedPost & { comments: FeedComment[] }>(`/api/feed/posts/${postId}`),

  feedToggleFollow: (targetUserId: number) =>
    request<{ following: boolean }>(`/api/feed/users/${targetUserId}/follow`, {
      method: 'POST',
    }),

  feedUserProfile: (targetUserId: number) =>
    request<FeedUserProfile>(`/api/feed/users/${targetUserId}/profile`),

  feedSearchUsers: (q: string) =>
    request<Array<{ id: number; name: string | null; email: string }>>(
      `/api/feed/users/search?q=${encodeURIComponent(q)}`,
    ),
}

// ── Study Feed types ───────────────────────────────────────────────────────

export interface FeedUser {
  id: number
  name: string | null
  email: string
}

export interface FeedPost {
  id: number
  userId: number
  body: string
  createdAt: string
  updatedAt: string
  user: FeedUser
  likedByMe: boolean
  _count: { likes: number; comments: number }
}

export interface FeedComment {
  id: number
  postId: number
  userId: number
  body: string
  createdAt: string
  user: FeedUser
}

export interface FeedUserProfile {
  id: number
  name: string | null
  email: string
  isFollowing: boolean
  _count: { followers: number; following: number; posts: number }
}

export type { StudentData }

export interface NormalizedCourse {
  id: string
  name: string
  teacher: string
  period: string
  average: number | null
  letterGrade: string | null
  assignments: Array<{
    name: string
    category: string
    score: number | null
    totalPoints: number | null
    percentage: string
    dateDue: string
  }>
  upcomingAssignments: Array<{
    name: string
    category: string
    score: number | null
    totalPoints: number | null
    percentage: string
    dateDue: string
  }>
}

// Kept for backwards compatibility — same shape as NormalizedCourse
export type HacGrade = NormalizedCourse
