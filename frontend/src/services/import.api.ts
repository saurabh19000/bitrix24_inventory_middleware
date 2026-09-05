import api from './api';
import type { ApiResponse, PaginatedResponse, ImportJob, ImportPreview } from '../types';

export async function uploadFile(file: File): Promise<ApiResponse<{ fileId: string; fileName: string; fileSize: number; filePath: string }>> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/imports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function previewFile(filePath: string, fileName: string): Promise<ApiResponse<ImportPreview>> {
  const res = await api.post('/imports/preview', { filePath, fileName });
  return res.data;
}

export async function createImport(data: any): Promise<ApiResponse<any>> {
  const res = await api.post('/imports', data);
  return res.data;
}

export async function getImports(params: { status?: string; page?: number; limit?: number } = {}): Promise<PaginatedResponse<ImportJob>> {
  const res = await api.get('/imports', { params });
  return res.data;
}

export async function getImport(id: string): Promise<ApiResponse<ImportJob>> {
  const res = await api.get(`/imports/${id}`);
  return res.data;
}

export async function getImportErrors(id: string): Promise<ApiResponse<any[]>> {
  const res = await api.get(`/imports/${id}/errors`);
  return res.data;
}

export async function downloadErrorReport(id: string): Promise<Blob> {
  const res = await api.get(`/imports/${id}/error-report`, { responseType: 'blob' });
  return res.data;
}

export async function retryFailed(id: string): Promise<ApiResponse<any>> {
  const res = await api.post(`/imports/${id}/retry`);
  return res.data;
}

export async function downloadTemplate(): Promise<Blob> {
  const res = await api.get('/imports/template', { responseType: 'blob' });
  return res.data;
}