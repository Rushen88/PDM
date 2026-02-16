import {
    BarChartOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    InboxOutlined,
    LaptopOutlined,
    ProjectOutlined,
    SettingOutlined,
    ShoppingCartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Layout, Menu, type MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/providers/AuthProvider';
import { moduleAccessApi, type ModuleAccessLevel } from '../../../features/auth/api';

const { Sider } = Layout;

interface AppSidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: string,
  icon?: React.ReactNode,
  children?: MenuItem[],
  moduleCode?: string
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
    moduleCode,
  } as MenuItem;
}

export function AppSidebar({ collapsed, onCollapse }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_superuser || user?.user_roles?.some((r) => r.role_detail?.code === 'admin');

  const { data: accessData, isLoading: accessLoading } = useQuery({
    queryKey: ['my-module-access'],
    queryFn: () => moduleAccessApi.getMyAccess(),
    enabled: !!user,
  });

  const accessMap = new Map<string, ModuleAccessLevel>(
    (accessData || []).map((a) => [a.module_code, a.access_level])
  );

  const hasAccess = (moduleCode?: string) => {
    if (!moduleCode) return true;
    if (isAdmin) return true;
    if (!accessData || accessLoading) return true;
    const level = accessMap.get(moduleCode);
    return !!level && level !== 'none';
  };

  const filterByAccess = (items: MenuItem[]): MenuItem[] => {
    return items.flatMap((item) => {
      if (!item) return [];
      if ((item as any).type === 'divider') return [item];

      const moduleCode = (item as any).moduleCode as string | undefined;
      const children = (item as any).children as MenuItem[] | undefined;
      const visibleChildren = children ? filterByAccess(children) : undefined;
      const hasVisibleChild = !!visibleChildren?.some((child) => (child as any).type !== 'divider');
      const isVisible = hasAccess(moduleCode) || hasVisibleChild;

      if (!isVisible) return [];
      return [{ ...item, children: visibleChildren }];
    });
  };

  const menuItems: MenuItem[] = filterByAccess([
    getItem('Панель управления', '/', <DashboardOutlined />, undefined, 'dashboard'),
    getItem('Проекты', '/projects', <ProjectOutlined />, [
      getItem('Активные', '/projects?status=in_progress', undefined, undefined, 'projects.active'),
      getItem('Все проекты', '/projects', undefined, undefined, 'projects.all'),
      getItem('Архив', '/projects?status=completed', undefined, undefined, 'projects.archive'),
    ], 'projects'),
    getItem('Справочники', '/catalog', <DatabaseOutlined />, [
      getItem('Номенклатура', '/catalog/nomenclature', undefined, undefined, 'catalog.nomenclature'),
      getItem('Поставщики', '/catalog/suppliers', undefined, undefined, 'catalog.suppliers'),
      getItem('Подрядчики', '/catalog/contractors', undefined, undefined, 'catalog.contractors'),
      { type: 'divider' },
      getItem('Настройка справочников', '/catalog/settings', undefined, undefined, 'catalog.settings'),
    ], 'catalog'),
    getItem('Снабжение', '/procurement', <ShoppingCartOutlined />, [
      getItem('Потребности', '/procurement/requirements', undefined, undefined, 'procurement.requirements'),
      getItem('Заказы на закупку', '/procurement/orders', undefined, undefined, 'procurement.orders'),
    ], 'procurement'),
    getItem('Рабочее место', '/workplace', <LaptopOutlined />, undefined, 'workplace'),
    getItem('Склад', '/warehouse', <InboxOutlined />, [
      getItem('Остатки', '/warehouse', undefined, undefined, 'warehouse.inventory'),
      getItem('Поступления', '/warehouse/receipts', undefined, undefined, 'warehouse.receipts'),
      getItem('Движение товаров', '/warehouse/movements', undefined, undefined, 'warehouse.movements'),
      getItem('Перемещения', '/warehouse/transfers', undefined, undefined, 'warehouse.transfers'),
      getItem('Передачи подрядчикам', '/warehouse/contractor-writeoffs', undefined, undefined, 'warehouse.contractor_transfer'),
      getItem('Приёмки от подрядчиков', '/warehouse/contractor-receipts', undefined, undefined, 'warehouse.contractor_return'),
      getItem('Инвентаризация', '/warehouse/inventory', undefined, undefined, 'warehouse.stocktaking'),
    ], 'warehouse'),
    getItem('Аналитика', '/analytics', <BarChartOutlined />, undefined, 'analytics'),
    { type: 'divider' },
    getItem('Настройки', '/settings', <SettingOutlined />, [
      getItem('Пользователи', '/settings/users', undefined, undefined, 'settings.users'),
      getItem('Роли', '/settings/roles', undefined, undefined, 'settings.roles'),
      getItem('Склады', '/settings/warehouses', undefined, undefined, 'settings.warehouses'),
      { type: 'divider' },
      getItem('Система', '/settings/system', undefined, undefined, 'settings.system'),
      getItem('Статусы производства', '/settings/manufacturing-statuses', undefined, undefined, 'settings.production_statuses'),
      getItem('Статусы закупок', '/settings/purchase-statuses', undefined, undefined, 'settings.procurement_statuses'),
      getItem('Причины производства', '/settings/manufacturing-problem-reasons', undefined, undefined, 'settings.production_reasons'),
      getItem('Причины закупок', '/settings/purchase-problem-reasons', undefined, undefined, 'settings.procurement_reasons'),
    ], 'settings'),
  ]);

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key);
  };

  // Get selected keys based on current path
  const getSelectedKeys = () => {
    const path = location.pathname;

    // Projects list supports status filtering via querystring
    if (path === '/projects') {
      const params = new URLSearchParams(location.search);
      const status = params.get('status');
      if (status === 'in_progress') return ['/projects?status=in_progress'];
      if (status === 'completed') return ['/projects?status=completed'];
      return ['/projects'];
    }

    // Handle nested project routes (detail/tabs)
    if (path.startsWith('/projects/')) return ['/projects'];
    if (path.startsWith('/catalog/')) return [path];
    if (path.startsWith('/settings/')) return [path];
    return [path];
  };

  // Get open keys for submenus
  const getOpenKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/projects')) return ['/projects'];
    if (path.startsWith('/catalog')) return ['/catalog'];
    if (path.startsWith('/procurement')) return ['/procurement'];
    if (path.startsWith('/workplace')) return ['/workplace'];
    if (path.startsWith('/warehouse')) return ['/warehouse'];
    if (path.startsWith('/settings')) return ['/settings'];
    return [];
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      collapsedWidth={64}
      style={{
        background: '#fff',
        borderRight: '1px solid #f0f0f0',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        overflow: 'auto',
      }}
      trigger={null}
    >
      {/* Logo */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 16px',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 600,
          fontSize: 18,
          color: '#1890ff',
          cursor: 'pointer',
        }}
        onClick={() => navigate('/')}
      >
        {collapsed ? '▤' : '▤ PDM ERP'}
      </div>

      {/* Navigation Menu */}
      <Menu
        mode="inline"
        selectedKeys={getSelectedKeys()}
        defaultOpenKeys={collapsed ? [] : getOpenKeys()}
        items={menuItems}
        onClick={handleMenuClick}
        style={{
          border: 'none',
          marginTop: 8,
        }}
      />
    </Sider>
  );
}
