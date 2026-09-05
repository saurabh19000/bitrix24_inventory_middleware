import { env } from './env';

export const bitrixConfig = {
  defaultTimeout: env.BITRIX_REQUEST_TIMEOUT,
  concurrency: env.BITRIX_CONCURRENCY,
  maxRetries: env.BITRIX_MAX_RETRIES,
  batchSize: env.BATCH_SIZE,
};