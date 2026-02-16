import axios, {
    type AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type InternalAxiosRequestConfig
} from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
export const ACCESS_TOKEN_KEY = 'pdm_access_token';
export const REFRESH_TOKEN_KEY = 'pdm_refresh_token';
export const USER_KEY = 'pdm_user';

/**
 * API Endpoints Constants
 */
export const API_ENDPOINTS = {
  // Procurement
  GOODS_RECEIPTS: '/goods-receipts/',
  GOODS_RECEIPT_ITEMS: '/goods-receipt-items/',
  PURCHASE_ORDERS: '/purchase-orders/',
  PURCHASE_ORDER_ITEMS: '/purchase-order-items/',
  MATERIAL_REQUIREMENTS: '/material-requirements/',
  // Warehouse
  WAREHOUSES: '/warehouses/',
  STOCK_ITEMS: '/stock-items/',
  STOCK_MOVEMENTS: '/stock-movements/',
  STOCK_TRANSFERS: '/stock-transfers/',
  CONTRACTOR_WRITEOFFS: '/contractor-writeoffs/',
  CONTRACTOR_WRITEOFF_ITEMS: '/contractor-writeoff-items/',
  CONTRACTOR_RECEIPTS: '/contractor-receipts/',
  CONTRACTOR_RECEIPT_ITEMS: '/contractor-receipt-items/',
};

/**
 * Axios instance configured for the PDM API
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: AxiosError) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and token refresh
apiClient.interceptors.response.use(
  (response: any) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 - Unauthorized (try to refresh token)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for the ongoing refresh
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      
      if (!refreshToken) {
        // No refresh token, redirect to login
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Try to refresh the token
        const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;
        localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);

        processQueue(null, newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        // Refresh failed, redirect to login
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle 403 - Forbidden
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data);
    }

    // Handle 500 - Server error
    if (error.response?.status && error.response.status >= 500) {
      console.error('Server error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

/**
 * Generic API request function
 */
export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}

/**
 * API helper methods
 */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'GET', url }),

  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'POST', url, data }),

  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'PUT', url, data }),

  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'PATCH', url, data }),

  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    apiRequest<T>({ ...config, method: 'DELETE', url }),
};

export default apiClient;
