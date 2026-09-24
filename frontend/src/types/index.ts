export interface User {
  id: string;
  email: string;
  role: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BitrixSettings {
  portalUrl: string;
  webhookConfigured: boolean;
  connectionStatus: 'UNKNOWN' | 'CONNECTED' | 'FAILED';
  lastTestedAt: string | null;
  isActive: boolean;
}

export interface ImportJob {
  id: string;
  fileName: string;
  importMode: string;
  type?: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  mappingJson?: any;
  bitrixDocumentId?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  createdBy?: { email: string };
  createdById?: string;
  statusCounts?: Record<string, number>;
  _count?: { records: number };
}

export interface ImportRecord {
  id: string;
  importJobId: string;
  rowNumber: number;
  sku?: string;
  productName?: string;
  status: string;
  bitrixProductId?: string;
  bitrixDocumentId?: string;
  warehouseId?: number;
  quantityArrived?: number;
  purchasePrice?: number;
  salesPrice?: number;
  errorMessage?: string;
  bitrixError?: string;
  rawData?: any;
  createdAt: string;
  updatedAt: string;
}

export interface StockReceiptField {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
  isCore?: boolean;
}

export interface BitrixStore {
  id: number;
  title: string;
  address?: string;
  active?: string;
}

export interface StockReceiptDiscovery {
  stockReceiptFields: StockReceiptField[];
  catalogFields: StockReceiptField[];
  stores: BitrixStore[];
  currency: string;
}

export interface ImportPreview {
  fileName: string;
  fileSize: number;
  worksheetName: string;
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  columnCount: number;
}

export interface DashboardStats {
  totalImports: number;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  skippedRecords: number;
  bitrixConnection: {
    status: string;
    configured: boolean;
    lastTestedAt: string | null;
  };
  recentImports: ImportJob[];
}

export interface DebugLog {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  details?: Record<string, any> | null;
  createdAt: string;
}

export interface DebugLogStats {
  total: number;
  levelCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  errorsLast24h: number;
}
