import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';

const redisOptions: RedisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

export const redisClient = new Redis(redisOptions);

redisClient.on('connect', () => {
  console.log(`[Redis] Connected to redis://${config.REDIS_HOST}:${config.REDIS_PORT}`);
});

redisClient.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

export function createRedisInstance(): Redis {
  return new Redis(redisOptions);
}
