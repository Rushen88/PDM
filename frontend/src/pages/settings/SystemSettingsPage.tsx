import {
    ExclamationCircleOutlined,
    ShoppingCartOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

interface SettingCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const SettingCard = ({ title, description, icon, path, color }: SettingCardProps) => {
  const navigate = useNavigate();

  return (
    <Card
      hoverable
      onClick={() => navigate(path)}
      style={{ height: '100%' }}
      bodyStyle={{ padding: 20 }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Title level={5} style={{ margin: 0, marginBottom: 4 }}>{title}</Title>
          <Text type="secondary">{description}</Text>
        </div>
      </div>
    </Card>
  );
};

export default function SystemSettingsPage() {
  const settingsGroups = [
    {
      title: 'Статусы',
      items: [
        {
          title: 'Статусы производства',
          description: 'Настройка этапов производственного процесса',
          icon: <ToolOutlined />,
          path: '/settings/manufacturing-statuses',
          color: '#1890ff',
        },
        {
          title: 'Статусы закупок',
          description: 'Настройка этапов процесса закупок',
          icon: <ShoppingCartOutlined />,
          path: '/settings/purchase-statuses',
          color: '#52c41a',
        },
      ],
    },
    {
      title: 'Причины проблем',
      items: [
        {
          title: 'Причины проблем производства',
          description: 'Справочник причин производственных задержек',
          icon: <ExclamationCircleOutlined />,
          path: '/settings/manufacturing-problem-reasons',
          color: '#fa8c16',
        },
        {
          title: 'Причины проблем закупок',
          description: 'Справочник причин проблем с закупками',
          icon: <WarningOutlined />,
          path: '/settings/purchase-problem-reasons',
          color: '#eb2f96',
        },
      ],
    },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>Настройки системы</Title>
        <Text type="secondary">Управление справочниками и параметрами системы</Text>
      </div>

      {settingsGroups.map((group) => (
        <div key={group.title} style={{ marginBottom: 32 }}>
          <Title level={5} style={{ marginBottom: 16 }}>{group.title}</Title>
          <Row gutter={[16, 16]}>
            {group.items.map((item) => (
              <Col key={item.path} xs={24} sm={12} lg={8}>
                <SettingCard {...item} />
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </div>
  );
}
