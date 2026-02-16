import {
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    InboxOutlined,
    PlusOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Button,
    Card,
    Empty,
    Form,
    Input,
    message,
    Modal,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import {
    warehouseApi,
    type Warehouse,
    type WarehouseSummary,
} from '../../features/warehouse';

const { Title, Text } = Typography;

const getApiErrorMessage = (error: any): string | null => {
  const data = error?.response?.data;
  if (!data) return null;
  if (typeof data === 'string') return data;

  const detail = data?.detail || data?.error;
  if (typeof detail === 'string') return detail;

  if (typeof data === 'object') {
    // DRF validation errors often look like: { field: ["msg"], non_field_errors: ["msg"] }
    const parts = Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => {
        if (Array.isArray(value)) return `${key}: ${value.map(String).join(', ')}`;
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return `${key}: ${value}`;
        return null;
      })
      .filter(Boolean) as string[];

    if (parts.length > 0) return parts.join('; ');
  }

  return null;
};

export default function WarehousesSettingsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);
  const [warehouseSummary, setWarehouseSummary] = useState<WarehouseSummary | null>(null);

  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();

  // Fetch warehouses
  const { data: warehousesData, isLoading } = useQuery({
    queryKey: ['warehouses-all'],
    queryFn: () => warehouseApi.warehouses.list({ page_size: 100 }),
  });

  const warehouses = warehousesData?.results || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Warehouse>) => warehouseApi.warehouses.create(data),
    onSuccess: () => {
      message.success('Склад создан');
      setIsModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['warehouses-all'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (error: any) => {
      const detail = getApiErrorMessage(error);
      message.error(detail ? `Ошибка при создании склада: ${detail}` : 'Ошибка при создании склада');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Warehouse> }) =>
      warehouseApi.warehouses.update(id, data),
    onSuccess: () => {
      message.success('Склад обновлён');
      setIsModalOpen(false);
      setEditingWarehouse(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['warehouses-all'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (error: any) => {
      const detail = getApiErrorMessage(error);
      message.error(detail ? `Ошибка при обновлении склада: ${detail}` : 'Ошибка при обновлении склада');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.warehouses.delete(id),
    onSuccess: () => {
      message.success('Склад удалён');
      queryClient.invalidateQueries({ queryKey: ['warehouses-all'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (error: any) => {
      const detail = getApiErrorMessage(error);
      message.error(detail ? `Ошибка при удалении склада: ${detail}` : 'Ошибка при удалении склада');
    },
  });

  // Create transfer for deletion mutation
  const createTransferMutation = useMutation({
    mutationFn: ({ sourceId, destinationId }: { sourceId: string; destinationId: string }) =>
      warehouseApi.stockTransfers.createForWarehouseDeletion(sourceId, destinationId),
    onSuccess: (result) => {
      message.success(`Создано перемещение ${result.number}. После его завершения склад можно будет удалить.`);
      setIsTransferModalOpen(false);
      setDeletingWarehouse(null);
      transferForm.resetFields();
    },
    onError: () => {
      message.error('Ошибка при создании перемещения');
    },
  });

  // Handle open modal
  const handleOpenModal = (warehouse?: Warehouse) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      form.setFieldsValue({
        name: warehouse.name,
        address: warehouse.address,
        description: warehouse.description,
        is_active: warehouse.is_active,
      });
    } else {
      form.setFieldsValue({
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  // Handle close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingWarehouse(null);
    form.resetFields();
  };

  // Handle save
  const handleSave = () => {
    form.validateFields().then((values) => {
      if (editingWarehouse) {
        updateMutation.mutate({ id: editingWarehouse.id, data: values });
      } else {
        createMutation.mutate(values);
      }
    });
  };

  // Handle delete attempt
  const handleDeleteAttempt = async (warehouse: Warehouse) => {
    try {
      const summary = await warehouseApi.warehouses.summary(warehouse.id);
      setWarehouseSummary(summary);
      
      if (summary.total_items > 0) {
        // Has items - show transfer modal
        setDeletingWarehouse(warehouse);
        setIsTransferModalOpen(true);
      } else {
        // No items - can delete directly
        Modal.confirm({
          title: 'Удалить склад?',
          content: `Вы уверены, что хотите удалить склад "${warehouse.name}"?`,
          okText: 'Удалить',
          okType: 'danger',
          cancelText: 'Отмена',
          onOk: () => deleteMutation.mutate(warehouse.id),
        });
      }
    } catch {
      message.error('Ошибка при проверке склада');
    }
  };

  // Handle transfer creation
  const handleCreateTransfer = () => {
    transferForm.validateFields().then((values) => {
      if (deletingWarehouse) {
        createTransferMutation.mutate({
          sourceId: deletingWarehouse.id,
          destinationId: values.destination_warehouse,
        });
      }
    });
  };

  // Table columns
  const columns: ColumnsType<Warehouse> = useMemo(
    () => [
      {
        title: 'Код',
        dataIndex: 'code',
        key: 'code',
        width: 100,
      },
      {
        title: 'Наименование',
        dataIndex: 'name',
        key: 'name',
        width: 200,
      },
      {
        title: 'Адрес',
        dataIndex: 'address',
        key: 'address',
        width: 200,
        render: (address: string) => address || '—',
      },
      {
        title: 'Описание',
        dataIndex: 'description',
        key: 'description',
        width: 200,
        render: (description: string) => description || '—',
      },
      {
        title: 'Статус',
        dataIndex: 'is_active',
        key: 'status',
        width: 100,
        align: 'center',
        render: (isActive: boolean) => (
          <Tag color={isActive ? 'success' : 'default'}>
            {isActive ? 'Активен' : 'Неактивен'}
          </Tag>
        ),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 120,
        align: 'center',
        render: (_, record) => (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenModal(record)}
            />
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteAttempt(record)}
            />
          </Space>
        ),
      },
    ],
    []
  );

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Склады
          </Title>
          <Text type="secondary">Управление складами организации</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          Добавить склад
        </Button>
      </div>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={warehouses}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
          locale={{
            emptyText: <Empty description="Нет складов" />,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingWarehouse ? 'Редактировать склад' : 'Создать склад'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSave}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Наименование"
            rules={[{ required: true, message: 'Введите наименование' }]}
          >
            <Input placeholder="Основной склад" />
          </Form.Item>

          <Form.Item name="address" label="Адрес">
            <Input.TextArea rows={2} placeholder="Адрес склада" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} placeholder="Дополнительная информация о складе" />
          </Form.Item>

          <Form.Item name="is_active" label="Активен" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Transfer Modal for deletion */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <span>На складе есть остатки</span>
          </Space>
        }
        open={isTransferModalOpen}
        onCancel={() => {
          setIsTransferModalOpen(false);
          setDeletingWarehouse(null);
          setWarehouseSummary(null);
          transferForm.resetFields();
        }}
        onOk={handleCreateTransfer}
        okText="Создать перемещение"
        cancelText="Отмена"
        confirmLoading={createTransferMutation.isPending}
        width={500}
      >
        <Alert
          message="Невозможно удалить склад"
          description={
            <>
              На складе <strong>"{deletingWarehouse?.name}"</strong> находится{' '}
              <strong>{warehouseSummary?.total_items || 0}</strong> позиций.
              <br />
              Для удаления склада необходимо сначала переместить все остатки на другой склад.
            </>
          }
          type="warning"
          showIcon
          icon={<InboxOutlined />}
          style={{ marginBottom: 16 }}
        />

        <Form form={transferForm} layout="vertical">
          <Form.Item
            name="destination_warehouse"
            label="Склад назначения"
            rules={[{ required: true, message: 'Выберите склад' }]}
          >
            <Select
              placeholder="Выберите склад для перемещения остатков"
              options={warehouses
                .filter((w: Warehouse) => w.id !== deletingWarehouse?.id && w.is_active)
                .map((w: Warehouse) => ({
                  label: `${w.name} (${w.code})`,
                  value: w.id,
                }))}
            />
          </Form.Item>
        </Form>

        <Text type="secondary">
          <SwapOutlined /> После создания перемещения выполните его (отгрузите и примите товары), 
          затем вы сможете удалить пустой склад.
        </Text>
      </Modal>
    </div>
  );
}
