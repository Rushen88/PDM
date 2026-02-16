/**
 * Purchase Orders Page (Заказы на закупку)
 * 
 * Согласно ERP-требованиям:
 * - Статусы: Черновик → Заказан → Частично поставлен → Закрыт
 * - Поля: Номер, Поставщик, Позиции, Сумма, Ожидаемая дата поставки, Статус
 * - Проект НЕ выбирается в форме (определяется через потребности)
 * - Одна потребность = один заказ (нельзя включить в несколько)
 */

import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    ExportOutlined,
    EyeOutlined,
    FileAddOutlined,
    FileExcelOutlined,
    FilterOutlined,
    PlusOutlined,
    ReloadOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    Descriptions,
    Divider,
    Drawer,
    Empty,
    Input,
    message,
    Popconfirm,
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
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { catalogApi } from '../../features/catalog';
import { OrderCreateModal, OrderEditModal, procurementApi, type PurchaseOrder, type PurchaseOrderItem, type PurchaseOrderStatus } from '../../features/procurement';
import { projectsApi } from '../../features/projects';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';
import { exportOrderToExcel } from '../../shared/utils/exportOrderExcel';

const { Title, Text } = Typography;

// Статусы согласно ТЗ
type OrderStatus = 'draft' | 'ordered' | 'partially_delivered' | 'closed' | 'cancelled';

