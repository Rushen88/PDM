import { useNavigate } from 'react-router-dom';
import { Layout, Input, Dropdown, Avatar, Space, Button, type MenuProps } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined,
} from '@ant-design/icons';

import { useAuth } from '../../../app/providers/AuthProvider';
import { AppBreadcrumbs } from './Breadcrumbs';

const { Header } = Layout;

interface AppHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function AppHeader({ collapsed, onToggleCollapse }: AppHeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Профиль',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
      onClick: logout,
    },
  ];

  // Get user initials for avatar
  const getInitials = () => {
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const last = user.last_name?.[0] || '';
    return (first + last).toUpperCase() || user.username[0].toUpperCase();
  };

  // Get display name
  const getDisplayName = () => {
    if (!user) return 'Пользователь';
    if (user.full_name) return user.full_name;
    if (user.first_name || user.last_name) {
      return `${user.last_name} ${user.first_name}`.trim();
    }
    return user.username;
  };

  // Get primary role name
  const getPrimaryRole = () => {
    if (!user?.user_roles?.length) return '';
    return user.user_roles[0]?.role_detail?.name || '';
  };

  return (
    <Header
      style={{
        padding: '0 24px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 99,
      }}
    >
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Collapse toggle */}
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleCollapse}
          style={{ fontSize: 16 }}
        />

        {/* Breadcrumbs */}
        <AppBreadcrumbs />
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Search */}
        <Input
          placeholder="Поиск..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          style={{ width: 240 }}
          allowClear
        />

        {/* Notifications */}
        <Button
          type="text"
          icon={<BellOutlined />}
          style={{ fontSize: 18 }}
        />

        {/* User menu */}
        <Dropdown
          menu={{ items: userMenuItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              style={{ backgroundColor: '#1890ff' }}
              icon={<UserOutlined />}
            >
              {getInitials()}
            </Avatar>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>
                {getDisplayName()}
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                {getPrimaryRole()}
              </div>
            </div>
          </Space>
        </Dropdown>
      </div>
    </Header>
  );
}
