import { WebSocket } from 'ws'

// All connected clients (for broadcast)
export const clients = new Set<WebSocket>()

// userId → set of connections (for targeted delivery)
export const userClients = new Map<number, Set<WebSocket>>()

export const broadcast = (event: string, data: unknown) => {
  const message = JSON.stringify({ event, data })
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message)
  })
}

export const sendToUser = (userId: number, event: string, data: unknown) => {
  const connections = userClients.get(userId)
  if (!connections) return
  const message = JSON.stringify({ event, data })
  connections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message)
  })
}
