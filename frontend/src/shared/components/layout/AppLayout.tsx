import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';

import { AppHeader } from './Header';
import { AppSidebar } from './Sidebar';

const { Content } = Layout;

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarOffset = collapsed ? 64 : 240;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppSidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout
        style={{
          marginLeft: sidebarOffset,
          transition: 'margin-left 0.2s',
        }}
      >
        <AppHeader collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
        <Content
          style={{
            margin: 0,
            padding: 24,
            minHeight: 280,
            background: '#f5f5f5',
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
