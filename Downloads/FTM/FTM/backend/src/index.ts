import app from './app'
import { logger } from './common/logger'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import jwt from 'jsonwebtoken'

const PORT = Number(process.env.PORT ?? '3001')
const JWT_SECRET = process.env.JWT_SECRET ?? 'nextstep-dev-secret-change-in-production'

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// All connected clients (for broadcast)
const clients = new Set<WebSocket>()

// userId → set of connections (for targeted delivery)
const userClients = new Map<number, Set<WebSocket>>()

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

// Broadcast to all connected clients
export const broadcast = (event: string, data: unknown) => {
  const message = JSON.stringify({ event, data })
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message)
  })
}

// Send to a specific user's WebSocket connections
export const sendToUser = (userId: number, event: string, data: unknown) => {
  const connections = userClients.get(userId)
  if (!connections) return
  const message = JSON.stringify({ event, data })
  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message)
  })
}

server.listen(PORT, '0.0.0.0', () => {
  logger.info('NextStep API started', {
    port: PORT,
    url: `http://0.0.0.0:${PORT}`,
  })
})
