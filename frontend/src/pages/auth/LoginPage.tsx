import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

import { useAuth } from '../../app/providers/AuthProvider';
import type { LoginCredentials } from '../../features/auth/api';

const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (values: LoginCredentials) => {
    setSubmitting(true);
    try {
      await login(values);
      navigate('/');
    } catch (error) {
      // Error is handled in AuthProvider
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Space
          direction="vertical"
          size="large"
          style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}
        >
          <div
            style={{
              fontSize: 48,
              color: '#1890ff',
              lineHeight: 1,
            }}
          >
            ▤
          </div>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              PDM ERP
            </Title>
            <Text type="secondary">
              Система управления проектным производством
            </Text>
          </div>
        </Space>

        <Form
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          requiredMark={false}
          initialValues={{ username: '', password: '' }}
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: 'Введите имя пользователя' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Имя пользователя"
              size="large"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Введите пароль' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Пароль"
              size="large"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting || isLoading}
            >
              Войти
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Для входа используйте корпоративные учётные данные
          </Text>
        </div>
      </Card>
    </div>
  );
}
