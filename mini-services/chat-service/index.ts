// chat-service — socket.io realtime chat mini-service
// Runs independently on port 3003, shares the main app's SQLite DB.
//
// Also runs a tiny HTTP control server on port 3004 (localhost-only) for
// server-side broadcasts. The Next.js API routes POST to
// http://localhost:3004/internal/broadcast to trigger a fan-out to all
// connected socket.io clients. We use a separate port because socket.io
// with path:"/" intercepts ALL HTTP requests on port 3003 — there's no
// way to expose a plain HTTP endpoint alongside it.

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

// ── Session cookie verification (inlined from src/lib/session.ts) ──────────
// The chat-service is a standalone Bun project — no @/ alias, no Next.js —
// so it can't import the shared `getSessionUserFromCookieHeader`. To keep
// the secret derivation and HMAC verification identical to the main app,
// this is a literal copy of the verification path in src/lib/session.ts.
// Keep these two files in sync if the token format changes.
const SESSION_COOKIE_NAME = 'mesinku_session'

function getSecret(): string {
  const envSecret = process.env.SESSION_SECRET
  if (envSecret && envSecret.length >= 16) return envSecret
  const dbUrl = process.env.DATABASE_URL || 'mesinku-dev-fallback-secret'
  return 'mesinku:' + dbUrl
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

function b64urlDecode(s: string): string | null {
  try {
    return Buffer.from(s, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

type SessionPayload = { id: string; role: string; exp: number }

function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null

  const payloadStr = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)
  const expectedSig = signPayload(payloadStr)

  // Constant-time signature comparison to prevent timing attacks.
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expectedSig, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  const decoded = b64urlDecode(payloadStr)
  if (!decoded) return null
  let payload: SessionPayload
  try {
    payload = JSON.parse(decoded)
  } catch {
    return null
  }
  if (!payload.id || typeof payload.exp !== 'number') return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

/**
 * Verify the session cookie from a raw Cookie header string (as found in
 * `socket.handshake.headers.cookie`). Returns the verified user
 * `{ id, role }`, or null if the cookie is missing/invalid/expired.
 *
 * The client-supplied userId in `user:join` is NEVER trusted — only the
 * HMAC-signed cookie identifies the user. This prevents account-A from
 * joining account-B's `user:B` room and receiving their private messages.
 */
function verifySessionCookie(
  cookieHeader: string | null | undefined
): { id: string; role: string } | null {
  if (!cookieHeader) return null
  let token: string | undefined
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    if (name === SESSION_COOKIE_NAME) {
      token = decodeURIComponent(part.slice(idx + 1).trim())
      break
    }
  }
  if (!token) return null
  const payload = verifySessionToken(token)
  if (!payload) return null
  return { id: payload.id, role: payload.role }
}

const PORT = 3003
const CONTROL_PORT = 3004

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
  // Allow large image payloads (base64 data URLs or image URLs with long
  // captions). Default is 1MB which is too small for payment proof images.
  // 25MB covers even uncompressed screenshots sent as base64.
  maxHttpBufferSize: 25 * 1024 * 1024,
})

