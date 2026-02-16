import { ClearOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Input, InputNumber, message, Popconfirm, Row, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

import { bomApi, type BOMItem, type BOMStructure } from '../../features/bom';
import { catalogApi, type CatalogCategory, type Nomenclature } from '../../features/catalog';

const { Text, Title } = Typography;

interface CompositionEditorProps {
  nomenclatureId?: string;
  nomenclatureItem?: Nomenclature;
  onCompositionChange?: (items: CompositionItem[]) => void;
  readOnly?: boolean;
}

// Экспортируемый интерфейс для императивного вызова методов
export interface CompositionEditorRef {
  saveComposition: () => Promise<string | null>;
  hasChanges: () => boolean;
}

interface CompositionItem {
  id?: string;
  child_item: string;
  child_item_name?: string;
  child_item_unit?: string;
  child_category?: string;
  child_category_name?: string;
  child_category_sort_order?: number;
  child_category_code?: string; // code вида справочника (для legacy BOM child_category)
  quantity: number;
  notes?: string;
  isNew?: boolean;
  isInComposition?: boolean;
}

/**
 * CompositionEditor - Редактор состава изделия
 * 
 * Отображает все допустимые номенклатурные позиции из allowed_children категорий.
 * Позволяет добавлять позиции в состав изделия с указанием количества.
 * Сортировка по уровню категорий (sort_order).
 */
const CompositionEditor = forwardRef<CompositionEditorRef, CompositionEditorProps>(function CompositionEditor({
  nomenclatureId,
  nomenclatureItem,
  onCompositionChange,
  readOnly = false,
}, ref) {
  const queryClient = useQueryClient();
  
  // Количества выбранных компонентов: childItemId -> qty
  const [compositionQuantities, setCompositionQuantities] = useState<Record<string, number>>({});
  
  // Поисковый фильтр
  const [searchText, setSearchText] = useState('');
  // Фильтр по категориям - массив для мультивыбора
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<string[]>([]);
  
  // Флаг инициализации (чтобы не затирать данные при повторных рендерах)
  const [initializedForId, setInitializedForId] = useState<string | null>(null);
  
  // Сброс состояния при смене номенклатурной позиции
  useEffect(() => {
    if (nomenclatureId !== initializedForId) {
      setCompositionQuantities({});
      setSearchText('');
      setSelectedCategoryFilters([]);
      setInitializedForId(null); // Сброс флага, чтобы useEffect инициализации сработал
    }
  }, [nomenclatureId, initializedForId]);
  
  // Загрузка детальной информации о категории корневого изделия (нужны allowed_children + code)
  const { data: categoryDetail, isLoading: categoryLoading } = useQuery({
    queryKey: ['catalog-category-detail', nomenclatureItem?.catalog_category],
    queryFn: () => catalogApi.categories.get(nomenclatureItem!.catalog_category),
    enabled: !!nomenclatureItem?.catalog_category,
  });
  
  // Получаем разрешённые категории для состава, отсортированные по sort_order
  const allowedCategories = useMemo(() => {
    if (!categoryDetail?.allowed_children) return [];
    return [...categoryDetail.allowed_children].sort((a, b) => 
      (a.sort_order || 0) - (b.sort_order || 0)
    );
  }, [categoryDetail]);
  
  const allowedCategoryIds = useMemo(() => 
    allowedCategories.map(c => c.id),
    [allowedCategories]
  );
  
  // Загрузка номенклатуры из ВСЕХ допустимых категорий
  const { data: allNomenclatureData, isLoading: nomenclatureLoading } = useQuery({
    queryKey: ['nomenclature-for-composition-all', allowedCategoryIds],
    queryFn: async () => {
      if (allowedCategoryIds.length === 0) return { results: [] };
      
      const responses = await Promise.all(
        allowedCategoryIds.map((categoryId) =>
          catalogApi.nomenclature.list({
            catalog_category: categoryId,
            page_size: 1000,
          } as any)
        )
      );

      return { results: responses.flatMap((r) => r.results || []) };
    },
    enabled: allowedCategoryIds.length > 0,
    staleTime: 30000, // Кэш на 30 секунд
  });

  // Определяем BOM id: сначала из nomenclatureItem.bom_id (если есть), иначе по root_item
  const { data: bomStructure, isLoading: bomStructureLoading } = useQuery({
    queryKey: ['bom-structure-for-item', nomenclatureId, nomenclatureItem?.bom_id],
    queryFn: async () => {
      if (!nomenclatureId) return null;
      if (nomenclatureItem?.bom_id) {
        return bomApi.structures.get(String(nomenclatureItem.bom_id));
      }
      const boms = await bomApi.structures.list({ root_item: nomenclatureId, page_size: 50 });
      return boms.results?.[0] ?? null;
    },
    enabled: !!nomenclatureId,
  });

  const bomId = bomStructure?.id;
  
  // Дерево BOM (нужно, чтобы при открытии восстановить состав)
  const { data: bomTree, isLoading: bomTreeLoading } = useQuery({
    queryKey: ['bom-tree', bomId],
    queryFn: async () => {
      if (!bomId) return null;
      return bomApi.structures.getTree(bomId);
    },
    enabled: !!bomId,
  });

  // Инициализация состояния из существующего BOM
  useEffect(() => {
    // Пропускаем если уже инициализировано для этой позиции
    if (initializedForId === nomenclatureId) return;
    if (!nomenclatureId) return;
    
    // Если нет BOM - состав пуст, но помечаем как инициализированный
    if (!bomTree?.tree) {
      // Если bomId ещё загружается - ждём
      if (bomStructureLoading || bomTreeLoading) return;
      // BOM не существует - инициализация пустым составом
      setInitializedForId(nomenclatureId);
      return;
    }

    const tree = bomTree.tree;
    const quantities: Record<string, number> = {};

    // Ожидаемый формат: корневой узел = child_item.id == nomenclatureId
    const rootNode = tree.find((n) => n.child_item?.id === nomenclatureId);
    const components = rootNode?.children?.length ? rootNode.children : tree;

    for (const node of components) {
      // Берём только 1-й уровень компонентов (как в UX)
      const childId = node.child_item.id;
      if (childId === nomenclatureId) continue;
      quantities[childId] = parseFloat(String(node.quantity));
    }

    setCompositionQuantities(quantities);
    setInitializedForId(nomenclatureId);
  }, [bomTree, nomenclatureId, initializedForId, bomStructureLoading, bomTreeLoading]);

  const isPieceUnit = (unit?: string) => {
    const u = (unit || '').trim().toLowerCase();
    return u === 'шт' || u === 'штука' || u === 'штук' || u === 'pcs' || u === 'pc' || u.includes('шт');
  };

  const normalizeQuantityForUnit = (qty: number, unit?: string) => {
    if (!Number.isFinite(qty)) return 0;
    if (isPieceUnit(unit)) return Math.max(0, Math.round(qty));
    return Math.max(0, qty);
  };
  
  // Все номенклатурные позиции с информацией о вхождении в состав
  const compositionItems = useMemo(() => {
    const items = allNomenclatureData?.results || [];
    
    // Карта категорий (нужны sort_order + code)
    const categoryMap = new Map<string, CatalogCategory>(allowedCategories.map(c => [c.id, c]));
    
    // Добавляем информацию о вхождении в состав и категории
    const enrichedItems: CompositionItem[] = items
      .filter(item => item.id !== nomenclatureId) // Исключаем само изделие
      .map(item => {
        const category = categoryMap.get(item.catalog_category);
        return {
          child_item: item.id,
          child_item_name: item.name,
          child_item_unit: item.unit,
          child_category: item.catalog_category,
          child_category_name: item.catalog_category_name || category?.name || '',
          child_category_sort_order: category?.sort_order ?? 999,
          child_category_code: category?.code,
          quantity: compositionQuantities[item.id] || 0,
          isInComposition: !!compositionQuantities[item.id] && compositionQuantities[item.id] > 0,
        };
      })
      // Сортируем: сначала по sort_order категории, потом по коду внутри категории
      .sort((a, b) => {
        const sortDiff = (a.child_category_sort_order || 0) - (b.child_category_sort_order || 0);
        if (sortDiff !== 0) return sortDiff;
        return (a.child_item_name || '').localeCompare(b.child_item_name || '');
      });
    
    return enrichedItems;
  }, [allNomenclatureData, compositionQuantities, allowedCategories, nomenclatureId]);
  
  // Позиции в составе
  const itemsInComposition = useMemo(() => 
    compositionItems.filter(item => item.isInComposition),
    [compositionItems]
  );
  
  // Доступные позиции (не добавленные в состав) с фильтрацией
  const availableItems = useMemo(() => {
    // Сначала исключаем уже добавленные в состав
    let items = compositionItems.filter(item => !item.isInComposition);
    
    // Фильтрация по поиску
    if (searchText) {
      const search = searchText.toLowerCase();
      items = items.filter(item => 
        item.child_item_name?.toLowerCase().includes(search)
      );
    }
    
    // Фильтрация по выбранным категориям (мультивыбор)
    if (selectedCategoryFilters.length > 0) {
      items = items.filter(item => selectedCategoryFilters.includes(item.child_category || ''));
    }
    
    return items;
  }, [compositionItems, searchText, selectedCategoryFilters]);
  
  // Переключение фильтра по категории (кликабельный тег)
  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategoryFilters(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };
  
  // Сброс всех фильтров категорий
  const resetCategoryFilters = () => {
    setSelectedCategoryFilters([]);
  };
  
  // Уведомление родителя об изменениях
  useEffect(() => {
    onCompositionChange?.(itemsInComposition);
  }, [itemsInComposition, onCompositionChange]);
  
  // Проверка наличия изменений (есть ли что-то в составе)
  const hasChanges = () => {
    return Object.keys(compositionQuantities).length > 0;
  };
  
  // Мутация для создания/обновления BOM
  const saveBOMMutation = useMutation({
    mutationFn: async () => {
      if (!nomenclatureId) {
        throw new Error('Сначала сохраните номенклатурную позицию');
      }
      // root_category/child_category в BOM — legacy-строка, берём из code вида справочника
      const rootCategoryCode = nomenclatureItem?.catalog_category_detail?.code || categoryDetail?.code;
      if (!rootCategoryCode) {
        throw new Error('Не удалось определить code вида справочника для root_category');
      }

      let ensuredBom: BOMStructure | null = bomStructure ?? null;

      if (!ensuredBom) {
        ensuredBom = await bomApi.structures.create({
          root_item: nomenclatureId,
          root_category: rootCategoryCode,
          name: `BOM: ${nomenclatureItem?.name || 'Без названия'}`,
          description: '',
        } as Partial<BOMStructure>);
      }

      const ensuredBomId = ensuredBom.id;

      // Получаем текущие элементы BOM (плоско) — так надёжнее, чем парсить tree
      const current = await bomApi.items.list({ bom: ensuredBomId, page_size: 2000 });
      const currentItems = current.results || [];

      // Находим/создаём корневой узел (child_item = root_item, parent_item = null)
      let rootNode = currentItems.find((i) => !i.parent_item && i.child_item === nomenclatureId);
      if (!rootNode) {
        rootNode = await bomApi.items.create({
          bom: ensuredBomId,
          parent_item: null,
          child_item: nomenclatureId,
          child_category: rootCategoryCode,
          quantity: 1,
          unit: nomenclatureItem?.unit || 'шт',
          position: 0,
          notes: '',
        } as Partial<BOMItem>);
      }

      // Текущие компоненты 1-го уровня: parent_item = root_item
      const currentComponents = currentItems.filter((i) => i.parent_item === nomenclatureId);
      const currentByChild = new Map(currentComponents.map((i) => [i.child_item, i] as const));

      // Нормализуем желаемые количества (в т.ч. целые для шт)
      const desired = new Map(
        Object.entries(compositionQuantities)
          .map(([childId, qty]) => {
            const meta = compositionItems.find((ci) => ci.child_item === childId);
            return [childId, normalizeQuantityForUnit(qty, meta?.child_item_unit)] as const;
          })
          .filter(([, qty]) => qty > 0)
      );

      // Удаляем удалённые компоненты
      for (const item of currentComponents) {
        if (!desired.has(item.child_item)) {
          await bomApi.items.delete(item.id);
        }
      }

      // Создаём/обновляем компоненты
      for (const [childId, qty] of desired) {
        const meta = compositionItems.find((ci) => ci.child_item === childId);
        const childCategoryCode = meta?.child_category_code;
        if (!childCategoryCode) {
          throw new Error(`Не удалось определить code вида справочника для компонента ${meta?.child_item_name || childId}`);
        }

        const existing = currentByChild.get(childId);
        if (existing) {
          await bomApi.items.update(existing.id, {
            quantity: qty,
            unit: meta?.child_item_unit || existing.unit,
            child_category: childCategoryCode,
          } as Partial<BOMItem>);
        } else {
          await bomApi.items.create({
            bom: ensuredBomId,
            parent_item: nomenclatureId,
            child_item: childId,
            child_category: childCategoryCode,
            quantity: qty,
            unit: meta?.child_item_unit || 'шт',
            position: 0,
            notes: '',
          } as Partial<BOMItem>);
        }
      }

      return ensuredBomId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom-structure-for-item', nomenclatureId] });
      queryClient.invalidateQueries({ queryKey: ['bom-tree'] });
      queryClient.invalidateQueries({ queryKey: ['nomenclature'] });
      message.success('Состав изделия сохранён');
    },
    onError: (error) => {
      message.error(`Ошибка сохранения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });
  
  // Экспортируем методы через ref для императивного вызова из родителя
  useImperativeHandle(ref, () => ({
    saveComposition: async () => {
      if (!nomenclatureId) return null;
      // ВАЖНО: при нажатии "ОК" в модалке номенклатуры мы обязаны
      // сохранить изменения состава, включая сценарий "удалили всё".
      // Но если BOM ещё не существует и состав пустой — создавать пустой BOM не нужно.
      const hasAnyDesired = Object.keys(compositionQuantities).some((k) => (compositionQuantities[k] || 0) > 0);
      if (!bomStructure && !hasAnyDesired) return null;
      try {
        const bomId = await saveBOMMutation.mutateAsync();
        return bomId;
      } catch {
        return null;
      }
    },
    hasChanges,
  }), [nomenclatureId, compositionQuantities, bomStructure, saveBOMMutation]);
  
  // Изменение количества
  const handleQuantityChange = (childId: string, quantity: number | null) => {
    setCompositionQuantities(prev => ({
      ...prev,
      [childId]: quantity || 0,
    }));
  };
  
  // Удаление из состава
  const handleRemoveFromComposition = (childId: string) => {
    setCompositionQuantities(prev => {
      const updated = { ...prev };
      delete updated[childId];
      return updated;
    });
  };
  
  // Добавление в состав (установка количества 1)
  const handleAddToComposition = (childId: string) => {
    setCompositionQuantities(prev => ({
      ...prev,
      [childId]: 1,
    }));
  };

  const isLoading = categoryLoading || nomenclatureLoading || bomStructureLoading || bomTreeLoading;
  
  // Если нет номенклатуры - показываем предупреждение
  if (!nomenclatureId) {
    return (
      <Alert
        message="Сначала сохраните номенклатурную позицию"
        description="После сохранения основных данных вы сможете управлять составом изделия"
        type="warning"
        showIcon
      />
    );
  }
  
  // Если это закупаемая позиция - состав не применим
  if (nomenclatureItem?.is_purchased) {
    return (
      <Alert
        message="Состав не применим"
        description="Для закупаемых позиций состав изделия не определяется"
        type="info"
        showIcon
      />
    );
  }
  
  // Если нет допустимых дочерних категорий
  if (!isLoading && allowedCategories.length === 0) {
    return (
      <Alert
        message="Нет допустимых компонентов"
        description={
          <span>
            Для данного вида справочника не настроены допустимые дочерние категории.
            <br />
            Настройте <strong>allowed_children</strong> в разделе &quot;Настройки каталога&quot;.
          </span>
        }
        type="warning"
        showIcon
      />
    );
  }

  // Колонки: левая таблица "В составе" — наименование, вид, кол-во, ед., удалить
  const selectedColumns: ColumnsType<CompositionItem> = [
    { title: 'Наименование', dataIndex: 'child_item_name', key: 'name', ellipsis: true },
    {
      title: 'Вид',
      dataIndex: 'child_category_name',
      key: 'cat',
      width: 130,
      ellipsis: true,
      render: (name: string) => <Text type="secondary">{name}</Text>,
    },
    {
      title: 'Кол-во',
      key: 'qty',
      width: 90,
      render: (_, record) => {
        const precision = isPieceUnit(record.child_item_unit) ? 0 : 3;
        return readOnly ? (
          <span>{record.quantity}</span>
        ) : (
          <InputNumber
            min={0}
            step={1}
            precision={precision}
            value={record.quantity || undefined}
            onChange={(v) => handleQuantityChange(record.child_item, v)}
            size="small"
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      title: 'Ед.',
      dataIndex: 'child_item_unit',
      key: 'unit',
      width: 50,
      render: (u: string) => <Text type="secondary">{u}</Text>,
    },
    ...(!readOnly
      ? [
          {
            title: '',
            key: 'actions',
            width: 40,
            render: (_: unknown, record: CompositionItem) => (
              <Tooltip title="Удалить из состава">
                <Popconfirm 
                  title="Удалить из состава?" 
                  onConfirm={() => handleRemoveFromComposition(record.child_item)}
                  okText="Да"
                  cancelText="Нет"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  // Колонки: правая таблица "Доступные позиции" — наименование, вид, ед., добавить
  const availableColumns: ColumnsType<CompositionItem> = [
    { title: 'Наименование', dataIndex: 'child_item_name', key: 'name', ellipsis: true },
    {
      title: 'Вид',
      dataIndex: 'child_category_name',
      key: 'cat',
      width: 130,
      ellipsis: true,
      render: (name: string) => <Text type="secondary">{name}</Text>,
    },
    {
      title: 'Ед.',
      dataIndex: 'child_item_unit',
      key: 'unit',
      width: 50,
      render: (u: string) => <Text type="secondary">{u}</Text>,
    },
    ...(!readOnly
      ? [
          {
            title: '',
            key: 'actions',
            width: 40,
            render: (_: unknown, record: CompositionItem) => (
              <Tooltip title="Добавить в состав">
                <Button
                  type="text"
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => handleAddToComposition(record.child_item)}
                />
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      {/* Заголовок и кнопка сохранения */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Title level={5} style={{ margin: 0 }}>Состав изделия</Title>
          <Tag color="blue">В составе: {itemsInComposition.length}</Tag>
          <Tag>Доступно: {availableItems.length}</Tag>
        </Space>

        {!readOnly && (
          <Button type="primary" icon={<SaveOutlined />} onClick={() => saveBOMMutation.mutate()} loading={saveBOMMutation.isPending}>
            Сохранить
          </Button>
        )}
      </div>

      {/* Кликабельные теги категорий для фильтрации */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
        <Space size={[0, 8]} wrap style={{ width: '100%' }}>
          <Text type="secondary" style={{ marginRight: 8 }}>Фильтр по видам:</Text>
          {allowedCategories.map((cat) => {
            const isSelected = selectedCategoryFilters.includes(cat.id);
            return (
              <Tag
                key={cat.id}
                color={isSelected ? 'blue' : undefined}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleCategoryFilter(cat.id)}
              >
                {cat.name}
              </Tag>
            );
          })}
          {selectedCategoryFilters.length > 0 && (
            <Tooltip title="Сбросить фильтры">
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={resetCategoryFilters}
                style={{ marginLeft: 8 }}
              >
                Сбросить
              </Button>
            </Tooltip>
          )}
        </Space>
      </div>

      <Spin spinning={isLoading}>
        <Row gutter={12}>
          {/* Левая таблица: В составе */}
          <Col span={12}>
            <Card size="small" title="В составе" bodyStyle={{ padding: 8 }}>
              {itemsInComposition.length === 0 && !isLoading ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Состав пуст" />
              ) : (
                <Table
                  columns={selectedColumns}
                  dataSource={itemsInComposition}
                  rowKey="child_item"
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '30', '50'] }}
                  scroll={{ x: 'max-content' }}
                />
              )}
            </Card>
          </Col>

          {/* Правая таблица: Доступные позиции */}
          <Col span={12}>
            <Card
              size="small"
              title={
                <Space>
                  <span>Доступные позиции</span>
                  <Input
                    placeholder="Поиск по коду или названию..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    size="small"
                    style={{ width: 220 }}
                  />
                </Space>
              }
              bodyStyle={{ padding: 8 }}
            >
              {availableItems.length === 0 && !isLoading ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет доступных позиций" />
              ) : (
                <Table
                  columns={availableColumns}
                  dataSource={availableItems}
                  rowKey="child_item"
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '30', '50'] }}
                  scroll={{ x: 'max-content' }}
                />
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
});

export default CompositionEditor;