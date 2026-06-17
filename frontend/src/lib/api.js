import axios from "axios";
import { useAuthStore } from "../contexts/AuthContext";

const baseURL = "/api/v1";

export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: attach token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh on 401
let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      useAuthStore.getState().refreshToken &&
      !originalRequest.url.includes("/auth/")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject, originalRequest });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refresh = useAuthStore.getState().refreshToken;
        const resp = await axios.post(`${baseURL}/auth/refresh`, { refresh_token: refresh });
        const { access_token, refresh_token } = resp.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        // Drain queue
        queue.forEach(({ resolve, originalRequest: req }) => {
          req.headers.Authorization = `Bearer ${access_token}`;
          resolve(api(req));
        });
        queue = [];
        return api(originalRequest);
      } catch (e) {
        queue.forEach(({ reject }) => reject(e));
        queue = [];
        useAuthStore.getState().logout();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// Convenience wrappers
export const http = {
  get: (url, cfg) => api.get(url, cfg).then((r) => r.data),
  post: (url, data, cfg) => api.post(url, data, cfg).then((r) => r.data),
  put: (url, data, cfg) => api.put(url, data, cfg).then((r) => r.data),
  patch: (url, data, cfg) => api.patch(url, data, cfg).then((r) => r.data),
  delete: (url, cfg) => api.delete(url, cfg).then((r) => r.data),
};
