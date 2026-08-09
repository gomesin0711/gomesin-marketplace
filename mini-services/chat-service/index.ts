// chat-service — socket.io realtime chat mini-service
// Runs independently on port 3003, shares the main app's SQLite DB.

import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

const PORT = 3003

const db = new PrismaClient({
  datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } },
})

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy uses it to route to this port.
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface MessagePayload {
  id: string
  senderId: string
  receiverId: string
  content: string
  image: string | null
  listingId: string | null
  listingTitle: string | null
  createdAt: string
  sent: boolean
}

io.on('connection', (socket) => {
  console.log(`[chat-service] connect ${socket.id}`)

  // Client authenticates by joining their user room.
  socket.on('user:join', (data: { userId: string }, ack?: (res: any) => void) => {
    const { userId } = data
    if (!userId) {
      ack?.({ ok: false, error: 'userId wajib' })
      return
    }
    socket.data.userId = userId
    socket.join(`user:${userId}`)
    console.log(`[chat-service] user:join ${userId} (socket ${socket.id})`)
    ack?.({ ok: true })
  })

  // Save message to DB + broadcast to both sender (echo) and receiver.
  socket.on(
    'message:send',
    async (
      data: {
        senderId: string
        receiverId: string
        content: string
        image?: string | null
        listingId?: string | null
        listingTitle?: string | null
      },
      ack?: (res: any) => void
    ) => {
      try {
        const { senderId, receiverId, content, image, listingId, listingTitle } = data
        if (!senderId || !receiverId || (!content?.trim() && !image)) {
          ack?.({ ok: false, error: 'senderId, receiverId, content/image wajib' })
          return
        }

        const msg = await db.message.create({
          data: {
            senderId,
            receiverId,
            content: content?.trim() || '',
            image: image || null,
            listingId: listingId || null,
            listingTitle: listingTitle || null,
          },
        })

        const createdAt =
          msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date(msg.createdAt).toISOString()

        const messagePayload: MessagePayload = {
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          content: msg.content,
          image: msg.image || null,
          listingId: msg.listingId,
          listingTitle: msg.listingTitle,
          createdAt,
          sent: true, // from sender's perspective
        }

        // Echo back to sender (other tabs/devices)
        io.to(`user:${senderId}`).emit('message:new', messagePayload)

        // Deliver to receiver (sent: false = incoming)
        io.to(`user:${receiverId}`).emit('message:new', { ...messagePayload, sent: false })

        console.log(
          `[chat-service] message:send ${senderId} -> ${receiverId} (id=${msg.id})`
        )
        ack?.({ ok: true, message: messagePayload })
      } catch (e: any) {
        console.error('[chat-service] message:send error', e?.message)
        ack?.({ ok: false, error: e?.message || 'internal error' })
      }
    }
  )

  // Mark messages from partnerId to userId as read, notify partner.
  socket.on(
    'message:read',
    async (data: { userId: string; partnerId: string }, ack?: (res: any) => void) => {
      try {
        const { userId, partnerId } = data
        if (!userId || !partnerId) {
          ack?.({ ok: false, error: 'userId dan partnerId wajib' })
          return
        }

        const result = await db.message.updateMany({
          where: {
            senderId: partnerId,
            receiverId: userId,
            read: false,
          },
          data: { read: true },
        })

        // Notify the partner that their messages were read.
        io.to(`user:${partnerId}`).emit('message:read-update', { partnerId: userId })

        console.log(
          `[chat-service] message:read userId=${userId} partnerId=${partnerId} updated=${result.count}`
        )
        ack?.({ ok: true, updated: result.count })
      } catch (e: any) {
        console.error('[chat-service] message:read error', e?.message)
        ack?.({ ok: false, error: e?.message })
      }
    }
  )

  socket.on('typing:start', (data: { senderId: string; receiverId: string }) => {
    const { senderId, receiverId } = data
    io.to(`user:${receiverId}`).emit('typing:update', { typerId: senderId, isTyping: true })
  })

  socket.on('typing:stop', (data: { senderId: string; receiverId: string }) => {
    const { senderId, receiverId } = data
    io.to(`user:${receiverId}`).emit('typing:update', { typerId: senderId, isTyping: false })
  })

  socket.on('disconnect', (reason) => {
    const userId = socket.data.userId
    console.log(`[chat-service] disconnect ${socket.id} userId=${userId || 'n/a'} reason=${reason}`)
  })

  socket.on('error', (err) => {
    console.error(`[chat-service] socket error ${socket.id}:`, err)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[chat-service] listening on port ${PORT} (path /)`)
})

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[chat-service] received ${signal}, shutting down...`)
  io.close(() => {
    httpServer.close(() => {
      db.$disconnect()
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
