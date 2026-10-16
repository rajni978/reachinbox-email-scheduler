import { redisClient } from '../db/redis';
import { config } from '../config';

export interface RateLimitResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  rescheduleDelayMs: number;
  reservationId: string;
}

// Lua script for atomic sliding window rate check, reservation, and minimum delay enforcement
// KEYS[1]: zset key (ratelimit:sender:{senderId}:zset)
// KEYS[2]: last sent timestamp key (ratelimit:sender:{senderId}:last_sent)
// ARGV[1]: current timestamp in ms (now)
// ARGV[2]: window size in ms (3600000 for 1 hour)
// ARGV[3]: hourly limit (e.g. 100)
// ARGV[4]: minimum delay between sends in ms (e.g. 2000)
// ARGV[5]: unique reservation ID (e.g. jobId)
const ATOMIC_RATE_LIMIT_LUA = `
local zset_key = KEYS[1]
local last_sent_key = KEYS[2]

local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_limit = tonumber(ARGV[3])
local min_delay = tonumber(ARGV[4])
local reservation_id = ARGV[5]

-- 1. Check minimum delay between individual email sends
local last_sent = tonumber(redis.call('GET', last_sent_key) or 0)
local time_since_last_sent = now - last_sent
if time_since_last_sent < min_delay then
  local wait_for_min_delay = min_delay - time_since_last_sent
  return { 0, -1, wait_for_min_delay, "MIN_DELAY_EXCEEDED" }
end

-- 2. Clean up entries outside the 1-hour window
local window_start = now - window_ms
redis.call('ZREMRANGEBYSCORE', zset_key, 0, window_start)

-- 3. Check current count in window
local current_count = redis.call('ZCARD', zset_key)

if current_count >= max_limit then
  -- Find oldest message timestamp to calculate next window slot
  local oldest = redis.call('ZRANGE', zset_key, 0, 0, 'WITHSCORES')
  local wait_ms = 60000 -- default 1 minute fallback
  if #oldest >= 2 then
    local oldest_time = tonumber(oldest[2])
    wait_ms = math.max(1000, (oldest_time + window_ms) - now + 1000)
  end
  return { 0, current_count, wait_ms, "HOURLY_LIMIT_EXCEEDED" }
end

-- 4. Reserve slot atomically
redis.call('ZADD', zset_key, now, reservation_id)
redis.call('SET', last_sent_key, now, 'PX', window_ms)
redis.call('EXPIRE', zset_key, math.ceil(window_ms / 1000) * 2)

return { 1, current_count + 1, 0, "OK" }
`;

export class RateLimiterService {
  private static WINDOW_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Atomically checks and reserves a send slot for a sender
   */
  static async checkAndReserve(
    senderId: string,
    customHourlyLimit?: number,
    customMinDelayMs?: number,
    jobId?: string
  ): Promise<RateLimitResult> {
    const limit = Math.min(
      customHourlyLimit ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER,
      10000 // Global safety maximum
    );
    const minDelay = customMinDelayMs ?? config.MIN_DELAY_BETWEEN_EMAILS_MS;
    const now = Date.now();
    const reservationId = jobId ? `${jobId}:${now}` : `${now}:${Math.random().toString(36).substring(7)}`;

    const zsetKey = `ratelimit:sender:${senderId}:zset`;
    const lastSentKey = `ratelimit:sender:${senderId}:last_sent`;

    try {
      const rawResult = (await redisClient.eval(
        ATOMIC_RATE_LIMIT_LUA,
        2,
        zsetKey,
        lastSentKey,
        now.toString(),
        this.WINDOW_MS.toString(),
        limit.toString(),
        minDelay.toString(),
        reservationId
      )) as [number, number, number, string];

      const [allowedNum, currentUsage, rescheduleDelayMs, reason] = rawResult;
      const allowed = allowedNum === 1;

      return {
        allowed,
        currentUsage: Math.max(0, currentUsage),
        limit,
        rescheduleDelayMs: allowed ? 0 : rescheduleDelayMs,
        reservationId: allowed ? reservationId : '',
      };
    } catch (error) {
      console.error('[RateLimiter] Error running atomic rate limit script:', error);
      // Fail closed with a short backoff rather than violating quotas
      return {
        allowed: false,
        currentUsage: 0,
        limit,
        rescheduleDelayMs: 5000,
        reservationId: '',
      };
    }
  }

  /**
   * Releases a reservation if the send failed prior to SMTP acceptance,
   * so unconsumed attempts do not count against the sender's quota.
   */
  static async releaseReservation(senderId: string, reservationId: string): Promise<void> {
    if (!reservationId) return;
    try {
      const zsetKey = `ratelimit:sender:${senderId}:zset`;
      await redisClient.zrem(zsetKey, reservationId);
    } catch (err) {
      console.error(`[RateLimiter] Error releasing reservation for ${senderId}:`, err);
    }
  }

  /**
   * Get current usage count in the last hour for a sender
   */
  static async getCurrentHourlyUsage(senderId: string): Promise<number> {
    try {
      const zsetKey = `ratelimit:sender:${senderId}:zset`;
      const now = Date.now();
      const windowStart = now - this.WINDOW_MS;
      await redisClient.zremrangebyscore(zsetKey, 0, windowStart);
      return await redisClient.zcard(zsetKey);
    } catch (err) {
      console.error(`[RateLimiter] Error getting usage for ${senderId}:`, err);
      return 0;
    }
  }
}
