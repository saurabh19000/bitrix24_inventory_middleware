import { BitrixClient } from '../bitrix/BitrixClient';
import { BitrixCatalogService, BitrixProductService } from '../bitrix/BitrixCatalogService';
import { BitrixStockReceiptService, BitrixStore } from '../bitrix/BitrixStockReceiptService';
import { logger } from '../../utils/logger';
import { debugLog } from '../debug/debugLog.service';

export interface StockReceiptRowData {
  sku?: string;
  name: string;
  barcode?: string;
  purchasePrice?: number;
  salesPrice?: number;
  quantityArrived: number;
  warehouse?: string;
  quantityDestination?: number;
  total?: number;
  defaultStoreId?: number;
  [key: string]: any;
}

export interface StockReceiptMapping {
  skuField?: string;
  nameField: string;
  barcodeField?: string;
  purchasePriceField?: string;
  salesPriceField?: string;
  quantityArrivedField: string;
  warehouseField?: string;
  quantityDestinationField?: string;
  totalField?: string;
  defaultStoreId?: number;
  [key: string]: any;
}

export type StockReceiptResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PARTIAL_FAILURE';

export interface StockReceiptResult {
  status: StockReceiptResultStatus;
  bitrixProductId?: string;
  bitrixDocumentId?: string;
  warehouseId?: number;
  quantityArrived?: number;
  purchasePrice?: number;
  salesPrice?: number;
  errorMessage?: string;
  bitrixError?: string;
}

