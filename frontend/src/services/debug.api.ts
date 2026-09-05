import api from './api';
import type { ApiResponse, DebugLog, DebugLogStats } from '../types';

export interface DebugLogListResponse extends ApiResponse<DebugLog[]> {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export async function getDebugLogs(params?: {
  level?: string;
  source?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<DebugLogListResponse> {
  const res = await api.get('/debug/logs', { params });
  return res.data;
}

export async function getDebugLogStats(): Promise<ApiResponse<DebugLogStats>> {
  const res = await api.get('/debug/logs/stats');
  return res.data;
}

export async function clearDebugLogs(): Promise<ApiResponse<{ deleted: number }>> {
  const res = await api.post('/debug/logs/clear');
  return res.data;
}