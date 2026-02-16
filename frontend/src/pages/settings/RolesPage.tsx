import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Radio,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { settingsApi, type ModuleAccessLevel, type ProjectAccessScope, type Role, type RoleModuleAccess } from '../../features/settings/api';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

// Access level options with descriptions
const accessLevelOptions = [
  { value: 'none', label: 'Нет доступа', color: 'default' },
  { value: 'view', label: 'Только просмотр', color: 'blue' },
  { value: 'edit', label: 'Редактирование', color: 'orange' },
  { value: 'full', label: 'Полный доступ', color: 'green' },
];

// Project access scope options
const projectAccessScopeOptions: { value: ProjectAccessScope; label: string; description: string }[] = [
  {
    value: 'own',
    label: 'Только свои позиции',
    description: 'Пользователь видит и редактирует только позиции, где он назначен ответственным',
  },
  {
    value: 'own_children_name_only',
    label: 'Свои позиции + дочерние (только наименования)',
    description: 'Чужие дочерние структуры отображаются строками без раскрытия и редактирования',
  },
  {
    value: 'own_children_view',
    label: 'Свои позиции + дочерние (просмотр)',
    description: 'Чужие дочерние структуры можно раскрывать и просматривать, но без редактирования',
  },
  {
    value: 'own_children_edit',
    label: 'Свои позиции + дочерние (редактирование)',
    description: 'Чужие дочерние структуры можно раскрывать, просматривать и редактировать',
  },
  {
    value: 'all',
    label: 'Все проекты (полный доступ)',
    description: 'Полный доступ ко всем проектам и позициям без ограничений',
  },
];

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [moduleAccessMap, setModuleAccessMap] = useState<Record<string, ModuleAccessLevel>>({});
  const [form] = Form.useForm();
  const { canEdit, canDelete } = useModuleAccess('settings.roles');

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

  const toRoleCode = (name: string) => {
    const map: Record<string, string> = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
      и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
      с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
      ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    };

    const translit = name
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9\s_-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '_');

    return translit || `role_${Date.now()}`;
  };

  // Fetch roles
  const { data: rolesData, isLoading } = useQuery({
    queryKey: ['roles', search],
    queryFn: () => settingsApi.roles.list(),
  });

  // Fetch system modules
  const { data: modulesData } = useQuery({
    queryKey: ['system-modules'],
    queryFn: () => settingsApi.systemModules.list(),
  });

  const roles = rolesData?.results || [];
  const modules = modulesData?.results || [];

  const moduleAccessRows = useMemo(() => {
    const moduleByCode = new Map(modules.map((m) => [m.code, m]));
    const rows: Array<{ id: string; name: string; indent: number }> = [];

    const structure = [
      { code: 'dashboard', name: 'Панель управления', indent: 0 },
      { code: 'projects', name: 'Проекты', indent: 0 },
      { code: 'projects.active', name: 'Активные', indent: 1 },
      { code: 'projects.all', name: 'Все проекты', indent: 1 },
      { code: 'projects.archive', name: 'Архив', indent: 1 },
      { code: 'catalog', name: 'Справочники', indent: 0 },
      { code: 'catalog.nomenclature', name: 'Номенклатура', indent: 1 },
      { code: 'catalog.suppliers', name: 'Поставщики', indent: 1 },
      { code: 'catalog.contractors', name: 'Подрядчики', indent: 1 },
      { code: 'catalog.settings', name: 'Настройка справочников', indent: 1 },
      { code: 'procurement', name: 'Снабжение', indent: 0 },
      { code: 'procurement.requirements', name: 'Потребности', indent: 1 },
      { code: 'procurement.orders', name: 'Заказы на закупку', indent: 1 },
      { code: 'workplace', name: 'Рабочее место', indent: 0 },
      { code: 'warehouse', name: 'Склад', indent: 0 },
      { code: 'warehouse.inventory', name: 'Остатки', indent: 1 },
      { code: 'warehouse.receipts', name: 'Поступления', indent: 1 },
      { code: 'warehouse.movements', name: 'Движение товаров', indent: 1 },
      { code: 'warehouse.transfers', name: 'Перемещения', indent: 1 },
      { code: 'warehouse.contractor_transfer', name: 'Передачи подрядчикам', indent: 1 },
      { code: 'warehouse.contractor_return', name: 'Приёмки от подрядчиков', indent: 1 },
      { code: 'warehouse.stocktaking', name: 'Инвентаризация', indent: 1 },
      { code: 'analytics', name: 'Аналитика', indent: 0 },
      { code: 'settings', name: 'Настройки', indent: 0 },
      { code: 'settings.users', name: 'Пользователи', indent: 1 },
      { code: 'settings.roles', name: 'Роли', indent: 1 },
      { code: 'settings.warehouses', name: 'Склады', indent: 1 },
      { code: 'settings.system', name: 'Система', indent: 1 },
      { code: 'settings.production_statuses', name: 'Статусы производства', indent: 1 },
      { code: 'settings.procurement_statuses', name: 'Статусы закупок', indent: 1 },
      { code: 'settings.production_reasons', name: 'Причины производства', indent: 1 },
      { code: 'settings.procurement_reasons', name: 'Причины закупок', indent: 1 },
    ];

    structure.forEach((item) => {
      const module = moduleByCode.get(item.code);
      if (module) {
        rows.push({ id: module.id, name: item.name, indent: item.indent });
      }
    });

    return rows;
  }, [modules]);
  
  const filteredRoles = roles.filter((role) =>
    [role.name, role.code, role.description]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search.toLowerCase()))
  );

  const createMutation = useMutation({
    mutationFn: (data: Partial<Role>) => settingsApi.roles.create(data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Role> }) =>
      settingsApi.roles.update(id, data),
    onSuccess: () => {
      message.success('Роль обновлена');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
      setEditingRole(null);
      form.resetFields();
    },
    onError: () => message.error('Ошибка обновления роли'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.roles.delete(id),
    onSuccess: () => {
      message.success('Роль удалена');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: () => message.error('Ошибка удаления роли'),
  });

  const setModuleAccessMutation = useMutation({
    mutationFn: ({ roleId, moduleAccess }: { 
      roleId: string; 
      moduleAccess: Array<{ module_id: string; access_level: ModuleAccessLevel }> 
    }) => settingsApi.roles.setModuleAccess(roleId, moduleAccess),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: () => message.error('Ошибка сохранения прав'),
  });

  const handleCreate = () => {
    setEditingRole(null);
    setModuleAccessMap({});
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      project_access_scope: 'all',
    });
    setModalOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    form.setFieldsValue({
      name: role.name,
      description: role.description,
      is_active: role.is_active,
      can_be_production_responsible: role.can_be_production_responsible,
      can_be_inventory_responsible: role.can_be_inventory_responsible,
      project_access_scope: role.project_access_scope || 'all',
    });
    const accessMap: Record<string, ModuleAccessLevel> = {};
    if (role.module_access) {
      role.module_access.forEach((ma: RoleModuleAccess) => {
        accessMap[ma.module_id] = ma.access_level;
      });
    }
    setModuleAccessMap(accessMap);
    setModalOpen(true);
  };


  const buildModuleAccessPayload = () =>
    Object.entries(moduleAccessMap)
      .filter(([, level]) => level !== 'none')
      .map(([moduleId, accessLevel]) => ({
        module_id: moduleId,
        access_level: accessLevel as ModuleAccessLevel,
      }));

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      if (editingRole) {
        await updateMutation.mutateAsync({ id: editingRole.id, data: values });
        const moduleAccess = buildModuleAccessPayload();
        await setModuleAccessMutation.mutateAsync({ roleId: editingRole.id, moduleAccess });
      } else {
        const nameValue = String(values.name || '').trim();
        const baseCode = toRoleCode(nameValue);
        const payload = {
          ...values,
          code: `${baseCode}_${Date.now().toString().slice(-4)}`,
        };
        const role = await createMutation.mutateAsync(payload);
        const moduleAccess = buildModuleAccessPayload();
        await setModuleAccessMutation.mutateAsync({ roleId: role.id, moduleAccess });
      }
      message.success(editingRole ? 'Роль обновлена' : 'Роль создана');
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
      setEditingRole(null);
      form.resetFields();
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: Record<string, string[]> } };
      const errorData = err.response?.data as unknown;
      if (errorData && typeof errorData === 'object') {
        const messages = Object.entries(errorData as Record<string, string[] | string>)
          .map(([field, errors]) =>
            Array.isArray(errors)
              ? `${field}: ${errors.join(', ')}`
              : `${field}: ${String(errors)}`
          )
          .join('; ');
        message.error(messages || 'Ошибка сохранения роли');
      } else if (typeof errorData === 'string') {
        message.error(errorData);
      } else {
        message.error('Ошибка сохранения роли');
      }
    }
  };

  const columns: ColumnsType<Role> = [
    {
      title: 'Роль',
      key: 'role',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name}</Text>
        </Space>
      ),
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      width: 280,
      render: (value) => value || <Text type="secondary">—</Text>,
    },
    {
      title: 'Доступы',
      key: 'access',
      width: 200,
      render: (_, record) => {
        const accessCount = record.module_access?.length || 0;
        if (accessCount === 0) {
          return <Text type="secondary">Не настроены</Text>;
        }
        const fullCount = record.module_access?.filter(ma => ma.access_level === 'full').length || 0;
        const editCount = record.module_access?.filter(ma => ma.access_level === 'edit').length || 0;
        const viewCount = record.module_access?.filter(ma => ma.access_level === 'view').length || 0;
        return (
          <Space size={4} wrap>
            {fullCount > 0 && <Tag color="green">{fullCount} полных</Tag>}
            {editCount > 0 && <Tag color="orange">{editCount} редакт.</Tag>}
            {viewCount > 0 && <Tag color="blue">{viewCount} просм.</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Пользователи',
      dataIndex: 'users_count',
      key: 'users_count',
      width: 100,
      align: 'center',
      render: (value) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      align: 'center',
      render: (value) =>
        value ? <Badge status="success" text="Активна" /> : <Badge status="default" text="Неактивна" />,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {canEdit && (
            <Tooltip title="Редактировать">
              <Button type="text" shape="circle" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title="Удалить роль?"
              description={
                record.users_count > 0 
                  ? `У роли есть ${record.users_count} пользователей. Удалить?` 
                  : "Это действие нельзя отменить"
              }
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="Удалить"
              okType="danger"
              cancelText="Отмена"
            >
              <Tooltip title="Удалить">
                <Button type="text" shape="circle" size="small" danger icon={<DeleteOutlined />} />
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
          <Title level={4} style={{ margin: 0 }}>Роли</Title>
          <Text type="secondary">Управление ролями и правами доступа</Text>
        </div>
        {canEdit && (
          <Button type="primary" shape="round" icon={<PlusOutlined />} onClick={handleCreate}>
            Добавить роль
          </Button>
        )}
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по названию, коду..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
      </Card>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={filteredRoles}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1200 }}
          size="small"
        />
      </Card>

      {/* Create/Edit Role Modal */}
      <Modal
        title={editingRole ? 'Редактировать роль' : 'Новая роль'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingRole(null);
          form.resetFields();
        }}
        onOk={() => {
          form
            .validateFields()
            .then(handleSubmit)
            .catch(showFormErrors);
        }}
        okText={editingRole ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        width={1280}
        bodyStyle={{ paddingTop: 8, paddingBottom: 8 }}
        confirmLoading={createMutation.isPending || updateMutation.isPending || setModuleAccessMutation.isPending}
        okButtonProps={{ size: 'middle', type: 'default', style: !canEdit ? { display: 'none' } : undefined }}
        cancelButtonProps={{ size: 'middle', type: 'default' }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onFinishFailed={showFormErrors}
          initialValues={{ is_active: true }}
        >
          <Row gutter={16} style={{ height: 720 }}>
            <Col span={9}>
              <Card size="small" title="Профиль роли" bodyStyle={{ padding: 8 }}>
                <Form.Item
                  name="name"
                  label="Название"
                  rules={[
                    { required: true, message: 'Введите название роли' },
                    { whitespace: true, message: 'Название не может быть пустым' },
                  ]}
                  style={{ marginBottom: 6 }}
                >
                  <Input placeholder="Роль" />
                </Form.Item>

                <Form.Item name="description" label="Описание" style={{ marginBottom: 6 }}>
                  <Input.TextArea rows={3} placeholder="Описание роли" />
                </Form.Item>

                <Form.Item name="is_active" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Space>
                    <Switch size="small" />
                    <Text>Активна</Text>
                  </Space>
                </Form.Item>
              </Card>

              <Card size="small" style={{ marginTop: 6 }} bodyStyle={{ padding: 8 }}>
                <Form.Item
                  name="can_be_production_responsible"
                  valuePropName="checked"
                  style={{ marginBottom: 2 }}
                >
                  <Space>
                    <Switch size="small" />
                    <Text>Может быть ответственным по производству</Text>
                  </Space>
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginLeft: 24 }}>
                  Пользователи с этой ролью отображаются в списке ответственных при назначении на позиции проекта
                </Text>
              </Card>

              <Card size="small" style={{ marginTop: 6 }} bodyStyle={{ padding: 8 }}>
                <Form.Item
                  name="can_be_inventory_responsible"
                  valuePropName="checked"
                  style={{ marginBottom: 2 }}
                >
                  <Space>
                    <Switch size="small" />
                    <Text>Может быть ответственным по инвентаризации</Text>
                  </Space>
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginLeft: 24 }}>
                  Пользователь отображается в списке ответственных для инвентаризации склада
                </Text>
              </Card>

              <Card size="small" title="Область видимости и доступ" style={{ marginTop: 6 }} bodyStyle={{ padding: 8 }}>
                <Form.Item name="project_access_scope" style={{ marginBottom: 6 }}>
                  <Select
                    options={projectAccessScopeOptions.map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    }))}
                    placeholder="Выберите режим доступа"
                  />
                </Form.Item>
              </Card>
            </Col>

            <Col span={15}>
              <Card size="small" title="Права доступа к модулям" style={{ height: '100%' }} bodyStyle={{ padding: 8, height: '100%' }}>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={moduleAccessRows}
                  scroll={{ y: 660 }}
                  style={{ width: '100%' }}
                  columns={[
                    {
                      title: 'Блок системы',
                      key: 'name',
                      width: 200,
                      render: (_, record) => (
                        <div style={{ paddingLeft: record.indent * 20 }}>
                          <Text strong={record.indent === 0}>{record.name}</Text>
                        </div>
                      ),
                    },
                    {
                      title: 'Права доступа',
                      key: 'access',
                      render: (_, record) => (
                        <Radio.Group
                          value={moduleAccessMap[record.id] || 'none'}
                          onChange={(e) => setModuleAccessMap(prev => ({
                            ...prev,
                            [record.id]: e.target.value
                          }))}
                          optionType="button"
                          buttonStyle="solid"
                          size="small"
                          style={{ fontSize: 10 }}
                        >
                          {accessLevelOptions.map(option => (
                            <Radio.Button
                              key={option.value}
                              value={option.value}
                              style={{ fontSize: 10, height: 24, lineHeight: '22px', padding: '0 6px' }}
                            >
                              {option.label}
                            </Radio.Button>
                          ))}
                        </Radio.Group>
                      ),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
