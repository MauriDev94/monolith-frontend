import axios from 'axios';
import { env } from '@/lib/env';

/**
 * Bootstrap-only axios instance.
 *
 * Used ONLY by the single-flight 401 interceptor (PR3) to call
 * `POST /auth/v1/refresh`. It MUST stay free of interceptors — otherwise the
 * refresh call could itself trigger another refresh, causing an infinite loop.
 *
 * `withCredentials: true` lets the browser send the HttpOnly refresh cookie on
 * cross-origin Vercel ↔ Render requests. In dev the Vite proxy makes the call
 * same-origin and the cookie still travels.
 */
export const refreshClient = axios.create({
  baseURL: env.VITE_API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});