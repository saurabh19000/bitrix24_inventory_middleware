import { BitrixClient } from './BitrixClient';
import { logger } from '../../utils/logger';

export interface BitrixCatalog {
  id: number;
  name: string;
  iblockTypeId: string;
  productIblockId: number | null;
}

export interface BitrixField {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
}

export interface CatalogContext {
  catalogId: number;
  catalogName: string;
  basePriceTypeId: number;
  currency: string;
  barcodePropertyId?: number;
}

// Map<webhookBaseUrl, Promise<context>> — resolve catalog/price-type/currency once per portal
const contextCache = new Map<string, Promise<CatalogContext>>();

export class BitrixCatalogService {
  private client: BitrixClient;

  constructor(client: BitrixClient) {
    this.client = client;
  }

  async getCatalogs(): Promise<BitrixCatalog[]> {
    try {
      const result = await this.client.callMethod('catalog.catalog.list', {});
      const catalogs = (result && result.catalogs) || [];
      return catalogs.map((c: any) => ({
        id: c.id,
        name: c.name,
        iblockTypeId: c.iblockTypeId,
        productIblockId: c.productIblockId != null ? c.productIblockId : null,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch Bitrix catalogs');
      throw error;
    }
  }

  async getDefaultCatalogId(): Promise<number> {
    const ctx = await this.getCatalogContext();
    return ctx.catalogId;
  }

  async getCatalogContext(): Promise<CatalogContext> {
    return resolveCatalogContext(this.client);
  }

  async getProductFields(): Promise<BitrixField[]> {
    try {
      const result = await this.client.callMethod('catalog.product.getFields', {});
      const src = (result && (result.product || result)) || {};
      const entries = Object.entries(src);
      if (entries.length > 0) {
        return entries.map(([id, f]: [string, any]) => ({
          id,
          name: f.name || id,
          type: f.type || 'string',
          isRequired: !!f.isRequired,
        }));
      }
    } catch (error) {
      logger.warn({ err: error }, 'catalog.product.getFields unavailable, using default field schema');
    }
    return this.defaultProductFields();
  }

  private defaultProductFields(): BitrixField[] {
    return [
      { id: 'id', name: 'ID', type: 'integer', isRequired: false },
      { id: 'iblockId', name: 'Catalog (IBLOCK_ID)', type: 'integer', isRequired: true },
      { id: 'name', name: 'Name', type: 'string', isRequired: true },
      { id: 'code', name: 'SKU / Code', type: 'string', isRequired: false },
      { id: 'xmlId', name: 'External ID (XML_ID)', type: 'string', isRequired: false },
      { id: 'active', name: 'Active', type: 'string', isRequired: false },
      { id: 'quantity', name: 'Stock quantity', type: 'double', isRequired: false },
      { id: 'price', name: 'Base price', type: 'double', isRequired: false },
      { id: 'barcode', name: 'Barcode (GTIN)', type: 'string', isRequired: false },
    ];
  }

  async getInventoryFields(): Promise<BitrixField[]> {
    try {
      const result = await this.client.callMethod('catalog.storeproduct.getFields', {});
      const src = (result && (result.storeProduct || result)) || {};
      return Object.entries(src).map(([id, f]: [string, any]) => ({
        id,
        name: f.name || id,
        type: f.type || 'string',
        isRequired: !!f.isRequired,
      }));
    } catch (error) {
      logger.warn({ err: error }, 'Failed to fetch inventory fields');
      return [];
    }
  }

  async getStores(): Promise<any[]> {
    try {
      const result = await this.client.callMethod('catalog.store.list', {});
      const stores = (result && result.stores) || [];
      return stores.map((s: any) => ({
        id: s.id,
        title: s.title,
        active: s.active,
        code: s.code,
      }));
    } catch (error) {
      logger.warn({ err: error }, 'Failed to fetch Bitrix stores');
      return [];
    }
  }
}

async function resolveCatalogContext(client: BitrixClient): Promise<CatalogContext> {
  const key = ((client as any).instance?.defaults?.baseURL) || 'default';

  if (contextCache.has(key)) {
    return contextCache.get(key)!;
  }

  const loader = (async () => {
    try {
      const catalogsRes = await client.callMethod('catalog.catalog.list', {});
      const catalogs = (catalogsRes && catalogsRes.catalogs) || [];
      const mainCatalog =
        catalogs.find((c: any) => c.productIblockId == null) || catalogs[0];

      if (!mainCatalog) {
        throw new Error('No commercial catalog found in this Bitrix24 portal');
      }

      const priceTypesRes = await client.callMethod('catalog.priceType.list', {});
      const priceTypes = (priceTypesRes && priceTypesRes.priceTypes) || [];
      const baseType = priceTypes.find((t: any) => t.base === 'Y') || priceTypes[0];

      if (!baseType) {
        throw new Error('No price type found in this Bitrix24 portal');
      }

      let currency = 'INR';
      try {
        const currenciesRes = await client.callMethod('crm.currency.list', {});
        const currencies = Array.isArray(currenciesRes) ? currenciesRes : (currenciesRes && currenciesRes.result) || [];
        const baseCurrency = currencies.find((c: any) => c.BASE === 'Y') || currencies[0];
        if (baseCurrency && baseCurrency.CURRENCY) {
          currency = baseCurrency.CURRENCY;
        }
      } catch {
        logger.warn('crm.currency.list unavailable, defaulting currency to INR');
      }

      // Discover or ensure barcode property on catalog iblock
      let barcodePropertyId: number | undefined;
      try {
        const props = await client.callMethod('crm.product.property.list', {});
        const propList = Array.isArray(props) ? props : (props && props.result) || [];
        const found = propList.find((p: any) => 
          String(p.IBLOCK_ID) === String(mainCatalog.id) &&
          (p.CODE?.toUpperCase() === 'BARCODE' || p.NAME?.toLowerCase() === 'barcode')
        );
        if (found) {
          barcodePropertyId = Number(found.ID);
        } else {
          const addRes = await client.callMethod('crm.product.property.add', {
            fields: {
              NAME: 'Barcode',
              CODE: 'BARCODE',
              ACTIVE: 'Y',
              SORT: 100,
              PROPERTY_TYPE: 'S',
              IBLOCK_ID: mainCatalog.id,
            },
          });
          const newId = typeof addRes === 'number' ? addRes : addRes?.id || addRes?.ID || addRes?.result;
          if (newId) barcodePropertyId = Number(newId);
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to resolve/create barcode property');
      }

      return {
        catalogId: mainCatalog.id,
        catalogName: mainCatalog.name,
        basePriceTypeId: baseType.id,
        currency,
        barcodePropertyId,
      };
    } catch (error) {
      contextCache.delete(key);
      throw error;
    }
  })();

  contextCache.set(key, loader);
  return loader;
}

export class BitrixProductService {
  private client: BitrixClient;
  private context: CatalogContext;

  constructor(client: BitrixClient, context: CatalogContext) {
    this.client = client;
    this.context = context;
  }

  async findProductBySku(sku: string): Promise<any | null> {
    try {
      const barcodeProp = this.context.barcodePropertyId ? `property${this.context.barcodePropertyId}` : undefined;
      const select = ['id', 'iblockId', 'name', 'code', 'quantity'];
      if (barcodeProp) select.push(barcodeProp);

      const result = await this.client.callMethod('catalog.product.list', {
        select,
        filter: { iblockId: this.context.catalogId, code: sku },
      });
      const products = (result && result.products) || [];
      if (!products[0]) return null;
      const p = products[0];
      let barcode = p.barcode;
      if (!barcode && barcodeProp && p[barcodeProp]) {
        barcode = typeof p[barcodeProp] === 'object' ? p[barcodeProp].value : p[barcodeProp];
      }
      return { ...p, barcode };
    } catch (error) {
      logger.warn({ err: error }, `Failed to search product by SKU ${sku}`);
      return null;
    }
  }

  async findProductByName(name: string): Promise<any | null> {
    try {
      const barcodeProp = this.context.barcodePropertyId ? `property${this.context.barcodePropertyId}` : undefined;
      const select = ['id', 'iblockId', 'name', 'code', 'quantity'];
      if (barcodeProp) select.push(barcodeProp);

      const result = await this.client.callMethod('catalog.product.list', {
        select,
        filter: { iblockId: this.context.catalogId, name: name },
      });
      const products = (result && result.products) || [];
      if (!products[0]) return null;
      const p = products[0];
      let barcode = p.barcode;
      if (!barcode && barcodeProp && p[barcodeProp]) {
        barcode = typeof p[barcodeProp] === 'object' ? p[barcodeProp].value : p[barcodeProp];
      }
      return { ...p, barcode };
    } catch (error) {
      return null;
    }
  }

  async createProduct(name: string, code: string, barcode?: string): Promise<number> {
    const fields: any = {
      iblockId: this.context.catalogId,
      name,
      code,
      active: 'Y',
    };
    if (barcode) {
      fields.barcode = barcode;
      if (this.context.barcodePropertyId) {
        fields[`property${this.context.barcodePropertyId}`] = barcode;
      }
    }

    const result = await this.client.callMethod('catalog.product.add', { fields });
    const element = result && (result.element || result.product);
    if (!element || !element.id) {
      throw new Error('Bitrix did not return a product ID after creation');
    }

    if (barcode && this.context.barcodePropertyId) {
      try {
        await this.client.callMethod('crm.product.update', {
          id: element.id,
          fields: {
            [`PROPERTY_${this.context.barcodePropertyId}`]: barcode,
          },
        });
      } catch {
        // non-blocking
      }
    }

    return element.id;
  }

  async updateProduct(id: number, fields: any): Promise<boolean> {
    try {
      const payload = { ...fields };
      if (payload.barcode && this.context.barcodePropertyId) {
        payload[`property${this.context.barcodePropertyId}`] = payload.barcode;
      }
      const result = await this.client.callMethod('catalog.product.update', { id, fields: payload });

      if (payload.barcode && this.context.barcodePropertyId) {
        try {
          await this.client.callMethod('crm.product.update', {
            id,
            fields: {
              [`PROPERTY_${this.context.barcodePropertyId}`]: payload.barcode,
            },
          });
        } catch {
          // non-blocking
        }
      }
      return !!(result && (result.element || result.product));
    } catch (error) {
      logger.error({ err: error }, `Failed to update product ${id}`);
      return false;
    }
  }

  async setPrice(productId: number, price: number): Promise<boolean> {
    try {
      if (!price || price <= 0) return true;

      const list = await this.client.callMethod('catalog.price.list', {
        filter: { productId },
      });
      const prices = (list && list.prices) || [];

      if (prices.length > 0) {
        await this.client.callMethod('catalog.price.update', {
          id: prices[0].id,
          fields: { price, currency: this.context.currency },
        });
      } else {
        await this.client.callMethod('catalog.price.add', {
          fields: {
            productId,
            catalogGroupId: this.context.basePriceTypeId,
            price,
            currency: this.context.currency,
          },
        });
      }
      return true;
    } catch (error) {
      logger.error({ err: error }, `Failed to set price for product ${productId}`);
      return false;
    }
  }

  async setQuantity(productId: number, quantity: number): Promise<{ supported: boolean; firstProbe: boolean }> {
    const state = quantitySupport.get(this.context.catalogId) ?? 'unknown';

    if (state === false) {
      return { supported: false, firstProbe: false };
    }

    const firstProbe = state === 'unknown';

    try {
      await this.client.callMethod('catalog.product.update', {
        id: productId,
        fields: { quantity },
      });

      // Verify the portal actually persisted the quantity (many plans ignore stock via REST)
      const check = await this.client.callMethod('catalog.product.get', { id: productId });
      const stored = check && (check.product || {}).quantity;
      if (stored == null || Number(stored) !== Number(quantity)) {
        quantitySupport.set(this.context.catalogId, false);
        return { supported: false, firstProbe };
      }

      quantitySupport.set(this.context.catalogId, true);
      return { supported: true, firstProbe };
    } catch (error) {
      logger.warn({ err: error }, `Quantity update not supported for product ${productId}`);
      quantitySupport.set(this.context.catalogId, false);
      return { supported: false, firstProbe };
    }
  }
}

const quantitySupport = new Map<number, boolean | 'unknown'>();

// Kept for API compatibility with older callers.
export class BitrixInventoryService {
  private client: BitrixClient;

  constructor(client: BitrixClient) {
    this.client = client;
  }

  async updateStoreStock(productId: number, quantity: number): Promise<boolean> {
    const context = await resolveCatalogContext(this.client);
    const productService = new BitrixProductService(this.client, context);
    const result = await productService.setQuantity(productId, quantity);
    return result.supported;
  }
}

export class BitrixBatchService {
  private client: BitrixClient;

  constructor(client: BitrixClient) {
    this.client = client;
  }

  async processBatch(items: Array<{ method: string; params: any }>): Promise<any[]> {
    return this.client.batch(items);
  }
}