import axios, { type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/lib/env';
import { tokenStore } from '@/api/tokenStore';

/**
 * Main axios client for all authenticated API traffic.
 *
 * PR2 skeleton: only the REQUEST interceptor is wired. The response interceptor
 * with single-flight 401 refresh lands in PR3 (FE-2-003) along with
 * `authEvents.emit('unauthorized')` on refresh failure.
 */
export const axiosClient = axios.create({
  baseURL: env.VITE_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});