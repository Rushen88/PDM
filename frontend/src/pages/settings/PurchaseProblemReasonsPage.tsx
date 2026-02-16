import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import type { PurchaseProblemReason, PurchaseProblemSubreason } from '../../features/settings/api';
import {
    useCreatePurchaseProblemReason,
    useCreatePurchaseProblemSubreason,
    useDeletePurchaseProblemReason,
    useDeletePurchaseProblemSubreason,
    usePurchaseProblemReasons,
    usePurchaseProblemSubreasons,
    useUpdatePurchaseProblemReason,
    useUpdatePurchaseProblemSubreason,
} from '../../features/settings/hooks';

const { Title, Text } = Typography;

const SEVERITY_OPTIONS = [
  { value: 1, label: 'Низкая', color: 'blue' },
  { value: 2, label: 'Средняя', color: 'orange' },
  { value: 3, label: 'Высокая', color: 'red' },
];

const getSeverityColor = (severity: number) => {
  return SEVERITY_OPTIONS.find(s => s.value === severity)?.color || 'default';
};

export default function PurchaseProblemReasonsPage() {
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<PurchaseProblemReason | null>(null);
  const [form] = Form.useForm();

  const [isSubreasonModalOpen, setIsSubreasonModalOpen] = useState(false);
  const [editingSubreason, setEditingSubreason] = useState<PurchaseProblemSubreason | null>(null);
  const [subreasonForm] = Form.useForm();

  const { data: reasonsData, isLoading } = usePurchaseProblemReasons();
  const createMutation = useCreatePurchaseProblemReason();
  const updateMutation = useUpdatePurchaseProblemReason();
  const deleteMutation = useDeletePurchaseProblemReason();

  const { data: subreasonsData, isLoading: subreasonsLoading } = usePurchaseProblemSubreasons(editingReason?.id);
  const createSubreasonMutation = useCreatePurchaseProblemSubreason();
  const updateSubreasonMutation = useUpdatePurchaseProblemSubreason();
  const deleteSubreasonMutation = useDeletePurchaseProblemSubreason();

  const reasons = reasonsData?.results || [];
  const subreasons = subreasonsData?.results || [];

  const filteredReasons = reasons.filter(
    (reason) =>
      reason.name.toLowerCase().includes(searchText.toLowerCase()) ||
      reason.code.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleOpenModal = (reason?: PurchaseProblemReason) => {
    if (reason) {
      setEditingReason(reason);
      form.setFieldsValue(reason);
    } else {
      setEditingReason(null);
      form.resetFields();
      form.setFieldsValue({
        severity: 2,
        sort_order: (reasons.length + 1) * 10,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingReason(null);
    form.resetFields();
    setIsSubreasonModalOpen(false);
    setEditingSubreason(null);
    subreasonForm.resetFields();
  };

  const openSubreasonModal = (subreason?: PurchaseProblemSubreason) => {
    if (!editingReason) {
      message.info('Сначала сохраните причину, затем добавляйте подпричины.');
      return;
    }

    if (subreason) {
      setEditingSubreason(subreason);
      subreasonForm.setFieldsValue(subreason);
    } else {
      setEditingSubreason(null);
      subreasonForm.resetFields();
      subreasonForm.setFieldsValue({
        sort_order: (subreasons.length + 1) * 10,
      });
    }
    setIsSubreasonModalOpen(true);
  };

  const closeSubreasonModal = () => {
    setIsSubreasonModalOpen(false);
    setEditingSubreason(null);
    subreasonForm.resetFields();
  };

  const submitSubreason = async (values: any) => {
    if (!editingReason) return;

    try {
      if (editingSubreason) {
        await updateSubreasonMutation.mutateAsync({ id: editingSubreason.id, data: values });
        message.success('Подпричина обновлена');
      } else {
        await createSubreasonMutation.mutateAsync({ ...values, reason: editingReason.id });
        message.success('Подпричина создана');
      }
      closeSubreasonModal();
    } catch (error: any) {
      message.error(error.message || 'Ошибка сохранения подпричины');
    }
  };

  const deleteSubreason = async (id: string) => {
    try {
      await deleteSubreasonMutation.mutateAsync(id);
      message.success('Подпричина удалена');
    } catch (error: any) {
      message.error(error.message || 'Ошибка удаления подпричины');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingReason) {
        await updateMutation.mutateAsync({ id: editingReason.id, data: values });
        message.success('Причина успешно обновлена');
      } else {
        await createMutation.mutateAsync(values);
        message.success('Причина успешно создана');
      }
      handleCloseModal();
    } catch (error: any) {
      message.error(error.message || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('Причина удалена');
    } catch (error: any) {
      message.error(error.message || 'Ошибка удаления');
    }
  };

  const columns: ColumnsType<PurchaseProblemReason> = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Критичность',
      dataIndex: 'severity',
      key: 'severity',
      width: 120,
      align: 'center',
      render: (value, record) => (
        <Tag color={getSeverityColor(value)}>{record.severity_display}</Tag>
      ),
      sorter: (a, b) => a.severity - b.severity,
    },
    {
      title: 'Рекомендуемое действие',
      dataIndex: 'suggested_action',
      key: 'suggested_action',
      ellipsis: true,
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
          <Popconfirm
            title="Удалить причину?"
            description="Это действие нельзя отменить"
            onConfirm={() => handleDelete(record.id)}
            okText="Удалить"
            cancelText="Отмена"
          >
            <Tooltip title="Удалить">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Причины проблем закупок</Title>
          <Text type="secondary">Настройка справочника причин проблем с закупками</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          Добавить причину
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
          dataSource={filteredReasons}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={editingReason ? 'Редактирование причины' : 'Новая причина проблемы'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={null}
        width={720}
      >
        <Tabs
          defaultActiveKey="reason"
          items={[
            {
              key: 'reason',
              label: 'Причина',
              children: (
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
                    <Input placeholder="Задержка поставщика" />
                  </Form.Item>

                  <Form.Item name="description" label="Описание">
                    <Input.TextArea rows={2} placeholder="Описание причины..." />
                  </Form.Item>

                  <Space size="large" style={{ display: 'flex' }}>
                    <Form.Item
                      name="severity"
                      label="Критичность"
                      rules={[{ required: true, message: 'Выберите критичность' }]}
                    >
                      <Select style={{ width: 150 }} options={SEVERITY_OPTIONS} />
                    </Form.Item>

                    <Form.Item
                      name="sort_order"
                      label="Порядок сортировки"
                      rules={[{ required: true, message: 'Укажите порядок' }]}
                    >
                      <InputNumber min={0} max={1000} />
                    </Form.Item>
                  </Space>

                  <Form.Item name="suggested_action" label="Рекомендуемое действие">
                    <Input.TextArea rows={3} placeholder="Какое действие рекомендуется при данной проблеме..." />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                    <Space>
                      <Button onClick={handleCloseModal}>Отмена</Button>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={createMutation.isPending || updateMutation.isPending}
                      >
                        {editingReason ? 'Сохранить' : 'Создать'}
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'subreasons',
              label: 'Подпричины',
              children: (
                <div style={{ paddingTop: 8 }}>
                  {!editingReason ? (
                    <Text type="secondary">Сначала сохраните причину, затем добавьте подпричины.</Text>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text type="secondary">Подпричины для «{editingReason.name}»</Text>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openSubreasonModal()}>
                          Добавить подпричину
                        </Button>
                      </div>

                      <Table
                        size="small"
                        rowKey="id"
                        loading={subreasonsLoading}
                        dataSource={subreasons}
                        pagination={false}
                        columns={[
                          { title: 'Название', dataIndex: 'name', key: 'name' },
                          {
                            title: 'Порядок',
                            dataIndex: 'sort_order',
                            key: 'sort_order',
                            width: 100,
                            align: 'center',
                          },
                          {
                            title: 'Действия',
                            key: 'actions',
                            width: 110,
                            align: 'center',
                            render: (_, record: PurchaseProblemSubreason) => (
                              <Space size="small">
                                <Tooltip title="Редактировать">
                                  <Button type="text" icon={<EditOutlined />} onClick={() => openSubreasonModal(record)} />
                                </Tooltip>
                                <Popconfirm
                                  title="Удалить подпричину?"
                                  onConfirm={() => deleteSubreason(record.id)}
                                  okText="Удалить"
                                  cancelText="Отмена"
                                >
                                  <Tooltip title="Удалить">
                                    <Button type="text" danger icon={<DeleteOutlined />} />
                                  </Tooltip>
                                </Popconfirm>
                              </Space>
                            ),
                          },
                        ]}
                        locale={{ emptyText: 'Подпричины не добавлены' }}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />

        <Modal
          title={editingSubreason ? 'Редактирование подпричины' : 'Новая подпричина'}
          open={isSubreasonModalOpen}
          onCancel={closeSubreasonModal}
          footer={null}
          destroyOnClose
        >
          <Form form={subreasonForm} layout="vertical" onFinish={submitSubreason} style={{ marginTop: 12 }}>
            <Form.Item
              name="name"
              label="Название"
              rules={[
                { required: true, message: 'Введите название' },
                { max: 200, message: 'Максимум 200 символов' },
              ]}
            >
              <Input placeholder="Например: таможня" />
            </Form.Item>

            <Form.Item name="sort_order" label="Порядок сортировки" rules={[{ required: true, message: 'Укажите порядок' }]}>
              <InputNumber min={0} max={10000} />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: 12 }}>
              <Space>
                <Button onClick={closeSubreasonModal}>Отмена</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createSubreasonMutation.isPending || updateSubreasonMutation.isPending}
                >
                  {editingSubreason ? 'Сохранить' : 'Создать'}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Modal>
    </div>
  );
}
