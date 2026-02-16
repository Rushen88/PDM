/**
 * Goods Receipts Page (Поступления / Приёмка)
 * 
 * Согласно ТЗ:
 * - Поступления создаются на основании заказов на закупку
 * - Допускается частичное поступление
 * - При подтверждении: увеличиваются остатки, обновляется статус заказа
 * - Статусы: Черновик → Подтверждено (системный)
 */

import {
    CheckCircleOutlined,
    DeleteOutlined,
    EyeOutlined,
    FilterOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Checkbox,
    Col,
    DatePicker,
    Descriptions,
    Divider,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
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
import { useSearchParams } from 'react-router-dom';

import { procurementApi, type PurchaseOrder, type PurchaseOrderItem } from '../../features/procurement';
import { warehouseApi } from '../../features/warehouse';
import { api, API_ENDPOINTS } from '../../shared/api/client';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

// Types for GoodsReceipt
interface GoodsReceiptItem {
  id: string;
  purchase_order_item: string;
  purchase_order_item_detail?: {
    id: string;
    ordered_quantity: number;
    delivered_quantity: number;
    remaining_quantity: number;
  };
  nomenclature_detail?: {
    id: string;
    code: string;
    name: string;
  };
  quantity: number;
  batch_number: string;
  notes: string;
}

interface GoodsReceipt {
  id: string;
  number: string;
  purchase_order: string;
  purchase_order_number?: string;
  purchase_order_detail?: {
    id: string;
    number: string;
    supplier_name: string;
    status: string;
    status_display?: string;
  };
  supplier_name?: string;
  warehouse: string;
  warehouse_name?: string;
  warehouse_detail?: {
    id: string;
    code: string;
    name: string;
  };
  status: 'draft' | 'confirmed' | 'cancelled';
  status_display?: string;
  receipt_date: string;
  received_by?: string;
  received_by_detail?: {
    id: string;
    username: string;
    full_name: string;
  };
  notes: string;
  items: GoodsReceiptItem[];
  items_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const statusConfig = {
  draft: { color: 'default', label: 'Черновик' },
  confirmed: { color: 'green', label: 'Подтверждено' },
  cancelled: { color: 'red', label: 'Отменено' },
};

// API functions for GoodsReceipt
const goodsReceiptApi = {
  list: (params?: Record<string, any>) =>
    api.get<{ results: GoodsReceipt[]; count: number }>(API_ENDPOINTS.GOODS_RECEIPTS, { params }),
  get: (id: string) => api.get<GoodsReceipt>(`${API_ENDPOINTS.GOODS_RECEIPTS}${id}/`),
  create: (data: Partial<GoodsReceipt>) =>
    api.post<GoodsReceipt>(API_ENDPOINTS.GOODS_RECEIPTS, data),
  update: (id: string, data: Partial<GoodsReceipt>) =>
    api.patch<GoodsReceipt>(`${API_ENDPOINTS.GOODS_RECEIPTS}${id}/`, data),
  delete: (id: string) => api.delete(`${API_ENDPOINTS.GOODS_RECEIPTS}${id}/`),
  confirm: (id: string) =>
    api.post<GoodsReceipt>(`${API_ENDPOINTS.GOODS_RECEIPTS}${id}/confirm/`),
  cancel: (id: string) =>
    api.post<GoodsReceipt>(`${API_ENDPOINTS.GOODS_RECEIPTS}${id}/cancel/`),
};

export default function GoodsReceiptsPage() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = useModuleAccess('warehouse.receipts');
  const [searchParams] = useSearchParams();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [warehouseFilter, setWarehouseFilter] = useState<string | undefined>();
  
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailReceipt, setDetailReceipt] = useState<GoodsReceipt | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(searchParams.get('create') === 'true');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(searchParams.get('order'));
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const createParam = searchParams.get('create') === 'true';
    const orderParam = searchParams.get('order');
    if (createParam) {
      setCreateModalVisible(true);
      if (orderParam && orderParam !== selectedOrderId) {
        setSelectedOrderId(orderParam);
      }
    }
  }, [searchParams]);

  // Fetch goods receipts
  const { data: receiptsData, isLoading, refetch } = useQuery({
    queryKey: ['goods-receipts', statusFilter, warehouseFilter, search],
    queryFn: () =>
      goodsReceiptApi.list({
        status: statusFilter,
        warehouse: warehouseFilter,
        search,
      }),
  });

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: () => warehouseApi.warehouses.list(),
  });

  // Fetch purchase orders (for creating receipts)
  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders-for-receipt'],
    queryFn: () =>
      procurementApi.purchaseOrders.list({}),
    enabled: createModalVisible,
  });

  const receipts = receiptsData?.results || [];
  const warehouses = warehousesData?.results || [];
  const availableOrders = (ordersData?.results || []).filter(
    (order) => order.status === 'ordered' || order.status === 'partially_delivered'
  );

  // Load selected order details
  useEffect(() => {
    if (selectedOrderId && createModalVisible) {
      form.setFieldValue('purchase_order', selectedOrderId);
      procurementApi.purchaseOrders.get(selectedOrderId).then(setSelectedOrder);
    }
  }, [selectedOrderId, createModalVisible, form]);

  // Mutations
  const createReceiptMutation = useMutation({
    mutationFn: goodsReceiptApi.create,
    onSuccess: () => {
      message.success('Поступление создано');
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      setCreateModalVisible(false);
      setSelectedOrder(null);
      setSelectedOrderId(null);
      form.resetFields();
    },
    onError: () => {
      message.error('Ошибка при создании поступления');
    },
  });

  const confirmReceiptMutation = useMutation({
    mutationFn: goodsReceiptApi.confirm,
    onSuccess: () => {
      message.success('Поступление подтверждено. Остатки обновлены.');
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      setDrawerVisible(false);
      setDetailReceipt(null);
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при подтверждении');
    },
  });

  const cancelReceiptMutation = useMutation({
    mutationFn: goodsReceiptApi.cancel,
    onSuccess: () => {
      message.success('Поступление отменено');
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
    },
    onError: () => {
      message.error('Ошибка при отмене');
    },
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: goodsReceiptApi.delete,
    onSuccess: () => {
      message.success('Поступление удалено');
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
    },
    onError: () => {
      message.error('Ошибка при удалении');
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    const total = receipts.length;
    const drafts = receipts.filter(r => r.status === 'draft').length;
    const confirmed = receipts.filter(r => r.status === 'confirmed').length;
    
    return { total, drafts, confirmed };
  }, [receipts]);

  // View receipt detail
  const showReceiptDetail = async (receipt: GoodsReceipt) => {
    try {
      const detail = await goodsReceiptApi.get(receipt.id);
      setDetailReceipt(detail);
      setDrawerVisible(true);
    } catch {
      message.error('Ошибка загрузки поступления');
    }
  };

  // Table columns
  const columns: ColumnsType<GoodsReceipt> = [
    {
      title: 'Номер',
      dataIndex: 'number',
      key: 'number',
      render: (number, record) => (
        <Button type="link" onClick={() => showReceiptDetail(record)}>
          {number}
        </Button>
      ),
    },
    {
      title: 'Заказ',
      key: 'purchase_order',
      render: (_, record) => record.purchase_order_number || '-',
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      render: (_, record) => record.supplier_name || '-',
    },
    {
      title: 'Склад',
      key: 'warehouse',
      render: (_, record) => record.warehouse_name || '-',
    },
    {
      title: 'Дата поступления',
      key: 'receipt_date',
      dataIndex: 'receipt_date',
      render: (date) => date ? dayjs(date).format('DD.MM.YYYY') : '-',
      sorter: (a, b) => (a.receipt_date || '').localeCompare(b.receipt_date || ''),
    },
    {
      title: 'Позиций',
      key: 'items_count',
      dataIndex: 'items_count',
      align: 'center',
    },
    {
      title: 'Статус',
      key: 'status',
      dataIndex: 'status',
      align: 'center',
      render: (status, record) => {
        const config = statusConfig[status as keyof typeof statusConfig];
        const label = record.status_display || config?.label || status;
        return <Tag color={config?.color}>{label}</Tag>;
      },
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Tooltip title="Просмотр">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => showReceiptDetail(record)}
            />
          </Tooltip>
          {canEdit && record.status === 'draft' && (
            <>
              <Tooltip title="Подтвердить приёмку">
                <Popconfirm
                  title="Подтвердить поступление?"
                  description="Остатки на складе будут увеличены"
                  onConfirm={() => confirmReceiptMutation.mutate(record.id)}
                >
                  <Button type="text" icon={<CheckCircleOutlined />} />
                </Popconfirm>
              </Tooltip>
              <Tooltip title="Отменить">
                <Popconfirm
                  title="Отменить поступление?"
                  onConfirm={() => cancelReceiptMutation.mutate(record.id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            </>
          )}
          {canDelete && (
            <Tooltip title="Удалить">
              <Popconfirm
                title="Удалить поступление?"
                okText="Удалить"
                okType="danger"
                cancelText="Отмена"
                onConfirm={() => deleteReceiptMutation.mutate(record.id)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Items table columns for drawer and create modal
  const itemColumns: ColumnsType<any> = [
    {
      title: 'Материал',
      key: 'nomenclature',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.nomenclature_detail?.name || item.name || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Заказано',
      key: 'ordered',
      align: 'right',
      render: (_, item) => item.purchase_order_item_detail?.ordered_quantity || item.quantity || '-',
    },
    {
      title: 'Уже получено',
      key: 'delivered',
      align: 'right',
      render: (_, item) => item.purchase_order_item_detail?.delivered_quantity || item.delivered_quantity || 0,
    },
    {
      title: 'Осталось',
      key: 'remaining',
      align: 'right',
      render: (_, item) => {
        const remaining = item.purchase_order_item_detail?.remaining_quantity || 
          (Number(item.quantity) - Number(item.delivered_quantity || 0));
        return <Text type={remaining > 0 ? 'warning' : undefined}>{remaining}</Text>;
      },
    },
    {
      title: 'Принимаем',
      key: 'accept_quantity',
      align: 'right',
      render: (_, item) => item.quantity || '-',
    },
  ];

  const handleCreateReceipt = (values: any) => {
    const items = selectedOrder?.items
      ?.filter((item: any) => values.items?.[item.id]?.selected)
      .filter((item: any) => values.items?.[item.id]?.quantity > 0)
      .map((item: any) => ({
        purchase_order_item: item.id,
        quantity: values.items[item.id].quantity,
        batch_number: values.items[item.id].batch_number || '',
      })) || [];

    createReceiptMutation.mutate({
      purchase_order: values.purchase_order,
      warehouse: values.warehouse,
      receipt_date: values.receipt_date?.format('YYYY-MM-DD'),
      notes: values.notes,
      items: items as any,
    });
  };

  const orderItemsForReceipt = useMemo(() => {
    if (!selectedOrder?.items) {
      return [] as PurchaseOrderItem[];
    }
    return selectedOrder.items.filter(
      (item: PurchaseOrderItem) => item.material_requirement_detail?.status === 'in_order'
    );
  }, [selectedOrder]);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <InboxOutlined style={{ marginRight: 8 }} />
            Поступления (Приёмка)
          </Title>
          <Text type="secondary">
            Приёмка товаров по заказам на закупку. При подтверждении остатки увеличиваются автоматически.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Обновить
            </Button>
            {canEdit && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                Создать поступление
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Всего поступлений" value={stats.total} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Черновики"
              value={stats.drafts}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Подтверждено"
              value={stats.confirmed}
              valueStyle={{ color: '#52c41a' }}
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
              placeholder="Склад"
              style={{ width: '100%' }}
              value={warehouseFilter}
              onChange={setWarehouseFilter}
              allowClear
            >
              {warehouses.map((w) => (
                <Select.Option key={w.id} value={w.id}>
                  {w.name}
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
          dataSource={receipts}
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
                description="Поступления отсутствуют"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={`Поступление ${detailReceipt?.number || ''}`}
        width={800}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setDetailReceipt(null);
        }}
        extra={
          detailReceipt?.status === 'draft' && (
            <Popconfirm
              title="Подтвердить поступление?"
              description="Остатки на складе будут увеличены"
              onConfirm={() => confirmReceiptMutation.mutate(detailReceipt.id)}
            >
              <Button type="primary" icon={<CheckCircleOutlined />}>
                Подтвердить
              </Button>
            </Popconfirm>
          )
        }
      >
        {detailReceipt && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Номер">{detailReceipt.number}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={statusConfig[detailReceipt.status]?.color}>
                  {detailReceipt.status_display || statusConfig[detailReceipt.status]?.label || detailReceipt.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Заказ">
                {detailReceipt.purchase_order_detail?.number || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Поставщик">
                {detailReceipt.purchase_order_detail?.supplier_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Склад">
                {detailReceipt.warehouse_detail?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Дата поступления">
                {detailReceipt.receipt_date 
                  ? dayjs(detailReceipt.receipt_date).format('DD.MM.YYYY') 
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Принял">
                {detailReceipt.received_by_detail?.full_name || '-'}
              </Descriptions.Item>
              {detailReceipt.notes && (
                <Descriptions.Item label="Примечания" span={2}>
                  {detailReceipt.notes}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider>Позиции</Divider>

            <Table
              columns={itemColumns}
              dataSource={detailReceipt.items || []}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </>
        )}
      </Drawer>

      {/* Create Modal */}
      <Modal
        title="Создать поступление"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          setSelectedOrder(null);
          setSelectedOrderId(null);
          form.resetFields();
        }}
        footer={null}
        width={1400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateReceipt}
          initialValues={{
            receipt_date: dayjs(),
          }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="purchase_order"
                label="Заказ на закупку"
                rules={[{ required: true, message: 'Выберите заказ' }]}
              >
                <Select
                  placeholder="Выберите заказ"
                  showSearch
                  optionFilterProp="children"
                  onChange={(value) => {
                    setSelectedOrderId(value);
                    const order = availableOrders.find(o => o.id === value);
                    if (order) {
                      procurementApi.purchaseOrders.get(order.id).then(setSelectedOrder);
                    }
                  }}
                >
                  {availableOrders.map((o) => (
                    <Select.Option key={o.id} value={o.id}>
                      {o.number} - {o.supplier_name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="warehouse"
                label="Склад"
                rules={[{ required: true, message: 'Выберите склад' }]}
              >
                <Select placeholder="Выберите склад">
                  {warehouses.map((w) => (
                    <Select.Option key={w.id} value={w.id}>
                      {w.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="receipt_date"
                label="Дата поступления"
                rules={[{ required: true, message: 'Выберите дату' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Примечания" style={{ marginTop: 8, marginBottom: 8 }}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Divider>Перечень позиций заказа</Divider>
          <Table
            dataSource={orderItemsForReceipt}
            rowKey="id"
            pagination={false}
            size="small"
            locale={{
              emptyText: selectedOrder ? 'Нет позиций со статусом "В заказе"' : 'Выберите заказ на закупку',
            }}
            columns={[
              {
                title: 'Принять',
                key: 'select',
                width: 80,
                align: 'center',
                render: (_, item: PurchaseOrderItem) => (
                  <Form.Item
                    name={['items', item.id, 'selected']}
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox />
                  </Form.Item>
                ),
              },
              {
                title: 'Материал',
                key: 'nomenclature',
                render: (_, item: PurchaseOrderItem) => (
                  <Space direction="vertical" size={0}>
                    <Text strong>{item.nomenclature_detail?.name || '-'}</Text>
                  </Space>
                ),
              },
              {
                title: 'Заказано',
                dataIndex: 'quantity',
                align: 'right',
                render: (val) => Number(val).toLocaleString('ru-RU'),
              },
              {
                title: 'Получено',
                dataIndex: 'delivered_quantity',
                align: 'right',
                render: (val) => Number(val).toLocaleString('ru-RU'),
              },
              {
                title: 'Осталось',
                align: 'right',
                render: (_, item: PurchaseOrderItem) => {
                  const remaining = Number(item.quantity) - Number(item.delivered_quantity);
                  return <Text type={remaining > 0 ? 'warning' : undefined}>{remaining}</Text>;
                },
              },
              {
                title: 'Принять',
                key: 'accept',
                width: 120,
                render: (_, item: PurchaseOrderItem) => {
                  const remaining = Number(item.quantity) - Number(item.delivered_quantity);
                  return (
                    <Form.Item
                      name={['items', item.id, 'quantity']}
                      noStyle
                      initialValue={remaining}
                    >
                      <InputNumber
                        min={0}
                        max={remaining}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  );
                },
              },
              {
                title: 'Партия',
                key: 'batch',
                width: 120,
                render: (_, item: PurchaseOrderItem) => (
                  <Form.Item
                    name={['items', item.id, 'batch_number']}
                    noStyle
                  >
                    <Input placeholder="№ партии" />
                  </Form.Item>
                ),
              },
            ]}
          />

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false);
                setSelectedOrder(null);
                setSelectedOrderId(null);
                form.resetFields();
              }}>
                Отмена
              </Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={createReceiptMutation.isPending}
                disabled={!selectedOrder}
              >
                Создать
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
