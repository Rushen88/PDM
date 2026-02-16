import { useState } from 'react';
import { 
  Card, Table, Button, Space, Input, Typography, Modal, Form, 
  message, Popconfirm, Tag, Select, Switch, List, Empty,
  Divider, InputNumber, Tabs
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined,
  ShoppingCartOutlined, ToolOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { 
  catalogApi, 
  type CatalogCategory, 
  type NomenclatureType 
} from '../../features/catalog';

const { Title, Text } = Typography;

export default function CatalogSettingsPage() {
  const queryClient = useQueryClient();
  
  // Состояние для модальных окон
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
  const [categoryForm] = Form.useForm();
  
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<NomenclatureType | null>(null);
  const [typeForm] = Form.useForm();
  const [selectedCategoryForType, setSelectedCategoryForType] = useState<string | null>(null);

  // Состояние для типов при создании категории
  const [newTypes, setNewTypes] = useState<{name: string; default_unit: string}[]>([]);

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => catalogApi.categories.list(),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch types
  const { data: types = [] } = useQuery({
    queryKey: ['nomenclature-types'],
    queryFn: () => catalogApi.nomenclatureTypes.list(),
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (data: Partial<CatalogCategory>) => {
      const category = await catalogApi.categories.create(data);
      // Создаём типы если это закупаемая категория
      if (data.is_purchased && newTypes.length > 0) {
        for (const type of newTypes) {
          await catalogApi.nomenclatureTypes.create({
            catalog_category: category.id,
            name: type.name,
            default_unit: type.default_unit,
          });
        }
      }
      return category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      queryClient.invalidateQueries({ queryKey: ['nomenclature-types'] });
      message.success('Вид справочника создан');
      handleCategoryModalClose();
    },
    onError: () => message.error('Ошибка создания'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CatalogCategory> }) => 
      catalogApi.categories.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      message.success('Вид справочника обновлён');
      handleCategoryModalClose();
    },
    onError: () => message.error('Ошибка обновления'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => catalogApi.categories.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
      message.success('Вид справочника удалён');
    },
    onError: () => message.error('Ошибка удаления. Возможно, есть связанная номенклатура.'),
  });

  // Type mutations
  const createTypeMutation = useMutation({
    mutationFn: (data: Partial<NomenclatureType>) => catalogApi.nomenclatureTypes.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature-types'] });
      message.success('Тип номенклатуры создан');
      handleTypeModalClose();
    },
    onError: () => message.error('Ошибка создания'),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NomenclatureType> }) => 
      catalogApi.nomenclatureTypes.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature-types'] });
      message.success('Тип номенклатуры обновлён');
      handleTypeModalClose();
    },
    onError: () => message.error('Ошибка обновления'),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => catalogApi.nomenclatureTypes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature-types'] });
      message.success('Тип номенклатуры удалён');
    },
    onError: () => message.error('Ошибка удаления'),
  });

  // Handlers for category modal
  const handleAddCategory = () => {
    setEditingCategory(null);
    categoryForm.resetFields();
    setNewTypes([]);
    setCategoryModalOpen(true);
  };

  const handleEditCategory = async (category: CatalogCategory) => {
    // Загружаем детальные данные с allowed_children
    try {
      const fullData = await catalogApi.categories.get(category.id);
      setEditingCategory(fullData);
      categoryForm.setFieldsValue({
        ...fullData,
        allowed_children_ids: fullData.allowed_children?.map(c => c.id) || [],
      });
      setNewTypes([]);
      setCategoryModalOpen(true);
    } catch (error) {
      message.error('Ошибка загрузки данных');
    }
  };

  const handleCategoryModalClose = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
    categoryForm.resetFields();
    setNewTypes([]);
  };

  const handleCategorySubmit = async () => {
    const values = await categoryForm.validateFields();
    // Конвертируем allowed_children_ids для API
    const data = {
      ...values,
      allowed_children_ids: values.allowed_children_ids || [],
    };
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  // Handlers for type modal
  const handleAddType = (categoryId?: string) => {
    setEditingType(null);
    setSelectedCategoryForType(categoryId || null);
    typeForm.resetFields();
    if (categoryId) {
      typeForm.setFieldValue('catalog_category', categoryId);
    }
    setTypeModalOpen(true);
  };

  const handleEditType = (type: NomenclatureType) => {
    setEditingType(type);
    setSelectedCategoryForType(type.catalog_category);
    typeForm.setFieldsValue(type);
    setTypeModalOpen(true);
  };

  const handleTypeModalClose = () => {
    setTypeModalOpen(false);
    setEditingType(null);
    setSelectedCategoryForType(null);
    typeForm.resetFields();
  };

  const handleTypeSubmit = async () => {
    const values = await typeForm.validateFields();
    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, data: values });
    } else {
      createTypeMutation.mutate(values);
    }
  };

  // Добавление нового типа при создании категории
  const handleAddNewType = () => {
    setNewTypes([...newTypes, { name: '', default_unit: 'шт' }]);
  };

  const handleRemoveNewType = (index: number) => {
    setNewTypes(newTypes.filter((_, i) => i !== index));
  };

  const handleUpdateNewType = (index: number, field: 'name' | 'default_unit', value: string) => {
    const updated = [...newTypes];
    updated[index][field] = value;
    setNewTypes(updated);
  };

  // Получить закупаемые категории для типов
  const purchasedCategories = categories.filter(c => c.is_purchased);

  // Получить типы для конкретной категории
  const getTypesForCategory = (categoryId: string) => {
    return types.filter(t => t.catalog_category === categoryId);
  };

  // Колонки таблицы категорий
  const categoryColumns: ColumnsType<CatalogCategory> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'is_purchased',
      key: 'is_purchased',
      width: 150,
      render: (isPurchased: boolean) => (
        <Tag 
          icon={isPurchased ? <ShoppingCartOutlined /> : <ToolOutlined />}
          color={isPurchased ? 'blue' : 'green'}
        >
          {isPurchased ? 'Закупаемый' : 'Изготавливаемый'}
        </Tag>
      ),
    },
    {
      title: 'Может включать',
      dataIndex: 'allowed_children_names',
      key: 'allowed_children',
      render: (names: string[] | undefined) => (
        names && names.length > 0 ? (
          <Space size={[0, 4]} wrap>
            {names.map((name, idx) => (
              <Tag key={idx} style={{ margin: 2 }}>{name}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: CatalogCategory) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEditCategory(record)} />
          <Popconfirm
            title="Удалить вид справочника?"
            description="Все связанные типы и номенклатура будут удалены"
            onConfirm={() => deleteCategoryMutation.mutate(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Следим за изменением is_purchased в форме
  const isPurchasedValue = Form.useWatch('is_purchased', categoryForm);

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <SettingOutlined style={{ marginRight: 8 }} />
            Настройка справочников
          </Title>
          <Text type="secondary">Виды справочников и типы номенклатуры</Text>
        </div>
      </div>

      {/* Виды справочников */}
      <Card 
        title="Виды справочников" 
        size="small" 
        style={{ marginBottom: 16 }}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCategory}>
            Добавить вид справочника
          </Button>
        }
      >
        <Table
          columns={categoryColumns}
          dataSource={categories}
          rowKey="id"
          loading={categoriesLoading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Модальное окно создания/редактирования категории */}
      <Modal
        title={editingCategory ? 'Редактирование вида справочника' : 'Новый вид справочника'}
        open={categoryModalOpen}
        onCancel={handleCategoryModalClose}
        onOk={handleCategorySubmit}
        confirmLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
        width={700}
      >
        <Tabs 
          defaultActiveKey="info"
          items={[
            {
              key: 'info',
              label: 'Основная информация',
              children: (
                <Form form={categoryForm} layout="vertical">
                  <Form.Item 
                    name="name" 
                    label="Наименование" 
                    rules={[{ required: true, message: 'Введите наименование' }]}
                  >
                    <Input placeholder="Например: Стандартные изделия" />
                  </Form.Item>

                  <Form.Item name="description" label="Описание">
                    <Input.TextArea rows={2} placeholder="Описание вида справочника" />
                  </Form.Item>

                  <Form.Item 
                    name="is_purchased" 
                    label="Тип позиций" 
                    valuePropName="checked"
                    initialValue={false}
                  >
                    <Switch 
                      checkedChildren="Закупаемый" 
                      unCheckedChildren="Изготавливаемый"
                    />
                  </Form.Item>

                  <Form.Item 
                    name="allowed_children_ids" 
                    label="Может включать в себя (из чего состоит изделие)"
                    extra={!editingCategory ? "После сохранения вы сможете добавить этот вид справочника в состав самого себя" : undefined}
                  >
                    <Select
                      mode="multiple"
                      placeholder="Выберите виды справочников, которые могут входить в состав"
                      options={[
                        // Добавляем текущую редактируемую категорию
                        ...(editingCategory ? [{
                          label: `${editingCategory.name} (этот справочник)`,
                          value: editingCategory.id
                        }] : []),
                        // Остальные категории
                        ...categories
                          .filter(c => !editingCategory || c.id !== editingCategory.id)
                          .map(c => ({ 
                            label: `${c.name} (${c.is_purchased ? 'закуп.' : 'изгот.'})`, 
                            value: c.id 
                          }))
                      ]}
                    />
                  </Form.Item>

                  <Form.Item name="sort_order" label="Порядок сортировки" initialValue={0}>
                    <InputNumber min={0} />
                  </Form.Item>

                  {/* Типы номенклатуры при создании закупаемой категории */}
                  {!editingCategory && isPurchasedValue && (
                    <>
                      <Divider>Типы номенклатуры</Divider>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Для закупаемых позиций можно сразу создать типы номенклатуры
                      </Text>
                      
                      {newTypes.map((type, index) => (
                        <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                          <Input
                            placeholder="Название типа"
                            value={type.name}
                            onChange={(e) => handleUpdateNewType(index, 'name', e.target.value)}
                            style={{ width: 250 }}
                          />
                          <Input
                            placeholder="Ед. изм."
                            value={type.default_unit}
                            onChange={(e) => handleUpdateNewType(index, 'default_unit', e.target.value)}
                            style={{ width: 100 }}
                          />
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={() => handleRemoveNewType(index)}
                          />
                        </Space>
                      ))}
                      
                      <Button 
                        type="dashed" 
                        icon={<PlusOutlined />} 
                        onClick={handleAddNewType}
                        block
                      >
                        Добавить тип номенклатуры
                      </Button>
                    </>
                  )}
                </Form>
              ),
            },
            // Вкладка типов только для закупаемых категорий при редактировании
            ...(editingCategory && editingCategory.is_purchased ? [{
              key: 'types',
              label: `Типы номенклатуры (${getTypesForCategory(editingCategory.id).length})`,
              children: (
                <div>
                  <Button 
                    type="dashed" 
                    icon={<PlusOutlined />} 
                    onClick={() => handleAddType(editingCategory.id)}
                    style={{ marginBottom: 16 }}
                    block
                  >
                    Добавить тип номенклатуры
                  </Button>
                  
                  {getTypesForCategory(editingCategory.id).length === 0 ? (
                    <Empty description="Типы номенклатуры не созданы" />
                  ) : (
                    <List
                      size="small"
                      dataSource={getTypesForCategory(editingCategory.id)}
                      renderItem={(type) => (
                        <List.Item
                          actions={[
                            <Button 
                              type="link" 
                              size="small" 
                              onClick={() => handleEditType(type)}
                            >
                              Редактировать
                            </Button>,
                            <Popconfirm
                              title="Удалить тип?"
                              description="Связанная номенклатура также будет удалена"
                              onConfirm={() => deleteTypeMutation.mutate(type.id)}
                            >
                              <Button type="link" size="small" danger>Удалить</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            title={type.name}
                            description={`Единица измерения: ${type.default_unit}`}
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            }] : []),
          ]}
        />
      </Modal>

      {/* Модальное окно создания/редактирования типа */}
      <Modal
        title={editingType ? 'Редактирование типа номенклатуры' : 'Новый тип номенклатуры'}
        open={typeModalOpen}
        onCancel={handleTypeModalClose}
        onOk={handleTypeSubmit}
        confirmLoading={createTypeMutation.isPending || updateTypeMutation.isPending}
        width={500}
      >
        <Form form={typeForm} layout="vertical">
          <Form.Item 
            name="catalog_category" 
            label="Вид справочника" 
            rules={[{ required: true, message: 'Выберите вид справочника' }]}
          >
            <Select
              placeholder="Выберите вид справочника"
              disabled={!!selectedCategoryForType}
              options={purchasedCategories.map(c => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>

          <Form.Item 
            name="name" 
            label="Название типа" 
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Например: Болты, Гайки, Провода" />
          </Form.Item>

          <Form.Item name="default_unit" label="Единица измерения по умолчанию" initialValue="шт">
            <Input placeholder="шт, м, кг, л" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
