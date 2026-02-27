import { getOfflineQueue, setOfflineQueue, incrementTodayCount } from '../services/storageService';
import api from '../services/api';

const MAX_RETRIES = 3;

export async function flushOfflineQueue(): Promise<{ succeeded: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      await api.post('/api/verification/check-in', { verification_code: item.verificationCode });
      succeeded++;
      await incrementTodayCount();
    } catch {
      item.retryCount++;
      if (item.retryCount < MAX_RETRIES) {
        remaining.push(item);
      } else {
        failed++;
      }
    }
  }

  await setOfflineQueue(remaining);
  return { succeeded, failed };
}
