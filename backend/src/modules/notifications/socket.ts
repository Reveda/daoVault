/**
 * Live notifications over socket.io (owner, 2026-10-19). The API attaches a socket.io server at
 * ${API_PREFIX}/socket.io (same origin as the site, so the existing /api proxy reaches it). A dashboard
 * connects with its sign-in token (the same JWT as the REST API, checked the same way) and joins its own
 * wallet's room; nobody can listen to another wallet. With REDIS_URL the rooms are shared by every API
 * copy (redis adapter) and the worker can emit too (redis emitter). Without Redis (dev, Render) one
 * process does it all.
 */
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Emitter } from "@socket.io/redis-emitter";
import { createClient } from "redis";
import { env } from "../../config/env.js";
import { authService } from "../auth/auth.service.js";

let io: Server | null = null;
let emitter: Emitter | null = null;

const room = (wallet: string) => `w:${wallet.toLowerCase()}`;

/** the API: socket.io server on the HTTP server */
export function initSocketServer(server: HttpServer): Server {
  io = new Server(server, {
    path: `${env.API_PREFIX}/socket.io`,
    serveClient: false,
    // same-origin only: the site and the API share one origin (Render rewrite, Nginx, Vite proxy)
    cors: { origin: false },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  io.use((socket, next) => {
    const token = String((socket.handshake.auth as { token?: unknown })?.token ?? "");
    if (!token) return next(new Error("unauthorized"));
    authService.verifyToken(token).then(
      (claims) => {
        socket.data.wallet = claims.sub;
        next();
      },
      () => next(new Error("unauthorized")),
    );
  });
  io.on("connection", (socket) => {
    void socket.join(room(String(socket.data.wallet)));
  });
  if (env.REDIS_URL) {
    const pub = createClient({ url: env.REDIS_URL });
    const sub = pub.duplicate();
    pub.on("error", (error: Error) => console.error("[socket redis]", error.message));
    sub.on("error", (error: Error) => console.error("[socket redis]", error.message));
    Promise.all([pub.connect(), sub.connect()]).then(
      () => io?.adapter(createAdapter(pub, sub)),
      (error: Error) => console.error("[socket redis] not connected:", error.message),
    );
  }
  return io;
}

/** the worker (no socket server): emits through Redis to whichever API copy holds the member's socket */
export async function initSocketEmitter(): Promise<void> {
  if (!env.REDIS_URL || io) return;
  const client = createClient({ url: env.REDIS_URL });
  client.on("error", (error: Error) => console.error("[socket emitter]", error.message));
  await client.connect();
  emitter = new Emitter(client);
}

export function emitToWallet(wallet: string, event: string, payload: unknown): void {
  if (io) io.to(room(wallet)).emit(event, payload);
  else emitter?.to(room(wallet)).emit(event, payload);
}

export async function closeSocketServer(): Promise<void> {
  await io?.close();
}
