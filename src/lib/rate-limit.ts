/**
 * Rate limiting abstraction for authentication endpoints.
 *
 * Backed by Redis (sliding window via sorted sets) when REDIS_URL is
 * configured — this is required for correctness once the app runs across
 * more than one server instance. When REDIS_URL is not set (e.g. local
 * development), we fall back to a real in-process limiter rather than a
 * no-op — requests are genuinely counted and blocked, it just isn't shared
 * across instances/restarts. A warning is logged once so this limitation is
 * never silent.
 */

import { createHash } from 'crypto';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
}

export interface RateLimitOptions {
  /** Logical bucket name, e.g. "login", "signup". */
  bucket: string;
  /** Identifier to limit on — usually IP, optionally combined with email. */
  identifier: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSec: number;
}

let warnedNoRedis = false;
let redisClientPromise: Promise<import('ioredis').Redis | null> | null = null;

async function getRedis(): Promise<import('ioredis').Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!redisClientPromise) {
    redisClientPromise = import('ioredis')
      .then(({ default: Redis }) => {
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          retryStrategy: () => null, // never block the request path retrying
        });
        client.on('error', (err) => {
          console.error('[rate-limit] Redis error, falling back to allow-and-log:', err.message);
        });
        return client.connect().then(() => client).catch((err) => {
          console.error('[rate-limit] Redis connection failed, using in-memory fallback:', err.message);
          return null;
        });
      })
      .catch(() => null);
  }
  return redisClientPromise;
}

// --- In-memory fallback (per-process, best-effort) --------------------------

interface Bucket {
  timestamps: number[];
}
const memoryStore = new Map<string, Bucket>();

function checkInMemory(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const bucket = memoryStore.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]!;
    memoryStore.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      limit,
    };
  }

  bucket.timestamps.push(now);
  memoryStore.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterSec: 0, limit };
}

// Periodically prune the in-memory store so it can't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, bucket] of memoryStore.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) memoryStore.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

// --- Redis-backed sliding window (sorted set) --------------------------------

async function checkInRedis(
  client: import('ioredis').Redis,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  const pipeline = client.multi();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, windowSec);
  const results = await pipeline.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;

  if (count > limit) {
    // Over the limit — remove the entry we just added so it doesn't count
    // toward a future, correctly-sized window.
    await client.zrem(key, member);
    const oldest = await client.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTs = oldest[1] ? Number(oldest[1]) : now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000)),
      limit,
    };
  }

  return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0, limit };
}

/** Hash the identifier so raw IPs/emails never end up as literal Redis/memory keys. */
function keyFor(bucket: string, identifier: string): string {
  const hash = createHash('sha256').update(identifier).digest('hex').slice(0, 32);
  return `ratelimit:${bucket}:${hash}`;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const key = keyFor(options.bucket, options.identifier);
  const redis = await getRedis();

  if (redis) {
    try {
      return await checkInRedis(redis, key, options.limit, options.windowSec);
    } catch (err) {
      console.error('[rate-limit] Redis check failed, falling back to in-memory:', err);
      return checkInMemory(key, options.limit, options.windowSec);
    }
  }

  if (!warnedNoRedis) {
    warnedNoRedis = true;
    console.warn(
      '[rate-limit] REDIS_URL not configured — using a per-instance in-memory limiter. ' +
        'This is real but not shared across instances or restarts. Set REDIS_URL for production.'
    );
  }
  return checkInMemory(key, options.limit, options.windowSec);
}

/** Extracts a best-effort client identifier from a request for rate limiting. */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]!.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again shortly.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
