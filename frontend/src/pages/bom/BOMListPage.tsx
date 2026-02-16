import { ApartmentOutlined, DeleteOutlined, EditOutlined, EyeOutlined, LockOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, message, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { bomApi, type BOMStructure } from '../../features/bom';
import { catalogApi, type Nomenclature } from '../../features/catalog';

const { Title, Text } = Typography;

export default function BOMListPage() {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBOM, setEditingBOM] = useState<BOMStructure | null>(null);
  const [form] = Form.useForm();

  // Fetch BOM structures
  const { data: bomData, isLoading } = useQuery({
    queryKey: ['bom-structures', searchText],
    queryFn: () => bomApi.structures.list({ search: searchText || undefined }),
  });

  // Fetch nomenclature for dropdown
  const { data: nomenclatureData } = useQuery({
    queryKey: ['nomenclature-list'],
    queryFn: () => catalogApi.nomenclature.list({ is_active: true }),
  });

  const bomStructures = bomData?.results || [];
  const nomenclatureOptions = nomenclatureData?.results || [];

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<BOMStructure>) => {
      if (editingBOM) {
        return bomApi.structures.update(editingBOM.id, data);
      }
      return bomApi.structures.create(data);
    },
    onSuccess: () => {
      message.success(editingBOM ? 'Структура обновлена' : 'Структура создана');
      queryClient.invalidateQueries({ queryKey: ['bom-structures'] });
      handleModalClose();
    },
    onError: () => {
      message.error('Ошибка при сохранении структуры');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => bomApi.structures.delete(id),
    onSuccess: () => {
      message.success('Структура удалена');
      queryClient.invalidateQueries({ queryKey: ['bom-structures'] });
    },
    onError: () => {
      message.error('Ошибка при удалении структуры');
    },
  });

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingBOM(null);
    form.resetFields();
  };

  const handleEdit = (bom: BOMStructure) => {
    setEditingBOM(bom);
    form.setFieldsValue({
      ...bom,
      root_item: bom.root_item,
    });
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingBOM(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    saveMutation.mutate(values);
  };

  const columns: ColumnsType<BOMStructure> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: BOMStructure) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.root_item_detail && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.root_item_detail.name}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Версия',
      dataIndex: 'current_version',
      key: 'current_version',
      width: 100,
      render: (version: number) => `v${version}`,
    },
    {
      title: 'Статус',
      key: 'status',
      width: 120,
      render: (_: unknown, record: BOMStructure) => (
        <Space>
          {record.is_active ? (
            <Tag color="success">Активна</Tag>
          ) : (
            <Tag color="default">Неактивна</Tag>
          )}
          {record.is_locked && <Tag color="warning" icon={<LockOutlined />}>Заблок.</Tag>}
        </Space>
      ),
    },
    {
      title: 'Позиций',
      dataIndex: 'items_count',
      key: 'items_count',
      width: 100,
      render: (count: number) => count || 0,
    },
    {
      title: 'Категория',
      dataIndex: 'root_category_display',
      key: 'root_category',
      width: 150,
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: BOMStructure) => (
        <Space>
          <Link to={`/bom/${record.id}`}>
            <Button type="text" icon={<EyeOutlined />} title="Просмотр" />
          </Link>
          {!record.is_locked && (
            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Редактировать" />
          )}
          {!record.is_locked && (
            <Popconfirm
              title="Удалить структуру?"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Удалить" />
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
          <Title level={4} style={{ margin: 0 }}>
            <ApartmentOutlined style={{ marginRight: 8 }} />
            Структура изделий (BOM)
          </Title>
          <Text type="secondary">Управление спецификациями и структурами изделий</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Создать структуру</Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по наименованию..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
      </Card>

      <Card size="small">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : bomStructures.length === 0 ? (
          <Empty description="Нет структур изделий" />
        ) : (
          <Table
            dataSource={bomStructures}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      <Modal
        title={editingBOM ? 'Редактирование структуры' : 'Новая структура изделия'}
        open={modalOpen}
        onCancel={handleModalClose}
        onOk={handleSubmit}
        confirmLoading={saveMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item 
            name="name" 
            label="Наименование структуры" 
            rules={[{ required: true, message: 'Введите наименование' }]}
          >
            <Input placeholder="Например: Станок токарный модель А" />
          </Form.Item>
          <Form.Item 
            name="root_item" 
            label="Корневое изделие" 
            rules={[{ required: true, message: 'Выберите изделие' }]}
          >
            <Select
              showSearch
              placeholder="Выберите изделие"
              optionFilterProp="label"
              options={nomenclatureOptions.map((n: Nomenclature) => ({
                value: n.id,
                label: n.name,
              }))}
            />
          </Form.Item>
          <Form.Item 
            name="root_category" 
            label="Категория" 
            rules={[{ required: true, message: 'Выберите категорию' }]}
          >
            <Select
              placeholder="Выберите категорию"
              options={[
                { value: 'PRODUCT', label: 'Готовое изделие' },
                { value: 'ASSEMBLY', label: 'Сборочная единица' },
                { value: 'PART', label: 'Деталь' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
