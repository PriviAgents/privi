import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Minimal JSON key-value store. Upstash Redis in production (env injected by
 * the Vercel Marketplace integration); an in-process Map locally so `next dev`
 * works with no setup. Serverless instances don't share memory, so production
 * must have Redis configured — `kvMode()` lets the app report which is active.
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic increment; sets the TTL when the key is created. */
  incr(key: string, ttlSec: number): Promise<number>;
  /** Set only if absent (atomic). Returns true when this call created the key. */
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  /** Atomic add of an integer amount; sets the TTL when the key is created. */
  incrBy(key: string, by: number, ttlSec: number): Promise<number>;
  /**
   * Take one of `max` concurrent slots under `key` (atomic). Slots expire after
   * `ttlSec` so a crashed holder can't leak one. Returns false when all are taken.
   */
  slotAcquire(key: string, member: string, max: number, ttlSec: number): Promise<boolean>;
  slotRelease(key: string, member: string): Promise<void>;
  /** Prepend to a list and keep only the newest `max` entries. */
  listPush(key: string, value: unknown, max: number): Promise<void>;
  listRange<T>(key: string, count: number): Promise<T[]>;
  /** Count keys matching a glob pattern (SCAN; fine for admin use). */
  countKeys(pattern: string): Promise<number>;
}

// Prune expired holders, then add this one if there's room. One round trip.
const SLOT_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[3]) * 1000)
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[2]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 1000)
  return 1
end
return 0`;

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

class UpstashKV implements KV {
  private r = new Redis({ url: url!, token: token! });
  async get<T>(key: string) {
    return (await this.r.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    if (ttlSec) await this.r.set(key, value, { ex: ttlSec });
    else await this.r.set(key, value);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string, ttlSec: number) {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.expire(key, ttlSec);
    return n;
  }
  async setNx(key: string, value: string, ttlSec: number) {
    return (await this.r.set(key, value, { nx: true, ex: ttlSec })) === "OK";
  }
  async incrBy(key: string, by: number, ttlSec: number) {
    const n = await this.r.incrby(key, Math.round(by));
    if (n === Math.round(by)) await this.r.expire(key, ttlSec);
    return n;
  }
  async slotAcquire(key: string, member: string, max: number, ttlSec: number) {
    const r = await this.r.eval(SLOT_LUA, [key], [String(Date.now()), String(max), String(ttlSec), member]);
    return Number(r) === 1;
  }
  async slotRelease(key: string, member: string) {
    await this.r.zrem(key, member);
  }  async listPush(key: string, value: unknown, max: number) {
    await this.r.lpush(key, JSON.stringify(value));
    await this.r.ltrim(key, 0, max - 1);
  }
  async listRange<T>(key: string, count: number) {
    const raw = await this.r.lrange<unknown>(key, 0, count - 1);
    return raw.map((x) => (typeof x === "string" ? (JSON.parse(x) as T) : (x as T)));
  }
  async countKeys(pattern: string) {
    let cursor: string | number = 0;
    let n = 0;
    do {
      const [next, keys]: [string | number, string[]] = await this.r.scan(cursor, { match: pattern, count: 500 });
      n += keys.length;
      cursor = next;
    } while (String(cursor) !== "0");
    return n;
  }

}

class MemoryKV implements KV {
  private m: Map<string, { v: string; exp?: number }>;
  constructor() {
    const g = globalThis as unknown as { __priviKV?: Map<string, { v: string; exp?: number }> };
    this.m = g.__priviKV ??= new Map(); // survives dev HMR
  }
  private live(key: string) {
    const e = this.m.get(key);
    if (e?.exp && e.exp < Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async get<T>(key: string) {
    const e = this.live(key);
    return e ? (JSON.parse(e.v) as T) : null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.m.set(key, { v: JSON.stringify(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
  }
  async del(key: string) {
    this.m.delete(key);
  }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(JSON.parse(e.v)) : 0) + 1;
    this.m.set(key, { v: JSON.stringify(n), exp: e?.exp ?? Date.now() + ttlSec * 1000 });
    return n;
  }
  async setNx(key: string, value: string, ttlSec: number) {
    if (this.live(key)) return false;
    this.m.set(key, { v: JSON.stringify(value), exp: Date.now() + ttlSec * 1000 });
    return true;
  }
  async incrBy(key: string, by: number, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(JSON.parse(e.v)) : 0) + Math.round(by);
    this.m.set(key, { v: JSON.stringify(n), exp: e?.exp ?? Date.now() + ttlSec * 1000 });
    return n;
  }
  private slots = new Map<string, Map<string, number>>();
  async slotAcquire(key: string, member: string, max: number, ttlSec: number) {
    const now = Date.now();
    const m = this.slots.get(key) ?? new Map<string, number>();
    for (const [k, at] of m) if (at < now - ttlSec * 1000) m.delete(k);
    if (m.size >= max) return false;
    m.set(member, now);
    this.slots.set(key, m);
    return true;
  }
  async slotRelease(key: string, member: string) {
    this.slots.get(key)?.delete(member);
  }  private lists = new Map<string, unknown[]>();
  async listPush(key: string, value: unknown, max: number) {
    const l = this.lists.get(key) ?? [];
    l.unshift(value);
    this.lists.set(key, l.slice(0, max));
  }
  async listRange<T>(key: string, count: number) {
    return (this.lists.get(key) ?? []).slice(0, count) as T[];
  }
  async countKeys(pattern: string) {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return [...this.m.keys()].filter((k) => re.test(k) && this.live(k)).length;
  }

}

export const kv: KV = url && token ? new UpstashKV() : new MemoryKV();
export const kvMode = (): "redis" | "memory" => (url && token ? "redis" : "memory");

/**
 * Fixed-window rate limit. Returns whether the call is allowed and when the
 * window resets. Fails open if the store errors, so an outage never locks
 * everyone out.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  try {
    const n = await kv.incr(`rl:${key}:${bucket}`, windowSec + 5);
    return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSec: (bucket + 1) * windowSec - Math.floor(Date.now() / 1000) };
  } catch {
    return { ok: true, remaining: limit, resetSec: windowSec };
  }
}

/**
 * Run `fn` while holding a named lock, waiting up to `waitMs` for it. The lock
 * expires after `ttlSec` so a crashed holder never blocks forever; keep `fn`
 * well inside that.
 */
export async function withLock<T>(name: string, fn: () => Promise<T>, ttlSec = 90, waitMs = 30_000): Promise<T> {
  const key = `lock:${name}`;
  const token = `${Date.now()}-${Math.random()}`;
  const deadline = Date.now() + waitMs;
  while (!(await kv.setNx(key, token, ttlSec))) {
    if (Date.now() > deadline) throw new Error(`Busy: ${name} is locked; try again shortly.`);
    await new Promise((r) => setTimeout(r, 400));
  }
  try {
    return await fn();
  } finally {
    // Only release our own lock (it may have expired and been re-taken).
    if ((await kv.get<string>(key)) === token) await kv.del(key);
  }
}

/** Like withLock, but returns `busy` immediately instead of waiting. */
export async function tryLock<T>(name: string, fn: () => Promise<T>, ttlSec = 90): Promise<{ busy: true } | { busy: false; value: T }> {
  const key = `lock:${name}`;
  const token = `${Date.now()}-${Math.random()}`;
  if (!(await kv.setNx(key, token, ttlSec))) return { busy: true };
  try {
    return { busy: false, value: await fn() };
  } finally {
    if ((await kv.get<string>(key)) === token) await kv.del(key);
  }
}
