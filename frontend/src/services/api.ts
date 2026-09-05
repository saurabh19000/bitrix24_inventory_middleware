import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60000,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const response = error.response;
    if (response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;