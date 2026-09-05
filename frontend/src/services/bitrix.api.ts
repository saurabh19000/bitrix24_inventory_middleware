import api from './api';
import type { ApiResponse } from '../types';

export async function getCatalogs(): Promise<ApiResponse<any[]>> {
  const res = await api.get('/bitrix/catalogs');
  return res.data;
}

export async function getProductFields(): Promise<ApiResponse<any[]>> {
  const res = await api.get('/bitrix/products/fields');
  return res.data;
}

export async function getInventoryFields(): Promise<ApiResponse<any[]>> {
  const res = await api.get('/bitrix/inventory/fields');
  return res.data;
}

export async function getInvoiceFields(): Promise<ApiResponse<{ fields: any[]; statuses: any[] }>> {
  const res = await api.get('/bitrix/invoice-fields');
  return res.data;
}