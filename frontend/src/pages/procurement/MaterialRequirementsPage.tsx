/**
 * Material Requirements Page (Потребности в материалах и комплектующих)
 * 
 * Согласно ERP-требованиям:
 * - Потребности формируются автоматически из проектов
 * - Ручное создание запрещено
 * - Статусы: Ожидает заказа → В заказе → На складе (строго 3 статуса)
 * - Статус = фактическое состояние, Проблема = отдельный флаг
 * - Одна потребность может быть только в одном заказе
 */

import {
    CheckCircleOutlined,
    ExportOutlined,
    FileSearchOutlined,
    FilterOutlined,
    ReloadOutlined,
    ShoppingCartOutlined,
    SyncOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    Descriptions,
    Divider,
    Empty,
    Input,
    message,
    Modal,
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

import { projectsApi } from '../../features/projects';
import {
    warehouseApi,
    type MaterialRequirement,
    type MaterialRequirementPriority,
    type MaterialRequirementStatus,
} from '../../features/warehouse';

const { Title, Text } = Typography;

// Статусы согласно ERP-требованиям (только 3 рабочих статуса)
const statusConfig: Record<MaterialRequirementStatus, { color: string; label: string }> = {
  waiting_order: { color: 'orange', label: 'Ожидает заказа' },
  in_order: { color: 'blue', label: 'В заказе' },
  closed: { color: 'green', label: 'На складе' },
  written_off: { color: 'lime', label: 'Списано' },
};

const priorityConfig: Record<MaterialRequirementPriority, { color: string; label: string }> = {
  low: { color: 'default', label: 'Низкий' },
  normal: { color: 'blue', label: 'Нормальный' },
  high: { color: 'orange', label: 'Высокий' },
  critical: { color: 'red', label: 'Критический' },
};

export default function MaterialRequirementsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialRequirementStatus | undefined>('waiting_order');
  const [priorityFilter, setPriorityFilter] = useState<MaterialRequirementPriority | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRequirement, setDetailRequirement] = useState<MaterialRequirement | null>(null);

  // Fetch material requirements
  const { data: requirementsData, isLoading, refetch } = useQuery({
    queryKey: ['material-requirements', statusFilter, priorityFilter, projectFilter, search],
    queryFn: () =>
      warehouseApi.materialRequirements.list({
        status: statusFilter,
        priority: priorityFilter,
        project: projectFilter,
        search,
      }),
  });

  // Fetch projects for filter
  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-filter'],
    queryFn: () => projectsApi.list({ status: 'in_progress' }),
  });

  const queryClient = useQueryClient();

  // Mutation для синхронизации из проектов
  const syncMutation = useMutation({
    mutationFn: () => warehouseApi.materialRequirements.syncFromProjects(),
    onSuccess: (data) => {
      message.success(`Синхронизировано ${data.synced_count} потребностей из проектов`);
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
    },
    onError: () => {
      message.error('Ошибка при синхронизации потребностей');
    },
  });

  const requirements = requirementsData?.results || [];
  const projects = projectsData?.results || [];

  // Calculate statistics
  const stats = useMemo(() => {
    const total = requirements.length;
    const waitingOrder = requirements.filter(r => r.status === 'waiting_order').length;
    const inOrder = requirements.filter(r => r.status === 'in_order').length;
    const closed = requirements.filter(r => r.status === 'closed').length;
    const withProblems = requirements.filter(r => r.has_problem).length;
    
    return { total, waitingOrder, inOrder, closed, withProblems };
  }, [requirements]);

  // Table columns
  const columns: ColumnsType<MaterialRequirement> = [
    {
      title: 'Наименование',
      key: 'nomenclature',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.nomenclature_detail?.name || '-'}</Text>
          <Space size={6}>
            {record.has_problem && (
              <Tooltip title={record.problem_reason_detail?.name || 'Есть проблема'}>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
      sorter: (a, b) =>
        (a.nomenclature_detail?.name || '').localeCompare(b.nomenclature_detail?.name || ''),
    },
    {
      title: 'ID',
      dataIndex: 'project_item_number',
      key: 'project_item_number',
      width: 90,
      align: 'center',
      sorter: (a, b) => {
        const av = a.project_item_number;
        const bv = b.project_item_number;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av - bv;
      },
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => {
        const value = String(selectedKeys?.[0] ?? '');

        return (
          <div style={{ padding: 8, width: 220 }}>
            <Input
              placeholder="Фильтр по ID"
              value={value}
              onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              allowClear
              style={{ marginBottom: 8, display: 'block' }}
            />
            <Space>
              <Button
                type="primary"
                size="small"
                onClick={() => confirm()}
              >
                Применить
              </Button>
              <Button
                size="small"
                onClick={() => {
                  clearFilters?.();
                  confirm();
                }}
              >
                Сброс
              </Button>
              <Button size="small" type="text" onClick={() => close()}>
                Закрыть
              </Button>
            </Space>
          </div>
        );
      },
      filterIcon: (filtered) => (
        <FilterOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
      ),
      onFilter: (value, record) => {
        const raw = record.project_item_number;
        if (raw == null) return false;
        const q = String(value ?? '').trim();
        if (!q) return true;
        const plain = String(raw);
        const padded = plain.padStart(7, '0');
        return plain.includes(q) || padded.includes(q);
      },
      render: (_, record) => (
        <Text code>
          {record.project_item_number ? String(record.project_item_number).padStart(7, '0') : '—'}
        </Text>
      ),
    },
    {
      title: 'Проект',
      key: 'project',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.project_detail?.name || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Позиция проекта',
      key: 'project_item',
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.project_item_detail?.parent_name || record.project_item_detail?.full_path || record.bom_item_detail?.path || '-'}
        </Text>
      ),
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      render: (_, record) => record.supplier_detail?.name || '—',
    },
    {
      title: 'Заказать до',
      key: 'order_by_date',
      dataIndex: 'order_by_date',
      render: (val) => val ? new Date(val).toLocaleDateString('ru-RU') : '-',
      sorter: (a, b) => {
        if (!a.order_by_date) return 1;
        if (!b.order_by_date) return -1;
        return new Date(a.order_by_date).getTime() - new Date(b.order_by_date).getTime();
      },
    },
    {
      title: 'Срок поставки',
      key: 'delivery_date',
      dataIndex: 'delivery_date',
      render: (val) => val ? new Date(val).toLocaleDateString('ru-RU') : '-',
      sorter: (a, b) => {
        if (!a.delivery_date) return 1;
        if (!b.delivery_date) return -1;
        return new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime();
      },
    },
    {
      title: 'Потребность',
      key: 'total_required',
      dataIndex: 'total_required',
      align: 'right',
      render: (val) => <Text strong>{Number(val).toLocaleString('ru-RU')}</Text>,
      sorter: (a, b) => Number(a.total_required) - Number(b.total_required),
    },
    {
      title: 'Доступно',
      key: 'free_available',
      dataIndex: 'free_available',
      align: 'right',
      render: (val) => Number(val).toLocaleString('ru-RU'),
    },
    {
      title: 'Проблема',
      key: 'has_problem',
      dataIndex: 'has_problem',
      align: 'center',
      width: 100,
      render: (hasProblem, record) => (
        hasProblem ? (
          <Tooltip title={record.problem_reason_detail?.name || 'Проблема'}>
            <Tag color="red">Да</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">Нет</Tag>
        )
      ),
      filters: [
        { text: 'С проблемами', value: true },
        { text: 'Без проблем', value: false },
      ],
      onFilter: (value, record) => record.has_problem === value,
    },
    {
      title: 'Причина проблемы',
      key: 'problem_reason',
      width: 200,
      render: (_, record) => record.problem_reason_detail?.name || '—',
    },
    {
      title: 'Статус',
      key: 'status',
      dataIndex: 'status',
      align: 'center',
      render: (status) => {
        const config = statusConfig[status as MaterialRequirementStatus];
        return <Tag color={config?.color}>{config?.label || status}</Tag>;
      },
      filters: Object.entries(statusConfig)
        .filter(([key]) => ['waiting_order', 'in_order', 'closed'].includes(key))
        .map(([key, { label }]) => ({
          text: label,
          value: key,
        })),
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Tooltip title="Просмотреть детали">
            <Button
              type="text"
              icon={<FileSearchOutlined />}
              onClick={() => {
                setDetailRequirement(record);
                setDetailModalOpen(true);
              }}
            />
          </Tooltip>
          {Number(record.to_order) > 0 && record.status === 'waiting_order' && (
            <Tooltip title="Включить в заказ">
              <Button
                type="text"
                icon={<ShoppingCartOutlined />}
                onClick={() => {
                  const supplierId = record.supplier || '';
                  const supplierParam = supplierId ? `&supplier=${supplierId}` : '';
                  navigate(`/procurement/orders?create=true&requirement=${record.id}${supplierParam}`);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <WarningOutlined style={{ marginRight: 8 }} />
            Потребности
          </Title>
          <Text type="secondary">
            Автоматически формируются из активных проектов. Ручное создание недоступно.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Обновить
            </Button>
            <Button 
              icon={<SyncOutlined spin={syncMutation.isPending} />} 
              onClick={() => syncMutation.mutate()}
              loading={syncMutation.isPending}
            >
              Синхронизировать из проектов
            </Button>
            <Button 
              icon={<ExportOutlined />}
              disabled={selectedRows.length === 0}
            >
              Экспорт
            </Button>
            <Button
              type="primary"
              icon={<ShoppingCartOutlined />}
              disabled={selectedRows.length === 0}
              onClick={() => navigate('/procurement/orders?create=true&requirements=' + selectedRows.join(','))}
            >
              Создать заказ
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Всего потребностей"
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="Ожидает заказа"
              value={stats.waitingOrder}
              valueStyle={{ color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="В заказах"
              value={stats.inOrder}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="Закрыто"
              value={stats.closed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="С проблемами"
              value={stats.withProblems}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="Поиск по ID или названию..."
              prefix={<FilterOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={5}>
            <Select
              placeholder="Проект"
              style={{ width: '100%' }}
              value={projectFilter}
              onChange={setProjectFilter}
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {projects.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="Статус"
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
            >
              {Object.entries(statusConfig).map(([key, { label }]) => (
                <Select.Option key={key} value={key}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="Приоритет"
              style={{ width: '100%' }}
              value={priorityFilter}
              onChange={setPriorityFilter}
              allowClear
            >
              {Object.entries(priorityConfig).map(([key, { label }]) => (
                <Select.Option key={key} value={key}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={requirements}
          rowKey="id"
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Всего: ${total}`,
            defaultPageSize: 20,
          }}
          rowSelection={{
            selectedRowKeys: selectedRows,
            onChange: (keys) => setSelectedRows(keys as string[]),
            getCheckboxProps: (record) => ({
              disabled: Number(record.to_order) <= 0,
            }),
          }}
          locale={{
            emptyText: (
              <Empty
                description="Потребности отсутствуют"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          scroll={{ x: 1200 }}
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
        width={720}
      >
        {detailRequirement && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Номенклатура" span={2}>
                {detailRequirement.nomenclature_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Проект">
                {detailRequirement.project_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Код проекта">
                {detailRequirement.project_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Позиция проекта" span={2}>
                {detailRequirement.project_item_detail?.full_path
                  || detailRequirement.project_item_detail?.parent_name
                  || detailRequirement.bom_item_detail?.path
                  || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Поставщик">
                {detailRequirement.supplier_detail?.name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusConfig[detailRequirement.status]?.color}>
                  {statusConfig[detailRequirement.status]?.label || detailRequirement.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Заказ">
                {detailRequirement.purchase_order_detail?.number
                  ? `${detailRequirement.purchase_order_detail.number} (${detailRequirement.purchase_order_detail.status_display || detailRequirement.purchase_order_detail.status || ''})`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Заказать до">
                {detailRequirement.order_by_date ? new Date(detailRequirement.order_by_date).toLocaleDateString('ru-RU') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Срок поставки">
                {detailRequirement.delivery_date ? new Date(detailRequirement.delivery_date).toLocaleDateString('ru-RU') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Приоритет">
                <Tag color={priorityConfig[detailRequirement.priority]?.color}>
                  {priorityConfig[detailRequirement.priority]?.label || detailRequirement.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Проблема">
                {detailRequirement.has_problem
                  ? (detailRequirement.problem_reason_detail?.name || 'Есть проблема')
                  : 'Нет'}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }} />

            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="Потребность">
                {Number(detailRequirement.total_required).toLocaleString('ru-RU')}
              </Descriptions.Item>
              <Descriptions.Item label="Доступно">
                {Number(detailRequirement.free_available ?? 0).toLocaleString('ru-RU')}
              </Descriptions.Item>
              <Descriptions.Item label="Зарезервировано">
                {Number(detailRequirement.total_reserved).toLocaleString('ru-RU')}
              </Descriptions.Item>
              <Descriptions.Item label="В заказах">
                {Number(detailRequirement.total_in_order).toLocaleString('ru-RU')}
              </Descriptions.Item>
              <Descriptions.Item label="К заказу">
                {Number(detailRequirement.to_order).toLocaleString('ru-RU')}
              </Descriptions.Item>
              <Descriptions.Item label="Дефицит">
                {Number(detailRequirement.deficit).toLocaleString('ru-RU')}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>
    </div>
  );
}
