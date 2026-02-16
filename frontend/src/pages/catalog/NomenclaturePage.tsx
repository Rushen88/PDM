import {
    DeleteOutlined,
    EditOutlined,
    PlusOutlined, SearchOutlined,
    ShopOutlined, StarFilled,
    UploadOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Avatar,
    Button,
    Card,
    Divider,
    Form,
    Input,
    InputNumber, List,
    message,
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import CompositionEditor, { type CompositionEditorRef } from '../../components/catalog/CompositionEditor';
import {
    catalogApi,
    type Nomenclature,
    type NomenclatureImportError,
    type NomenclatureImportPreviewResponse,
    type NomenclatureImportRow,
} from '../../features/catalog';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';

const { Title, Text } = Typography;

export default function NomenclaturePage() {
  const { canEdit, canDelete } = useModuleAccess('catalog.nomenclature');
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [hasBomFilter, setHasBomFilter] = useState<boolean | undefined>();
  const [unitFilter, setUnitFilter] = useState<string | undefined>();
  const [primarySupplierFilter, setPrimarySupplierFilter] = useState<string | undefined>();
  const [nomenclatureTypeFilter, setNomenclatureTypeFilter] = useState<string | undefined>();
  const [nomenclatureTypeIsNull, setNomenclatureTypeIsNull] = useState<boolean | undefined>();
  const [ordering, setOrdering] = useState<string | undefined>(
    'catalog_category__is_purchased,catalog_category__sort_order,name'
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Nomenclature | null>(null);
  const [form] = Form.useForm();
  const [editingLoadingId, setEditingLoadingId] = useState<string | null>(null);

  // Импорт из Excel
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<NomenclatureImportPreviewResponse | null>(null);
  
  // Ref для CompositionEditor - позволяет вызывать сохранение состава при OK
  const compositionEditorRef = useRef<CompositionEditorRef>(null);
  
  // Состояние для поставщиков в форме
  const [selectedSuppliers, setSelectedSuppliers] = useState<{
    supplier: string;
    delivery_days: number;
    is_primary: boolean;
  }[]>([]);

  // Fetch catalog categories
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => catalogApi.categories.list(),
  });

  // Watch form category for loading types
  const formCategoryId = Form.useWatch('catalog_category', form);
  const formCategory = categories.find(c => c.id === formCategoryId);
  const isFormCategoryPurchased = formCategory?.is_purchased || false;

  // Fetch nomenclature types based on form category (for modal)
  const { data: formTypes = [] } = useQuery({
    queryKey: ['nomenclature-types', formCategoryId],
    queryFn: () => catalogApi.nomenclatureTypes.list(formCategoryId),
    enabled: !!formCategoryId && isFormCategoryPurchased,
  });

  const importPreviewMutation = useMutation({
    mutationFn: (file: File) => catalogApi.nomenclature.importExcelPreview(file),
    onSuccess: (data, file) => {
      setImportFile(file);
      setImportPreview(data);
      setImportModalOpen(true);

      if (data?.errors?.length) {
        message.warning(`Файл обработан, найдено ошибок: ${data.errors.length}`);
      } else {
        message.success(`Файл обработан: позиций к добавлению: ${data.summary?.valid_rows ?? data.rows.length}`);
      }
    },
    onError: (error: any) => {
      const serverMessage = error?.response?.data?.error;
      message.error(serverMessage || 'Ошибка обработки Excel файла');
    },
  });

  const importConfirmMutation = useMutation({
    mutationFn: (file: File) => catalogApi.nomenclature.importExcelConfirm(file),
    onSuccess: async (data) => {
      message.success(`Добавлено позиций: ${data.created}`);
      setImportModalOpen(false);
      setImportFile(null);
      setImportPreview(null);
      await queryClient.invalidateQueries({ queryKey: ['nomenclature'] });
      await queryClient.invalidateQueries({ queryKey: ['nomenclature-by-category'] });
    },
    onError: (error: any) => {
      const payload = error?.response?.data;
      if (payload?.rows && payload?.errors) {
        setImportPreview(payload as NomenclatureImportPreviewResponse);
        message.error(payload?.error || 'Импорт отменён: исправьте ошибки в файле');
        return;
      }
      message.error(payload?.error || 'Ошибка импорта');
    },
  });

  const openImportFilePicker = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // сброс значения чтобы можно было выбрать тот же файл повторно
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      message.error('Поддерживается только формат .xlsx');
      return;
    }
    importPreviewMutation.mutate(file);
  };

  const formatImportErrors = (errors: NomenclatureImportError[], limit = 20) => {
    const slice = errors.slice(0, limit);
    const lines = slice.map(e => `Строка ${e.row}, столбец ${e.column}: ${e.message}`);
    const tail = errors.length > limit ? `\n… и ещё ${errors.length - limit} ошибок` : '';
    return lines.join('\n') + tail;
  };

  const importColumns: ColumnsType<NomenclatureImportRow> = useMemo(() => [
    {
      title: 'Строка',
      dataIndex: 'row',
      key: 'row',
      width: 80,
    },
    {
      title: 'Вид справочника',
      dataIndex: 'catalog_category_name',
      key: 'catalog_category_name',
      width: 220,
      render: (v: string, r) => r.catalog_category ? v : <Text type="danger">{v || '—'}</Text>,
    },
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (v: string, r) => r.can_import ? v : <Text type="danger">{v || '—'}</Text>,
    },
    {
      title: 'Сборочный чертеж',
      dataIndex: 'drawing_number',
      key: 'drawing_number',
      width: 160,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Ед. изм.',
      dataIndex: 'unit',
      key: 'unit',
      width: 100,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Тех. характеристики',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 240,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Тип номенклатуры',
      dataIndex: 'nomenclature_type_name',
      key: 'nomenclature_type_name',
      width: 200,
      render: (v: string, r) => (r.is_purchased ? (v || <Text type="secondary">—</Text>) : <Text type="secondary">—</Text>),
    },
    {
      title: 'Статус',
      key: 'status',
      width: 120,
      render: (_, r) => r.can_import ? <Tag color="green">ОК</Tag> : <Tag color="red">Ошибка</Tag>,
    },
  ], []);

  // Типы номенклатуры для фильтра в таблице (можно ограничивать выбранной категорией)
  const { data: filterTypes = [] } = useQuery({
    queryKey: ['nomenclature-types-filter', selectedCategory],
    queryFn: () => catalogApi.nomenclatureTypes.list(selectedCategory),
  });

  // Fetch suppliers for purchased items
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => catalogApi.suppliers.list(),
  });
  const suppliers = suppliersData?.results || [];

  // Fetch nomenclature list
  const { data: nomenclatureData, isLoading } = useQuery({
    queryKey: [
      'nomenclature',
      searchText,
      selectedCategory,
      hasBomFilter,
      unitFilter,
      primarySupplierFilter,
      nomenclatureTypeFilter,
      nomenclatureTypeIsNull,
      ordering,
      page,
      pageSize,
    ],
    queryFn: () => catalogApi.nomenclature.list({
      search: searchText || undefined,
      catalog_category: selectedCategory,
      has_bom: hasBomFilter,
      unit: unitFilter,
      primary_supplier: primarySupplierFilter,
      nomenclature_type: nomenclatureTypeFilter,
      nomenclature_type_isnull: nomenclatureTypeIsNull,
      ordering,
      page,
      page_size: pageSize,
    }),
    staleTime: 0, // Всегда считать данные устаревшими для свежести
    refetchOnMount: 'always', // Всегда обновлять при монтировании
  });

  // При изменении фильтров/поиска всегда возвращаемся на первую страницу
  useEffect(() => {
    setPage(1);
  }, [
    searchText,
    selectedCategory,
    hasBomFilter,
    unitFilter,
    primarySupplierFilter,
    nomenclatureTypeFilter,
    nomenclatureTypeIsNull,
    ordering,
  ]);

  const categoryColumnFilters = useMemo(
    () => categories.map((c) => ({ text: c.name, value: c.id })),
    [categories]
  );

  const unitColumnFilters = useMemo(() => {
    const units = Array.from(new Set((nomenclatureData?.results || []).map((n) => n.unit).filter(Boolean)));
    units.sort((a, b) => String(a).localeCompare(String(b), 'ru'));
    return units.map((u) => ({ text: String(u), value: String(u) }));
  }, [nomenclatureData?.results]);

  const supplierColumnFilters = useMemo(() => {
    const opts = suppliers
      .filter((s) => s?.id)
      .map((s) => ({
        text: s.short_name || s.name,
        value: s.id,
      }));
    opts.sort((a, b) => String(a.text).localeCompare(String(b.text), 'ru'));
    return opts;
  }, [suppliers]);

  const typeColumnFilters = useMemo(() => {
    const opts = filterTypes
      .filter((t) => t?.id)
      .map((t) => ({ text: t.name, value: t.id }));
    opts.sort((a, b) => String(a.text).localeCompare(String(b.text), 'ru'));
    return [{ text: '—', value: '__none__' }, ...opts];
  }, [filterTypes]);

  const mapSorterToOrdering = (sorter: any): string | undefined => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (!s?.order) {
      return 'catalog_category__is_purchased,catalog_category__sort_order,name';
    }

    // Сортировку разрешаем только по "Наименование"
    if (s.columnKey === 'name') {
      return s.order === 'descend' ? '-name' : 'name';
    }

    return 'catalog_category__is_purchased,catalog_category__sort_order,name';
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Nomenclature>) => {
      const item = await catalogApi.nomenclature.create(data);
      // Добавляем поставщиков если есть
      for (const sup of selectedSuppliers) {
        await catalogApi.nomenclatureSuppliers.create({
          nomenclature_item: item.id,
          supplier: sup.supplier,
          delivery_days: sup.delivery_days,
          is_primary: sup.is_primary,
        });
      }
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature'] });
      message.success('Номенклатура создана');
      setIsModalOpen(false);
      form.resetFields();
      setSelectedSuppliers([]);
    },
    onError: (error: unknown) => {
      // Пытаемся извлечь детали ошибки из ответа
      const err = error as { response?: { data?: Record<string, string[]> } };
      const data = err?.response?.data;
      if (data) {
        if (data.name) {
          message.error(`Наименование: ${data.name.join(', ')}`);
        } else if (data.non_field_errors) {
          message.error(data.non_field_errors.join(', '));
        } else {
          message.error('Ошибка создания номенклатуры');
        }
      } else {
        message.error('Ошибка создания номенклатуры');
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Nomenclature> }) => {
      const item = await catalogApi.nomenclature.update(id, data);
      
      // Обновляем поставщиков: удаляем старых, добавляем новых
      // Сначала получаем текущих поставщиков
      const currentSuppliers = editingItem?.item_suppliers || [];
      
      // Удаляем тех, кого нет в новом списке
      for (const current of currentSuppliers) {
        if (!selectedSuppliers.find(s => s.supplier === current.supplier)) {
          await catalogApi.nomenclatureSuppliers.delete(current.id);
        }
      }
      
      // Добавляем/обновляем поставщиков
      for (const sup of selectedSuppliers) {
        const existing = currentSuppliers.find(c => c.supplier === sup.supplier);
        if (existing) {
          // Обновляем существующего
          await catalogApi.nomenclatureSuppliers.update(existing.id, {
            delivery_days: sup.delivery_days,
            is_primary: sup.is_primary,
          });
        } else {
          // Создаём нового
          await catalogApi.nomenclatureSuppliers.create({
            nomenclature_item: id,
            supplier: sup.supplier,
            delivery_days: sup.delivery_days,
            is_primary: sup.is_primary,
          });
        }
      }
      
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature'] });
      message.success('Номенклатура обновлена');
      setIsModalOpen(false);
      setEditingItem(null);
      form.resetFields();
      setSelectedSuppliers([]);
    },
    onError: () => message.error('Ошибка обновления'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.nomenclature.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclature'] });
      message.success('Номенклатура удалена');
    },
    onError: () => message.error('Ошибка удаления'),
  });

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    // Если установлен фильтр по категории, подставляем его в форму
    if (selectedCategory) {
      form.setFieldValue('catalog_category', selectedCategory);
    }
    setSelectedSuppliers([]);
    setIsModalOpen(true);
  };

  const handleEdit = async (record: Nomenclature) => {
    try {
      setEditingLoadingId(record.id);
      // Загружаем полные данные номенклатуры
      const fullRecord = await catalogApi.nomenclature.get(record.id);
      setEditingItem(fullRecord);
      form.setFieldsValue({
        ...fullRecord,
        catalog_category: fullRecord.catalog_category,
        nomenclature_type: fullRecord.nomenclature_type,
      });
      // Загружаем поставщиков
      if (fullRecord.item_suppliers && fullRecord.item_suppliers.length > 0) {
        setSelectedSuppliers(fullRecord.item_suppliers.map(s => ({
          supplier: s.supplier,
          delivery_days: s.delivery_days,
          is_primary: s.is_primary,
        })));
      } else {
        setSelectedSuppliers([]);
      }
      setIsModalOpen(true);
    } catch (error: any) {
      const serverMessage = error?.response?.data?.error;
      message.error(serverMessage || 'Не удалось загрузить номенклатуру для редактирования');
    } finally {
      setEditingLoadingId(null);
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    
    // При редактировании изготавливаемой позиции - сначала сохраняем состав
    if (editingItem && !isFormCategoryPurchased && compositionEditorRef.current) {
      try {
        await compositionEditorRef.current.saveComposition();
      } catch (error) {
        console.error('Ошибка сохранения состава:', error);
        // Продолжаем сохранение основных данных даже если состав не сохранился
      }
    }
    
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  // Обработчик выбора вида справочника в форме
  const handleCategoryChange = () => {
    form.setFieldValue('nomenclature_type', null);
    setSelectedSuppliers([]);
  };

  // Обработчик выбора типа номенклатуры - автозаполнение единицы измерения
  const handleNomenclatureTypeChange = (typeId: string) => {
    const selectedType = formTypes.find(t => t.id === typeId);
    if (selectedType && selectedType.default_unit) {
      form.setFieldValue('unit', selectedType.default_unit);
    }
  };

  // Добавление поставщика
  const handleAddSupplier = (supplierId: string) => {
    if (selectedSuppliers.find(s => s.supplier === supplierId)) return;
    setSelectedSuppliers([
      ...selectedSuppliers,
      { supplier: supplierId, delivery_days: 7, is_primary: selectedSuppliers.length === 0 }
    ]);
  };

  // Удаление поставщика
  const handleRemoveSupplier = (supplierId: string) => {
    const newList = selectedSuppliers.filter(s => s.supplier !== supplierId);
    // Если удалили приоритетного, назначаем первого
    if (newList.length > 0 && !newList.find(s => s.is_primary)) {
      newList[0].is_primary = true;
    }
    setSelectedSuppliers(newList);
  };

  // Изменение приоритетного поставщика
  const handleSetPrimary = (supplierId: string) => {
    setSelectedSuppliers(selectedSuppliers.map(s => ({
      ...s,
      is_primary: s.supplier === supplierId
    })));
  };

  // Изменение срока поставки
  const handleDeliveryDaysChange = (supplierId: string, days: number) => {
    setSelectedSuppliers(selectedSuppliers.map(s => 
      s.supplier === supplierId ? { ...s, delivery_days: days } : s
    ));
  };

  // Получить название категории
  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || '-';
  };

  const columns: ColumnsType<Nomenclature> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      sorter: true,
      sortDirections: ['ascend'],
    },
    {
      title: 'Вид справочника',
      dataIndex: 'catalog_category_name',
      key: 'category',
      width: 180,
      filters: categoryColumnFilters,
      filteredValue: selectedCategory ? [selectedCategory] : null,
      render: (name: string, record) => (
        <Tag color={record.is_purchased ? 'blue' : 'green'}>
          {name || getCategoryName(record.catalog_category)}
        </Tag>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'nomenclature_type_name',
      key: 'type',
      width: 225,
      filters: typeColumnFilters,
      filteredValue:
        nomenclatureTypeIsNull
          ? ['__none__']
          : nomenclatureTypeFilter
            ? [nomenclatureTypeFilter]
            : null,
      render: (name: string) => name || '—',
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Состав</span>,
      dataIndex: 'has_bom',
      key: 'has_bom',
      width: 105,
      align: 'center' as const,
      filters: [
        { text: 'Есть состав', value: true },
        { text: 'Нет состава', value: false },
      ],
      filteredValue:
        typeof hasBomFilter === 'boolean'
          ? [hasBomFilter]
          : null,
      render: (hasBom: boolean, record) => {
        if (record.is_purchased) return <Text type="secondary">—</Text>;
        return hasBom ? (
          <Tag color="green">Да</Tag>
        ) : (
          <Tag>Нет</Tag>
        );
      },
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Ед. изм.</span>,
      dataIndex: 'unit',
      key: 'unit',
      width: 105,
      filters: unitColumnFilters,
      filteredValue: unitFilter ? [unitFilter] : null,
    },
    {
      title: 'Поставщик',
      dataIndex: 'primary_supplier_name',
      key: 'supplier',
      width: 170,
      filters: supplierColumnFilters,
      filteredValue: primarySupplierFilter ? [primarySupplierFilter] : null,
      render: (name: string, record) => 
        record.is_purchased ? (name || '-') : <Text type="secondary">—</Text>,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size="small">
          {canEdit && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              loading={editingLoadingId === record.id}
              disabled={!!editingLoadingId && editingLoadingId !== record.id}
              onClick={() => handleEdit(record)}
            />
          )}
          {canDelete && (
            <Popconfirm
              title="Удалить номенклатуру?"
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText="Да"
              cancelText="Нет"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
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
          <Title level={4} style={{ margin: 0 }}>Номенклатура</Title>
          <Text type="secondary">Справочник номенклатурных позиций</Text>
        </div>
        <Space>
          {canEdit && (
            <>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleImportFileSelected}
              />
              <Button
                icon={<UploadOutlined />}
                onClick={openImportFilePicker}
                loading={importPreviewMutation.isPending}
              >
                Загрузить Excel
              </Button>
            </>
          )}
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Добавить</Button>
          )}
        </Space>
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
          <Select 
            placeholder="Вид справочника" 
            style={{ width: 200 }} 
            allowClear
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={categories.map(c => ({ 
              label: c.name, 
              value: c.id,
            }))}
          />
          <Select 
            placeholder="Состав изделия" 
            style={{ width: 160 }} 
            allowClear
            value={hasBomFilter}
            onChange={setHasBomFilter}
            options={[
              { label: 'Есть состав', value: true },
              { label: 'Нет состава', value: false },
            ]}
          />
        </Space>
      </Card>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={nomenclatureData?.results || []}
          rowKey="id"
          loading={isLoading}
          onChange={(pagination, filters, sorter) => {
            // Pagination (server-side)
            const nextPage = pagination.current || 1;
            const nextSize = pagination.pageSize || 20;
            if (nextSize !== pageSize) {
              setPage(1);
              setPageSize(nextSize);
            } else {
              setPage(nextPage);
            }

            // Header filters -> state (AntD может отдавать null/undefined при сбросе)
            const cat = (filters as any)?.category as Array<string | number> | null | undefined;
            const type = (filters as any)?.type as Array<string> | null | undefined;
            const bom = (filters as any)?.has_bom as Array<boolean | string> | null | undefined;
            const unit = (filters as any)?.unit as Array<string> | null | undefined;
            const supplier = (filters as any)?.supplier as Array<string> | null | undefined;

            const firstOrUndef = <T,>(v: Array<T> | null | undefined): T | undefined =>
              Array.isArray(v) && v.length > 0 ? v[0] : undefined;

            const catValue = firstOrUndef(cat);
            setSelectedCategory(catValue !== undefined ? String(catValue) : undefined);

            const bomValue = firstOrUndef(bom);
            if (bomValue === undefined) {
              setHasBomFilter(undefined);
            } else {
              setHasBomFilter(bomValue === true || bomValue === 'true');
            }

            const unitValue = firstOrUndef(unit);
            setUnitFilter(unitValue !== undefined ? String(unitValue) : undefined);

            const typeValue = firstOrUndef(type);
            if (typeValue === '__none__') {
              setNomenclatureTypeFilter(undefined);
              setNomenclatureTypeIsNull(true);
            } else if (typeValue) {
              setNomenclatureTypeFilter(String(typeValue));
              setNomenclatureTypeIsNull(undefined);
            } else {
              setNomenclatureTypeFilter(undefined);
              setNomenclatureTypeIsNull(undefined);
            }

            const supplierValue = firstOrUndef(supplier);
            setPrimarySupplierFilter(supplierValue !== undefined ? String(supplierValue) : undefined);

            // Sorting
            setOrdering(mapSorterToOrdering(sorter));
          }}
          pagination={{
            total: nomenclatureData?.count || 0,
            current: page,
            pageSize,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
          size="small"
        />
      </Card>

      <Modal
        title={editingItem 
          ? `Редактировать номенклатуру: ${editingItem.name}` 
          : 'Добавить номенклатуру'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => { setIsModalOpen(false); setEditingItem(null); setSelectedSuppliers([]); }}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={1200}
      >
        {/* Изготавливаемые изделия показываем с вкладками */}
        {!isFormCategoryPurchased ? (
          <Tabs
            defaultActiveKey="main"
            items={[
              {
                key: 'main',
                label: 'Основные данные',
                children: (
                  <Form form={form} layout="vertical">
                    <Form.Item 
                      name="catalog_category" 
                      label="Вид справочника (тип номенклатуры)" 
                      rules={[{ required: true, message: 'Выберите вид справочника' }]}
                    >
                      <Select 
                        options={categories.map(c => ({ 
                          label: `${c.name} (${c.is_purchased ? 'закупаемый' : 'изготавливаемый'})`, 
                          value: c.id 
                        }))} 
                        onChange={handleCategoryChange}
                        placeholder="Выберите вид справочника"
                        disabled={!!editingItem}
                      />
                    </Form.Item>

                    <Form.Item 
                      name="name" 
                      label="Наименование" 
                      rules={[{ required: true, message: 'Введите наименование' }]}
                    >
                      <Input placeholder="Наименование номенклатурной позиции" />
                    </Form.Item>

                    <Form.Item name="drawing_number" label="Сборочный чертеж">
                      <Input placeholder="Сборочный чертеж (для изготавливаемых позиций)" />
                    </Form.Item>

                    <Form.Item name="unit" label="Единица измерения" initialValue="шт">
                      <Input />
                    </Form.Item>

                    <Form.Item name="description" label="Описание">
                      <Input.TextArea rows={2} />
                    </Form.Item>

                    <Form.Item name="specifications" label="Технические характеристики">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'composition',
                label: (
                  <Space>
                    Состав изделия
                    {editingItem?.has_bom && (
                      <Tag color="purple" style={{ marginLeft: 4 }}>Заполнен</Tag>
                    )}
                  </Space>
                ),
                children: (
                  <CompositionEditor
                    ref={compositionEditorRef}
                    nomenclatureId={editingItem?.id}
                    nomenclatureItem={editingItem || undefined}
                  />
                ),
              },
            ]}
          />
        ) : (
          /* Закупаемые изделия показываем простой формой */
          <Form form={form} layout="vertical">
            <Form.Item 
              name="catalog_category" 
              label="Вид справочника (тип номенклатуры)" 
              rules={[{ required: true, message: 'Выберите вид справочника' }]}
            >
              <Select 
                options={categories.map(c => ({ 
                  label: `${c.name} (${c.is_purchased ? 'закупаемый' : 'изготавливаемый'})`, 
                  value: c.id 
                }))} 
                onChange={handleCategoryChange}
                placeholder="Выберите вид справочника"
              />
            </Form.Item>


            <Form.Item 
              name="name" 
              label="Наименование" 
              rules={[{ required: true, message: 'Введите наименование' }]}
            >
              <Input placeholder="Наименование номенклатурной позиции" />
            </Form.Item>

            {isFormCategoryPurchased && (
              <Form.Item name="nomenclature_type" label="Тип номенклатуры">
                <Select 
                  options={formTypes.map(t => ({ label: t.name, value: t.id }))} 
                  allowClear 
                  placeholder="Выберите тип (опционально)"
                  onChange={handleNomenclatureTypeChange}
                />
              </Form.Item>
            )}

            {!isFormCategoryPurchased && (
              <Form.Item name="drawing_number" label="Сборочный чертеж">
                <Input placeholder="Для изготавливаемых позиций" />
              </Form.Item>
            )}

            <Form.Item name="unit" label="Единица измерения" initialValue="шт">
              <Input />
            </Form.Item>

            <Form.Item name="description" label="Описание">
              <Input.TextArea rows={2} />
            </Form.Item>

            <Form.Item name="specifications" label="Технические характеристики">
              <Input.TextArea rows={2} />
            </Form.Item>

            {isFormCategoryPurchased && (
              <>
                <Divider>Поставщики</Divider>
                
                <Form.Item label="Добавить поставщика">
                  <Select
                    placeholder="Выберите поставщика"
                    style={{ width: '100%' }}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={suppliers
                      .filter(s => !selectedSuppliers.find(ss => ss.supplier === s.id))
                      .map(s => ({ label: s.name, value: s.id }))}
                    onChange={(value: string) => value && handleAddSupplier(value)}
                    value={undefined}
                  />
                </Form.Item>

                {selectedSuppliers.length > 0 && (
                  <List
                    size="small"
                    dataSource={selectedSuppliers}
                    renderItem={(item) => {
                      const supplier = suppliers.find(s => s.id === item.supplier);
                      return (
                        <List.Item
                          actions={[
                            <Button 
                              type="link" 
                              size="small" 
                              danger 
                              onClick={() => handleRemoveSupplier(item.supplier)}
                            >
                              Удалить
                            </Button>
                          ]}
                        >
                          <List.Item.Meta
                            avatar={<Avatar icon={<ShopOutlined />} />}
                            title={
                              <Space>
                                {supplier?.name}
                                {item.is_primary && (
                                  <Tag color="gold" icon={<StarFilled />}>Приоритетный</Tag>
                                )}
                              </Space>
                            }
                            description={
                              <Space>
                                <span>Срок поставки:</span>
                                <InputNumber
                                  size="small"
                                  min={1}
                                  max={365}
                                  value={item.delivery_days}
                                  onChange={(v) => handleDeliveryDaysChange(item.supplier, v || 7)}
                                  style={{ width: 70 }}
                                />
                                <span>дней</span>
                                {!item.is_primary && (
                                  <Button 
                                    type="link" 
                                    size="small"
                                    onClick={() => handleSetPrimary(item.supplier)}
                                  >
                                    Сделать приоритетным
                                  </Button>
                                )}
                              </Space>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                )}
              </>
            )}
          </Form>
        )}
      </Modal>

      <Modal
        title="Импорт номенклатуры из Excel"
        open={importModalOpen}
        onCancel={() => {
          if (importConfirmMutation.isPending) return;
          setImportModalOpen(false);
          setImportFile(null);
          setImportPreview(null);
        }}
        onOk={() => {
          if (!importFile) {
            message.error('Файл не выбран');
            return;
          }
          if (importPreview?.errors?.length) {
            message.error('Нельзя импортировать: исправьте ошибки в файле');
            return;
          }
          importConfirmMutation.mutate(importFile);
        }}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={importConfirmMutation.isPending}
        width={1200}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>
            Добавить данные позиции в справочник «Номенклатура»?
          </Text>
        </div>

        {importPreview?.summary && (
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">
              Строк в файле: {importPreview.summary.total_rows} • Прочитано: {importPreview.summary.parsed_rows} • Готово к добавлению: {importPreview.summary.valid_rows}
              {importPreview.summary.errors_count ? ` • Ошибок: ${importPreview.summary.errors_count}` : ''}
            </Text>
          </div>
        )}

        {importPreview?.errors?.length ? (
          <Alert
            type="error"
            showIcon
            message="В файле обнаружены ошибки"
            description={
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {formatImportErrors(importPreview.errors)}
              </pre>
            }
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <Table
          columns={importColumns}
          dataSource={importPreview?.rows || []}
          rowKey={(r) => `${r.row}-${r.catalog_category_name}-${r.name}`}
          size="small"
          pagination={{ pageSize: 50 }}
          scroll={{ x: 1400, y: 420 }}
        />
      </Modal>
    </div>
  );
}
