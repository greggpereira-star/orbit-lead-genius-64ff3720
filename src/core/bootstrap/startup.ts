import { runInfrastructureCheck } from '../runtime/health-checker';
import { logger } from '../observability/logger';

export const initializeApplication = async () => {
  const traceId = Math.random().toString(36).substring(2, 15);
  logger.info('Application Bootstrap: Initiating', { traceId });

  try {
    const health = await runInfrastructureCheck();
    if (health.status === 'unhealthy') {
      logger.error('Application Bootstrap: Infrastructure Failure', { traceId, health });
      return { success: false, health };
    }

    logger.info('Application Bootstrap: Success', { traceId });
    return { success: true, health };
  } catch (error: any) {
    logger.error('Application Bootstrap: Fatal Error', { traceId, error: error.message });
    return { success: false, error: error.message };
  }
};
