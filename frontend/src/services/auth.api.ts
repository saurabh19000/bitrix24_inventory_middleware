import api from './api';
import type { User, ApiResponse } from '../types';

export async function login(email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
  const res = await api.post('/auth/login', { email, password });
  return res.data;
}

export async function logout(): Promise<ApiResponse> {
  const res = await api.post('/auth/logout');
  return res.data;
}

export async function getMe(): Promise<ApiResponse<User>> {
  const res = await api.get('/auth/me');
  return res.data;
}