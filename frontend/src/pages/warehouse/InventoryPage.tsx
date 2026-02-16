import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Badge,
    Button,
    Card,
    DatePicker,
    Descriptions,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Progress,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';

import { settingsApi } from '../../features/settings';
import {
    warehouseApi,
    type InventoryDocument,
    type InventoryDocumentStatus,
    type InventoryItem,
    type Warehouse
} from '../../features/warehouse';

const { Title, Text } = Typography;

const STATUS_CONFIG: Record<InventoryDocumentStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: 'Черновик' },
  in_progress: { color: 'processing', text: 'В работе' },
  completed: { color: 'success', text: 'Завершена' },
  cancelled: { color: 'error', text: 'Отменена' },
};

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<InventoryDocumentStatus | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<InventoryDocument | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const [createForm] = Form.useForm();

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.warehouses.list({ is_active: true }),
  });

  const warehouses: Warehouse[] = warehousesData?.results || [];

  // Fetch users for responsible selection
  const { data: usersData } = useQuery({
    queryKey: ['responsible-candidates'],
    queryFn: () => settingsApi.users.responsibleCandidates(),
  });

  // Fetch inventory documents
  const { data: documentsData, isLoading, refetch } = useQuery({
    queryKey: ['inventory-documents', selectedWarehouse, selectedStatus],
    queryFn: () => warehouseApi.inventoryDocuments.list({
      warehouse: selectedWarehouse,
      status: selectedStatus,
    }),
  });

  const documents: InventoryDocument[] = documentsData?.results || [];

  // Fetch document detail
  const { data: documentDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['inventory-document', selectedDocument?.id],
    queryFn: () => selectedDocument ? warehouseApi.inventoryDocuments.get(selectedDocument.id) : null,
    enabled: !!selectedDocument?.id && showDetailModal,
  });

  // Create document mutation
  const createMutation = useMutation({
    mutationFn: warehouseApi.inventoryDocuments.create,
    onSuccess: () => {
      message.success('Документ инвентаризации создан');
      setShowCreateModal(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['inventory-documents'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при создании');
    },
  });

  // Start inventory mutation
  const startMutation = useMutation({
    mutationFn: warehouseApi.inventoryDocuments.start,
    onSuccess: (data) => {
      message.success(`Инвентаризация начата. Позиций: ${data.items_count}`);
      queryClient.invalidateQueries({ queryKey: ['inventory-documents'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-document'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при запуске');
    },
  });

  // Complete inventory mutation
  const completeMutation = useMutation({
    mutationFn: warehouseApi.inventoryDocuments.complete,
    onSuccess: () => {
      message.success('Инвентаризация завершена');
      queryClient.invalidateQueries({ queryKey: ['inventory-documents'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-document'] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Ошибка при завершении';
      if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('резерв')) {
        Modal.warning({
          title: 'Требуется действие',
          content: errorMessage,
          okText: 'ОК',
        });
        return;
      }
      message.error(errorMessage);
    },
  });

  // Cancel inventory mutation
  const cancelMutation = useMutation({
    mutationFn: warehouseApi.inventoryDocuments.cancel,
    onSuccess: () => {
      message.success('Инвентаризация отменена');
      queryClient.invalidateQueries({ queryKey: ['inventory-documents'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при отмене');
    },
  });

  // Delete inventory mutation
  const deleteMutation = useMutation({
    mutationFn: warehouseApi.inventoryDocuments.delete,
    onSuccess: () => {
      message.success('Документ инвентаризации удалён');
      queryClient.invalidateQueries({ queryKey: ['inventory-documents'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при удалении');
    },
  });

  // Update item count mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { actual_quantity: number; notes?: string } }) =>
      warehouseApi.inventoryItems.updateCount(id, data),
    onSuccess: () => {
      message.success('Количество обновлено');
      setEditingItemId(null);
      refetchDetail();
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || 'Ошибка при обновлении');
    },
  });

  // Handle create
  const handleCreate = async (values: any) => {
    await createMutation.mutateAsync({
      ...values,
      planned_date: values.planned_date?.format('YYYY-MM-DD'),
    });
  };

  // Open detail modal
  const openDetailModal = (doc: InventoryDocument) => {
    setSelectedDocument(doc);
    setShowDetailModal(true);
  };

  // Documents table columns
  const columns: ColumnsType<InventoryDocument> = [
    {
      title: 'Номер',
      dataIndex: 'number',
      key: 'number',
      width: 120,
      render: (num: string) => <Text strong>{num}</Text>,
    },
    {
      title: 'Склад',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
      width: 150,
    },
    {
      title: 'Тип',
      dataIndex: 'document_type_display',
      key: 'document_type_display',
      width: 130,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: InventoryDocumentStatus, record) => {
        const config = STATUS_CONFIG[status];
        return <Tag color={config.color}>{record.status_display || config.text}</Tag>;
      },
    },
    {
      title: 'Прогресс',
      key: 'progress',
      width: 150,
      render: (_, record) => {
        if (record.status === 'draft') return '-';
        const total = record.items_count || 0;
        const counted = record.counted_items || 0;
        const percent = total > 0 ? Math.round((counted / total) * 100) : 0;
        return (
          <Space>
            <Progress percent={percent} size="small" style={{ width: 100 }} />
            <Text type="secondary">{counted}/{total}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Плановая дата',
      dataIndex: 'planned_date',
      key: 'planned_date',
      width: 120,
      render: (date: string) => dayjs(date).format('DD.MM.YYYY'),
    },
    {
      title: 'Ответственный',
      dataIndex: 'responsible_name',
      key: 'responsible_name',
      width: 150,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => openDetailModal(record)}
          />
          {record.status === 'draft' && (
            <Popconfirm
              title="Начать инвентаризацию?"
              description="Будут созданы позиции для подсчёта"
              onConfirm={() => startMutation.mutate(record.id)}
            >
              <Button type="text" icon={<PlayCircleOutlined />} />
            </Popconfirm>
          )}
          {record.status === 'in_progress' && (
            <Button
              type="text"
              icon={<CheckCircleOutlined />}
              onClick={() => openDetailModal(record)}
            />
          )}
          {['draft', 'in_progress'].includes(record.status) && (
            <Popconfirm
              title="Отменить инвентаризацию?"
              onConfirm={() => cancelMutation.mutate(record.id)}
            >
              <Button type="text" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          )}
          {record.status === 'draft' && (
            <Popconfirm
              title="Удалить документ?"
              description="Документ будет безвозвратно удалён"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // Items table columns (for detail modal)
  const itemColumns: ColumnsType<InventoryItem> = [
    {
      title: 'Наименование',
      dataIndex: 'nomenclature_name',
      key: 'nomenclature_name',
      ellipsis: true,
    },
    {
      title: 'Место',
      dataIndex: 'location',
      key: 'location',
      width: 80,
    },
    {
      title: 'Учётное',
      dataIndex: 'system_quantity',
      key: 'system_quantity',
      width: 100,
      render: (qty: number, record) => `${qty} ${record.unit || 'шт'}`,
    },
    {
      title: 'Фактическое',
      key: 'actual_quantity',
      width: 150,
      render: (_, record) => {
        if (editingItemId === record.id) {
          return (
            <InputNumber
              size="small"
              min={0}
              defaultValue={record.actual_quantity || record.system_quantity}
              onPressEnter={(e) => {
                const value = (e.target as HTMLInputElement).value;
                updateItemMutation.mutate({
                  id: record.id,
                  data: { actual_quantity: Number(value) },
                });
              }}
              onBlur={(e) => {
                updateItemMutation.mutate({
                  id: record.id,
                  data: { actual_quantity: Number(e.target.value) },
                });
              }}
              autoFocus
            />
          );
        }
        return (
          <Space>
            {record.is_counted ? (
              <Text>{record.actual_quantity} {record.unit || 'шт'}</Text>
            ) : (
              <Text type="secondary">—</Text>
            )}
            {documentDetail?.status === 'in_progress' && (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditingItemId(record.id)}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: 'Разница',
      key: 'difference',
      width: 100,
      render: (_, record) => {
        if (!record.is_counted) return '-';
        const diff = record.difference || 0;
        if (diff === 0) return <Text>0</Text>;
        return (
          <Text style={{ color: diff > 0 ? '#52c41a' : '#ff4d4f' }}>
            {diff > 0 ? '+' : ''}{diff}
          </Text>
        );
      },
    },
    {
      title: 'Статус',
      key: 'status',
      width: 100,
      render: (_, record) => (
        record.is_counted
          ? <Badge status="success" text="Учтён" />
          : <Badge status="default" text="Ожидает" />
      ),
    },
  ];

  const detailItems: InventoryItem[] = documentDetail?.items || [];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>Инвентаризация</Title>
        <Text type="secondary">Учёт и корректировка складских остатков</Text>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Склад"
            style={{ width: 200 }}
            allowClear
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            options={warehouses.map(w => ({ label: w.name, value: w.id }))}
          />
          <Select
            placeholder="Статус"
            style={{ width: 150 }}
            allowClear
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={Object.entries(STATUS_CONFIG).map(([key, config]) => ({
              label: config.text,
              value: key,
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Обновить
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowCreateModal(true)}
          >
            Новая инвентаризация
          </Button>
        </Space>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
          size="small"
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Новая инвентаризация"
        open={showCreateModal}
        onCancel={() => {
          setShowCreateModal(false);
          createForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ document_type: 'full' }}
        >
          <Form.Item
            name="warehouse"
            label="Склад"
            rules={[{ required: true, message: 'Выберите склад' }]}
          >
            <Select
              placeholder="Выберите склад"
              options={warehouses.map(w => ({ label: w.name, value: w.id }))}
            />
          </Form.Item>

          <Form.Item
            name="document_type"
            label="Тип инвентаризации"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: 'Полная', value: 'full' },
                { label: 'Частичная', value: 'partial' },
                { label: 'Выборочная', value: 'spot_check' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="planned_date"
            label="Плановая дата"
            rules={[{ required: true, message: 'Укажите дату' }]}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="responsible"
            label="Ответственный"
            rules={[{ required: true, message: 'Выберите ответственного' }]}
          >
            <Select
              placeholder="Выберите ответственного"
              options={usersData?.map(u => ({
                label: u.full_name || u.username,
                value: u.id,
              })) || []}
            />
          </Form.Item>

          <Form.Item name="notes" label="Примечание">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setShowCreateModal(false);
                createForm.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                Создать
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={`Инвентаризация ${documentDetail?.number || ''}`}
        open={showDetailModal}
        onCancel={() => {
          setShowDetailModal(false);
          setSelectedDocument(null);
          setEditingItemId(null);
        }}
        footer={
          documentDetail?.status === 'in_progress' ? (
            <Space>
              <Button onClick={() => setShowDetailModal(false)}>Закрыть</Button>
              <Popconfirm
                title="Завершить инвентаризацию?"
                description="Все расхождения будут применены к остаткам"
                onConfirm={() => completeMutation.mutate(documentDetail.id)}
              >
                <Button 
                  type="primary" 
                  icon={<CheckCircleOutlined />}
                  disabled={detailItems.some(i => !i.is_counted)}
                >
                  Завершить
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Button onClick={() => setShowDetailModal(false)}>Закрыть</Button>
          )
        }
        width={1000}
      >
        {documentDetail && (
          <>
            <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Склад">{documentDetail.warehouse_name}</Descriptions.Item>
              <Descriptions.Item label="Тип">{documentDetail.document_type_display}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={STATUS_CONFIG[documentDetail.status].color}>
                  {documentDetail.status_display}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Плановая дата">
                {dayjs(documentDetail.planned_date).format('DD.MM.YYYY')}
              </Descriptions.Item>
              <Descriptions.Item label="Фактическая дата">
                {documentDetail.actual_date ? dayjs(documentDetail.actual_date).format('DD.MM.YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ответственный">
                {documentDetail.responsible_name}
              </Descriptions.Item>
            </Descriptions>

            <Table
              columns={itemColumns}
              dataSource={detailItems}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ y: 400 }}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
