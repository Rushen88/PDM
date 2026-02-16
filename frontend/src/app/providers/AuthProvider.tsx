import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { App } from 'antd';

import { authApi, type User, type LoginCredentials } from '../../features/auth/api';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from '../../shared/api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem(USER_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (error: any) {
      console.error('Auth check error:', error);
      // Token is invalid or server is down, clear local data
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      
      // Show error message only if it's not a 401 (unauthorized)
      if (error.response?.status !== 401) {
        if (error.code === 'ERR_NETWORK') {
          message.warning('Сервер недоступен. Пожалуйста, войдите в систему.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    
    try {
      const response = await authApi.login(credentials);
      // Store JWT tokens
      localStorage.setItem(ACCESS_TOKEN_KEY, response.access);
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setUser(response.user);
      message.success(`Добро пожаловать, ${response.user.full_name || response.user.username}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Ошибка авторизации';
      
      if (error.response) {
        // Server responded with error
        if (error.response.status === 502 || error.response.status === 503) {
          errorMessage = 'Сервер недоступен. Проверьте, что бэкенд запущен на порту 8000';
        } else if (error.response.status === 401) {
          errorMessage = 'Неверный логин или пароль';
        } else if (error.response.data?.non_field_errors?.[0]) {
          errorMessage = error.response.data.non_field_errors[0];
        } else if (error.response.data?.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data?.username) {
          errorMessage = `Логин: ${error.response.data.username[0]}`;
        } else if (error.response.data?.password) {
          errorMessage = `Пароль: ${error.response.data.password[0]}`;
        }
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Ошибка сети. Проверьте подключение и доступность сервера';
      }
      
      message.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch (error) {
      // Ignore logout errors
    } finally {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      message.info('Вы вышли из системы');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
