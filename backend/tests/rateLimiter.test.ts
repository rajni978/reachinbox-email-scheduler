import { RateLimiterService } from '../src/services/rateLimiter';
import { redisClient } from '../src/db/redis';

describe('RateLimiterService (Atomic Redis Lua)', () => {
  const testSenderId = `test_sender_${Date.now()}`;

  afterAll(async () => {
    // Clean up test keys
    await redisClient.del(`ratelimit:sender:${testSenderId}:zset`);
    await redisClient.del(`ratelimit:sender:${testSenderId}:last_sent`);
    await redisClient.quit();
  });

  it('should allow sending when under hourly limit and min delay', async () => {
    const result = await RateLimiterService.checkAndReserve(
      testSenderId,
      5, // limit 5
      0, // min delay 0ms for this test
      'job_1'
    );

    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toBe(1);
    expect(result.limit).toBe(5);
  });

  it('should enforce hourly limit when exceeded', async () => {
    // Fill quota up to 5
    for (let i = 2; i <= 5; i++) {
      await RateLimiterService.checkAndReserve(testSenderId, 5, 0, `job_${i}`);
    }

    // 6th job should be rejected and return reschedule delay
    const sixth = await RateLimiterService.checkAndReserve(testSenderId, 5, 0, 'job_6');
    expect(sixth.allowed).toBe(false);
    expect(sixth.rescheduleDelayMs).toBeGreaterThan(0);
  });

  it('should accurately report current hourly usage', async () => {
    const usage = await RateLimiterService.getCurrentHourlyUsage(testSenderId);
    expect(usage).toBe(5);
  });
});
