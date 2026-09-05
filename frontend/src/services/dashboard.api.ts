import api from './api';
import type { ApiResponse, DashboardStats } from '../types';

export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const res = await api.get('/dashboard/stats');
  return res.data;
}