const BASE = ''

class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

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
    const body = await res.json().catch(() => ({})) as { error?: string | { message?: string; code?: string } }
    const msg  = typeof body?.error === 'string' ? body.error : body?.error?.message
    const code = typeof body?.error === 'object' ? body?.error?.code : undefined
    throw new ApiError(msg ?? `HTTP ${res.status}`, code)
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
    priority?: string | null
  }>
  stats: {
    totalCourses: number
    pendingAssignments: number
    assignmentsDueToday: number
    assignmentsDueThisWeek: number
  }
}

export const api = {
  register: (email: string, password: string, name?: string, role?: string) =>
    request<LoginResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role }),
    }),
  login: (email: string, password: string) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<StudentData>('/api/students/me'),
  updateProfile: (fields: { satScore?: number | null; actScore?: number | null; futureDecision?: string | null }) =>
    request<{ id: number }>('/api/students/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }),
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

  portalSyncProfile: () =>
    request<{
      synced: boolean
      name: string | null
      profile: {
        id: number
        userId: number
        gradeLevel: number
        graduationYear: number | null
        weightedGpa: number
        unweightedGpa: number
        futureDecision: string | null
        satScore: number | null
        actScore: number | null
        counselorName: string | null
      } | null
      studentInfo: {
        name: string
        grade: string
        school: string
        district: string
        counselor: string
        cohortYear: string
      }
    }>('/api/integrations/grades/sync-profile', {
      method: 'POST',
    }),

  portalGrades: () =>
    request<{
      systemType: string
      grades: NormalizedCourse[]
    }>('/api/integrations/grades/current'),

  portalTranscript: () =>
    request<{
      systemType: string
      transcript: {
        semesters: Array<{
          year: string
          semester: string
          courses: Array<{ name: string; grade: string; credits: string }>
        }>
        cumulativeGPA: string | null
        weightedGPA: string | null
        unweightedGPA: string | null
        classRank: string | null
        quartile: string | null
      }
    }>('/api/integrations/grades/transcript'),

  portalSchedule: () =>
    request<{ schedule: Record<string, string>[] }>('/api/integrations/grades/schedule'),

  portalClasswork: (period?: string) =>
    request<{
      classes: Array<{ name: string; period: string; teacher: string; room: string; average: string | null; scores: Array<{ name: string; category: string; score: number | null; totalPoints: number | null; percentage: string; dateDue: string }> }>
      availablePeriods: string[]
      currentPeriod: string
    }>(`/api/integrations/grades/classwork${period ? `?period=${encodeURIComponent(period)}` : ''}`),

  portalReportCard: (period?: string) =>
    request<{
      reportingPeriods: string[]
      currentPeriod: string
      semesters: {
        sem1: Array<{ name: string; period: string; numericGrade: string; letterGrade: string; credits: string; teacher: string }>
        sem2: Array<{ name: string; period: string; numericGrade: string; letterGrade: string; credits: string; teacher: string }>
      }
    }>(`/api/integrations/grades/report-card${period ? `?period=${encodeURIComponent(period)}` : ''}`),

  portalGpa: () =>
    request<{
      gpa: number | null
      unweightedGpa: number | null
      weightedGpa: number | null
      courseCount: number
      systemType: string
    }>('/api/integrations/grades/gpa'),

  portalProgressReport: (date?: string) =>
    request<{
      availableDates: string[]
      currentDate: string
      courses: Array<{ name: string; period: string; average: string; letterGrade: string; teacher: string }>
    }>(`/api/integrations/grades/progress-report${date ? `?date=${encodeURIComponent(date)}` : ''}`),

  portalContactTeachers: () =>
    request<{
      teachers: Array<{ name: string; courseName: string; period: string; email: null; emailNote: string; emailHint: string }>
    }>('/api/integrations/grades/contact-teachers'),

  portalAttendance: (monthOffset = 0) =>
    request<{
      month: string
      year: number
      monthIndex: number
      days: Array<{ date: string; dayOfWeek: string; status: string; code: string; description: string }>
      summary: { absences: number; tardies: number; excused: number }
    }>(`/api/integrations/grades/attendance?monthOffset=${monthOffset}`),

  // ── Study Feed ──────────────────────────────────────────────────────────────

  feedPosts: (page = 1, limit = 20) =>
    request<{
      posts: FeedPost[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
    }>(`/api/feed/posts?page=${page}&limit=${limit}`),

  feedFollowingPosts: (page = 1, limit = 20) =>
    request<{
      posts: FeedPost[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
    }>(`/api/feed/posts/following?page=${page}&limit=${limit}`),

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

  feedToggleCommentLike: (postId: number, commentId: number) =>
    request<{ liked: boolean; count: number }>(`/api/feed/posts/${postId}/comments/${commentId}/like`, {
      method: 'POST',
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
    request<Array<{ id: number; name: string | null; email: string; tag: string | null; tagColor: string | null }>>(
      `/api/feed/users/search?q=${encodeURIComponent(q)}`,
    ),

  feedUserPosts: (targetUserId: number, page = 1, limit = 20) =>
    request<{
      posts: FeedPost[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
    }>(`/api/feed/users/${targetUserId}/posts?page=${page}&limit=${limit}`),

  feedUpdateTag: (tag: string) =>
    request<{ id: number; name: string | null; email: string; tag: string | null }>(
      '/api/feed/users/me/tag',
      {
        method: 'PUT',
        body: JSON.stringify({ tag }),
      },
    ),

  feedAwardTag: (targetUserId: number, tag: string, tagColor?: string) =>
    request<{ tag: string | null; tagColor: string | null; allTags: Array<{ tag: string; tagColor: string }> }>(
      `/api/feed/users/${targetUserId}/tag`,
      {
        method: 'PUT',
        body: JSON.stringify({ tag, ...(tagColor ? { tagColor } : {}) }),
      },
    ),

  feedResetTag: (targetUserId: number) =>
    request<{ tag: string | null; tagColor: string | null; allTags: Array<{ tag: string; tagColor: string }> }>(
      `/api/feed/users/${targetUserId}/tag`,
      { method: 'DELETE' },
    ),

  feedRemoveTagFromUser: (targetUserId: number, tagName: string) =>
    request<{ tag: string | null; tagColor: string | null; allTags: Array<{ tag: string; tagColor: string }> }>(
      `/api/feed/users/${targetUserId}/tags/${encodeURIComponent(tagName)}`,
      { method: 'DELETE' },
    ),

  feedSetDisplayTag: (tag: string, tagColor: string) =>
    request<{ tag: string | null; tagColor: string | null }>(
      '/api/feed/users/me/display-tag',
      { method: 'PUT', body: JSON.stringify({ tag, tagColor }) },
    ),

  feedBanUser: (targetUserId: number, banned: boolean) =>
    request<{ banned: boolean }>(`/api/feed/users/${targetUserId}/ban`, {
      method: 'PUT',
      body: JSON.stringify({ banned }),
    }),

  feedMuteUser: (targetUserId: number, minutes: number | null) =>
    request<{ mutedUntil: string | null }>(`/api/feed/users/${targetUserId}/mute`, {
      method: 'PUT',
      body: JSON.stringify({ minutes }),
    }),

  feedSetUserRole: (targetUserId: number, role: string) =>
    request<{ role: string }>(`/api/feed/users/${targetUserId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  feedCreateGiveaway: (data: { body: string; giveawayTag: string; giveawayTagColor: string; durationMinutes: number }) =>
    request<FeedPost>('/api/feed/posts/giveaway', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  feedEnterGiveaway: (postId: number) =>
    request<{ entered: boolean; count: number }>(`/api/feed/posts/${postId}/giveaway/enter`, {
      method: 'POST',
    }),

  feedDrawGiveaway: (postId: number) =>
    request<{ winnerId: number; winnerName: string }>(`/api/feed/posts/${postId}/giveaway/draw`, {
      method: 'POST',
    }),

  feedPinPost: (postId: number) =>
    request<{ pinnedUntil: string | null }>(`/api/feed/posts/${postId}/pin`, { method: 'PUT' }),

  feedUnpinPost: (postId: number) =>
    request<{ ok: boolean }>(`/api/feed/posts/${postId}/unpin`, { method: 'PUT' }),

  // ── Planner ───────────────────────────────────────────────────────────────────

  plannerList: () =>
    request<PlannerItem[]>('/api/assignments?limit=100'),

  plannerCreate: (item: { title: string; subject?: string; dueDate: string; dueTime?: string }) =>
    request<PlannerItem>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  plannerToggle: (id: number, completed: boolean) =>
    request<PlannerItem>(`/api/assignments/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),

  plannerDelete: (id: number) =>
    request<{ deleted: boolean }>(`/api/assignments/${id}`, {
      method: 'DELETE',
    }),

  // ── Colleges ──────────────────────────────────────────────────────────────────

  collegeList: () =>
    request<CollegeListItem[]>('/api/colleges'),

  collegeAdd: (name: string) =>
    request<CollegeListItem>('/api/colleges', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  collegeRemove: (id: number) =>
    request<{ deleted: boolean }>(`/api/colleges/${id}`, { method: 'DELETE' }),

  deleteAccount: (password: string) =>
    request<{ deleted: boolean }>('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  // ── Notifications ─────────────────────────────────────────────────────────────

  getNotifications: () =>
    request<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),

  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  // ── Parent API ────────────────────────────────────────────────────────────────

  parentLinkStudent: (credentials: { districtUrl: string; username: string; password: string }) =>
    request<{ linked: boolean; student: { id: number; name: string | null; email: string } }>(
      '/api/parent/link-student',
      { method: 'POST', body: JSON.stringify(credentials) },
    ),

  parentStudents: () =>
    request<ParentStudentSummary[]>('/api/parent/students'),

  parentStudentDetail: (studentId: number) =>
    request<StudentData>(`/api/parent/students/${studentId}`),

  parentUnlinkStudent: (studentId: number) =>
    request<{ unlinked: boolean }>(`/api/parent/students/${studentId}`, { method: 'DELETE' }),

  parentStudentChat: (studentId: number, message: string) =>
    request<{ reply: string }>(`/api/parent/students/${studentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
}

// ── Planner types ─────────────────────────────────────────────────────────

export interface PlannerItem {
  id: number
  title: string
  subject: string | null
  dueDate: string
  dueTime: string | null
  completed: boolean
  completedAt: string | null
  userId: number
}

// ── Study Feed types ───────────────────────────────────────────────────────

export interface FeedUser {
  id: number
  name: string | null
  email: string
  tag: string | null
  tagColor: string | null
}

export interface FeedPost {
  id: number
  userId: number
  body: string
  createdAt: string
  updatedAt: string
  user: FeedUser
  likedByMe: boolean
  enteredByMe: boolean
  type: string
  pinnedUntil: string | null
  giveawayTag: string | null
  giveawayTagColor: string | null
  giveawayEndsAt: string | null
  giveawayWinnerId: number | null
  giveawayWinner: { id: number; name: string | null; email: string } | null
  _count: { likes: number; comments: number; giveawayEntries: number }
}

export interface FeedComment {
  id: number
  postId: number
  userId: number
  body: string
  createdAt: string
  user: FeedUser
  likedByMe: boolean
  _count: { likes: number }
}

export interface FeedUserProfile {
  id: number
  name: string | null
  email: string
  tag: string | null
  tagColor: string | null
  role: string
  isFollowing: boolean
  totalLikes: number
  chatBanned: boolean
  chatMutedUntil: string | null
  allTags: Array<{ tag: string; tagColor: string }>
  _count: { followers: number; following: number; posts: number }
}

// ── Parent API ─────────────────────────────────────────────────────────────────

export interface ParentStudentSummary {
  id: number
  name: string | null
  email: string
  gradeLevel: number | null
  graduationYear: number | null
  weightedGpa: number
  unweightedGpa: number
  pendingAssignments: number
  totalCourses: number
  courses: Array<{ name: string; letterGrade: string | null; percentage: number | null }>
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

export interface CollegeListItem {
  id: number
  userId: number
  name: string
  createdAt: string
}

export interface AppNotification {
  id: number
  userId: number
  fromUserId: number
  type: 'FOLLOW' | 'LIKE' | 'COMMENT'
  postId: number | null
  preview: string | null
  read: boolean
  createdAt: string
  sender: FeedUser
}
