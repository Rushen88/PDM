import { HomeOutlined } from '@ant-design/icons';
import { Breadcrumb } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Breadcrumb configuration for routes
 */
const breadcrumbNameMap: Record<string, string> = {
  '/': 'Главная',
  '/projects': 'Проекты',
  '/catalog': 'Справочники',
  '/catalog/nomenclature': 'Номенклатура',
  '/catalog/suppliers': 'Поставщики',
  '/catalog/contractors': 'Подрядчики',
  '/bom': 'Структуры изделий',
  '/procurement': 'Снабжение',
  '/procurement/requirements': 'Потребности',
  '/procurement/orders': 'Заказы на закупку',
  '/production': 'Производство',
  '/warehouse': 'Склад',
  '/warehouse/movements': 'Движение товаров',
  '/warehouse/inventory': 'Инвентаризация',
  '/analytics': 'Аналитика',
  '/settings': 'Настройки',
  '/settings/users': 'Пользователи',
  '/settings/roles': 'Роли',
  '/settings/system': 'Система',
};

export function AppBreadcrumbs() {
  const location = useLocation();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handler = () => forceUpdate((prev) => prev + 1);
    window.addEventListener('project-name-updated', handler);
    return () => window.removeEventListener('project-name-updated', handler);
  }, []);

  // Build breadcrumb items from pathname
  const pathSnippets = location.pathname.split('/').filter((i) => i);

  const breadcrumbItems = pathSnippets.map((_, index) => {
    const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
    const isLast = index === pathSnippets.length - 1;
    const snippet = pathSnippets[index];

    // Check if this is a dynamic segment (e.g., project ID)
    let title = breadcrumbNameMap[url];

    // Handle dynamic segments
    if (!title) {
      // Check if it's an ID (numeric or UUID)
      if (/^\d+$/.test(snippet) || /^[0-9a-fA-F-]{36}$/.test(snippet)) {
        const prevPath = `/${pathSnippets.slice(0, index).join('/')}`;
        if (prevPath === '/projects') {
          const storedName = sessionStorage.getItem(`project-name:${snippet}`);
          title = storedName || `Проект`;
        } else if (prevPath === '/bom') {
          title = `BOM`;
        } else {
          title = `#${snippet}`;
        }
      } else {
        // Handle tab names
        const tabNames: Record<string, string> = {
          structure: 'Структура',
          gantt: 'Gantt',
          procurement: 'Снабжение',
          production: 'Производство',
          documents: 'Документы',
          history: 'История',
        };
        title = tabNames[snippet] || snippet;
      }
    }

    return {
      key: url,
      title: isLast ? (
        title
      ) : (
        <Link to={url}>{title}</Link>
      ),
    };
  });

  // Add home at the beginning
  const items = [
    {
      key: 'home',
      title: (
        <Link to="/">
          <HomeOutlined />
        </Link>
      ),
    },
    ...breadcrumbItems,
  ];

  // Don't show breadcrumbs on home page
  if (location.pathname === '/') {
    return null;
  }

  return (
    <Breadcrumb
      items={items}
      style={{ margin: 0 }}
    />
  );
}
