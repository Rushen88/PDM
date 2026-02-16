import { CheckCircleOutlined, DeleteOutlined, EditOutlined, LockOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, ColorPicker, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { Color } from 'antd/es/color-picker';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { PurchaseStatusRef } from '../../features/settings/api';
import {
    useCreatePurchaseStatus,
    useDeletePurchaseStatus,
    usePurchaseStatuses,
    useSetDefaultPurchaseStatus,
    useUpdatePurchaseStatus,
} from '../../features/settings/hooks';

const { Title, Text } = Typography;

export default function PurchaseStatusesPage() {
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<PurchaseStatusRef | null>(null);
  const [form] = Form.useForm();

  const { data: statusesData, isLoading } = usePurchaseStatuses();
  const createMutation = useCreatePurchaseStatus();
  const updateMutation = useUpdatePurchaseStatus();
  const deleteMutation = useDeletePurchaseStatus();
  const setDefaultMutation = useSetDefaultPurchaseStatus();

  const statuses = statusesData?.results || [];

  const filteredStatuses = statuses.filter(
    (status) =>
      status.name.toLowerCase().includes(searchText.toLowerCase()) ||
      status.code.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleOpenModal = (status?: PurchaseStatusRef) => {
    if (status) {
      setEditingStatus(status);
      form.setFieldsValue({
        ...status,
        color: status.color,
      });
    } else {
      setEditingStatus(null);
      form.resetFields();
      form.setFieldsValue({
        color: '#1890ff',
        sort_order: (statuses.length + 1) * 10,
        progress_percent: 0,
        is_default: false,
        is_delivered: false,
        is_not_required: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStatus(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    try {
      const colorValue = typeof values.color === 'string' 
        ? values.color 
        : (values.color as Color)?.toHexString?.() || '#1890ff';

      const data = {
        ...values,
        color: colorValue,
      };

      if (editingStatus) {
        await updateMutation.mutateAsync({ id: editingStatus.id, data });
        message.success('Статус успешно обновлён');
      } else {
        await createMutation.mutateAsync(data);
        message.success('Статус успешно создан');
      }
      handleCloseModal();
    } catch (error: any) {
      message.error(error.message || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('Статус удалён');
    } catch (error: any) {
      message.error(error.message || 'Ошибка удаления');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultMutation.mutateAsync(id);
      message.success('Статус по умолчанию изменён');
    } catch (error: any) {
      message.error(error.message || 'Ошибка');
    }
  };

  const columns: ColumnsType<PurchaseStatusRef> = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <Tag color={record.color}>{text}</Tag>
          {record.is_system && (
            <Tooltip title="Системный статус (нельзя удалить)">
              <LockOutlined style={{ color: '#999' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Прогресс',
      dataIndex: 'progress_percent',
      key: 'progress_percent',
      width: 100,
      align: 'center',
      render: (value) => `${value}%`,
    },
    {
      title: 'Доставлено',
      dataIndex: 'is_delivered',
      key: 'is_delivered',
      width: 100,
      align: 'center',
      render: (value) => value ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag>,
    },
    {
      title: 'Не требуется',
      dataIndex: 'is_not_required',
      key: 'is_not_required',
      width: 110,
      align: 'center',
      render: (value) => value ? <Tag color="purple">Да</Tag> : <Tag>Нет</Tag>,
    },
    {
      title: 'По умолчанию',
      dataIndex: 'is_default',
      key: 'is_default',
      width: 120,
      align: 'center',
      render: (value, record) => (
        value ? (
          <Tag color="blue" icon={<CheckCircleOutlined />}>По умолчанию</Tag>
        ) : (
          <Button 
            type="link" 
            size="small" 
            onClick={() => handleSetDefault(record.id)}
          >
            Сделать по умолчанию
          </Button>
        )
      ),
    },
    {
      title: 'Порядок',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      align: 'center',
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Редактировать">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleOpenModal(record)}
            />
          </Tooltip>
          {!record.is_system && (
            <Popconfirm
              title="Удалить статус?"
              description="Это действие нельзя отменить"
              onConfirm={() => handleDelete(record.id)}
              okText="Удалить"
              cancelText="Отмена"
            >
              <Tooltip title="Удалить">
                <Button type="text" danger icon={<DeleteOutlined />} />
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
          <Title level={4} style={{ margin: 0 }}>Статусы закупок</Title>
          <Text type="secondary">Настройка справочника статусов закупаемых позиций</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          Добавить статус
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по названию или коду..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
      </Card>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={filteredStatuses}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={editingStatus ? 'Редактирование статуса' : 'Новый статус закупки'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Название"
            rules={[
              { required: true, message: 'Введите название' },
              { max: 100, message: 'Максимум 100 символов' },
            ]}
          >
            <Input placeholder="Не начата" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} placeholder="Описание статуса..." />
          </Form.Item>

          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="color" label="Цвет">
              <ColorPicker />
            </Form.Item>

            <Form.Item
              name="sort_order"
              label="Порядок сортировки"
              rules={[{ required: true, message: 'Укажите порядок' }]}
            >
              <InputNumber min={0} max={1000} />
            </Form.Item>

            <Form.Item
              name="progress_percent"
              label="Прогресс (%)"
              rules={[{ required: true, message: 'Укажите прогресс' }]}
            >
              <InputNumber min={0} max={100} />
            </Form.Item>
          </Space>

          <Space size="large">
            <Form.Item name="is_default" valuePropName="checked" label="По умолчанию">
              <Switch />
            </Form.Item>

            <Form.Item name="is_delivered" valuePropName="checked" label="Доставлено">
              <Switch />
            </Form.Item>

            <Form.Item name="is_not_required" valuePropName="checked" label="Не требуется закупка">
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item name="auto_trigger" label="Авто-триггер">
            <Input placeholder="Условие автоматического применения статуса" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={handleCloseModal}>Отмена</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editingStatus ? 'Сохранить' : 'Создать'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
