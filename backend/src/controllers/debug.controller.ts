import { Response, NextFunction, Request } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { debugLog } from '../services/debug/debugLog.service';

export class DebugController {
  async listLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { level, source, search, page = 1, limit = 100 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (level && level !== 'ALL') where.level = String(level);
      if (source && source !== 'ALL') where.source = String(source);
      if (search) {
        where.message = { contains: String(search), mode: 'insensitive' };
      }

      const [logs, total] = await Promise.all([
        prisma.debugLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: Math.min(Number(limit), 500),
        }),
        prisma.debugLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: logs,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const [groupedByLevel, groupedBySource, total, errorsLast24h] = await Promise.all([
        prisma.debugLog.groupBy({
          by: ['level'],
          _count: { id: true },
        }),
        prisma.debugLog.groupBy({
          by: ['source'],
          _count: { id: true },
        }),
        prisma.debugLog.count(),
        prisma.debugLog.count({
          where: {
            level: { in: ['WARN', 'ERROR'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      const levelCounts: Record<string, number> = {};
      groupedByLevel.forEach(g => { levelCounts[g.level] = g._count.id; });

      const sourceCounts: Record<string, number> = {};
      groupedBySource.forEach(g => { sourceCounts[g.source] = g._count.id; });

      res.json({
        success: true,
        data: { total, levelCounts, sourceCounts, errorsLast24h },
      });
    } catch (error) {
      next(error);
    }
  }

  async clearLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await prisma.debugLog.deleteMany({});
      debugLog.info('SYSTEM', `Debug logs cleared (${deleted.count} rows)`);
      res.json({ success: true, data: { deleted: deleted.count } });
    } catch (error) {
      next(error);
    }
  }
}

export const debugController = new DebugController();