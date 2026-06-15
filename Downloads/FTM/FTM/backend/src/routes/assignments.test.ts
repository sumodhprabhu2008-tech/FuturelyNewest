import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

// Uses the live dev.db with seeded data. Run `npm run db:seed` before this suite.
// A dedicated test DB is out of scope for the prototype.

const TEST_EMAIL = 'test@nextstep.com'
const TEST_PASSWORD = 'nextstep123'

let authToken: string
let firstAssignmentId: number

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD })

  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): run npm run db:seed first`)
  }

  authToken = res.body.data.token as string

  const first = await prisma.assignment.findFirst({ orderBy: { dueDate: 'asc' } })
  if (!first) throw new Error('No assignments found: run npm run db:seed first')
  firstAssignmentId = first.id

  // Reset the first assignment to incomplete before each run
  await prisma.assignment.update({
    where: { id: firstAssignmentId },
    data: { completed: false, completedAt: null },
  })
})

afterAll(() => prisma.$disconnect())

describe('GET /assignments', () => {
  it('returns 200 with all 8 seeded assignments', async () => {
    const res = await request(app)
      .get('/assignments')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(8)
    expect(res.body.meta).toMatchObject({ hasNextPage: false, count: 8 })
  })

  it('returns only incomplete assignments when status=incomplete', async () => {
    const res = await request(app)
      .get('/assignments?status=incomplete')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    const items = res.body.data as Array<{ completed: boolean }>
    expect(items.every(a => !a.completed)).toBe(true)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/assignments')
    expect(res.status).toBe(401)
  })

  it('returns 422 for an invalid status value', async () => {
    const res = await request(app)
      .get('/assignments?status=invalid')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('respects the limit query param', async () => {
    const res = await request(app)
      .get('/assignments?limit=3')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(3)
    expect(res.body.meta.hasNextPage).toBe(true)
    expect(res.body.meta.nextCursor).toBeTruthy()
  })
})

describe('PATCH /assignments/:id/complete', () => {
  it('marks an assignment complete', async () => {
    const res = await request(app)
      .patch(`/assignments/${firstAssignmentId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ completed: true })

    expect(res.status).toBe(200)
    expect(res.body.data.completed).toBe(true)
    expect(res.body.data.completedAt).not.toBeNull()
  })

  it('marks the same assignment incomplete again', async () => {
    const res = await request(app)
      .patch(`/assignments/${firstAssignmentId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ completed: false })

    expect(res.status).toBe(200)
    expect(res.body.data.completed).toBe(false)
    expect(res.body.data.completedAt).toBeNull()
  })

  it('returns 404 for a non-existent assignment id', async () => {
    const res = await request(app)
      .patch('/assignments/999999/complete')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ completed: true })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 422 when body is missing', async () => {
    const res = await request(app)
      .patch(`/assignments/${firstAssignmentId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 422 when completed is not a boolean', async () => {
    const res = await request(app)
      .patch(`/assignments/${firstAssignmentId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ completed: 'yes' })

    expect(res.status).toBe(422)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .patch(`/assignments/${firstAssignmentId}/complete`)
      .send({ completed: true })

    expect(res.status).toBe(401)
  })
})
