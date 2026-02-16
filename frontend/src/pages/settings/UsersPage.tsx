import {
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    KeyOutlined,
    MailOutlined,
    PhoneOutlined,
    PlusOutlined,
    SearchOutlined,
    StopOutlined,
    TeamOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    Descriptions,
    Drawer,
    Form,
    Input,
    message,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { settingsApi, type CreateUserData, type User, type UserDetail } from '../../features/settings/api';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDetail | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();
  const { canEdit, canDelete } = useModuleAccess('settings.users');

  const showFormErrors = (error: { errorFields?: Array<{ name: (string | number)[]; errors: string[] }> }) => {
    const errorFields = error?.errorFields || [];
    if (errorFields.length === 0) {
      message.warning('Заполните обязательные поля');
      return;
    }
    const messages = errorFields
      .map((field) => `${field.name.join('.')}: ${field.errors.join(', ')}`)
      .join('; ');
    message.error(messages);
  };

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', search, showInactive],
    queryFn: () => settingsApi.users.list({ 
      search: search || undefined,
      is_active: showInactive ? undefined : true,
    }),
  });

  // Fetch roles for select
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => settingsApi.roles.list(),
  });

  const users = usersData?.results || [];
  const roles = rolesData?.results || [];

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => settingsApi.users.create(data),
    onSuccess: () => {
      message.success('Пользователь создан');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (error: Error & { response?: { data?: Record<string, string[]> } }) => {
      const errorData = error.response?.data as unknown;
      if (errorData && typeof errorData === 'object') {
        const messages = Object.entries(errorData as Record<string, string[] | string>)
          .map(([field, errors]) =>
            Array.isArray(errors)
              ? `${field}: ${errors.join(', ')}`
              : `${field}: ${String(errors)}`
          )
          .join('; ');
        message.error(messages || 'Ошибка создания пользователя');
      } else if (typeof errorData === 'string') {
        message.error(errorData);
      } else {
        message.error('Ошибка создания пользователя');
      }
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserDetail> }) =>
      settingsApi.users.update(id, data),
    onSuccess: () => {
      message.success('Пользователь обновлён');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      setEditingUser(null);
      form.resetFields();
    },
    onError: () => message.error('Ошибка обновления'),
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.users.delete(id),
    onSuccess: () => {
      message.success('Пользователь удалён');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => message.error('Ошибка удаления'),
  });

  // Activate/Deactivate mutations
  const activateMutation = useMutation({
    mutationFn: (id: string) => settingsApi.users.activate(id),
    onSuccess: () => {
      message.success('Пользователь активирован');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => message.error('Ошибка активации'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => settingsApi.users.deactivate(id),
    onSuccess: () => {
      message.success('Пользователь деактивирован');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => message.error('Ошибка деактивации'),
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      settingsApi.users.resetPassword(id, password),
    onSuccess: () => {
      message.success('Пароль сброшен');
      setResetPasswordModal(false);
      setResetPasswordUserId(null);
      resetPasswordForm.resetFields();
    },
    onError: () => message.error('Ошибка сброса пароля'),
  });

  // Fetch single user for detail view
  const { data: userDetail } = useQuery({
    queryKey: ['user', selectedUser?.id],
    queryFn: () => settingsApi.users.get(selectedUser!.id),
    enabled: !!selectedUser?.id && detailDrawerOpen,
  });

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = async (user: User) => {
    const detail = await settingsApi.users.get(user.id);
    setEditingUser(detail);
    form.setFieldsValue({
      ...detail,
      role_ids: detail.user_roles.map(ur => ur.role),
    });
    setModalOpen(true);
  };

  const handleViewDetail = async (user: User) => {
    const detail = await settingsApi.users.get(user.id);
    setSelectedUser(detail);
    setDetailDrawerOpen(true);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        data: values as unknown as Partial<UserDetail>,
      });
    } else {
      createMutation.mutate(values as unknown as CreateUserData);
    }
  };

  const handleResetPassword = (userId: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordModal(true);
  };

  const submitResetPassword = (values: { new_password: string }) => {
    if (resetPasswordUserId) {
      resetPasswordMutation.mutate({
        id: resetPasswordUserId,
        password: values.new_password,
      });
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: 'Пользователь',
      key: 'user',
      width: 280,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <UserOutlined />
            <Text strong style={{ cursor: 'pointer' }} onClick={() => handleViewDetail(record)}>
              {record.full_name || record.username}
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>@{record.username}</Text>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 220,
      render: (email) => (
        <Space>
          <MailOutlined />
          <Text>{email}</Text>
        </Space>
      ),
    },
    {
      title: 'Должность / Отдел',
      key: 'position',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.position || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.department || '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Роли',
      dataIndex: 'roles_display',
      key: 'roles',
      width: 180,
      render: (rolesArr: string[]) => (
        <Space wrap size={4}>
          {rolesArr && rolesArr.length > 0 ? (
            rolesArr.map((role, idx) => (
              <Tag key={idx} color="blue">{role}</Tag>
            ))
          ) : (
            <Text type="secondary">—</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      align: 'center',
      render: (isActive) =>
        isActive ? (
          <Badge status="success" text="Активен" />
        ) : (
          <Badge status="default" text="Неактивен" />
        ),
    },
    {
      title: 'Последний вход',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 150,
      render: (date) =>
        date ? dayjs(date).format('DD.MM.YYYY HH:mm') : <Text type="secondary">—</Text>,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {canEdit && (
            <Tooltip title="Редактировать">
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            </Tooltip>
          )}
          {canEdit && (
            <Tooltip title="Сбросить пароль">
              <Button size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(record.id)} />
            </Tooltip>
          )}
          {canEdit && (record.is_active ? (
            <Popconfirm
              title="Деактивировать пользователя?"
              onConfirm={() => deactivateMutation.mutate(record.id)}
              okText="Да"
              cancelText="Нет"
            >
              <Tooltip title="Деактивировать">
                <Button size="small" danger icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Активировать">
              <Button
                size="small"
                type="primary"
                ghost
                icon={<CheckCircleOutlined />}
                onClick={() => activateMutation.mutate(record.id)}
              />
            </Tooltip>
          ))}
          {canDelete && (
            <Popconfirm
              title="Удалить пользователя?"
              description="Это действие нельзя отменить"
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="Удалить"
              okType="danger"
              cancelText="Отмена"
            >
              <Tooltip title="Удалить">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Пользователи</Title>
          <Text type="secondary">Управление пользователями системы</Text>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Добавить пользователя
          </Button>
        )}
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по имени, email..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Switch
            checkedChildren="Показать неактивных"
            unCheckedChildren="Только активные"
            checked={showInactive}
            onChange={setShowInactive}
          />
        </Space>
      </Card>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total} пользователей`,
          }}
          scroll={{ x: 1200 }}
          size="small"
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingUser(null);
          form.resetFields();
        }}
        onOk={() => {
          form
            .validateFields()
            .then(handleSubmit)
            .catch(showFormErrors);
        }}
        okText={editingUser ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        width={600}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okButtonProps={{ style: !canEdit ? { display: 'none' } : undefined }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onFinishFailed={showFormErrors}
          initialValues={{ is_active: true }}
        >
          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item
              name="username"
              label="Логин"
              rules={[
                { required: true, message: 'Введите логин' },
                { whitespace: true, message: 'Логин не может быть пустым' },
              ]}
              style={{ flex: 1 }}
            >
              <Input prefix={<UserOutlined />} placeholder="Логин для входа" disabled={!!editingUser} />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Введите email' },
                { type: 'email', message: 'Некорректный email' },
              ]}
              style={{ flex: 1 }}
            >
              <Input prefix={<MailOutlined />} placeholder="email@example.com" />
            </Form.Item>
          </Space>

          {!editingUser && (
            <Space size="middle" style={{ display: 'flex' }}>
              <Form.Item
                name="password"
                label="Пароль"
                rules={[{ required: true, message: 'Введите пароль' }]}
                style={{ flex: 1 }}
              >
                <Input.Password placeholder="Пароль" />
              </Form.Item>
              <Form.Item
                name="password_confirm"
                label="Подтверждение"
                rules={[
                  { required: true, message: 'Подтвердите пароль' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Пароли не совпадают'));
                    },
                  }),
                ]}
                style={{ flex: 1 }}
              >
                <Input.Password placeholder="Повторите пароль" />
              </Form.Item>
            </Space>
          )}

          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item name="last_name" label="Фамилия" style={{ flex: 1 }}>
              <Input placeholder="Иванов" />
            </Form.Item>
            <Form.Item name="first_name" label="Имя" style={{ flex: 1 }}>
              <Input placeholder="Иван" />
            </Form.Item>
            <Form.Item name="middle_name" label="Отчество" style={{ flex: 1 }}>
              <Input placeholder="Иванович" />
            </Form.Item>
          </Space>

          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item name="position" label="Должность" style={{ flex: 1 }}>
              <Input placeholder="Инженер" />
            </Form.Item>
            <Form.Item name="department" label="Отдел" style={{ flex: 1 }}>
              <Input placeholder="Производственный отдел" />
            </Form.Item>
          </Space>

          <Form.Item name="phone" label="Телефон">
            <Input prefix={<PhoneOutlined />} placeholder="+7 (999) 123-45-67" />
          </Form.Item>

          <Form.Item name="role_ids" label="Роли">
            <Select
              mode="multiple"
              placeholder="Выберите роли"
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
              optionFilterProp="label"
            />
          </Form.Item>

          <Space size="middle">
            <Form.Item name="is_active" valuePropName="checked" label="Активен">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title="Сброс пароля"
        open={resetPasswordModal}
        onCancel={() => {
          setResetPasswordModal(false);
          setResetPasswordUserId(null);
          resetPasswordForm.resetFields();
        }}
        onOk={() => resetPasswordForm.submit()}
        okText="Сбросить"
        cancelText="Отмена"
        confirmLoading={resetPasswordMutation.isPending}
      >
        <Form form={resetPasswordForm} layout="vertical" onFinish={submitResetPassword}>
          <Form.Item
            name="new_password"
            label="Новый пароль"
            rules={[
              { required: true, message: 'Введите новый пароль' },
              { min: 8, message: 'Пароль должен быть минимум 8 символов' },
            ]}
          >
            <Input.Password placeholder="Новый пароль" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Подтверждение пароля"
            rules={[
              { required: true, message: 'Подтвердите пароль' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Пароли не совпадают'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Подтверждение пароля" />
          </Form.Item>
        </Form>
      </Modal>

      {/* User Detail Drawer */}
      <Drawer
        title="Информация о пользователе"
        open={detailDrawerOpen}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedUser(null);
        }}
        width={500}
      >
        {(userDetail || selectedUser) && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Логин">
                {(userDetail || selectedUser)?.username}
              </Descriptions.Item>
              <Descriptions.Item label="ФИО">
                {(userDetail || selectedUser)?.full_name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {(userDetail || selectedUser)?.email}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">
                {userDetail?.phone || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Должность">
                {(userDetail || selectedUser)?.position || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Отдел">
                {(userDetail || selectedUser)?.department || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                {(userDetail || selectedUser)?.is_active ? (
                  <Badge status="success" text="Активен" />
                ) : (
                  <Badge status="default" text="Неактивен" />
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Дата регистрации">
                {userDetail?.date_joined
                  ? dayjs(userDetail.date_joined).format('DD.MM.YYYY HH:mm')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Последний вход">
                {(userDetail || selectedUser)?.last_login
                  ? dayjs((userDetail || selectedUser)?.last_login).format('DD.MM.YYYY HH:mm')
                  : '—'}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 24 }}>
              <TeamOutlined /> Роли
            </Title>
            {userDetail?.user_roles && userDetail.user_roles.length > 0 ? (
              <Space wrap>
                {userDetail.user_roles.map((ur) => (
                  <Tag key={ur.id} color="blue" icon={<TeamOutlined />}>
                    {ur.role_detail?.name || 'Роль'}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">Нет назначенных ролей</Text>
            )}

            <div style={{ marginTop: 24 }}>
              <Space>
                <Button icon={<EditOutlined />} onClick={() => {
                  setDetailDrawerOpen(false);
                  if (userDetail) handleEdit(userDetail);
                }}>
                  Редактировать
                </Button>
                <Button icon={<KeyOutlined />} onClick={() => {
                  if (userDetail) {
                    handleResetPassword(userDetail.id);
                  }
                }}>
                  Сбросить пароль
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
