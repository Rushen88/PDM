import {
    DeleteOutlined,
    ExportOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    ShareAltOutlined,
    WarningOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Progress,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { catalogApi, type Nomenclature } from '../../features/catalog';
import { projectsApi } from '../../features/projects';
import {
    warehouseApi,
    type StockItem,
    type Warehouse,
    type WarehouseSummary
} from '../../features/warehouse';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = useModuleAccess('warehouse.inventory');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
  const [distributeModalOpen, setDistributeModalOpen] = useState(false);
  const [distributeItem, setDistributeItem] = useState<StockItem | null>(null);
  const [distributeProjects, setDistributeProjects] = useState<string[]>([]);
  const [distributeQuantity, setDistributeQuantity] = useState<number>(0);
  
  const [receiveForm] = Form.useForm();
  const [issueForm] = Form.useForm();

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.warehouses.list({ is_active: true }),
  });

  const warehouses: Warehouse[] = warehousesData?.results || [];

  // Fetch warehouse summary
  const { data: summary } = useQuery({
    queryKey: ['warehouse-summary', selectedWarehouse],
    queryFn: () => selectedWarehouse ? warehouseApi.warehouses.summary(selectedWarehouse) : null,
    enabled: !!selectedWarehouse,
  });

  // Fetch stock items
  const { data: stockItemsData, isLoading, refetch } = useQuery({
    queryKey: ['stock-items', selectedWarehouse, searchText, showLowStock],
    queryFn: () => warehouseApi.stockItems.list({
      warehouse: selectedWarehouse,
      search: searchText || undefined,
      low_stock: showLowStock || undefined,
    }),
  });

  const stockItems: StockItem[] = stockItemsData?.results || [];

  // Fetch nomenclature for receipt modal
  const { data: nomenclatureData } = useQuery({
    queryKey: ['nomenclature-for-stock'],
    queryFn: () => catalogApi.nomenclature.list({ page_size: 1000, is_active: true }),
  });

  const nomenclatureItems: Nomenclature[] = nomenclatureData?.results || [];

  const { data: activeProjectsData } = useQuery({
    queryKey: ['active-projects-for-distribution'],
    queryFn: () => projectsApi.list({ status: 'in_progress', page_size: 200 }),
    enabled: distributeModalOpen,
  });
  const activeProjects = activeProjectsData?.results || [];

  // Receive stock mutation
  const receiveMutation = useMutation({
    mutationFn: warehouseApi.stockItems.receive,
    onSuccess: () => {
      message.success('Товар принят на склад');
      setShowReceiveModal(false);
      receiveForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при приёмке');
    },
  });

  // Issue stock mutation
  const issueMutation = useMutation({
    mutationFn: warehouseApi.stockItems.issue,
    onSuccess: () => {
      message.success('Товар выдан со склада');
      setShowIssueModal(false);
      setSelectedStockItem(null);
      issueForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при выдаче');
    },
  });

  const deleteStockItemMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockItems.delete(id),
    onSuccess: () => {
      message.success('Позиция удалена');
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
    },
    onError: () => message.error('Ошибка при удалении'),
  });

  const distributeMutation = useMutation({
    mutationFn: (data: { stockItemId: string; projectIds: string[]; quantity: number }) =>
      warehouseApi.stockItems.distributeToProjects(data.stockItemId, {
        project_ids: data.projectIds,
        quantity: data.quantity,
      }),
    onSuccess: (result) => {
      message.success(`Распределено: ${result.allocated.length}`);
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['project-items'] });
      setDistributeModalOpen(false);
      setDistributeItem(null);
      setDistributeProjects([]);
      setDistributeQuantity(0);
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error || error?.message;
      message.error(apiError || 'Ошибка распределения');
    },
  });

  // Handle receive
  const handleReceive = async (values: any) => {
    await receiveMutation.mutateAsync({
      warehouse_id: values.warehouse_id,
      nomenclature_item_id: values.nomenclature_item_id,
      quantity: values.quantity,
      unit: values.unit || 'шт',
      batch_number: values.batch_number,
      unit_cost: values.unit_cost,
      location: values.location,
      notes: values.notes,
    });
  };

  // Handle issue
  const handleIssue = async (values: any) => {
    if (!selectedStockItem) return;
    await issueMutation.mutateAsync({
      stock_item_id: selectedStockItem.id,
      quantity: values.quantity,
      reason: values.reason,
      notes: values.notes,
    });
  };

  // Open issue modal
  const openIssueModal = (item: StockItem) => {
    setSelectedStockItem(item);
    setShowIssueModal(true);
  };

  const openDistributeModal = (item: StockItem) => {
    setDistributeItem(item);
    setDistributeQuantity(Number(item.available_quantity || 0));
    setDistributeProjects([]);
    setDistributeModalOpen(true);
  };

  // Table columns
  const columns: ColumnsType<StockItem> = [
    {
      title: 'Наименование',
      dataIndex: 'nomenclature_name',
      key: 'nomenclature_name',
      ellipsis: true,
    },
    {
      title: 'Склад',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
      width: 150,
    },
    {
      title: 'Место',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      render: (loc: string) => loc || '-',
    },
    {
      title: 'Количество',
      key: 'quantity',
      width: 120,
      render: (_, record) => {
        const percentage = record.min_quantity > 0 
          ? Math.min(100, (record.quantity / record.min_quantity) * 100)
          : 100;
        const status = record.is_low_stock ? 'exception' : 'success';
        
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Space>
              <Text strong>{record.quantity}</Text>
              <Text type="secondary">{record.unit}</Text>
            </Space>
            {record.min_quantity > 0 && (
              <Progress percent={percentage} size="small" status={status} showInfo={false} />
            )}
          </Space>
        );
      },
    },
    {
      title: 'В резерве',
      dataIndex: 'reserved_quantity',
      key: 'reserved_quantity',
      width: 110,
      render: (qty: number, record) => (
        <Text type={qty > 0 ? 'warning' : 'secondary'}>
          {qty} {record.unit}
        </Text>
      ),
    },
    {
      title: 'Доступно',
      dataIndex: 'available_quantity',
      key: 'available_quantity',
      width: 100,
      render: (qty: number, record) => (
        <Text strong style={{ color: qty <= 0 ? '#ff4d4f' : undefined }}>
          {qty} {record.unit}
        </Text>
      ),
    },
    {
      title: 'Статус',
      key: 'status',
      width: 130,
      render: (_, record) => {
        if (record.quantity === 0) {
          return <Tag color="red">Нет в наличии</Tag>;
        }
        if (record.is_low_stock) {
          return <Tag color="orange" icon={<WarningOutlined />}>Мало</Tag>;
        }
        return <Tag color="green">В наличии</Tag>;
      },
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          {canEdit && (
            <Tooltip title="Выдать">
              <Button
                type="text"
                icon={<ExportOutlined />}
                onClick={() => openIssueModal(record)}
                disabled={record.available_quantity <= 0}
              />
            </Tooltip>
          )}
          {canEdit && Number(record.available_quantity) > 0 && (
            <Tooltip title="Распределить на проекты">
              <Button
                type="text"
                icon={<ShareAltOutlined />}
                onClick={() => openDistributeModal(record)}
              />
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="Удалить">
              <Popconfirm
                title="Удалить позицию остатка?"
                okText="Удалить"
                okType="danger"
                cancelText="Отмена"
                onConfirm={() => deleteStockItemMutation.mutate(record.id)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Calculate totals for stats
  const defaultSummary: WarehouseSummary = {
    total_items: stockItems.length,
    low_stock_items: stockItems.filter(i => i.quantity < 10 && i.quantity > 0).length,
    out_of_stock_items: stockItems.filter(i => i.quantity <= 0).length,
  };

  const displaySummary = summary || defaultSummary;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>Склад</Title>
        <Text type="secondary">Управление складскими остатками и движением товаров</Text>
      </div>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Всего позиций" 
              value={displaySummary.total_items}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Мало на складе" 
              value={displaySummary.low_stock_items} 
              valueStyle={{ color: displaySummary.low_stock_items > 0 ? '#faad14' : undefined }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic 
              title="Нет в наличии" 
              value={displaySummary.out_of_stock_items}
              valueStyle={{ color: displaySummary.out_of_stock_items > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Склад"
            style={{ width: 200 }}
            allowClear
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            options={warehouses.map(w => ({ 
              label: w.name, 
              value: w.id 
            }))}
          />
          <Input
            placeholder="Поиск по наименованию, артикулу..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          <Button
            type={showLowStock ? 'primary' : 'default'}
            icon={<WarningOutlined />}
            onClick={() => setShowLowStock(!showLowStock)}
          >
            Мало на складе
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Обновить
          </Button>
          {canEdit && (
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setShowReceiveModal(true)}
            >
              Приём товара
            </Button>
          )}
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={stockItems}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
          size="small"
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title="Распределить свободный остаток"
        open={distributeModalOpen}
        onCancel={() => {
          setDistributeModalOpen(false);
          setDistributeItem(null);
          setDistributeProjects([]);
          setDistributeQuantity(0);
        }}
        onOk={() => {
          if (!distributeItem) return;
          if (distributeProjects.length === 0) {
            message.warning('Выберите проекты для распределения');
            return;
          }
          if (distributeQuantity <= 0) {
            message.warning('Укажите количество для распределения');
            return;
          }
          distributeMutation.mutate({
            stockItemId: distributeItem.id,
            projectIds: distributeProjects,
            quantity: distributeQuantity,
          });
        }}
        okText="Распределить"
        cancelText="Отмена"
        okButtonProps={{ loading: distributeMutation.isPending }}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text>
            {distributeItem?.nomenclature_name}
          </Text>
          <Text type="secondary">
            Свободный остаток: {distributeItem?.available_quantity || 0} {distributeItem?.unit || ''}
          </Text>
          <InputNumber
            min={0.001}
            max={Number(distributeItem?.available_quantity || 0)}
            value={distributeQuantity}
            onChange={(val) => setDistributeQuantity(Number(val || 0))}
            style={{ width: '100%' }}
            placeholder="Количество для распределения"
          />
          <Select
            mode="multiple"
            placeholder="Проекты в работе"
            value={distributeProjects}
            onChange={setDistributeProjects}
            options={activeProjects.map((p: { id: string; name: string }) => ({
              label: p.name,
              value: p.id,
            }))}
            style={{ width: '100%' }}
          />
        </Space>
      </Modal>

      {/* Receive Modal */}
      <Modal
        title="Приём товара на склад"
        open={showReceiveModal}
        onCancel={() => {
          setShowReceiveModal(false);
          receiveForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={receiveForm}
          layout="vertical"
          onFinish={handleReceive}
          initialValues={{ unit: 'шт' }}
        >
          <Form.Item
            name="warehouse_id"
            label="Склад"
            rules={[{ required: true, message: 'Выберите склад' }]}
          >
            <Select
              placeholder="Выберите склад"
              options={warehouses.map(w => ({ label: w.name, value: w.id }))}
            />
          </Form.Item>
          
          <Form.Item
            name="nomenclature_item_id"
            label="Номенклатура"
            rules={[{ required: true, message: 'Выберите номенклатуру' }]}
          >
            <Select
              showSearch
              placeholder="Начните вводить название"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(value) => {
                // Auto-fill unit from nomenclature
                const selectedNomenclature = nomenclatureItems.find(n => n.id === value);
                if (selectedNomenclature?.unit) {
                  receiveForm.setFieldValue('unit', selectedNomenclature.unit);
                }
              }}
              options={nomenclatureItems.map(n => ({
                label: n.name,
                value: n.id,
              }))}
            />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="quantity"
                label="Количество"
                rules={[{ required: true, message: 'Введите количество' }]}
              >
                <InputNumber min={0.001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="Единица измерения">
                <Select
                  options={[
                    { label: 'шт', value: 'шт' },
                    { label: 'м', value: 'м' },
                    { label: 'кг', value: 'кг' },
                    { label: 'л', value: 'л' },
                    { label: 'компл.', value: 'компл.' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="batch_number" label="Номер партии">
            <Input placeholder="Например: LOT-2024-001" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="unit_cost" label="Цена за единицу">
                <InputNumber min={0} style={{ width: '100%' }} addonAfter="₽" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Место хранения">
                <Input placeholder="Например: A-01-01" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="notes" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setShowReceiveModal(false);
                receiveForm.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit" loading={receiveMutation.isPending}>
                Принять
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Issue Modal */}
      <Modal
        title={`Выдача со склада: ${selectedStockItem?.nomenclature_name || ''}`}
        open={showIssueModal}
        onCancel={() => {
          setShowIssueModal(false);
          setSelectedStockItem(null);
          issueForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={issueForm}
          layout="vertical"
          onFinish={handleIssue}
        >
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <Text>Доступно: </Text>
            <Text strong style={{ fontSize: 16 }}>
              {selectedStockItem?.available_quantity} {selectedStockItem?.unit}
            </Text>
          </div>
          
          <Form.Item
            name="quantity"
            label="Количество к выдаче"
            rules={[
              { required: true, message: 'Введите количество' },
              {
                validator: (_, value) => {
                  if (value > (selectedStockItem?.available_quantity || 0)) {
                    return Promise.reject('Превышает доступное количество');
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              min={0.001}
              max={selectedStockItem?.available_quantity || 0}
              style={{ width: '100%' }}
              addonAfter={selectedStockItem?.unit}
            />
          </Form.Item>
          
          <Form.Item name="reason" label="Причина">
            <Select
              placeholder="Выберите причину"
              options={[
                { label: 'Выдача на производство', value: 'Выдача на производство' },
                { label: 'Выдача на проект', value: 'Выдача на проект' },
                { label: 'Внутреннее использование', value: 'Внутреннее использование' },
                { label: 'Другое', value: 'Другое' },
              ]}
            />
          </Form.Item>
          
          <Form.Item name="notes" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setShowIssueModal(false);
                setSelectedStockItem(null);
                issueForm.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit" loading={issueMutation.isPending}>
                Выдать
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
