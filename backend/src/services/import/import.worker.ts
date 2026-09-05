import { Job, Worker } from 'bullmq';
import fs from 'fs';
import { prisma } from '../../config/database';
import { importService } from './import.service';
import { invoiceImportService } from './invoiceImport.service';
import { createImportWorker, ImportJobData, ImportType } from '../../queues/import.queue';
import { logger } from '../../utils/logger';
import { debugLog } from '../../services/debug/debugLog.service';
import { bitrixConfig } from '../../config/bitrix';

const BATCH_SIZE = bitrixConfig.batchSize;

let activeWorker: Worker | null = null;

function extractRowData(record: any, mapping: any, importType: ImportType): any {
  const rawData = (record.rawData as any) || {};

  if (importType === 'INVOICES') {
    const num = (v: any) => (v !== undefined && v !== '' ? Number(v) : undefined);
    return {
      accountNumber: mapping.accountNumberField
        ? (rawData[mapping.accountNumberField] !== undefined && rawData[mapping.accountNumberField] !== ''
            ? String(rawData[mapping.accountNumberField])
            : '')
        : '',
      orderTopic: mapping.orderTopicField
        ? (rawData[mapping.orderTopicField] ? String(rawData[mapping.orderTopicField]) : undefined)
        : undefined,
      client: mapping.clientField
        ? (rawData[mapping.clientField] ? String(rawData[mapping.clientField]) : undefined)
        : undefined,
      amount: mapping.amountField ? num(rawData[mapping.amountField]) : undefined,
      currency: mapping.currencyField
        ? (rawData[mapping.currencyField] ? String(rawData[mapping.currencyField]) : undefined)
        : undefined,
      status: mapping.statusField
        ? (rawData[mapping.statusField] ? String(rawData[mapping.statusField]) : undefined)
        : undefined,
      billDate: mapping.billDateField
        ? (rawData[mapping.billDateField] ? String(rawData[mapping.billDateField]) : undefined)
        : undefined,
      dueDate: mapping.dueDateField
        ? (rawData[mapping.dueDateField] ? String(rawData[mapping.dueDateField]) : undefined)
        : undefined,
      comment: mapping.commentField
        ? (rawData[mapping.commentField] ? String(rawData[mapping.commentField]) : undefined)
        : undefined,
    };
  }

  return {
    sku: mapping.skuField ? String(rawData[mapping.skuField] ?? '') : '',
    name: mapping.nameField ? String(rawData[mapping.nameField] ?? '') : '',
    quantity: mapping.quantityField ? (rawData[mapping.quantityField] !== undefined && rawData[mapping.quantityField] !== '' ? Number(rawData[mapping.quantityField]) : undefined) : undefined,
    price: mapping.priceField ? (rawData[mapping.priceField] !== undefined && rawData[mapping.priceField] !== '' ? Number(rawData[mapping.priceField]) : undefined) : undefined,
    barcode: mapping.barcodeField ? (rawData[mapping.barcodeField] ? String(rawData[mapping.barcodeField]) : undefined) : undefined,
  };
}

