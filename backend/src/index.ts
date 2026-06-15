import app from './app'
import { logger } from './common/logger'
import { WebSocketServer } from 'ws'
import http from 'http'
import jwt from 'jsonwebtoken'
import { clients, userClients } from './lib/websocket'

const PORT = Number(process.env.PORT ?? '3001')
const JWT_SECRET = process.env.JWT_SECRET ?? 'nextstep-dev-secret-change-in-production'

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  clients.add(ws)
  let authedUserId: number | null = null

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; token?: string }
      if (msg.type === 'AUTH' && msg.token) {
        const payload = jwt.verify(msg.token, JWT_SECRET) as { sub?: string | number }
        const userId = typeof payload.sub === 'number' ? payload.sub : parseInt(String(payload.sub ?? ''), 10)
        if (!isNaN(userId)) {
          authedUserId = userId
          if (!userClients.has(userId)) userClients.set(userId, new Set())
          userClients.get(userId)!.add(ws)
          ws.send(JSON.stringify({ event: 'AUTH_OK', data: { userId } }))
        }
      }
    } catch {
      // ignore malformed messages
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    if (authedUserId !== null) {
      const set = userClients.get(authedUserId)
      set?.delete(ws)
      if (set?.size === 0) userClients.delete(authedUserId)
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  logger.info('NextStep API started', {
    port: PORT,
    url: `http://0.0.0.0:${PORT}`,
  })
})
