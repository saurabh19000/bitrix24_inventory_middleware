import IORedis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    if (times > 10) {
      logger.error('Redis: max retry attempts reached');
      return null;
    }
    return Math.min(times * 200, 5000);
  },
});

redisConnection.on('connect', () => {
  logger.info('Redis connected');
});

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

export async function connectRedis(): Promise<void> {
  try {
    await redisConnection.ping();
    logger.info('Redis connection verified');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to Redis');
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redisConnection.quit();
    logger.info('Redis disconnected');
  } catch (error) {
    logger.error({ err: error }, 'Failed to disconnect Redis');
  }
}