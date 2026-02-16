import {
    CalculatorOutlined,
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    ExportOutlined,
    EyeOutlined,
    ReloadOutlined,
    SearchOutlined,
    ShoppingCartOutlined,
    SyncOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    Empty,
    Input,
    message,
    Modal,
    Progress,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { catalogApi, type CatalogCategory } from '../../features/catalog';
import { projectsApi, type ProjectItem } from '../../features/projects';
import {
    warehouseApi,
    type MaterialRequirement,
    type MaterialRequirementPriority,
    type MaterialRequirementStatus,
    type MaterialRequirementSummary,
} from '../../features/warehouse';

const { Title, Text } = Typography;

// Priority colors
const priorityColors: Record<MaterialRequirementPriority, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  critical: 'red',
};

const priorityLabels: Record<MaterialRequirementPriority, string> = {
  low: 'Низкий',
  normal: 'Нормальный',
  high: 'Высокий',
  critical: 'Критический',
};

// Status colors - согласно ERP: только 3 рабочих статуса
const statusColors: Record<MaterialRequirementStatus, string> = {
  waiting_order: 'orange',
  in_order: 'blue',
  closed: 'green',
  written_off: 'lime',
};

const statusLabels: Record<MaterialRequirementStatus, string> = {
  waiting_order: 'Ожидает заказа',
  in_order: 'В заказе',
  closed: 'На складе',
  written_off: 'Списано',
};

