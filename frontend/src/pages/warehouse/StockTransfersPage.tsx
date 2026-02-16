import {
    CarOutlined,
    CheckOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    EyeOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SendOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Checkbox,
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
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import {
    warehouseApi,
    type StockItem,
    type StockTransfer,
    type StockTransferItem,
    type StockTransferStatus,
    type Warehouse,
} from '../../features/warehouse';

const { Title, Text } = Typography;

// Status configuration
const statusConfig: Record<StockTransferStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Черновик' },
  pending: { color: 'processing', label: 'Ожидает' },
  in_transit: { color: 'blue', label: 'В пути' },
  completed: { color: 'success', label: 'Завершено' },
  cancelled: { color: 'error', label: 'Отменено' },
};

export default function StockTransfersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockTransferStatus | undefined>();
  const [sourceWarehouseFilter, setSourceWarehouseFilter] = useState<string | undefined>();
  const [destWarehouseFilter, setDestWarehouseFilter] = useState<string | undefined>();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

  // Create modal state - items selection
  const [createSourceWarehouse, setCreateSourceWarehouse] = useState<string | undefined>();
  const [selectedStockItems, setSelectedStockItems] = useState<Record<string, number>>({});
  const [isSelectItemsOpen, setIsSelectItemsOpen] = useState(false);
  const [createCategoryFilter, setCreateCategoryFilter] = useState<string | undefined>();

  const [createForm] = Form.useForm();
  const [addItemForm] = Form.useForm();

  // Fetch transfers
  const { data: transfersData, isLoading, refetch } = useQuery({
    queryKey: ['stock-transfers', statusFilter, sourceWarehouseFilter, destWarehouseFilter, search],
    queryFn: () =>
      warehouseApi.stockTransfers.list({
        status: statusFilter,
        source_warehouse: sourceWarehouseFilter,
        destination_warehouse: destWarehouseFilter,
        search: search || undefined,
      }),
  });

  // Fetch warehouses for filters
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: () => warehouseApi.warehouses.list({ is_active: true, page_size: 100 }),
  });

  // Fetch selected transfer details
  const { data: transferDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-transfer-detail', selectedTransfer?.id],
    queryFn: () => (selectedTransfer ? warehouseApi.stockTransfers.get(selectedTransfer.id) : null),
    enabled: !!selectedTransfer && isDetailDrawerOpen,
  });

  // Fetch stock items for add item modal (existing transfer)
  const { data: stockItemsData } = useQuery({
    queryKey: ['stock-items-for-transfer', selectedTransfer?.source_warehouse],
    queryFn: () =>
      warehouseApi.stockItems.list({
        warehouse: selectedTransfer?.source_warehouse,
        page_size: 500,
      }),
    enabled: !!selectedTransfer?.source_warehouse && isAddItemModalOpen,
  });

  // Fetch stock items for create modal (new transfer)
  const { data: createStockItemsData } = useQuery({
    queryKey: ['stock-items-for-create-transfer', createSourceWarehouse],
    queryFn: () =>
      warehouseApi.stockItems.list({
        warehouse: createSourceWarehouse,
        page_size: 500,
      }),
    enabled: !!createSourceWarehouse && isCreateModalOpen,
  });

  const transfers = transfersData?.results || [];
  const warehouses = warehousesData?.results || [];
  const stockItems = stockItemsData?.results || [];
  const createStockItems = createStockItemsData?.results || [];

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    createStockItems.forEach((item) => {
      if (item.catalog_category && item.catalog_category_name) {
        map.set(item.catalog_category, item.catalog_category_name);
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [createStockItems]);

  const filteredCreateStockItems = useMemo(() => {
    if (!createCategoryFilter) return createStockItems;
    return createStockItems.filter((item) => item.catalog_category === createCategoryFilter);
  }, [createStockItems, createCategoryFilter]);

  // Create mutation with items
  const createMutation = useMutation({
    mutationFn: async (data: {
      source_warehouse: string;
      destination_warehouse: string;
      reason?: string;
      notes?: string;
      items?: Array<{ stock_item_id: string; quantity: number }>;
    }) => {
      const { items, ...transferData } = data;
      const transfer = await warehouseApi.stockTransfers.create(transferData);
      
      // Add items if provided
      if (items && items.length > 0) {
        for (const item of items) {
          await warehouseApi.stockTransfers.addItem(transfer.id, item);
        }
      }
      
      return transfer;
    },
    onSuccess: (result) => {
      const itemCount = Object.keys(selectedStockItems).filter(k => selectedStockItems[k] > 0).length;
      message.success(`Создано перемещение ${result.number}${itemCount > 0 ? ` с ${itemCount} позициями` : ''}`);
      setIsCreateModalOpen(false);
      createForm.resetFields();
      setCreateSourceWarehouse(undefined);
      setSelectedStockItems({});
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      setSelectedTransfer(result);
      setIsDetailDrawerOpen(true);
    },
    onError: () => {
      message.error('Ошибка при создании перемещения');
    },
  });

  // Add item mutation
  const addItemMutation = useMutation({
    mutationFn: (data: { stock_item_id: string; quantity: number; notes?: string }) =>
      warehouseApi.stockTransfers.addItem(selectedTransfer!.id, data),
    onSuccess: () => {
      message.success('Позиция добавлена');
      setIsAddItemModalOpen(false);
      addItemForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при добавлении позиции');
    },
  });

  // Remove item mutation
  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => warehouseApi.stockTransfers.removeItem(selectedTransfer!.id, itemId),
    onSuccess: () => {
      message.success('Позиция удалена');
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при удалении позиции');
    },
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.submit(id),
    onSuccess: () => {
      message.success('Перемещение отправлено на согласование');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при отправке');
    },
  });

  // Ship mutation
  const shipMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.ship(id),
    onSuccess: () => {
      message.success('Перемещение отправлено');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при отправке');
    },
  });

  // Receive mutation
  const receiveMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.receive(id),
    onSuccess: () => {
      message.success('Перемещение принято');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при приёмке');
    },
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.delete(id),
    onSuccess: () => {
      message.success('Перемещение удалено');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
    },
    onError: () => {
      message.error('Ошибка при удалении');
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.cancel(id),
    onSuccess: () => {
      message.success('Перемещение отменено');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', selectedTransfer?.id] });
    },
    onError: () => {
      message.error('Ошибка при отмене');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockTransfers.delete(id),
    onSuccess: () => {
      message.success('Перемещение удалено');
      setIsDetailDrawerOpen(false);
      setSelectedTransfer(null);
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
    },
    onError: () => {
      message.error('Ошибка при удалении');
    },
  });

  // Handle create
  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      // Build items array from selectedStockItems
      const items = Object.entries(selectedStockItems)
        .filter(([, quantity]) => quantity > 0)
        .map(([stock_item_id, quantity]) => ({ stock_item_id, quantity }));
      
      createMutation.mutate({
        ...values,
        items,
      });
    });
  };

  // Handle select all items for transfer
  const handleSelectAll = () => {
    const allItems: Record<string, number> = {};
    filteredCreateStockItems.filter(si => si.quantity > 0).forEach(si => {
      allItems[si.id] = si.quantity;
    });
    setSelectedStockItems(allItems);
  };

  // Handle clear selection
  const handleClearSelection = () => {
    setSelectedStockItems({});
  };

  // Reset create modal state when source warehouse changes
  useEffect(() => {
    setSelectedStockItems({});
    setCreateCategoryFilter(undefined);
    setIsSelectItemsOpen(false);
  }, [createSourceWarehouse]);

  // Handle add item
  const handleAddItem = () => {
    addItemForm.validateFields().then((values) => {
      addItemMutation.mutate(values);
    });
  };

  // Open detail drawer
  const openDetail = (transfer: StockTransfer) => {
    setSelectedTransfer(transfer);
    setIsDetailDrawerOpen(true);
  };

  // Table columns
  const columns: ColumnsType<StockTransfer> = useMemo(
    () => [
      {
        title: 'Номер',
        dataIndex: 'number',
        key: 'number',
        width: 130,
        render: (number: string, record) => (
          <Button type="link" onClick={() => openDetail(record)} style={{ padding: 0 }}>
            {number}
          </Button>
        ),
      },
      {
        title: 'Откуда',
        dataIndex: 'source_warehouse_name',
        key: 'source',
        width: 180,
      },
      {
        title: '',
        key: 'arrow',
        width: 50,
        align: 'center',
        render: () => <SwapOutlined style={{ color: '#1890ff' }} />,
      },
      {
        title: 'Куда',
        dataIndex: 'destination_warehouse_name',
        key: 'destination',
        width: 180,
      },
      {
        title: 'Позиций',
        dataIndex: 'items_count',
        key: 'items_count',
        width: 80,
        align: 'center',
      },
      {
        title: 'Создано',
        dataIndex: 'created_date',
        key: 'created_date',
        width: 110,
        render: (date: string) => dayjs(date).format('DD.MM.YYYY'),
      },
      {
        title: 'Отправлено',
        dataIndex: 'shipped_date',
        key: 'shipped_date',
        width: 110,
        render: (date: string | null) => (date ? dayjs(date).format('DD.MM.YYYY') : '—'),
      },
      {
        title: 'Получено',
        dataIndex: 'received_date',
        key: 'received_date',
        width: 110,
        render: (date: string | null) => (date ? dayjs(date).format('DD.MM.YYYY') : '—'),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        align: 'center',
        render: (status: StockTransferStatus) => (
          <Tag color={statusConfig[status].color}>{statusConfig[status].label}</Tag>
        ),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 100,
        align: 'center',
        render: (_, record) => (
          <Space>
            <Tooltip title="Просмотр">
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} />
            </Tooltip>
            <Tooltip title="Удалить">
              <Popconfirm
                title="Удалить перемещение?"
                okText="Удалить"
                okType="danger"
                cancelText="Отмена"
                onConfirm={() => deleteTransferMutation.mutate(record.id)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          </Space>
        ),
      },
    ],
    [deleteTransferMutation]
  );

  // Items columns for detail drawer
  const itemColumns: ColumnsType<StockTransferItem> = [
    {
      title: 'Номенклатура',
      key: 'nomenclature',
      render: (_, record) => (
        <div>
          <div>{record.nomenclature_name}</div>
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
      title: 'Количество',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (qty: number) => qty.toLocaleString('ru-RU'),
    },
    {
      title: 'Доступно',
      dataIndex: 'available_quantity',
      key: 'available',
      width: 100,
      align: 'right',
      render: (qty: number) => (qty !== undefined ? qty.toLocaleString('ru-RU') : '—'),
    },
    ...(selectedTransfer?.status === 'draft'
      ? [
          {
            title: '',
            key: 'delete',
            width: 50,
            align: 'center' as const,
            render: (_: unknown, record: StockTransferItem) => (
              <Popconfirm
                title="Удалить позицию?"
                onConfirm={() => removeItemMutation.mutate(record.id)}
                okText="Да"
                cancelText="Нет"
              >
                <Button type="link" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  const detail = transferDetail || selectedTransfer;
  const detailItemsCount = detail?.items?.length ?? detail?.items_count ?? 0;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          Перемещения между складами
        </Title>
        <Text type="secondary">Управление документами перемещения товаров между складами</Text>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по номеру..."
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            placeholder="Склад отправления"
            style={{ width: 180 }}
            allowClear
            value={sourceWarehouseFilter}
            onChange={setSourceWarehouseFilter}
            options={warehouses.map((w: Warehouse) => ({ label: w.name, value: w.id }))}
          />
          <Select
            placeholder="Склад получения"
            style={{ width: 180 }}
            allowClear
            value={destWarehouseFilter}
            onChange={setDestWarehouseFilter}
            options={warehouses.map((w: Warehouse) => ({ label: w.name, value: w.id }))}
          />
          <Select
            placeholder="Статус"
            style={{ width: 150 }}
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            options={Object.entries(statusConfig).map(([value, { label }]) => ({
              label,
              value,
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Обновить
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
            Создать перемещение
          </Button>
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={transfers}
          rowKey="id"
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
            pageSize: 20,
          }}
          scroll={{ x: 1200 }}
          size="small"
          locale={{
            emptyText: <Empty description="Нет перемещений" />,
          }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Создать перемещение"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          createForm.resetFields();
          setCreateSourceWarehouse(undefined);
          setSelectedStockItems({});
        }}
        onOk={handleCreate}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={createMutation.isPending}
        width={800}
      >
        <Form form={createForm} layout="vertical">
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="source_warehouse"
              label="Склад отправления"
              rules={[{ required: true, message: 'Выберите склад' }]}
              style={{ flex: 1 }}
            >
              <Select
                placeholder="Выберите склад"
                options={warehouses.map((w: Warehouse) => ({ label: w.name, value: w.id }))}
                onChange={(value) => setCreateSourceWarehouse(value)}
              />
            </Form.Item>
            <Form.Item
              name="destination_warehouse"
              label="Склад получения"
              rules={[{ required: true, message: 'Выберите склад' }]}
              style={{ flex: 1 }}
            >
              <Select
                placeholder="Выберите склад"
                disabled={!createSourceWarehouse}
                options={warehouses
                  .filter((w: Warehouse) => w.id !== createSourceWarehouse)
                  .map((w: Warehouse) => ({ label: w.name, value: w.id }))}
              />
            </Form.Item>
          </div>
          {createSourceWarehouse && (
            <Space style={{ marginBottom: 12 }} wrap>
              <Button
                icon={<InboxOutlined />}
                onClick={() => setIsSelectItemsOpen((prev) => !prev)}
              >
                {isSelectItemsOpen ? 'Скрыть позиции' : 'Добавить перемещаемые позиции'}
              </Button>
              <Select
                placeholder="Вид справочника"
                style={{ minWidth: 220 }}
                allowClear
                disabled={!isSelectItemsOpen}
                value={createCategoryFilter}
                onChange={setCreateCategoryFilter}
                options={categoryOptions}
              />
            </Space>
          )}
          
          {createSourceWarehouse && isSelectItemsOpen && (
            <>
              <Divider orientation="left" style={{ margin: '12px 0' }}>
                Позиции для перемещения
                <Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal', fontSize: 12 }}>
                  (выбрано: {Object.values(selectedStockItems).filter(q => q > 0).length})
                </Text>
              </Divider>
              
              <Space style={{ marginBottom: 12 }}>
                <Button 
                  icon={<CheckOutlined />} 
                  onClick={handleSelectAll}
                  disabled={filteredCreateStockItems.filter(si => si.quantity > 0).length === 0}
                >
                  Переместить всё
                </Button>
                <Button onClick={handleClearSelection} disabled={Object.keys(selectedStockItems).length === 0}>
                  Снять выбор
                </Button>
              </Space>

              {filteredCreateStockItems.filter(si => si.quantity > 0).length === 0 ? (
                <Empty 
                  description="На выбранном складе нет товаров"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="id"
                    dataSource={filteredCreateStockItems.filter(si => si.quantity > 0)}
                    columns={[
                      {
                        title: '',
                        dataIndex: 'id',
                        key: 'select',
                        width: 50,
                        render: (id: string, record: StockItem) => (
                          <Checkbox
                            checked={(selectedStockItems[id] || 0) > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStockItems(prev => ({ ...prev, [id]: record.quantity }));
                              } else {
                                setSelectedStockItems(prev => ({ ...prev, [id]: 0 }));
                              }
                            }}
                          />
                        ),
                      },
                      {
                        title: 'Наименование',
                        dataIndex: 'nomenclature_name',
                        key: 'nomenclature_name',
                        ellipsis: true,
                      },
                      {
                        title: 'Вид',
                        dataIndex: 'catalog_category_name',
                        key: 'catalog_category_name',
                        width: 160,
                        render: (value?: string | null) => value || '—',
                      },
                      {
                        title: 'Доступно',
                        dataIndex: 'quantity',
                        key: 'available',
                        width: 100,
                        align: 'right',
                        render: (qty: number, record: StockItem) => `${qty} ${record.unit || 'шт.'}`,
                      },
                      {
                        title: 'К перемещению',
                        dataIndex: 'id',
                        key: 'transfer_qty',
                        width: 140,
                        render: (id: string, record: StockItem) => (
                          <InputNumber
                            size="small"
                            min={0}
                            max={record.quantity}
                            value={selectedStockItems[id] || 0}
                            onChange={(value) => {
                              setSelectedStockItems(prev => ({ ...prev, [id]: value || 0 }));
                            }}
                            style={{ width: '100%' }}
                            disabled={(selectedStockItems[id] || 0) === 0 && !Object.keys(selectedStockItems).includes(id)}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <Form.Item name="reason" label="Причина перемещения" style={{ flex: 1 }}>
              <Input.TextArea rows={2} placeholder="Укажите причину" />
            </Form.Item>
            <Form.Item name="notes" label="Примечания" style={{ flex: 1 }}>
              <Input.TextArea rows={2} placeholder="Дополнительные примечания" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title={`Перемещение ${detail?.number || ''}`}
        placement="right"
        width={800}
        open={isDetailDrawerOpen}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setSelectedTransfer(null);
        }}
        extra={
          detail && (
            <Space>
              {detail.status === 'draft' && (
                <>
                  <Button icon={<PlusOutlined />} onClick={() => setIsAddItemModalOpen(true)}>
                    Добавить позицию
                  </Button>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => submitMutation.mutate(detail.id)}
                    loading={submitMutation.isPending}
                    disabled={detailItemsCount === 0}
                  >
                    Отправить
                  </Button>
                  <Popconfirm
                    title="Удалить перемещение?"
                    onConfirm={() => deleteMutation.mutate(detail.id)}
                    okText="Да"
                    cancelText="Нет"
                  >
                    <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
                      Удалить
                    </Button>
                  </Popconfirm>
                </>
              )}
              {detail.status === 'pending' && (
                <>
                  <Button
                    type="primary"
                    icon={<CarOutlined />}
                    onClick={() => shipMutation.mutate(detail.id)}
                    loading={shipMutation.isPending}
                  >
                    Отгрузить
                  </Button>
                  <Popconfirm
                    title="Отменить перемещение?"
                    onConfirm={() => cancelMutation.mutate(detail.id)}
                    okText="Да"
                    cancelText="Нет"
                  >
                    <Button danger icon={<CloseCircleOutlined />} loading={cancelMutation.isPending}>
                      Отменить
                    </Button>
                  </Popconfirm>
                </>
              )}
              {detail.status === 'in_transit' && (
                <Button
                  type="primary"
                  icon={<InboxOutlined />}
                  onClick={() => receiveMutation.mutate(detail.id)}
                  loading={receiveMutation.isPending}
                >
                  Принять
                </Button>
              )}
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Статус">
                <Tag color={statusConfig[detail.status].color}>{statusConfig[detail.status].label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Создано">
                {dayjs(detail.created_date).format('DD.MM.YYYY')}
              </Descriptions.Item>
              <Descriptions.Item label="Склад отправления">{detail.source_warehouse_name}</Descriptions.Item>
              <Descriptions.Item label="Склад получения">{detail.destination_warehouse_name}</Descriptions.Item>
              {detail.shipped_date && (
                <Descriptions.Item label="Отгружено">
                  {dayjs(detail.shipped_date).format('DD.MM.YYYY')}
                </Descriptions.Item>
              )}
              {detail.received_date && (
                <Descriptions.Item label="Принято">
                  {dayjs(detail.received_date).format('DD.MM.YYYY')}
                </Descriptions.Item>
              )}
              {detail.shipped_by_name && (
                <Descriptions.Item label="Отгрузил">{detail.shipped_by_name}</Descriptions.Item>
              )}
              {detail.received_by_name && (
                <Descriptions.Item label="Принял">{detail.received_by_name}</Descriptions.Item>
              )}
              {detail.reason && <Descriptions.Item label="Причина" span={2}>{detail.reason}</Descriptions.Item>}
              {detail.notes && <Descriptions.Item label="Примечания" span={2}>{detail.notes}</Descriptions.Item>}
            </Descriptions>

            <Divider orientation="left">Позиции ({detail.items?.length || 0})</Divider>

            <Table
              columns={itemColumns}
              dataSource={transferDetail?.items || []}
              rowKey="id"
              loading={detailLoading}
              pagination={false}
              size="small"
              locale={{
                emptyText: <Empty description="Нет позиций. Добавьте товары для перемещения." />,
              }}
            />
          </>
        )}
      </Drawer>

      {/* Add Item Modal */}
      <Modal
        title="Добавить позицию"
        open={isAddItemModalOpen}
        onCancel={() => {
          setIsAddItemModalOpen(false);
          addItemForm.resetFields();
        }}
        onOk={handleAddItem}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={addItemMutation.isPending}
      >
        <Form form={addItemForm} layout="vertical">
          <Form.Item
            name="stock_item_id"
            label="Позиция на складе"
            rules={[{ required: true, message: 'Выберите позицию' }]}
          >
            <Select
              showSearch
              placeholder="Выберите позицию"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={stockItems
                .filter((si: StockItem) => si.quantity > 0)
                .map((si: StockItem) => ({
                  label: `${si.nomenclature_name} (${si.quantity} ${si.unit || 'шт.'})`,
                  value: si.id,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Количество"
            rules={[
              { required: true, message: 'Укажите количество' },
              { type: 'number', min: 0.001, message: 'Количество должно быть больше 0' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.001}
              precision={3}
              placeholder="Количество для перемещения"
            />
          </Form.Item>
          <Form.Item name="notes" label="Примечания">
            <Input.TextArea rows={2} placeholder="Примечания к позиции" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
