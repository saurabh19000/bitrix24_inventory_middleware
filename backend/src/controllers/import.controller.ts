import { Response, NextFunction, Request } from 'express';
import { prisma } from '../config/database';
import { excelService } from '../services/excel/excel.service';
import { excelValidator } from '../services/excel/excel.validator';
import { mappingService } from '../services/excel/mapping.service';
import { importQueue } from '../queues/import.queue';
import { AuthenticatedRequest, ExcelRow } from '../types';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { debugLog } from '../services/debug/debugLog.service';
import path from 'path';
import fs from 'fs';

export class ImportController {
  async upload(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;

      if (!file) {
        throw new AppError('No file uploaded', 400);
      }

      // Record the file path for the job
      res.status(201).json({
        success: true,
        data: {
          fileId: file.filename,
          fileName: file.originalname,
          fileSize: file.size,
          filePath: file.path,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async preview(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { filePath, fileName } = req.body;

      if (!filePath || !fileName) {
        throw new AppError('filePath and fileName are required', 400);
      }

      // Security: ensure the file path is within uploads dir
      const uploadDir = path.resolve(__dirname, '../../uploads');
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(uploadDir)) {
        throw new AppError('Invalid file path', 400);
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new AppError('File not found or expired', 404);
      }

      const fileSize = fs.statSync(resolvedPath).size;
      const data = await excelService.parseFile(resolvedPath, fileName, fileSize);

      // Return preview data (first 50 rows)
      res.json({
        success: true,
        data: {
          ...data,
          rows: data.rows.slice(0, 50),
          totalRows: data.totalRows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createImportJob(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        filePath,
        fileName,
        fileSize,
        mapping,
        importMode,
        type,
      } = req.body;

      const importType = type === 'INVOICES' ? 'INVOICES' : 'PRODUCTS';

      if (!filePath || !fileName) {
        throw new AppError('filePath and fileName are required', 400);
      }

      const uploadDir = path.resolve(__dirname, '../../uploads');
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(uploadDir)) {
        throw new AppError('Invalid file path', 400);
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new AppError('File not found or expired', 404);
      }

      if (importType === 'PRODUCTS' && (!mapping || !mapping.skuField)) {
        throw new AppError('A SKU field mapping is required', 400);
      }

      if (importType === 'INVOICES' && (!mapping || !mapping.accountNumberField)) {
        throw new AppError('An Invoice Number field mapping is required', 400);
      }

      const fileStat = fs.statSync(resolvedPath);
      const parsed = await excelService.parseFile(resolvedPath, fileName, fileStat.size);

      // Validate all rows
      const validation = importType === 'INVOICES'
        ? excelValidator.validateInvoice(parsed.rows, mapping)
        : excelValidator.validate(parsed.rows, {
            skuField: mapping.skuField,
            nameField: mapping.nameField,
            quantityField: mapping.quantityField,
            priceField: mapping.priceField,
            barcodeField: mapping.barcodeField,
          });

      // Create import job
      const importJob = await prisma.importJob.create({
        data: {
          fileName,
          filePath: resolvedPath,
          importMode: (importMode || 'CREATE_UPDATE') as 'CREATE_ONLY' | 'CREATE_UPDATE' | 'UPDATE_ONLY',
          type: importType,
          status: 'PENDING',
          totalRows: parsed.totalRows,
          mappingJson: mapping as any,
          createdById: req.user!.id,
        },
      });

      // Create import records
      const recordsData = parsed.rows.map(row => ({
        importJobId: importJob.id,
        rowNumber: Number(row._rowNumber),
        sku: importType === 'INVOICES'
          ? (row[mapping.accountNumberField] ? String(row[mapping.accountNumberField]) : null)
          : (row[mapping.skuField] ? String(row[mapping.skuField]) : null),
        productName: importType === 'INVOICES'
          ? (mapping.orderTopicField && row[mapping.orderTopicField] ? String(row[mapping.orderTopicField]) : null)
          : (row[mapping.nameField] ? String(row[mapping.nameField]) : null),
        status: 'PENDING',
        rawData: row as any,
      }));

      await prisma.importRecord.createMany({
        data: recordsData,
      });

      // Queue the job
      const queuePayload = importType === 'INVOICES' ? {
        importJobId: importJob.id,
        type: importType as 'INVOICES',
        mapping: {
          accountNumberField: mapping.accountNumberField,
          orderTopicField: mapping.orderTopicField,
          clientField: mapping.clientField,
          amountField: mapping.amountField,
          currencyField: mapping.currencyField,
          statusField: mapping.statusField,
          billDateField: mapping.billDateField,
          dueDateField: mapping.dueDateField,
          commentField: mapping.commentField,
        },
        importMode: (importMode || 'CREATE_UPDATE') as 'CREATE_ONLY' | 'CREATE_UPDATE' | 'UPDATE_ONLY',
      } : {
        importJobId: importJob.id,
        type: 'PRODUCTS' as 'PRODUCTS',
        mapping: {
          skuField: mapping.skuField,
          nameField: mapping.nameField,
          quantityField: mapping.quantityField,
          priceField: mapping.priceField,
          barcodeField: mapping.barcodeField,
        },
        importMode: (importMode || 'CREATE_UPDATE') as 'CREATE_ONLY' | 'CREATE_UPDATE' | 'UPDATE_ONLY',
      };

      await importQueue.add('process-import', queuePayload as any, {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      });

      logger.info(`Import job created: ${importJob.id} (${importType})`);
      debugLog.info('IMPORT', `Import job created: ${fileName} (${importType})`, {
        importJobId: importJob.id,
        importMode: importMode || 'CREATE_UPDATE',
        totalRows: validation.totalRows,
        validRows: validation.validCount,
        invalidRows: validation.invalidCount,
      });

      res.status(201).json({
        success: true,
        data: {
          id: importJob.id,
          fileName: importJob.fileName,
          type: importType,
          status: importJob.status,
          totalRows: validation.totalRows,
          validRows: validation.validCount,
          invalidRows: validation.invalidCount,
          duplicates: validation.duplicates,
          validationErrors: validation.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listImports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where = status && status !== 'ALL' ? { status: String(status) } : {};

      const [imports, total] = await Promise.all([
        prisma.importJob.findMany({
          where,
          include: {
            createdBy: { select: { email: true } },
            _count: { select: { records: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit),
        }),
        prisma.importJob.count({ where }),
      ]);

      res.json({
        success: true,
        data: imports,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (error) {
      next(error);
    }
  }

  async getImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const importJob = await prisma.importJob.findUnique({
        where: { id },
        include: {
          createdBy: { select: { email: true } },
        },
      });

      if (!importJob) {
        throw new AppError('Import job not found', 404);
      }

      // Get counts by status
      const records = await prisma.importRecord.groupBy({
        by: ['status'],
        where: { importJobId: id },
        _count: { id: true },
      });

      const statusCounts: Record<string, number> = {};
      records.forEach(r => {
        statusCounts[r.status] = r._count.id;
      });

      res.json({
        success: true,
        data: {
          ...importJob,
          statusCounts,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getErrors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const errors = await prisma.importRecord.findMany({
        where: {
          importJobId: id,
          status: { in: ['FAILED', 'PARTIAL_FAILURE'] },
        },
        orderBy: { rowNumber: 'asc' },
      });

      res.json({
        success: true,
        data: errors,
      });
    } catch (error) {
      next(error);
    }
  }

  async getErrorReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const errors = await prisma.importRecord.findMany({
        where: {
          importJobId: id,
          status: { in: ['FAILED', 'PARTIAL_FAILURE'] },
        },
        orderBy: { rowNumber: 'asc' },
      });

      const reportData = errors.map(e => ({
        rowNumber: e.rowNumber,
        sku: e.sku || '',
        productName: e.productName || '',
        status: e.status,
        errorMessage: e.errorMessage || e.bitrixError || '',
      }));

      const workbook = await excelService.generateErrorReport(reportData);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="import_errors_${id}.xlsx"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  async retryFailedRecords(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const importJob = await prisma.importJob.findUnique({ where: { id } });
      if (!importJob) {
        throw new AppError('Import job not found', 404);
      }

      // Update failed/partial/stuck-pending records back to PENDING
      const updated = await prisma.importRecord.updateMany({
        where: {
          importJobId: id,
          status: { in: ['FAILED', 'PARTIAL_FAILURE', 'PENDING'] },
        },
        data: {
          status: 'PENDING',
          errorMessage: null,
          bitrixError: null,
        },
      });

      // Reset job status
      await prisma.importJob.update({
        where: { id },
        data: {
          status: 'PENDING',
          failedRows: 0,
          processedRows: 0,
          startedAt: null,
          completedAt: null,
        },
      });

      // Re-queue
      await importQueue.add('process-import', {
        importJobId: id,
        type: (importJob.type || 'PRODUCTS') as 'PRODUCTS' | 'INVOICES',
        mapping: importJob.mappingJson as any,
        importMode: (importJob.importMode as 'CREATE_ONLY' | 'CREATE_UPDATE' | 'UPDATE_ONLY') || 'CREATE_UPDATE',
      }, {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      });

      logger.info(`Retrying ${updated.count} failed records for import ${id}`);
      debugLog.warn('IMPORT', `Retrying ${updated.count} records for import ${id}`, {
        importJobId: id,
        retriedCount: updated.count,
      });

      res.json({
        success: true,
        data: {
          retriedCount: updated.count,
          importJobId: id,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const workbook = await excelService.generateTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.xlsx"');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }
}

export const importController = new ImportController();