const statusConfig: Record<OrderStatus, { color: string; label: string; icon: React.ReactNode }> = {
  draft: { color: 'default', label: 'Черновик', icon: <EditOutlined /> },
  ordered: { color: 'blue', label: 'Заказан', icon: <SendOutlined /> },
  partially_delivered: { color: 'orange', label: 'Частично поставлен', icon: <ClockCircleOutlined /> },
  closed: { color: 'green', label: 'Закрыт', icon: <CheckCircleOutlined /> },
  cancelled: { color: 'red', label: 'Отменён', icon: <StopOutlined /> },
};

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { canEdit, canDelete } = useModuleAccess('procurement.orders');
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | undefined>();
  const [supplierFilter, setSupplierFilter] = useState<string | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(searchParams.get('create') === 'true');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const initialRequirementIds = useMemo(() => {
    const single = searchParams.get('requirement');
    const multi = searchParams.get('requirements');
    if (multi) {
      return multi.split(',').map((id) => id.trim()).filter(Boolean);
    }
    return single ? [single] : [];
  }, [searchParams]);

  const initialSupplierId = useMemo(() => searchParams.get('supplier'), [searchParams]);

  // Fetch purchase orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['purchase-orders', statusFilter, supplierFilter, projectFilter, search],
    queryFn: () =>
      procurementApi.purchaseOrders.list({
        status: statusFilter,
        supplier: supplierFilter,
        project: projectFilter,
        search,
      }),
  });

  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => catalogApi.suppliers.list({}),
  });

  // Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-filter'],
    queryFn: () => projectsApi.list({ status: 'in_progress' }),
  });

  const orders = ordersData?.results || [];
    useEffect(() => {
      const openId = searchParams.get('open');
      if (!openId) return;
      procurementApi.purchaseOrders.get(openId)
        .then((detail) => {
          setDetailOrder(detail);
          setDrawerVisible(true);
        })
        .catch(() => {
          message.error('Ошибка загрузки заказа');
        });
    }, [searchParams]);

  useEffect(() => {
    setCreateModalVisible(searchParams.get('create') === 'true');
  }, [searchParams]);
  const suppliers = suppliersData?.results || [];
  const projects = projectsData?.results || [];

  // Mutations
  const submitOrderMutation = useMutation({
    mutationFn: (id: string) => procurementApi.purchaseOrders.confirm(id),
    onSuccess: () => {
      message.success('Заказ переведён в статус «Заказан»');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: () => {
      message.error('Ошибка при подтверждении заказа');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (id: string) => procurementApi.purchaseOrders.cancel(id),
    onSuccess: () => {
      message.success('Заказ отменён');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: () => {
      message.error('Ошибка при отмене заказа');
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => procurementApi.purchaseOrders.delete(id),
    onSuccess: () => {
      message.success('Заказ удалён');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      message.error(error.response?.data?.error || 'Ошибка при удалении заказа');
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    const total = orders.length;
    const drafts = orders.filter(o => o.status === 'draft').length;
    const ordered = orders.filter(o => 
      ['ordered', 'partially_delivered'].includes(o.status)
    ).length;
    const closed = orders.filter(o => o.status === 'closed').length;
    const totalAmount = orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    
    return { total, drafts, ordered, closed, totalAmount };
  }, [orders]);

  // View order detail
  const showOrderDetail = async (order: PurchaseOrder) => {
    try {
      const detail = await procurementApi.purchaseOrders.get(order.id);
      setDetailOrder(detail);
      setDrawerVisible(true);
    } catch {
      message.error('Ошибка загрузки заказа');
    }
  };

  const handleExportDetailOrder = () => {
    if (!detailOrder) return;
    exportOrderToExcel({
      fileName: `Заказ_${detailOrder.number}`,
      orderNumber: detailOrder.number,
      supplierName: detailOrder.supplier_detail?.name || null,
      supplierInn: detailOrder.supplier_detail?.inn || null,
      orderDate: detailOrder.order_date,
      items: (detailOrder.items || []).map((item, index) => ({
        index: index + 1,
        nomenclatureName: item.nomenclature_detail?.name || '',
        projectName: item.project_item_detail?.project_name || detailOrder.project_detail?.name || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || undefined,
        orderByDate: item.material_requirement_detail?.order_by_date || null,
      })),
    });
  };

  // Table columns
  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: 'Номер',
      dataIndex: 'number',
      key: 'number',
      width: 120,
      render: (number, record) => (
        <Button type="link" onClick={() => showOrderDetail(record)}>
          {number}
        </Button>
      ),
      sorter: (a, b) => a.number.localeCompare(b.number),
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      render: (_, record) => (
        <Text>{record.supplier_name || '-'}</Text>
      ),
    },
    {
      title: 'Проект',
      key: 'project',
      width: 100,
      render: (_, record) => record.project_name || '-',
    },
    {
      title: 'Поз.',
      key: 'items_count',
      dataIndex: 'items_count',
      width: 60,
      align: 'center',
    },
    {
      title: 'Сумма',
      key: 'total_amount',
      dataIndex: 'total_amount',
      width: 130,
      align: 'right',
      render: (val, record) => (
        <Text strong>
          {Number(val || 0).toLocaleString('ru-RU', { 
            style: 'currency', 
            currency: record.currency || 'RUB' 
          })}
        </Text>
      ),
      sorter: (a, b) => Number(a.total_amount) - Number(b.total_amount),
    },
    {
      title: 'Ожид. дата',
      key: 'expected_delivery_date',
      dataIndex: 'expected_delivery_date',
      width: 110,
      render: (date) => {
        if (!date) return '-';
        const d = dayjs(date);
        const isOverdue = d.isBefore(dayjs(), 'day');
        return (
          <Text type={isOverdue ? 'danger' : undefined}>
            {d.format('DD.MM.YYYY')}
          </Text>
        );
      },
      sorter: (a, b) => 
        (a.expected_delivery_date || '').localeCompare(b.expected_delivery_date || ''),
    },
    {
      title: 'Статус',
      key: 'status',
      dataIndex: 'status',
      width: 150,
      align: 'center',
      render: (status, record) => {
        const config = statusConfig[status as OrderStatus];
        const label = record.status_display || config?.label || (typeof status === 'string' ? status : '');
        return (
          <Tag color={config?.color} icon={config?.icon}>
            {label}
          </Tag>
        );
      },
      filters: Object.entries(statusConfig).map(([key, { label }]) => ({
        text: label,
        value: key,
      })),
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 200,
      render: (_, record) => {
        const isDraft = record.status === 'draft';
        const isOrdered = ['ordered', 'partially_delivered'].includes(record.status);
        const isClosed = record.status === 'closed';
        const isCancelled = record.status === 'cancelled';

        return (
          <Space>
            <Tooltip title="Просмотр">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => showOrderDetail(record)}
              />
            </Tooltip>
            {/* Черновик: редактирование, отправка, удаление */}
            {isDraft && (
              <>
                {canEdit && (
                  <Tooltip title="Редактировать">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditOrderId(record.id);
                        setEditModalVisible(true);
                      }}
                    />
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip title="Отправить поставщику">
                    <Popconfirm
                      title="Отправить заказ поставщику?"
                      description="Статус изменится на 'Заказан'"
                      onConfirm={() => submitOrderMutation.mutate(record.id)}
                    >
                      <Button type="text" icon={<SendOutlined />} />
                    </Popconfirm>
                  </Tooltip>
                )}
                {canDelete && (
                  <Tooltip title="Удалить">
                    <Popconfirm
                      title="Удалить черновик заказа?"
                      description="Связанные потребности будут освобождены."
                      onConfirm={() => deleteOrderMutation.mutate(record.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Tooltip>
                )}
              </>
            )}
            {/* Заказан / Частично поставлен: создать поступление, отменить */}
            {isOrdered && (
              <>
                {canEdit && (
                  <Tooltip title="Создать поступление">
                    <Button
                      type="primary"
                      size="small"
                      icon={<FileAddOutlined />}
                      onClick={() => navigate(`/warehouse/receipts?create=true&order=${record.id}`)}
                    >
                      Приёмка
                    </Button>
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip title="Отменить заказ">
                    <Popconfirm
                      title="Отменить заказ?"
                      description="Позиции вернутся в статус ожидания заказа."
                      onConfirm={() => cancelOrderMutation.mutate(record.id)}
                    >
                      <Button type="text" danger icon={<StopOutlined />} />
                    </Popconfirm>
                  </Tooltip>
                )}
              </>
            )}
            {/* Закрыт / Отменён: только просмотр */}
            {(isClosed || isCancelled) && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isClosed ? 'Заказ закрыт' : 'Заказ отменён'}
              </Text>
            )}
          </Space>
        );
      },
    },
  ];

  // Items table columns for drawer
  const itemColumns: ColumnsType<PurchaseOrderItem> = [
    {
      title: 'Материал',
      key: 'nomenclature',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.nomenclature_detail?.name || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Проект',
      key: 'project',
      render: (_, item) => item.project_item_detail?.project_name || detailOrder?.project_detail?.name || '-',
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      align: 'right',
      render: (val, item) => `${Number(val).toLocaleString('ru-RU')} ${item.unit || ''}`,
    },
    {
      title: 'Получено',
      dataIndex: 'delivered_quantity',
      align: 'right',
      render: (val) => Number(val).toLocaleString('ru-RU'),
    },
    {
      title: 'Цена',
      dataIndex: 'unit_price',
      align: 'right',
      render: (val) => Number(val || 0).toLocaleString('ru-RU'),
    },
    {
      title: 'Сумма',
      dataIndex: 'total_price',
      align: 'right',
      render: (val) => <Text strong>{Number(val || 0).toLocaleString('ru-RU')}</Text>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      align: 'center',
      render: (status) => {
        const colors: Record<string, string> = {
          pending: 'default',
          ordered: 'blue',
          in_transit: 'orange',
          delivered: 'green',
          cancelled: 'red',
        };
        const labels: Record<string, string> = {
          pending: 'Ожидает',
          ordered: 'Заказано',
          in_transit: 'В пути',
          delivered: 'Получено',
          cancelled: 'Отменено',
        };
        return <Tag color={colors[status]}>{labels[status] || status}</Tag>;
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Заказы на закупку
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Обновить
            </Button>
            <Button icon={<ExportOutlined />}>Экспорт</Button>
            {canEdit && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                Создать заказ
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={5}>
          <Card size="small">
            <Statistic title="Всего заказов" value={stats.total} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="Черновики"
              value={stats.drafts}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="В работе"
              value={stats.ordered}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic
              title="Закрыто"
              value={stats.closed}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Сумма"
              value={stats.totalAmount}
              precision={0}
              suffix="₽"
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="Поиск по номеру..."
              prefix={<FilterOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={5}>
            <Select
              placeholder="Поставщик"
              style={{ width: '100%' }}
              value={supplierFilter}
              onChange={setSupplierFilter}
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {suppliers.map((s) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name}
                </Select.Option>
              ))}
            </Select>
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
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Всего: ${total}`,
            defaultPageSize: 20,
          }}
          locale={{
            emptyText: (
              <Empty
                description="Заказы отсутствуют"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={`Заказ ${detailOrder?.number || ''}`}
        width={800}
        open={drawerVisible}
        extra={
          <Button
            icon={<FileExcelOutlined />}
            onClick={handleExportDetailOrder}
            disabled={!detailOrder?.items?.length}
          >
            Печать заказа
          </Button>
        }
        onClose={() => {
          setDrawerVisible(false);
          setDetailOrder(null);
        }}
      >
        {detailOrder && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Номер">{detailOrder.number}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusConfig[detailOrder.status as OrderStatus]?.color}>
                  {statusConfig[detailOrder.status as OrderStatus]?.label || detailOrder.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Поставщик">
                {detailOrder.supplier_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Проект">
                {detailOrder.project_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Дата заказа">
                {detailOrder.order_date ? dayjs(detailOrder.order_date).format('DD.MM.YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ожидаемая поставка">
                {detailOrder.expected_delivery_date 
                  ? dayjs(detailOrder.expected_delivery_date).format('DD.MM.YYYY') 
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Сумма" span={2}>
                <Text strong style={{ fontSize: 16 }}>
                  {Number(detailOrder.total_amount || 0).toLocaleString('ru-RU')} {detailOrder.currency || 'RUB'}
                </Text>
              </Descriptions.Item>
              {detailOrder.notes && (
                <Descriptions.Item label="Примечания" span={2}>
                  {detailOrder.notes}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider>Позиции заказа</Divider>

            <Table
              columns={itemColumns}
              dataSource={detailOrder.items || []}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </>
        )}
      </Drawer>

      {/* Create Modal - новый компонент с двумя панелями */}
      <OrderCreateModal
        open={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={() => refetch()}
        initialRequirementIds={initialRequirementIds}
        initialSupplierId={initialSupplierId}
      />

      <OrderEditModal
        open={editModalVisible}
        orderId={editOrderId}
        onClose={() => {
          setEditModalVisible(false);
          setEditOrderId(null);
        }}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