async function processJob(job: Job<ImportJobData>): Promise<void> {
  const { importJobId, importMode } = job.data;
  const importType: ImportType = job.data.type || 'PRODUCTS';

  try {
    // Load import job
    const importJob = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!importJob) {
      throw new Error(`Import job ${importJobId} not found`);
    }

    const effectiveMapping = job.data.mapping || (importJob.mappingJson as any) || {};

    // Mark job as processing
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    logger.info(`Import job ${importJobId} started (${importType})`);
    debugLog.info('WORKER', `Import job ${importJobId} started (${importType})`, {
      importJobId,
      importType,
      recordCount: await prisma.importRecord.count({ where: { importJobId, status: 'PENDING' } }),
    });

    // Load pending records, draining the queue until none remain.
    // NOTE: skip is always 0 because processed records leave the PENDING set;
    // paginating with an accumulating offset skips live records and strands them.
    while (true) {
      const pendingRecords = await prisma.importRecord.findMany({
        where: {
          importJobId,
          status: 'PENDING',
        },
        orderBy: { rowNumber: 'asc' },
        skip: 0,
        take: BATCH_SIZE,
      });

      if (pendingRecords.length === 0) {
        break;
      }

      logger.info(`Processing batch of ${pendingRecords.length} records`);

      // Process each record asynchronously with controlled concurrency
      const concurrency = bitrixConfig.concurrency || 5;

      const worker = async (record: any): Promise<void> => {
        try {
          const rowData = extractRowData(record, effectiveMapping, importType);

          // Mark as processing
          await prisma.importRecord.update({
            where: { id: record.id },
            data: { status: 'PROCESSING' },
          });

          const result = importType === 'INVOICES'
            ? await invoiceImportService.processInvoiceRecord(rowData, effectiveMapping, importMode)
            : await importService.processRecord(rowData, effectiveMapping, importMode);

          const rec = result as any;

          await prisma.importRecord.update({
            where: { id: record.id },
            data: {
              status: result.status,
              ...(rec.bitrixProductId ? { bitrixProductId: rec.bitrixProductId } : {}),
              ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
              ...(result.bitrixError ? { bitrixError: result.bitrixError } : {}),
            },
          });

          // Update job progress counters
          await prisma.importJob.update({
            where: { id: importJobId },
            data: {
              processedRows: { increment: 1 },
              successfulRows: { increment: result.status === 'SUCCESS' ? 1 : 0 },
              failedRows: { increment: (result.status === 'FAILED' || result.status === 'PARTIAL_FAILURE') ? 1 : 0 },
              skippedRows: { increment: result.status === 'SKIPPED' ? 1 : 0 },
            },
          });

          const key = importType === 'INVOICES' ? rowData.accountNumber || record.sku : record.sku;

          if (result.status === 'FAILED' || result.status === 'PARTIAL_FAILURE') {
            debugLog.warn('WORKER', `Record row ${record.rowNumber} (${key}): ${result.status}`, {
              importJobId,
              rowNumber: record.rowNumber,
              key,
              errorMessage: result.errorMessage,
              bitrixError: result.bitrixError,
            });
          }

          logger.info(`Processed record ${key} (row ${record.rowNumber}): ${result.status}`);
        } catch (error) {
          logger.error({ err: error }, `Failed to process record ${record.id}`);
          const errMessage = error instanceof Error ? error.message : 'Unknown error';

          debugLog.error('WORKER', `Unexpected error on record row ${record.rowNumber}: ${errMessage}`, {
            importJobId,
            rowNumber: record.rowNumber,
            recordId: record.id,
          });

          await prisma.importRecord.update({
            where: { id: record.id },
            data: {
              status: 'FAILED',
              errorMessage: errMessage,
            },
          });

          await prisma.importJob.update({
            where: { id: importJobId },
            data: {
              processedRows: { increment: 1 },
              failedRows: { increment: 1 },
            },
          });
        }
      };

      // Process with concurrency control
      for (let i = 0; i < pendingRecords.length; i += concurrency) {
        const chunk = pendingRecords.slice(i, i + concurrency);
        await Promise.all(chunk.map(worker));
      }
    }

    // Reconciliation: records left PENDING/PROCESSING mean the run was interrupted
    const stuck = await prisma.importRecord.updateMany({
      where: {
        importJobId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'FAILED',
        errorMessage: 'Worker interrupted before this record was processed. Use Retry to continue.',
      },
    });

    if (stuck.count > 0) {
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { failedRows: { increment: stuck.count }, processedRows: { increment: stuck.count } },
      });
    }

    // Determine final job status
    const [successCount, failedCount, skippedCount, partialCount] = await Promise.all([
      prisma.importRecord.count({ where: { importJobId, status: 'SUCCESS' } }),
      prisma.importRecord.count({ where: { importJobId, status: 'FAILED' } }),
      prisma.importRecord.count({ where: { importJobId, status: 'SKIPPED' } }),
      prisma.importRecord.count({ where: { importJobId, status: 'PARTIAL_FAILURE' } }),
    ]);

    let finalStatus = 'COMPLETED';
    if (failedCount > 0 || partialCount > 0) {
      finalStatus = 'COMPLETED_WITH_ERRORS';
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        successfulRows: successCount,
        failedRows: failedCount + partialCount,
        skippedRows: skippedCount,
        processedRows: successCount + failedCount + skippedCount + partialCount,
      },
    });

    logger.info(`Import job ${importJobId} completed with status: ${finalStatus}`);
    debugLog.info('WORKER', `Import job ${importJobId} completed (${finalStatus})`, {
      importJobId,
      finalStatus,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      partial: partialCount,
      stuckReconciled: stuck.count,
    });

    // Clean up uploaded file after processing
    try {
      if (importJob.filePath && fs.existsSync(importJob.filePath)) {
        fs.unlinkSync(importJob.filePath);
      }
    } catch {
      logger.warn(`Failed to clean up file for import ${importJobId}`);
    }
  } catch (error) {
    logger.error({ err: error }, `Import job ${importJobId} failed`);
    debugLog.error('WORKER', `Import job ${importJobId} failed: ${(error as Error).message}`, {
      importJobId,
      importType,
      errorMessage: (error as Error).message,
    });
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
      },
    }).catch(() => {});
    throw error;
  }
}

export function startImportWorker(): void {
  if (activeWorker) {
    logger.warn('Import worker already running, skipping duplicate start');
    return;
  }

  activeWorker = createImportWorker(processJob);
  logger.info('Import worker started');
  debugLog.info('WORKER', 'Import worker started');
}

export async function stopImportWorker(): Promise<void> {
  if (!activeWorker) {
    return;
  }

  const worker = activeWorker;
  activeWorker = null;

  await worker.close();
  logger.info('Import worker stopped');
}