export class StockReceiptImportService {
  async processRecord(
    rowData: StockReceiptRowData,
    mapping: StockReceiptMapping,
    importMode: string,
    bitrixDocumentId?: number,
    storesList?: BitrixStore[]
  ): Promise<StockReceiptResult> {
    const sku = (rowData.sku || '').trim();
    const name = (rowData.name || '').trim();
    const barcode = (rowData.barcode || '').trim();
    const quantityArrived = rowData.quantityArrived;
    const purchasePrice = rowData.purchasePrice;
    const salesPrice = rowData.salesPrice;

    if (!name && !sku) {
      return { status: 'SKIPPED', errorMessage: 'Missing product name or SKU' };
    }

    if (quantityArrived === undefined || quantityArrived === null || isNaN(Number(quantityArrived)) || Number(quantityArrived) < 0) {
      return { status: 'FAILED', errorMessage: 'Quantity Arrived is required and must be non-negative' };
    }

    try {
      const client = await BitrixClient.fromDbConfiguration();
      const catalogService = new BitrixCatalogService(client);
      const stockReceiptService = new BitrixStockReceiptService(client);
      const context = await catalogService.getCatalogContext();
      const productService = new BitrixProductService(client, context);

      // Resolve destination warehouse
      let resolvedStoreId = mapping.defaultStoreId || rowData.defaultStoreId;
      if (rowData.warehouse && storesList && storesList.length > 0) {
        const whRaw = String(rowData.warehouse).trim().toLowerCase();
        const matched = storesList.find(s => 
          String(s.id) === whRaw || 
          s.title.toLowerCase() === whRaw || 
          s.title.toLowerCase().includes(whRaw)
        );
        if (matched) {
          resolvedStoreId = matched.id;
        }
      }

      if (!resolvedStoreId && storesList && storesList.length > 0) {
        resolvedStoreId = storesList[0].id;
      }

      // Step 1: Product Catalog Sync
      let existingProduct: any = null;
      if (sku) {
        existingProduct = await productService.findProductBySku(sku);
      }
      if (!existingProduct && name) {
        existingProduct = await productService.findProductByName(name);
      }

      if (importMode === 'UPDATE_ONLY' && !existingProduct) {
        return { status: 'SKIPPED', errorMessage: 'Product does not exist in catalog (Update Only mode)' };
      }

      let productId: number;
      let partialNotes: string[] = [];

      if (existingProduct) {
        productId = Number(existingProduct.id);

        if (importMode !== 'CREATE_ONLY') {
          const updateFields: any = {};
          if (name && existingProduct.name !== name) updateFields.name = name;
          if (barcode) updateFields.barcode = barcode;

          if (Object.keys(updateFields).length > 0) {
            const updated = await productService.updateProduct(productId, updateFields);
            if (!updated) {
              partialNotes.push('Failed to update product details');
            }
          }
        }
      } else {
        const productCode = sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
        const productName = name || `Product ${productCode}`;
        productId = await productService.createProduct(productName, productCode, barcode || undefined);
      }

      if (!productId) {
        return { status: 'FAILED', errorMessage: 'Failed to obtain Bitrix product ID' };
      }

      // Update Sales Price if mapped and positive
      if (salesPrice !== undefined && salesPrice !== null && !isNaN(Number(salesPrice)) && Number(salesPrice) > 0) {
        const priceOk = await productService.setPrice(productId, Number(salesPrice));
        if (!priceOk) {
          partialNotes.push('Base sales price could not be saved');
        }
      }

      // Update Purchasing Price (Cost) on product if mapped and positive
      if (purchasePrice !== undefined && purchasePrice !== null && !isNaN(Number(purchasePrice)) && Number(purchasePrice) > 0) {
        try {
          await productService.updateProduct(productId, {
            purchasingPrice: Number(purchasePrice),
            purchasingCurrency: context.currency || 'AED',
          });
        } catch {
          // non-blocking
        }
      }

      const finalStoreId = resolvedStoreId && Number(resolvedStoreId) > 0 ? Number(resolvedStoreId) : 1;

      // Step 2: Bitrix Inventory Stock Receipt Document Sync
      let docElementAdded = false;
      const qtyToReceive = Number(quantityArrived);
      if (bitrixDocumentId && !isNaN(qtyToReceive) && qtyToReceive > 0) {
        try {
          await stockReceiptService.addDocumentElement(
            bitrixDocumentId,
            productId,
            qtyToReceive,
            purchasePrice !== undefined ? Number(purchasePrice) : undefined,
            finalStoreId
          );
          docElementAdded = true;
          debugLog.debug('IMPORT', `Added product ${productId} to stock receipt doc ${bitrixDocumentId}`);
        } catch (docErr: any) {
          partialNotes.push(`Stock receipt line item error: ${docErr.message}`);
        }
      }

      // Fallback/Direct Store Stock Sync to ensure warehouse records reflect the arrival
      try {
        await stockReceiptService.syncDirectStoreStock(productId, finalStoreId, Number(quantityArrived));
      } catch {
        // Non-blocking
      }

      // Legacy product quantity update probe
      try {
        await productService.setQuantity(productId, Number(quantityArrived));
      } catch {
        // Non-blocking
      }

      const status: StockReceiptResultStatus = partialNotes.length > 0 ? 'PARTIAL_FAILURE' : 'SUCCESS';

      return {
        status,
        bitrixProductId: String(productId),
        bitrixDocumentId: bitrixDocumentId ? String(bitrixDocumentId) : undefined,
        warehouseId: resolvedStoreId ? Number(resolvedStoreId) : undefined,
        quantityArrived: Number(quantityArrived),
        purchasePrice: purchasePrice !== undefined ? Number(purchasePrice) : undefined,
        salesPrice: salesPrice !== undefined ? Number(salesPrice) : undefined,
        errorMessage: partialNotes.length > 0 ? partialNotes.join('; ') : undefined,
      };
    } catch (error: any) {
      logger.error({ err: error, sku, name }, 'Stock receipt record processing failed');
      return {
        status: 'FAILED',
        errorMessage: error.message || 'Unknown error while processing stock receipt',
        bitrixError: 'Bitrix API error during stock receipt processing',
      };
    }
  }
}

export const stockReceiptImportService = new StockReceiptImportService();