// ── Control HTTP server (port 3004) ────────────────────────────────────────
// Tiny HTTP server for server-side broadcasts. The Next.js API routes
// (running in a separate process) POST to this endpoint to trigger a
// fan-out to all connected socket.io clients without going through the
// public Caddy gateway.
//
// Endpoint: POST /internal/broadcast
// Body: { event: string, payload?: any }
// Authorization: none (this port is firewalled to localhost-only).
const controlServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST' && req.url?.startsWith('/internal/broadcast')) {
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      const event = String(body.event || '')
      const payload = body.payload ?? null
      if (!event) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'event wajib' }))
        return
      }
      io.emit(event, payload)
      console.log(`[chat-service] /internal/broadcast event=${event} clients=${io.engine.clientsCount}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, delivered: io.engine.clientsCount }))
    } catch (e: any) {
      console.error('[chat-service] /internal/broadcast error', e?.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: e?.message || 'internal' }))
    }
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), clients: io.engine.clientsCount }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
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
  // The session cookie from the socket.io handshake is verified with HMAC.
  // The client-supplied `data.userId` is IGNORED — only the verified id
  // from the signed cookie is used. This prevents account-A from calling
  // `socket.emit('user:join', { userId: 'B' })` and receiving B's messages.
  socket.on('user:join', (data: { userId?: string }, ack?: (res: any) => void) => {
    const sessionUser = verifySessionCookie(socket.handshake.headers.cookie)
    if (!sessionUser) {
      console.log(
        `[chat-service] user:join REJECTED (no/invalid session) socket=${socket.id}`
      )
      ack?.({ ok: false, error: 'Unauthorized' })
      return
    }
    socket.data.userId = sessionUser.id
    socket.join(`user:${sessionUser.id}`)
    console.log(
      `[chat-service] user:join verified=${sessionUser.id} (socket ${socket.id})`
    )
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
        const verifiedUserId = socket.data.userId
        if (!verifiedUserId) {
          ack?.({ ok: false, error: 'Not authenticated' })
          return
        }
        // Defense-in-depth: reject if the client-supplied senderId does not
        // match the verified session user. We always persist the VERIFIED id.
        if (data.senderId && data.senderId !== verifiedUserId) {
          console.log(
            `[chat-service] message:send FORBIDDEN senderId=${data.senderId} != verified=${verifiedUserId} socket=${socket.id}`
          )
          ack?.({ ok: false, error: 'Forbidden: senderId mismatch', status: 403 })
          return
        }
        const senderId = verifiedUserId
        const { receiverId, content, image, listingId, listingTitle } = data
        if (!receiverId || (!content?.trim() && !image)) {
          ack?.({ ok: false, error: 'receiverId, content/image wajib' })
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
    async (data: { userId?: string; partnerId: string }, ack?: (res: any) => void) => {
      try {
        const verifiedUserId = socket.data.userId
        if (!verifiedUserId) {
          ack?.({ ok: false, error: 'Not authenticated' })
          return
        }
        const userId = verifiedUserId // ignore client-supplied data.userId
        const { partnerId } = data
        if (!partnerId) {
          ack?.({ ok: false, error: 'partnerId wajib' })
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
    const verifiedUserId = socket.data.userId
    if (!verifiedUserId) return
    if (data.senderId !== verifiedUserId) return // reject spoofed senderId
    io.to(`user:${data.receiverId}`).emit('typing:update', { typerId: verifiedUserId, isTyping: true })
  })

  socket.on('typing:stop', (data: { senderId: string; receiverId: string }) => {
    const verifiedUserId = socket.data.userId
    if (!verifiedUserId) return
    if (data.senderId !== verifiedUserId) return // reject spoofed senderId
    io.to(`user:${data.receiverId}`).emit('typing:update', { typerId: verifiedUserId, isTyping: false })
  })

  // ── In-app call signaling ──────────────────────────────────────────────
  // Voice/video calls between mesinKU users — NO phone numbers, purely
  // in-app. WebRTC handles the peer-to-peer media; socket.io only relays
  // the signaling (request, accept, reject, end, SDP/ICE).
  socket.on(
    'call:request',
    (data: {
      from: string
      fromName: string
      fromImage: string | null
      to: string
      type: 'voice' | 'video'
      callId: string
    }) => {
      const verifiedUserId = socket.data.userId
      if (!verifiedUserId) return
      const { fromName, fromImage, to, type, callId } = data
      if (!data.from || !to || !callId) return
      if (data.from !== verifiedUserId) return // reject spoofed `from`
      io.to(`user:${to}`).emit('call:incoming', { from: verifiedUserId, fromName, fromImage, to, type, callId })
      console.log(`[chat-service] call:request ${verifiedUserId} -> ${to} type=${type} callId=${callId}`)
    }
  )

  socket.on('call:accept', (data: { from: string; to: string; callId: string }) => {
    const verifiedUserId = socket.data.userId
    if (!verifiedUserId) return
    const { to, callId } = data
    if (!data.from || !to || !callId) return
    if (data.from !== verifiedUserId) return // reject spoofed `from`
    io.to(`user:${to}`).emit('call:accepted', { from: verifiedUserId, callId })
    console.log(`[chat-service] call:accept ${verifiedUserId} -> ${to} callId=${callId}`)
  })

  socket.on('call:reject', (data: { from: string; to: string; callId: string }) => {
    const verifiedUserId = socket.data.userId
    if (!verifiedUserId) return
    const { to, callId } = data
    if (!data.from || !to || !callId) return
    if (data.from !== verifiedUserId) return // reject spoofed `from`
    io.to(`user:${to}`).emit('call:rejected', { from: verifiedUserId, callId })
    console.log(`[chat-service] call:reject ${verifiedUserId} -> ${to} callId=${callId}`)
  })

  socket.on('call:end', (data: { from: string; to: string; callId: string }) => {
    const verifiedUserId = socket.data.userId
    if (!verifiedUserId) return
    const { to, callId } = data
    if (!data.from || !to || !callId) return
    if (data.from !== verifiedUserId) return // reject spoofed `from`
    io.to(`user:${to}`).emit('call:ended', { from: verifiedUserId, callId })
    console.log(`[chat-service] call:end ${verifiedUserId} -> ${to} callId=${callId}`)
  })

  // WebRTC signaling relay — SDP offer/answer + ICE candidates.
  // The payload is opaque to the server; it just forwards it.
  socket.on(
    'call:signal',
    (data: { from: string; to: string; callId: string; signal: any }) => {
      const verifiedUserId = socket.data.userId
      if (!verifiedUserId) return
      const { to, callId, signal } = data
      if (!data.from || !to || !callId) return
      if (data.from !== verifiedUserId) return // reject spoofed `from`
      io.to(`user:${to}`).emit('call:signal', { from: verifiedUserId, callId, signal })
    }
  )

  // Listings broadcast — admin emits this when a listing is deleted/published/
  // updated. The chat-service fans it out to ALL connected clients so that any
  // open homepage (Beranda) refetches its listing queries in realtime.
  socket.on(
    'listings:broadcast',
    (data: { kind?: 'invalidate' }, ack?: (res: any) => void) => {
      const kind = data?.kind || 'invalidate'
      io.emit('listings:invalidate', { kind })
      console.log(`[chat-service] listings:broadcast kind=${kind} (from ${socket.id})`)
      ack?.({ ok: true })
    }
  )

  // Client-side fallback for listing:new — when a client (e.g. the admin's
  // browser that just clicked "Publikasi") wants to announce a freshly
  // published listing to ALL other clients. The HTTP /internal/broadcast
  // endpoint is the primary path (called server-side by the Next.js API),
  // but this socket handler is kept as a redundancy for cases where the
  // server-side call fails (e.g. chat-service was unreachable when the API
  // ran, but the admin's socket is still up).
  socket.on('listing:broadcast-new', (data: any, ack?: (res: any) => void) => {
    io.emit('listing:new', data)
    console.log(`[chat-service] listing:broadcast-new (from ${socket.id})`)
    ack?.({ ok: true })
  })

  socket.on('listing:broadcast-pending', (data: any, ack?: (res: any) => void) => {
    io.emit('listing:pending', data)
    console.log(`[chat-service] listing:broadcast-pending (from ${socket.id})`)
    ack?.({ ok: true })
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

controlServer.listen(CONTROL_PORT, '127.0.0.1', () => {
  console.log(`[chat-service] control HTTP server listening on port ${CONTROL_PORT} (localhost-only)`)
})

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[chat-service] received ${signal}, shutting down...`)
  io.close(() => {
    httpServer.close(() => {
      controlServer.close(() => {
        db.$disconnect()
        process.exit(0)
      })
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
