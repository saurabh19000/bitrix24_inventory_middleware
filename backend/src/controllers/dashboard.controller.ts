import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

export class DashboardController {
  async getStats(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const [totalImports, totalRecords, successfulRecords, failedRecords, skippedRecords, bitrixConfig, recentImports] =
        await Promise.all([
          prisma.importJob.count(),
          prisma.importRecord.count(),
          prisma.importRecord.count({ where: { status: 'SUCCESS' } }),
          prisma.importRecord.count({ where: { status: 'FAILED' } }),
          prisma.importRecord.count({ where: { status: 'SKIPPED' } }),
          prisma.bitrixConfiguration.findFirst({ where: { isActive: true } }),
          prisma.importJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { createdBy: { select: { email: true } } },
          }),
        ]);

      res.json({
        success: true,
        data: {
          totalImports,
          totalRecords,
          successfulRecords,
          failedRecords,
          skippedRecords,
          bitrixConnection: {
            status: bitrixConfig?.connectionStatus || 'UNKNOWN',
            configured: !!bitrixConfig,
            lastTestedAt: bitrixConfig?.lastTestedAt || null,
          },
          recentImports,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Dashboard stats failed');
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
