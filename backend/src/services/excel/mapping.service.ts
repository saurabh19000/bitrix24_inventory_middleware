import { logger } from '../../utils/logger';

export interface BitrixFieldOption {
  id: string;
  label: string;
}

export interface autoMappingResult {
  mapping: Record<string, string>;
  confidence: number;
}

const KEYWORD_MAP: Record<string, string[]> = {
  'SKU': ['sku', 'product sku', 'product code', 'item code', 'code', 'reference'],
  'NAME': ['product name', 'name', 'item name', 'product', 'title'],
  'QUANTITY': ['quantity', 'qty', 'stock', 'available stock', 'available', 'in stock', 'inventory', 'stock qty', 'warehouse stock'],
  'PRICE': ['price', 'base price', 'unit price', 'cost', 'selling price', 'rate', 'mrp'],
  'BARCODE': ['barcode', 'bar code', 'ean', 'upc', 'gtin', 'item barcode'],
  'XML_ID': ['external id', 'xml id', 'external code'],
  'ACTIVE': ['active', 'status', 'is active', 'available'],
  'MEASURE': ['unit', 'measure', 'uom', 'unit of measure'],
  'WEIGHT': ['weight', 'gross weight', 'net weight'],
  'DESCRIPTION': ['description', 'details', 'long description', 'notes', 'remarks'],
  'DETAIL_TEXT': ['detailed description', 'full description', 'details'],
  'PREVIEW_TEXT': ['short description', 'brief', 'summary'],
  'SORT': ['sort', 'sort order', 'order', 'sorting'],
  'DETAIL_PICTURE': ['image', 'photo', 'picture', 'product image'],
};

export class MappingService {
  autoMap(excelColumns: string[], bitrixFields: string[]): Record<string, string> {
    const autoMapping: Record<string, string> = {};

    excelColumns.forEach(col => {
      const colLower = col.toLowerCase().trim();

      // First, try direct (case-insensitive) match to a Bitrix field ID
      const direct = bitrixFields.find(f => f.toLowerCase() === colLower);
      if (direct) {
        autoMapping[col] = direct;
        return;
      }

      // Then try keyword-based matching
      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const [bitrixField, keywords] of Object.entries(KEYWORD_MAP)) {
        for (const kw of keywords) {
          // Check if the Excel column name contains the keyword or vice versa
          if (colLower.includes(kw) || kw.includes(colLower)) {
            const score = Math.max(colLower.includes(kw) ? kw.length : 0, kw.includes(colLower) ? colLower.length : 0);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = bitrixField;
            }
          }
        }
      }

      if (bestMatch && bitrixFields.includes(bestMatch)) {
        autoMapping[col] = bestMatch;
      } else if (bestMatch) {
        // Bitrix field might not be in the list, try fuzzy
        const fuzzy = this.fuzzyMatchField(colLower, bitrixFields);
        if (fuzzy) {
          autoMapping[col] = fuzzy;
        }
      }
    });

    return autoMapping;
  }

  private fuzzyMatchField(colLower: string, bitrixFields: string[]): string | null {
    let bestField: string | null = null;
    let bestDistance = Infinity;

    bitrixFields.forEach(field => {
      const distance = this.levenshteinDistance(colLower, field.toLowerCase());
      if (distance < bestDistance && distance < 5) {
        bestDistance = distance;
        bestField = field;
      }
    });

    return bestField;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = i === 0
          ? j
          : Math.min(
              matrix[i][j-1] + 1,
              matrix[i-1][j] + 1,
              matrix[i-1][j-1] + (b[i-1] === a[j-1] ? 0 : 1)
            );
      }
    }
    return matrix[b.length][a.length];
  }

  getRequiredFields(mapping: Record<string, string>): { skuField?: string; nameField?: string } {
    return {
      skuField: mapping['SKU'],
      nameField: mapping['NAME'],
    };
  }

  getOptionalFields(mapping: Record<string, string>): Record<string, string> {
    const optional: Record<string, string> = {};
    for (const [excelCol, bitrixField] of Object.entries(mapping)) {
      if (bitrixField !== 'SKU' && bitrixField !== 'NAME') {
        optional[excelCol] = bitrixField;
      }
    }
    return optional;
  }

  autoMapStockReceipt(excelColumns: string[], bitrixFields: string[]): Record<string, string> {
    const autoMapping: Record<string, string> = {};

    excelColumns.forEach(col => {
      const colLower = col.toLowerCase().trim();

      // First check direct matches in bitrixFields or stock receipt fields
      const direct = bitrixFields.find(f => f.toLowerCase() === colLower);
      if (direct) {
        autoMapping[col] = direct;
        return;
      }

      // Keyword match against STOCK_RECEIPT_KEYWORD_MAP
      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const [targetField, keywords] of Object.entries(STOCK_RECEIPT_KEYWORD_MAP)) {
        for (const kw of keywords) {
          if (colLower === kw) {
            bestScore = 1000;
            bestMatch = targetField;
            break;
          }
          if (colLower.includes(kw) || kw.includes(colLower)) {
            const score = kw.length;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = targetField;
            }
          }
        }
        if (bestScore === 1000) break;
      }

      if (bestMatch) {
        autoMapping[col] = bestMatch;
      } else {
        // Fallback to general fuzzy
        const fuzzy = this.fuzzyMatchField(colLower, bitrixFields);
        if (fuzzy) {
          autoMapping[col] = fuzzy;
        }
      }
    });

    return autoMapping;
  }
}

export const STOCK_RECEIPT_KEYWORD_MAP: Record<string, string[]> = {
  'SKU': ['sku', 'product sku', 'product code', 'item code', 'code', 'part number', 'part no', 'part #', 'item #', 'reference', 'model', 'model no'],
  'PRODUCT_NAME': ['product name', 'description', 'item description', 'product', 'title', 'name', 'item name', 'item'],
  'BARCODE': ['barcode', 'bar code', 'ean', 'upc', 'gtin', 'item barcode'],
  'PURCHASE_PRICE': ['purchase price', 'cost', 'cost price', 'buying price', 'buy price', 'unit cost', 'purchase rate', 'cost '],
  'SALES_PRICE': ['sales price', 'sale price', 'selling price', 'dealer price', 'end user price', 'retail price', 'price', 'unit price', 'mrp', 'base price'],
  'QUANTITY_ARRIVED': ['quantity arrived', 'qty arrived', 'arrived qty', 'quantity', 'qty', 'qty in stock', 'stock qty', 'received qty', 'received', 'quantity received', 'amount', 'in stock', 'stock'],
  'WAREHOUSE': ['warehouse', 'store', 'location', 'destination warehouse', 'target warehouse', 'wh', 'store to'],
  'QUANTITY_DESTINATION': ['quantity at destination', 'destination qty', 'qty destination', 'current stock', 'dest qty'],
  'TOTAL': ['total', 'total cost', 'total amount', 'total price', 'amount total', 'net total'],
};

export const mappingService = new MappingService();
