import { Response, NextFunction } from 'express';
import { BitrixClient } from '../services/bitrix/BitrixClient';
import { BitrixCatalogService, BitrixProductService, BitrixInventoryService } from '../services/bitrix/BitrixCatalogService';
import { BitrixInvoiceService } from '../services/bitrix/BitrixInvoiceService';
import { BitrixStockReceiptService, STOCK_RECEIPT_CORE_FIELDS } from '../services/bitrix/BitrixStockReceiptService';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

export class BitrixController {
  async getCatalogs(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await BitrixClient.fromDbConfiguration();
      const service = new BitrixCatalogService(client);
      const catalogs = await service.getCatalogs();
      res.json({ success: true, data: catalogs });
    } catch (error) {
      next(error);
    }
  }

  async getProductFields(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await BitrixClient.fromDbConfiguration();
      const service = new BitrixCatalogService(client);
      const fields = await service.getProductFields();
      res.json({ success: true, data: fields });
    } catch (error) {
      next(error);
    }
  }

  async getInventoryFields(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await BitrixClient.fromDbConfiguration();
      const service = new BitrixCatalogService(client);
      const fields = await service.getInventoryFields();
      res.json({ success: true, data: fields });
    } catch (error) {
      next(error);
    }
  }

  async getStores(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await BitrixClient.fromDbConfiguration();
      const service = new BitrixCatalogService(client);
      const stores = await service.getStores();
      res.json({ success: true, data: stores });
    } catch (error) {
      next(error);
    }
  }

  async getEndpointInfo(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await BitrixClient.fromDbConfiguration();
      const test = await client.testConnection(client['instance']?.defaults?.baseURL || '');
      res.json({ success: true, data: { reachable: test } });
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceFields(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          fields: BitrixInvoiceService.getFields(),
          statuses: BitrixInvoiceService.getStatusOptions(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getStockReceiptFields(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      try {
        const client = await BitrixClient.fromDbConfiguration();
        const service = new BitrixStockReceiptService(client);
        const discovery = await service.getDiscoveryFields();
        res.json({
          success: true,
          data: discovery,
        });
      } catch (err: any) {
        logger.info({ msg: err.message }, 'Returning default stock receipt fields (Bitrix offline or unconfigured)');
        res.json({
          success: true,
          data: {
            stockReceiptFields: STOCK_RECEIPT_CORE_FIELDS,
            catalogFields: [],
            stores: [],
            currency: 'USD',
            configured: false,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

export const bitrixController = new BitrixController();