export default function ProcurementPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialRequirementStatus | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<MaterialRequirementPriority | undefined>();
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  
  // Filters for project items
  const [projectSearch, setProjectSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<string | undefined>();
  const [supplierFilter, setSupplierFilter] = useState<string | undefined>();
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string | undefined>();
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRequirement, setDetailRequirement] = useState<MaterialRequirement | null>(null);

  // Fetch material requirements
  const { data: requirementsData, isLoading, refetch } = useQuery({
    queryKey: ['material-requirements', statusFilter, priorityFilter, criticalOnly, categoryFilter, search],
    queryFn: () =>
      warehouseApi.materialRequirements.list({
        status: statusFilter,
        priority: priorityFilter,
        critical_only: criticalOnly,
        category: categoryFilter,
        search: search || undefined,
      }),
  });
  
  // Fetch all purchased items from active projects (exclude planning stage, exclude contractor)
  const { data: projectItemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['procurement-items', projectSearch, projectFilter],
    queryFn: async () => {
      const response = await projectsApi.items.list({ 
        page_size: 1000,
        search: projectSearch || undefined,
        project: projectFilter,
        is_purchased: true,
        purchase_by_contractor: false,
        exclude_planning: true,  // Исключаем позиции из проектов на стадии планирования
      });
      return response;
    },
  });
  
  // Fetch active projects for filter
  const { data: projectsData } = useQuery({
    queryKey: ['active-projects'],
    queryFn: () => projectsApi.list({ status: 'in_progress', page_size: 100 }),
  });

  // Fetch summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['material-requirements-summary'],
    queryFn: () => warehouseApi.materialRequirements.summary(),
  });

  // Fetch categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ['nomenclature-categories'],
    queryFn: () => catalogApi.categories.list(),
  });

  const requirements = requirementsData?.results || [];
  const categories = categoriesData || [];
  const projects = projectsData?.results || [];
  const allProjectItems = projectItemsData?.results || [];
  
  // Filter only purchased items from active projects, excluding contractor purchases
  // Note: Basic filtering done on backend via exclude_planning, is_purchased, purchase_by_contractor
  const purchasedItems = useMemo(() => {
    let filtered = allProjectItems;
    
    // Применяем дополнительные фильтры на фронтенде
    if (purchaseStatusFilter) {
      filtered = filtered.filter(item => item.purchase_status === purchaseStatusFilter);
    }
    
    if (supplierFilter) {
      filtered = filtered.filter(item => item.supplier === supplierFilter);
    }
    
    if (itemCategoryFilter) {
      filtered = filtered.filter(item => item.category === itemCategoryFilter);
    }
    
    return filtered;
  }, [allProjectItems, purchaseStatusFilter, supplierFilter, itemCategoryFilter]);
  
  // Получаем уникальных поставщиков из позиций для фильтра
  const uniqueSuppliers = useMemo(() => {
    const suppliersMap = new Map<string, string>();
    allProjectItems.forEach((item: ProjectItem) => {
      if (item.supplier && item.supplier_detail && !item.purchase_by_contractor) {
        suppliersMap.set(item.supplier, item.supplier_detail.name);
      }
    });
    return Array.from(suppliersMap.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [allProjectItems]);
  
  // Получаем уникальные категории из позиций для фильтра
  const uniqueItemCategories = useMemo(() => {
    const categoriesMap = new Map<string, string>();
    allProjectItems.forEach((item: ProjectItem) => {
      if (item.category_display) {
        categoriesMap.set(item.category, item.category_display);
      }
    });
    return Array.from(categoriesMap.entries()).map(([value, label]) => ({ value, label }));
  }, [allProjectItems]);
  
  // Создаем мапу проектов для быстрого доступа к названиям
  const projectsMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    projects.forEach((p) => {
      map.set(p.id, { name: p.name });
    });
    return map;
  }, [projects]);
  
  const summary: MaterialRequirementSummary = summaryData || {
    total_items: 0,
    critical_items: 0,
    high_priority_items: 0,
    items_to_order: 0,
    total_to_order_value: 0,
    status_breakdown: {},
    priority_breakdown: {},
  };

  // Calculate mutation
  const calculateMutation = useMutation({
    mutationFn: (recalculateAll: boolean) =>
      warehouseApi.materialRequirements.calculate({ recalculate_all: recalculateAll }),
    onSuccess: (result) => {
      message.success(`Пересчитано ${result.calculated_count} позиций`);
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['material-requirements-summary'] });
    },
    onError: () => {
      message.error('Ошибка при расчёте потребностей');
    },
  });

  // Create purchase order mutation
  const createOrderMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.materialRequirements.createPurchaseOrder(id),
    onSuccess: (result) => {
      message.success(`Создан заказ ${result.purchase_order_number}`);
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
      if (result.purchase_order_id) {
        navigate(`/procurement/orders?open=${result.purchase_order_id}`);
      }
    },
    onError: () => {
      message.error('Ошибка при создании заказа');
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => warehouseApi.materialRequirements.syncFromProjects(),
    onSuccess: (result) => {
      message.success(`Синхронизировано ${result.synced_count} позиций`);
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['material-requirements-summary'] });
    },
    onError: () => {
      message.error('Ошибка синхронизации');
    },
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.materialRequirements.delete(id),
    onSuccess: () => {
      message.success('Потребность удалена');
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
    },
    onError: () => {
      message.error('Ошибка при удалении');
    },
  });

  // Handle calculate
  const handleCalculate = () => {
    Modal.confirm({
      title: 'Пересчёт потребностей',
      content: 'Пересчитать все материальные потребности на основе активных проектов и текущих остатков?',
      okText: 'Пересчитать',
      cancelText: 'Отмена',
      onOk: () => calculateMutation.mutate(true),
    });
  };

  // Table columns
  const columns: ColumnsType<MaterialRequirement> = useMemo(
    () => [
      {
        title: 'ID',
        key: 'project_item_number',
        width: 70,
        align: 'center',
        render: (_, record) => (
          <Text code style={{ fontSize: 11 }}>
            {record.project_item_number ? String(record.project_item_number).padStart(7, '0') : '—'}
          </Text>
        ),
      },
      {
        title: 'Номенклатура',
        key: 'nomenclature',
        width: 250,
        render: (_, record) => (
          <div>
            <div style={{ fontWeight: 500 }}>{record.nomenclature_name}</div>
          </div>
        ),
      },
      {
        title: 'Ед.',
        dataIndex: 'unit',
        key: 'unit',
        width: 60,
        align: 'center',
      },
      {
        title: 'Требуется',
        dataIndex: 'total_required',
        key: 'total_required',
        width: 100,
        align: 'right',
        render: (value: number) => <span style={{ fontWeight: 500 }}>{value.toLocaleString('ru-RU')}</span>,
      },
      {
        title: 'В наличии',
        dataIndex: 'total_available',
        key: 'total_available',
        width: 100,
        align: 'right',
        render: (value: number, record) => (
          <span style={{ color: value < record.total_required ? '#ff4d4f' : '#52c41a' }}>
            {value.toLocaleString('ru-RU')}
          </span>
        ),
      },
      {
        title: 'Резерв',
        dataIndex: 'total_reserved',
        key: 'total_reserved',
        width: 80,
        align: 'right',
        render: (value: number) => (value > 0 ? value.toLocaleString('ru-RU') : '—'),
      },
      {
        title: 'В заказе',
        dataIndex: 'total_in_order',
        key: 'total_in_order',
        width: 80,
        align: 'right',
        render: (value: number) => (value > 0 ? <span style={{ color: '#1890ff' }}>{value.toLocaleString('ru-RU')}</span> : '—'),
      },
      {
        title: 'К заказу',
        dataIndex: 'to_order',
        key: 'to_order',
        width: 100,
        align: 'right',
        render: (value: number) => (
          <span style={{ fontWeight: 600, color: value > 0 ? '#ff4d4f' : '#52c41a' }}>
            {value > 0 ? value.toLocaleString('ru-RU') : '—'}
          </span>
        ),
      },
      {
        title: 'Покрытие',
        key: 'coverage',
        width: 120,
        render: (_, record) => {
          const coverageNum =
            record.total_required > 0 ? (record.total_available / record.total_required) * 100 : 100;
          const percent = Math.min(Math.round(coverageNum), 100);
          return (
            <Tooltip title={`${percent}% покрытия`}>
              <Progress
                percent={percent}
                size="small"
                status={percent < 50 ? 'exception' : percent < 100 ? 'active' : 'success'}
                showInfo={false}
              />
            </Tooltip>
          );
        },
      },
      {
        title: 'Дней до дефицита',
        dataIndex: 'days_until_depletion',
        key: 'days_until_depletion',
        width: 120,
        align: 'center',
        render: (value: number | null) => {
          if (value === null || value === undefined) return '—';
          if (value <= 0) return <Tag color="red">Дефицит</Tag>;
          if (value <= 7) return <Tag color="orange">{value} дн.</Tag>;
          if (value <= 14) return <Tag color="gold">{value} дн.</Tag>;
          return <Tag color="green">{value} дн.</Tag>;
        },
      },
      {
        title: 'Приоритет',
        dataIndex: 'priority',
        key: 'priority',
        width: 110,
        align: 'center',
        render: (priority: MaterialRequirementPriority) => (
          <Tag color={priorityColors[priority]}>{priorityLabels[priority]}</Tag>
        ),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        align: 'center',
        render: (status: MaterialRequirementStatus) => (
          <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
        ),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 140,
        align: 'center',
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="Просмотреть детали">
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => {
                  setDetailRequirement(record);
                  setDetailModalOpen(true);
                }}
              />
            </Tooltip>
            {record.to_order > 0 && record.status === 'waiting_order' ? (
              <Tooltip title="Включить в заказ">
                <Button
                  type="link"
                  size="small"
                  icon={<ShoppingCartOutlined />}
                  loading={createOrderMutation.isPending}
                  onClick={() => createOrderMutation.mutate(record.id)}
                />
              </Tooltip>
            ) : null}
            <Tooltip title="Удалить">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  Modal.confirm({
                    title: 'Удалить потребность?',
                    content: 'Действие необратимо. Удалить выбранную потребность?',
                    okText: 'Удалить',
                    okType: 'danger',
                    cancelText: 'Отмена',
                    onOk: () => deleteRequirementMutation.mutate(record.id),
                  })
                }
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [createOrderMutation, deleteRequirementMutation]
  );
  
  // Columns for project purchased items
  const projectItemColumns: ColumnsType<ProjectItem> = useMemo(
    () => [
      {
        title: 'Проект',
        key: 'project',
        width: 200,
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div style={{ padding: 8 }}>
            <Select
              style={{ width: 200, marginBottom: 8, display: 'block' }}
              placeholder="Выберите проект"
              allowClear
              showSearch
              value={selectedKeys[0]}
              onChange={(value) => setSelectedKeys(value ? [value] : [])}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={projects.map((p) => ({
                label: p.name,
                value: p.id,
              }))}
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} size="small">
                Применить
              </Button>
              <Button onClick={() => { clearFilters?.(); confirm(); }} size="small">
                Сбросить
              </Button>
            </Space>
          </div>
        ),
        onFilter: (value, record) => record.project === value,
        render: (_, record) => {
          const projectInfo = projectsMap.get(record.project);
          const displayText = projectInfo ? projectInfo.name : record.project;
          return (
            <Button type="link" size="small" onClick={() => navigate(`/projects/${record.project}/procurement`)}>
              {displayText}
            </Button>
          );
        },
      },
      {
        title: 'Наименование',
        dataIndex: 'name',
        key: 'name',
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder="Поиск по наименованию"
              value={selectedKeys[0]}
              onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              style={{ marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} size="small">
                Найти
              </Button>
              <Button onClick={() => { clearFilters?.(); confirm(); }} size="small">
                Сбросить
              </Button>
            </Space>
          </div>
        ),
        filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
        onFilter: (value, record) => 
          record.name?.toLowerCase().includes((value as string).toLowerCase()) ||
          record.article_number?.toLowerCase().includes((value as string).toLowerCase()),
        render: (name, record) => (
          <Space direction="vertical" size={0}>
            <Text>{name}</Text>
            {record.article_number && <Text type="secondary" style={{ fontSize: 12 }}>{record.article_number}</Text>}
          </Space>
        ),
      },
      {
        title: 'Вид справочника',
        dataIndex: 'category_display',
        key: 'category',
        width: 150,
        filters: uniqueItemCategories.map(cat => ({ text: cat.label, value: cat.value })),
        onFilter: (value, record) => record.category === value,
        render: (category) => category || '—',
      },
      {
        title: 'Кол-во',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 80,
        align: 'right',
        render: (qty, record) => `${qty} ${record.unit || 'шт'}`,
      },
      {
        title: 'Поставщик',
        key: 'supplier',
        width: 180,
        filters: uniqueSuppliers.map(sup => ({ text: sup.label, value: sup.value })),
        onFilter: (value, record) => record.supplier === value,
        render: (_, record) => {
          if (record.purchase_by_contractor) {
            return <Tag color="purple">Не требуется (подрядчик)</Tag>;
          }
          return record.supplier_detail?.name || <Text type="warning">Не указан</Text>;
        },
      },
      {
        title: 'Статус закупки',
        dataIndex: 'purchase_status',
        key: 'purchase_status',
        width: 130,
        filters: [
          { text: 'Ожидает заказа', value: 'waiting_order' },
          { text: 'В заказе', value: 'in_order' },
          { text: 'На складе', value: 'closed' },
          { text: 'Списано', value: 'written_off' },
          { text: 'Ожидает заказа', value: 'pending' },
          { text: 'Заказано', value: 'ordered' },
          { text: 'В пути', value: 'in_transit' },
          { text: 'Доставлено', value: 'delivered' },
          { text: 'Задержка', value: 'delayed' },
          { text: 'Отменено', value: 'cancelled' },
        ].filter(f => purchasedItems.some(item => item.purchase_status === f.value)),
        onFilter: (value, record) => record.purchase_status === value,
        render: (status, record) => {
          const colors: Record<string, string> = {
            waiting_order: 'orange',
            in_order: 'blue',
            closed: 'green',
            written_off: 'lime',
            pending: 'orange',
            ordered: 'blue',
            in_transit: 'cyan',
            delivered: 'green',
            delayed: 'red',
            cancelled: 'default',
          };
          const labels: Record<string, string> = {
            waiting_order: 'Ожидает заказа',
            in_order: 'В заказе',
            closed: 'На складе',
            written_off: 'Списано',
            pending: 'Ожидает заказа',
            ordered: 'Заказано',
            in_transit: 'В пути',
            delivered: 'Доставлено',
            delayed: 'Задержка',
            cancelled: 'Отменено',
            not_required: 'Не требуется',
          };
          return (
            <Tag color={colors[status] || 'default'}>
              {labels[status] || record.purchase_status_display || 'Не определен'}
            </Tag>
          );
        },
      },
      {
        title: 'Заказать до',
        dataIndex: 'order_date',
        key: 'order_date',
        width: 110,
        render: (date) => date ? new Date(date).toLocaleDateString('ru-RU') : '—',
      },
      {
        title: 'Срок поставки',
        dataIndex: 'required_date',
        key: 'required_date',
        width: 110,
        render: (date) => date ? new Date(date).toLocaleDateString('ru-RU') : '—',
      },
      {
        title: 'Ответственный',
        key: 'responsible',
        width: 150,
        render: (_, record) => record.responsible_detail?.full_name || <Text type="secondary">—</Text>,
      },
      {
        title: '',
        key: 'actions',
        width: 50,
        render: (_, record) => (
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => navigate(`/projects/${record.project}/procurement`)} 
          />
        ),
      },
    ],
    [navigate, projectsMap, projects, uniqueSuppliers, uniqueItemCategories, purchasedItems]
  );

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          Закупки
        </Title>
        <Text type="secondary">Закупаемые позиции из активных проектов и расчёт материальных потребностей</Text>
      </div>
      
      {/* Tab for switching between views */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Filters for project items */}
          <div>
            <Text strong>Закупаемые позиции из активных проектов</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <Input
                  placeholder="Поиск по наименованию..."
                  prefix={<SearchOutlined />}
                  style={{ width: 250 }}
                  allowClear
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                />
                <Select
                  placeholder="Фильтр по проекту"
                  style={{ width: 250 }}
                  allowClear
                  showSearch
                  value={projectFilter}
                  onChange={setProjectFilter}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={projects.map((p) => ({
                    label: p.name,
                    value: p.id,
                  }))}
                />
                <Select
                  placeholder="Вид справочника"
                  style={{ width: 180 }}
                  allowClear
                  value={itemCategoryFilter}
                  onChange={setItemCategoryFilter}
                  options={uniqueItemCategories}
                />
                <Select
                  placeholder="Статус закупки"
                  style={{ width: 150 }}
                  allowClear
                  value={purchaseStatusFilter}
                  onChange={setPurchaseStatusFilter}
                  options={[
                    { value: 'pending', label: 'Ожидает' },
                    { value: 'ordered', label: 'Заказано' },
                    { value: 'in_transit', label: 'В пути' },
                    { value: 'delivered', label: 'Доставлено' },
                    { value: 'delayed', label: 'Задержка' },
                  ]}
                />
                <Select
                  placeholder="Поставщик"
                  style={{ width: 200 }}
                  allowClear
                  showSearch
                  value={supplierFilter}
                  onChange={setSupplierFilter}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={uniqueSuppliers}
                />
                <Button icon={<ReloadOutlined />} onClick={() => refetchItems()}>
                  Обновить
                </Button>
              </Space>
            </div>
          </div>
          
          <Table
            columns={projectItemColumns}
            dataSource={purchasedItems}
            rowKey="id"
            size="small"
            loading={itemsLoading}
            pagination={{ 
              defaultPageSize: 20, 
              showTotal: (total) => `Всего ${total} позиций`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            locale={{
              emptyText: <Empty description="Нет закупаемых позиций" />,
            }}
          />
        </Space>
      </Card>

      {/* Stats */}
      <div style={{ marginTop: 24, marginBottom: 16 }}>
        <Title level={5}>Материальные потребности</Title>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Всего позиций"
              value={summary.total_items}
              loading={summaryLoading}
            />

          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Критических"
              value={summary.critical_items}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Высокий приоритет"
              value={summary.high_priority_items}
              valueStyle={{ color: '#fa8c16' }}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="К заказу"
              value={summary.items_to_order}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ShoppingCartOutlined />}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Выполнено"
              value={summary.status_breakdown?.fulfilled?.count || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Button
              type="primary"
              icon={<CalculatorOutlined />}
              loading={calculateMutation.isPending}
              onClick={handleCalculate}
              block
            >
              Пересчитать
            </Button>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по наименованию, артикулу..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            placeholder="Категория"
            style={{ width: 180 }}
            allowClear
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories.map((c: CatalogCategory) => ({ label: c.name, value: c.id }))}
          />
          <Select
            placeholder="Приоритет"
            style={{ width: 150 }}
            allowClear
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { label: 'Критический', value: 'critical' },
              { label: 'Высокий', value: 'high' },
              { label: 'Нормальный', value: 'normal' },
              { label: 'Низкий', value: 'low' },
            ]}
          />
          <Select
            placeholder="Статус"
            style={{ width: 160 }}
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: 'Ожидает заказа', value: 'waiting_order' },
              { label: 'В заказе', value: 'in_order' },
              { label: 'На складе', value: 'closed' },
              { label: 'Списано', value: 'written_off' },
            ]}
          />
          <Button
            type={criticalOnly ? 'primary' : 'default'}
            danger={criticalOnly}
            icon={<ExclamationCircleOutlined />}
            onClick={() => setCriticalOnly(!criticalOnly)}
          >
            Только критичные
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Обновить
          </Button>
          <Button icon={<SyncOutlined />} onClick={() => syncMutation.mutate()}>
            Синхронизировать из проектов
          </Button>
          <Button icon={<ExportOutlined />}>Экспорт</Button>
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={requirements}
          rowKey="id"
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
            pageSize: 50,
          }}
          scroll={{ x: 1400 }}
          size="small"
          rowSelection={{
            selectedRowKeys: selectedRows,
            onChange: (keys) => setSelectedRows(keys as string[]),
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    Нет данных о потребностях.{' '}
                    <Button type="link" onClick={handleCalculate} style={{ padding: 0 }}>
                      Выполнить расчёт
                    </Button>
                  </span>
                }
              />
            ),
          }}
        />
      </Card>

      <Modal
        open={detailModalOpen}
        title="Детали потребности"
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailRequirement(null);
        }}
        footer={[
          <Button key="ok" type="primary" onClick={() => {
            setDetailModalOpen(false);
            setDetailRequirement(null);
          }}>
            ОК
          </Button>,
        ]}
      >
        {detailRequirement ? (
          <div>
            <p><Text strong>Номенклатура:</Text> {detailRequirement.nomenclature_name}</p>
            <p><Text strong>Проект:</Text> {detailRequirement.project_detail?.name || '—'}</p>
            <p><Text strong>Изделие в проекте:</Text> {detailRequirement.project_item_detail?.full_path || '—'}</p>
            <p><Text strong>Заказ:</Text> {detailRequirement.purchase_order_detail?.number || '—'}</p>
            <p><Text strong>Статус заказа:</Text> {detailRequirement.purchase_order_detail?.status || '—'}</p>
            <p><Text strong>Поставщик:</Text> {detailRequirement.supplier_detail?.name || '—'}</p>
            <p><Text strong>Заказать до:</Text> {detailRequirement.order_by_date ? new Date(detailRequirement.order_by_date).toLocaleDateString('ru-RU') : '—'}</p>
            <p><Text strong>Срок поставки:</Text> {detailRequirement.delivery_date ? new Date(detailRequirement.delivery_date).toLocaleDateString('ru-RU') : '—'}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
