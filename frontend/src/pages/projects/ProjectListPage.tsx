import {
    DeleteOutlined,
    EditOutlined,
    ExportOutlined,
    EyeOutlined,
    MoreOutlined,
    PlusOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    DatePicker,
    Divider,
    Dropdown,
    Empty,
    Form,
    Input,
    message,
    Modal,
    Progress,
    Select,
    Space,
    Table,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { catalogApi, type CatalogCategory } from '../../features/catalog';
import { projectsApi, type Project, type ProjectStatus } from '../../features/projects';
import { StatusBadge } from '../../shared/components/data-display';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * Project List Page
 */
export default function ProjectListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  const { canEdit, canDelete } = useModuleAccess('projects');

  // Fetch manufactured categories for product selection
  const { data: manufacturedCategories = [] } = useQuery({
    queryKey: ['catalog-categories-manufactured'],
    queryFn: () => catalogApi.categories.manufactured(),
  });

  // Watch form category for loading nomenclature
  const formCategoryId = Form.useWatch('catalog_category', form);
  
  // Fetch nomenclature for selected category
  const { data: nomenclatureData } = useQuery({
    queryKey: ['nomenclature', formCategoryId],
    queryFn: () => catalogApi.nomenclature.list({ catalog_category: formCategoryId }),
    enabled: !!formCategoryId,
  });
  const nomenclatureItems = nomenclatureData?.results || [];

  // Get filter from URL
  const statusFilter = searchParams.get('status') as ProjectStatus | null;

  // Fetch projects from API
  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', searchText, statusFilter],
    queryFn: () => projectsApi.list({
      search: searchText || undefined,
      status: statusFilter || undefined,
    }),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Project>) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      message.success('Проект создан');
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: () => message.error('Ошибка создания проекта'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) => 
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      message.success('Проект обновлён');
      setIsModalOpen(false);
      setEditingProject(null);
      form.resetFields();
    },
    onError: () => message.error('Ошибка обновления проекта'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      message.success('Проект удалён');
    },
    onError: () => message.error('Ошибка удаления проекта'),
  });

  const handleAdd = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Project) => {
    setEditingProject(record);
    form.setFieldsValue({
      ...record,
      dates: record.start_date && record.planned_end_date 
        ? [dayjs(record.start_date), dayjs(record.planned_end_date)] 
        : undefined,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data: Partial<Project> = {
      name: values.name,
      description: values.description,
      status: values.status || 'planning',
      priority: values.priority || 1,
      start_date: values.dates?.[0]?.format('YYYY-MM-DD'),
      planned_end_date: values.dates?.[1]?.format('YYYY-MM-DD'),
    };
    
    // Добавляем корневую номенклатуру при создании (автоматически создаст структуру BOM)
    if (!editingProject && values.nomenclature_item) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any).root_nomenclature = values.nomenclature_item;
    }
    
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const projects = projectsData?.results || [];

  const columns: ColumnsType<Project> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <Button type="link" onClick={() => navigate(`/projects/${record.id}`)} style={{ padding: 0, textAlign: 'left' }}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      filters: [
        { text: 'Планирование', value: 'planning' },
        { text: 'В работе', value: 'in_progress' },
        { text: 'Приостановлен', value: 'on_hold' },
        { text: 'Завершён', value: 'completed' },
        { text: 'Отменён', value: 'cancelled' },
      ],
      render: (status: ProjectStatus) => <StatusBadge status={status} />,
    },
    {
      title: 'Прогресс',
      dataIndex: 'progress',
      key: 'progress',
      width: 180,
      sorter: (a, b) => (Number(a.progress) || 0) - (Number(b.progress) || 0),
      render: (percent) => {
        const p = Number(percent) || 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Progress
              percent={p}
              size="small"
              style={{ width: 100, margin: 0 }}
              strokeColor={p >= 70 ? '#52c41a' : p >= 40 ? '#1890ff' : '#faad14'}
              showInfo={false}
            />
            <Text style={{ minWidth: 40 }}>{p.toFixed(1)}%</Text>
          </div>
        );
      },
    },
    {
      title: 'Сроки',
      key: 'dates',
      width: 180,
      render: (_, record) => {
        if (!record.start_date || !record.planned_end_date) {
          return <Text type="secondary">Не заданы</Text>;
        }
        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        return (
          <Text type="secondary">
            {formatDate(record.start_date)} – {formatDate(record.planned_end_date)}
          </Text>
        );
      },
    },
    {
      title: 'Руководитель',
      dataIndex: 'project_manager_name',
      key: 'project_manager',
      width: 150,
      render: (name) => name || <Text type="secondary">Не назначен</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'view',
                icon: <EyeOutlined />,
                label: 'Просмотр',
                onClick: () => navigate(`/projects/${record.id}`),
              },
              ...(canEdit
                ? [{
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Редактировать',
                    onClick: () => handleEdit(record),
                  }]
                : []),
              ...(canDelete
                ? [
                    { type: 'divider' as const },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: 'Удалить',
                      danger: true,
                      onClick: () => deleteMutation.mutate(record.id),
                    },
                  ]
                : []),
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="page-container">
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Проекты
          </Title>
          <Text type="secondary">
            Управление проектами производства стендов
          </Text>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Создать проект
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по названию..."
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            value={searchText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            placeholder="Статус"
            style={{ width: 160 }}
            allowClear
            value={statusFilter}
            onChange={(value: string | undefined) => {
              if (value) {
                setSearchParams({ status: value });
              } else {
                setSearchParams({});
              }
            }}
            options={[
              { label: 'Все статусы', value: '' },
              { label: 'Планирование', value: 'planning' },
              { label: 'В работе', value: 'in_progress' },
              { label: 'Приостановлен', value: 'on_hold' },
              { label: 'Завершён', value: 'completed' },
            ]}
          />
          <Button icon={<ExportOutlined />}>Экспорт</Button>
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          dataSource={projects}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            total: projectsData?.count || 0,
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} из ${total}`,
          }}
          size="small"
          locale={{
            emptyText: <Empty description="Нет проектов" />,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingProject ? 'Редактировать проект' : 'Создать проект'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => { setIsModalOpen(false); setEditingProject(null); form.resetFields(); }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={700}
      >
        <Form form={form} layout="vertical">
          {!editingProject && (
            <>
              <Divider orientation="left" plain>Выбор изделия</Divider>
              <Form.Item 
                name="catalog_category" 
                label="Вид справочника" 
                tooltip="Выберите категорию изготавливаемой номенклатуры"
              >
                <Select 
                  placeholder="Выберите вид справочника"
                  allowClear
                  options={manufacturedCategories.map((c: CatalogCategory) => ({ 
                    label: c.name, 
                    value: c.id 
                  }))}
                  onChange={() => form.setFieldValue('nomenclature_item', undefined)}
                />
              </Form.Item>
              
              <Form.Item 
                name="nomenclature_item" 
                label="Изделие (номенклатура)" 
                tooltip="Выберите изделие для проекта"
              >
                <Select 
                  placeholder={formCategoryId ? "Выберите изделие" : "Сначала выберите вид справочника"}
                  allowClear
                  disabled={!formCategoryId}
                  showSearch
                  filterOption={(input: string, option: { label: string; value: string } | undefined) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={nomenclatureItems.map((n: { id: string; code: string; name: string }) => ({ 
                    label: n.name, 
                    value: n.id 
                  }))}
                />
              </Form.Item>
              <Divider orientation="left" plain>Данные проекта</Divider>
            </>
          )}
          
          <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Введите наименование' }]}>
            <Input placeholder="Название проекта" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Описание проекта" />
          </Form.Item>
          <Form.Item name="status" label="Статус" initialValue="planning">
            <Select options={[
              { label: 'Планирование', value: 'planning' },
              { label: 'В работе', value: 'in_progress' },
              { label: 'Приостановлен', value: 'on_hold' },
              { label: 'Завершён', value: 'completed' },
              { label: 'Отменён', value: 'cancelled' },
            ]} />
          </Form.Item>
          <Form.Item
            name="dates"
            label="Сроки"
            rules={[
              {
                validator: (_, value) => {
                  if (!value || value.length !== 2) return Promise.resolve();
                  const [start, end] = value;
                  if (start && end && dayjs(start).isAfter(dayjs(end), 'day')) {
                    return Promise.reject(new Error('План начала не может быть позже планового окончания'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" initialValue={1}>
            <Select options={[
              { label: 'Низкий', value: 0 },
              { label: 'Обычный', value: 1 },
              { label: 'Высокий', value: 2 },
              { label: 'Критический', value: 3 },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
