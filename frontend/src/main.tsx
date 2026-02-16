import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import updateLocale from 'dayjs/plugin/updateLocale';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './app/App';
import ErrorBoundary from './app/components/ErrorBoundary';
import { AuthProvider } from './app/providers/AuthProvider';
import { theme } from './styles/theme';

import './styles/index.css';

dayjs.extend(updateLocale);
dayjs.updateLocale('ru', { weekStart: 1 });
dayjs.locale('ru');

// Configure Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds - данные свежие 30 сек
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true, // Всегда перезагружать при монтировании компонента
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={theme} locale={ruRU}>
          <AntApp>
            <BrowserRouter>
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
