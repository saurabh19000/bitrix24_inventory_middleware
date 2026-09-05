import api from './api';
import type { ApiResponse, BitrixSettings } from '../types';

export async function getBitrixSettings(): Promise<ApiResponse<BitrixSettings>> {
  const res = await api.get('/settings/bitrix');
  return res.data;
}

export async function saveBitrixSettings(data: { portalUrl: string; webhookUrl?: string; isActive?: boolean }): Promise<ApiResponse<BitrixSettings>> {
  const res = await api.post('/settings/bitrix', data);
  return res.data;
}

export async function updateBitrixSettings(data: { portalUrl?: string; webhookUrl?: string; isActive?: boolean }): Promise<ApiResponse<BitrixSettings>> {
  const res = await api.put('/settings/bitrix', data);
  return res.data;
}

export async function deleteBitrixSettings(): Promise<ApiResponse> {
  const res = await api.delete('/settings/bitrix');
  return res.data;
}

export async function testBitrixConnection(): Promise<ApiResponse<{ connectionStatus: string; lastTestedAt: string }>> {
  const res = await api.post('/settings/bitrix/test');
  return res.data;
}