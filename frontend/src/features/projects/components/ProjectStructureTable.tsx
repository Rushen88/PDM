import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    MinusSquareOutlined,
    PauseCircleOutlined,
    PlusOutlined,
    PlusSquareOutlined,
    ShoppingCartOutlined,
    TeamOutlined,
    ToolOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    DatePicker,
    InputNumber,
    message,
    Modal,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { projectsApi, type ProjectItem } from '../api';

const { Text } = Typography;

interface EditableCell {
  itemId: string;
  field: string;
  value: unknown;
}

interface User {
  id: string;
  full_name: string;
}

interface Contractor {
  id: string;
  name: string;
  short_name?: string;
}

interface Supplier {
  id: string;
  name: string;
  short_name?: string;
}

interface TreeProjectItem extends ProjectItem {
  treeChildren: TreeProjectItem[];
  level: number;
  expanded?: boolean;
}

interface ProjectStructureTableProps {
  projectId: string;
  items: ProjectItem[];
  users: User[];
  contractors: Contractor[];
  suppliers: Supplier[];
  loading?: boolean;
  onRefetch: () => void;
  editMode?: boolean;
  onOpenItem?: (item: ProjectItem) => void;
}

/**
 * Build tree structure from flat items array
 */
function buildTree(items: ProjectItem[]): TreeProjectItem[] {
  const itemMap = new Map<string, TreeProjectItem>();
  const roots: TreeProjectItem[] = [];

  // Create map with children arrays
  items.forEach(item => {
    itemMap.set(item.id, { ...item, treeChildren: [], level: 0 });
  });

  // Build tree
  items.forEach(item => {
    const node = itemMap.get(item.id)!;
    if (item.parent_item) {
      const parent = itemMap.get(item.parent_item);
      if (parent) {
        parent.treeChildren.push(node);
      } else {
        // Parent not found in current dataset - treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  // Sort children by category_sort_order first, then by name alphabetically, and set levels
  const setLevels = (node: TreeProjectItem, level: number) => {
    node.level = level;
    // Sort by category_sort_order first (lower = higher priority), then by name alphabetically
    node.treeChildren.sort((a, b) => {
      const categoryOrderA = a.category_sort_order ?? 999;
      const categoryOrderB = b.category_sort_order ?? 999;
      if (categoryOrderA !== categoryOrderB) {
        return categoryOrderA - categoryOrderB;
      }
      // Within same category - sort alphabetically by name
      return a.name.localeCompare(b.name, 'ru');
    });
    node.treeChildren.forEach(child => setLevels(child, level + 1));
  };
  roots.forEach(root => setLevels(root, 0));
  // Sort roots the same way
  roots.sort((a, b) => {
    const categoryOrderA = a.category_sort_order ?? 999;
    const categoryOrderB = b.category_sort_order ?? 999;
    if (categoryOrderA !== categoryOrderB) {
      return categoryOrderA - categoryOrderB;
    }
    // Within same category - sort alphabetically by name
    return a.name.localeCompare(b.name, 'ru');
  });

  return roots;
}

/**
 * Flatten tree to array (respecting expand state)
 */
function flattenTree(
  nodes: TreeProjectItem[],
  expandedIds: Set<string>
): TreeProjectItem[] {
  const result: TreeProjectItem[] = [];
  
  const traverse = (node: TreeProjectItem) => {
    result.push({ ...node, expanded: expandedIds.has(node.id) });
    if (expandedIds.has(node.id)) {
      node.treeChildren.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  return result;
}

/**
 * Get all IDs in tree
 */
function getAllIds(nodes: TreeProjectItem[]): string[] {
  const ids: string[] = [];
  const traverse = (node: TreeProjectItem) => {
    ids.push(node.id);
    node.treeChildren.forEach(traverse);
  };
  nodes.forEach(traverse);
  return ids;
}

/**
 * Get IDs at specific level
 */
function getIdsByLevel(nodes: TreeProjectItem[], targetLevel: number): string[] {
  const ids: string[] = [];
  const traverse = (node: TreeProjectItem, level: number) => {
    if (level <= targetLevel) {
      ids.push(node.id);
    }
    if (level < targetLevel) {
      node.treeChildren.forEach(child => traverse(child, level + 1));
    }
  };
  nodes.forEach(node => traverse(node, 0));
  return ids;
}

/**
 * Get max level in tree
 */
function getMaxLevel(nodes: TreeProjectItem[]): number {
  let maxLevel = 0;
  const traverse = (node: TreeProjectItem, level: number) => {
    maxLevel = Math.max(maxLevel, level);
    node.treeChildren.forEach(child => traverse(child, level + 1));
  };
  nodes.forEach(node => traverse(node, 0));
  return maxLevel;
}

/**
 * Project Structure Table with inline editing
 */
export function ProjectStructureTable({
  projectId,
  items,
  users,
  contractors,
  suppliers,
  loading,
  onRefetch,
  editMode = false,
  onOpenItem,
}: ProjectStructureTableProps) {
  const queryClient = useQueryClient();
  const canEdit = editMode === true;
  
  // DEBUG: Log what we receive
  console.log('[ProjectStructureTable] ==== COMPONENT RENDER ====');
  console.log('[ProjectStructureTable] Props items count:', items.length);
  if (items.length > 0) {
    console.log('[ProjectStructureTable] First item:', {
      id: items[0].id,
      name: items[0].name,
      parent_item: items[0].parent_item,
    });
    const rootItems = items.filter(i => !i.parent_item);
    console.log('[ProjectStructureTable] Root items (parent_item=null):', rootItems.length);
    if (rootItems.length > 0) {
      const rootId = rootItems[0].id;
      const children = items.filter(i => i.parent_item === rootId);
      console.log('[ProjectStructureTable] Children of root:', children.length);
    }
  }
  
  // Build tree and track expanded nodes
  const tree = useMemo(() => buildTree(items), [items]);
  const rootIds = useMemo(() => tree.map(n => n.id), [tree]);
  
  console.log('[ProjectStructureTable] Before useState - rootIds:', rootIds.length, rootIds);
  
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // По умолчанию раскрываем только верхний уровень (как в ТЗ: дальше показываем "+")
    const initial = new Set(rootIds);
    console.log('[ProjectStructureTable] useState initializer - creating Set with', rootIds.length, 'items');
    return initial;
  });
  
  // Flatten tree for display
  const flatData = useMemo(
    () => {
      const result = flattenTree(tree, expandedIds);
      console.log('[ProjectStructureTable] flatData computed:', {
        treeRoots: tree.length,
        expandedCount: expandedIds.size,
        flatDataLength: result.length,
        firstFewNames: result.slice(0, 5).map(i => i.name),
      });
      return result;
    },
    [tree, expandedIds]
  );
  
  // Editing state
  const [editingCell, setEditingCell] = useState<EditableCell | null>(null);
  const editableCellStyle = {
    cursor: canEdit ? 'pointer' : 'default',
    padding: '0 4px',
    borderRadius: 4,
    minHeight: 14,
  } as const;

  // Add child modal state
  const [addChildModalOpen, setAddChildModalOpen] = useState(false);
  const [selectedParentItem, setSelectedParentItem] = useState<TreeProjectItem | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childQuantity, setChildQuantity] = useState<number>(1);
  const [childCategoryFilter, setChildCategoryFilter] = useState<string | null>(null);

  // Executor edit modal state
  const [executorModalOpen, setExecutorModalOpen] = useState(false);
  const [executorItem, setExecutorItem] = useState<TreeProjectItem | null>(null);
  const [executorType, setExecutorType] = useState<'internal' | 'contractor'>('internal');
  const [executorContractorId, setExecutorContractorId] = useState<string | null>(null);
  const [executorSupplyType, setExecutorSupplyType] = useState<'our_supply' | 'contractor_supply'>('our_supply');

  const { data: availableChildrenData, isLoading: availableChildrenLoading } = useQuery({
    queryKey: ['project-item-available-children', selectedParentItem?.id],
    queryFn: () => projectsApi.items.getAvailableChildren(selectedParentItem!.id),
    enabled: addChildModalOpen && !!selectedParentItem?.id,
  });

  const availableChildren = availableChildrenData?.items || [];
  const availableCategories = Array.from(
    new Map(
      availableChildren
        .filter(item => item.catalog_category && item.catalog_category_name)
        .map(item => [item.catalog_category as string, item.catalog_category_name as string])
    ).entries()
  ).map(([value, label]) => ({ value, label }));

  const filteredAvailableChildren = childCategoryFilter
    ? availableChildren.filter(item => item.catalog_category === childCategoryFilter)
    : availableChildren;
  
  // Update when items change
  useEffect(() => {
    const existingIds = new Set(getAllIds(tree));
    setExpandedIds(prev => {
      // Сохраняем только те раскрытия, которые ещё существуют.
      const next = new Set<string>();
      prev.forEach(id => {
        if (existingIds.has(id)) next.add(id);
      });

      // Если ничего не раскрыто (например, первый рендер после загрузки) — раскроем корни.
      if (next.size === 0) {
        rootIds.forEach(id => next.add(id));
      }

      return next;
    });
  }, [tree, rootIds]);

  // Toggle expand/collapse
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Expand/collapse all
  const expandAll = useCallback(() => {
    setExpandedIds(new Set(getAllIds(tree)));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Expand to specific level (like Excel)
  const expandToLevel = useCallback((level: number) => {
    setExpandedIds(new Set(getIdsByLevel(tree, level)));
  }, [tree]);

  // Get max tree level
  const maxLevel = useMemo(() => getMaxLevel(tree), [tree]);

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Partial<ProjectItem> }) =>
      projectsApi.items.update(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: any } };
      const data = err?.response?.data;
      if (data) {
        if (typeof data === 'string') {
          message.error(data);
          return;
        }
        const detail = data.error || data.detail || data.non_field_errors?.[0];
        if (detail) {
          message.error(detail);
          return;
        }
        const fieldErrors = Object.values(data).flat().filter(Boolean);
        if (fieldErrors.length > 0) {
          message.error(fieldErrors.join('; '));
          return;
        }
      }
      message.error('Ошибка сохранения');
    },
  });

  // Add child mutation
  const addChildMutation = useMutation({
    mutationFn: ({ parentId, nomenclatureId, quantity }: { parentId: string; nomenclatureId: string; quantity: number }) =>
      projectsApi.items.addChild(parentId, { nomenclature_item: nomenclatureId, quantity }),
    onSuccess: () => {
      message.success('Позиция добавлена');
      setAddChildModalOpen(false);
      setSelectedParentItem(null);
      setSelectedChildId(null);
      setChildQuantity(1);
      onRefetch();
    },
    onError: () => message.error('Ошибка добавления позиции'),
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => projectsApi.items.delete(itemId),
    onSuccess: () => {
      message.success('Позиция удалена');
      onRefetch();
    },
    onError: () => message.error('Ошибка удаления'),
  });

  // Set responsible cascade
  const setResponsibleMutation = useMutation({
    mutationFn: ({ itemId, responsibleId, cascade }: { itemId: string; responsibleId: string; cascade: boolean }) =>
      projectsApi.setResponsibleCascade(projectId, itemId, responsibleId, cascade),
    onSuccess: (data) => {
      message.success(`Ответственный назначен для ${data.updated_count} позиций`);
      onRefetch();
    },
    onError: () => message.error('Ошибка назначения'),
  });

  // Set contractor cascade
  const setContractorMutation = useMutation({
    mutationFn: ({ itemId, contractorId, materialSupplyType, cascade }: { 
      itemId: string; 
      contractorId: string; 
      materialSupplyType: 'our_supply' | 'contractor_supply';
      cascade: boolean 
    }) =>
      projectsApi.setContractor(projectId, itemId, contractorId, materialSupplyType, cascade),
    onSuccess: (data) => {
      message.success(`Подрядчик назначен для ${data.updated_count} позиций`);
      onRefetch();
    },
    onError: () => message.error('Ошибка назначения'),
  });

  // Set internal manufacturer cascade (Своими силами)
  const setInternalMutation = useMutation({
    mutationFn: ({ itemId, cascade }: { itemId: string; cascade: boolean }) =>
      projectsApi.setInternalManufacturer(projectId, itemId, cascade),
    onSuccess: (data) => {
      message.success(`Исполнитель "Своими силами" установлен для ${data.updated_count} позиций`);
      onRefetch();
    },
    onError: () => message.error('Ошибка установки исполнителя'),
  });

  // Cascade dates mutation
  const cascadeDatesMutation = useMutation({
    mutationFn: (itemId: string) =>
      projectsApi.cascadeDates(projectId, itemId),
    onSuccess: (data) => {
      message.success(data.message);
      onRefetch();
    },
    onError: () => message.error('Ошибка расчёта дат'),
  });

  // Handle cell edit start
  const startEdit = useCallback((itemId: string, field: string, value: unknown) => {
    if (!canEdit) return;
    setEditingCell({ itemId, field, value });
  }, [canEdit]);

  // Handle cell edit cancel
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Handle cell edit save
  const saveEdit = useCallback((itemId: string, field: string, value: unknown) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // For responsible with children - ask about cascade
    if (field === 'responsible' && item.children_count && item.children_count > 0) {
      Modal.confirm({
        title: 'Назначить ответственного',
        content: `Назначить этого ответственного на все дочерние элементы (${item.children_count} шт)?`,
        okText: 'Да, на все',
        cancelText: 'Только на этот',
        onOk: () => {
          setResponsibleMutation.mutate({
            itemId,
            responsibleId: value as string,
            cascade: true,
          });
        },
        onCancel: () => {
          setResponsibleMutation.mutate({
            itemId,
            responsibleId: value as string,
            cascade: false,
          });
        },
      });
      setEditingCell(null);
      return;
    }

    // For contractor with children - ask about cascade
    if (field === 'contractor' && item.children_count && item.children_count > 0) {
      Modal.confirm({
        title: 'Назначить подрядчика',
        content: `Назначить этого подрядчика на все дочерние элементы (${item.children_count} шт)?`,
        okText: 'Да, на все',
        cancelText: 'Только на этот',
        onOk: () => {
          setContractorMutation.mutate({
            itemId,
            contractorId: value as string,
            materialSupplyType: item.material_supply_type || 'our_supply',
            cascade: true,
          });
        },
        onCancel: () => {
          setContractorMutation.mutate({
            itemId,
            contractorId: value as string,
            materialSupplyType: item.material_supply_type || 'our_supply',
            cascade: false,
          });
        },
      });
      setEditingCell(null);
      return;
    }

    // For planned_start with children - ask about cascade dates
    if (field === 'planned_start' && value && item.children_count && item.children_count > 0) {
      if (item.planned_end && dayjs(value as dayjs.Dayjs).isAfter(dayjs(item.planned_end), 'day')) {
        message.error('План начала не может быть позже планового окончания');
        setEditingCell(null);
        return;
      }
      Modal.confirm({
        title: 'Рассчитать даты дочерних элементов?',
        content: (
          <div>
            <p>Автоматически рассчитать даты для дочерних элементов?</p>
            <ul style={{ fontSize: 12, color: '#666' }}>
              <li>Изготовление: дата окончания = дата начала родителя - 1 день</li>
              <li>Закупка: дата поставки с учётом срока поставщика</li>
            </ul>
          </div>
        ),
        okText: 'Да, рассчитать',
        cancelText: 'Нет, только этот элемент',
        onOk: () => {
          // First save the date
          const data: Partial<ProjectItem> = {
            planned_start: (value as dayjs.Dayjs).format('YYYY-MM-DD'),
          };
          updateItemMutation.mutate({ itemId, data }, {
            onSuccess: () => {
              // Then cascade
              cascadeDatesMutation.mutate(itemId);
            },
          });
        },
        onCancel: () => {
          // Just save the date
          const data: Partial<ProjectItem> = {
            planned_start: (value as dayjs.Dayjs).format('YYYY-MM-DD'),
          };
          updateItemMutation.mutate({ itemId, data });
        },
      });
      setEditingCell(null);
      return;
    }

    if (field === 'planned_start' && value && item.planned_end) {
      const startDate = dayjs(value as dayjs.Dayjs);
      const endDate = dayjs(item.planned_end);
      if (startDate.isAfter(endDate, 'day')) {
        message.error('План начала не может быть позже планового окончания');
        setEditingCell(null);
        return;
      }
    }

    // Validate dates: end/required cannot be before start
    if ((field === 'planned_end' || field === 'required_date') && value && item.planned_start) {
      const endDate = dayjs(value as dayjs.Dayjs);
      const startDate = dayjs(item.planned_start);
      if (endDate.isBefore(startDate, 'day')) {
        message.error('Дата окончания/срок поставки не может быть раньше даты начала');
        setEditingCell(null);
        return;
      }
    }

    // Regular save
    const data: Partial<ProjectItem> = {};
    if (field === 'planned_start' || field === 'planned_end' || field === 'required_date' || field === 'order_date') {
      (data as Record<string, string | null>)[field] = value ? (value as dayjs.Dayjs).format('YYYY-MM-DD') : null;
    } else {
      (data as Record<string, unknown>)[field] = value;
    }

    // Warn if child finishes after parent starts
    if ((field === 'planned_end' || field === 'required_date') && value && item.parent_item) {
      const parent = items.find(i => i.id === item.parent_item);
      if (parent?.planned_start) {
        const childDate = dayjs(value as dayjs.Dayjs);
        const parentStart = dayjs(parent.planned_start);
        if (childDate.isAfter(parentStart, 'day')) {
          message.warning(
            'Внимание: дочерняя позиция завершится после планового старта родительского изделия'
          );
        }
      }
    }

    updateItemMutation.mutate({ itemId, data });
    setEditingCell(null);
  }, [items, updateItemMutation, setResponsibleMutation, setContractorMutation, cascadeDatesMutation]);

  const openAddChildModal = useCallback((record: TreeProjectItem) => {
    if (!canEdit) return;
    setSelectedParentItem(record);
    setSelectedChildId(null);
    setChildQuantity(1);
    setChildCategoryFilter(null);
    setAddChildModalOpen(true);
  }, [canEdit]);

  const handleAddChild = useCallback(() => {
    if (!selectedParentItem || !selectedChildId) {
      message.warning('Выберите номенклатуру для добавления');
      return;
    }
    addChildMutation.mutate({
      parentId: selectedParentItem.id,
      nomenclatureId: selectedChildId,
      quantity: childQuantity,
    });
  }, [addChildMutation, childQuantity, selectedChildId, selectedParentItem]);

  const handleDeleteItem = useCallback((record: TreeProjectItem) => {
    if (!canEdit) return;
    const hasChildren = record.children_count && record.children_count > 0;
    Modal.confirm({
      title: 'Удалить позицию',
      content: hasChildren
        ? 'Эта позиция содержит дочерние элементы. Удалить вместе со всеми дочерними?' 
        : 'Удалить выбранную позицию?',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteItemMutation.mutate(record.id),
    });
  }, [canEdit, deleteItemMutation]);

  const openExecutorModal = useCallback((record: TreeProjectItem) => {
    if (!canEdit) return;
    setExecutorItem(record);
    setExecutorType(record.manufacturer_type || 'internal');
    setExecutorContractorId(record.contractor || null);
    setExecutorSupplyType(record.material_supply_type || 'our_supply');
    setExecutorModalOpen(true);
  }, [canEdit]);

  const handleSaveExecutor = useCallback(() => {
    if (!executorItem) return;

    if (executorType === 'contractor' && !executorContractorId) {
      message.warning('Выберите подрядчика');
      return;
    }

    if (executorType === 'contractor') {
      const executeSet = (cascade: boolean) => {
        setContractorMutation.mutate({
          itemId: executorItem.id,
          contractorId: executorContractorId as string,
          materialSupplyType: executorSupplyType,
          cascade,
        });
        setExecutorModalOpen(false);
      };

      if (executorItem.children_count && executorItem.children_count > 0) {
        Modal.confirm({
          title: 'Назначить подрядчика',
          content: `Назначить этого подрядчика на все дочерние элементы (${executorItem.children_count} шт)?`,
          okText: 'Да, на все',
          cancelText: 'Только на этот',
          onOk: () => executeSet(true),
          onCancel: () => executeSet(false),
        });
        return;
      }

      executeSet(false);
      return;
    }

    // Исполнитель "Своими силами" - используем специальный endpoint с каскадным обновлением
    const executeSetInternal = (cascade: boolean) => {
      setInternalMutation.mutate({
        itemId: executorItem.id,
        cascade,
      });
      setExecutorModalOpen(false);
    };

    // Если есть дочерние элементы - предлагаем каскадное обновление
    if (executorItem.children_count && executorItem.children_count > 0) {
      Modal.confirm({
        title: 'Изготовление своими силами',
        content: `Установить "Своими силами" на все дочерние элементы (${executorItem.children_count} шт)?`,
        okText: 'Да, на все',
        cancelText: 'Только на этот',
        onOk: () => executeSetInternal(true),
        onCancel: () => executeSetInternal(false),
      });
      return;
    }

    executeSetInternal(false);
  }, [executorContractorId, executorItem, executorSupplyType, executorType, setContractorMutation, setInternalMutation]);

  // Status icon helper
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'in_progress': return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'in_progress_by_contractor': return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'suspended':
      case 'suspended_by_contractor':
        return <PauseCircleOutlined style={{ color: '#faad14' }} />;
      case 'sent_to_contractor': return <ClockCircleOutlined style={{ color: '#8c8c8c' }} />;
      case 'manufactured_by_contractor': return <CheckCircleOutlined style={{ color: '#13c2c2' }} />;
      default: return <ClockCircleOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const manufacturingStatusOptions = [
    { value: 'not_started', label: 'Не начато' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'suspended', label: 'Приостановлено' },
    { value: 'completed', label: 'Изготовлено' },
  ];

  const contractorStatusOptions = [
    { value: 'sent_to_contractor', label: 'Передано подрядчику' },
    { value: 'in_progress_by_contractor', label: 'В работе подрядчиком' },
    { value: 'suspended_by_contractor', label: 'Приостановлено подрядчиком' },
    { value: 'manufactured_by_contractor', label: 'Изготовлено подрядчиком' },
    { value: 'completed', label: 'Изготовлено' },
  ];

  const purchaseStatusOptions = [
    { value: 'waiting_order', label: 'Ожидает заказа' },
    { value: 'in_order', label: 'В заказе' },
    { value: 'closed', label: 'На складе' },
    { value: 'written_off', label: 'Списано' },
  ];

  // Columns
  const columns: ColumnsType<TreeProjectItem> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      width: 310,
      fixed: 'left',
      render: (name, record, index) => {
        const hasChildren = record.treeChildren.length > 0;
        const indent = record.level * 20;
        const isPurchased = record.is_purchased === true;
        const isManufactured = !isPurchased;
        
        // DEBUG: Log first few records
        if (index < 5) {
          console.log(`[Column render] Row ${index}:`, {
            name: record.name,
            level: record.level,
            treeChildren: record.treeChildren.length,
            hasChildren,
            indent,
            parent_item: record.parent_item,
          });
        }
        
        return (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent, minHeight: 16 }}>
            {hasChildren ? (
              <Button
                type="text"
                size="small"
                icon={record.expanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(record.id);
                }}
                style={{ marginRight: 4, color: '#1890ff' }}
              />
            ) : (
              <span style={{ width: 28 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Button
                type="link"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenItem?.(record);
                }}
                className={`structure-name-link ${isPurchased ? 'structure-name-purchased' : 'structure-name-manufactured'}`}
                style={{
                  padding: 0,
                  height: 'auto',
                  fontSize: 12,
                  lineHeight: '12px',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {name}
              </Button>
              {record.is_overdue && (
                <Tooltip title="Просрочено">
                  <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                </Tooltip>
              )}
            </div>
            <Tag
              color={isManufactured ? 'green' : 'blue'}
              style={{ margin: 0, fontSize: 10, lineHeight: '14px' }}
            >
              {isPurchased ? 'ЗАКУП' : 'ИЗГОТ'}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Кол-во',
      key: 'quantity_group',
      children: [
        {
          title: '',
          dataIndex: 'quantity',
          key: 'quantity_value',
          width: 56,
          align: 'right',
          className: 'qty-cell',
          render: (qty, record) => {
            const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'quantity';

            if (isEditing) {
              return (
                <InputNumber
                  autoFocus
                  min={0.001}
                  step={1}
                  precision={3}
                  size="small"
                  style={{ width: '100%', textAlign: 'right' }}
                  defaultValue={Number(qty || 1)}
                  onBlur={cancelEdit}
                  onPressEnter={(e) => {
                    const value = (e.target as HTMLInputElement).value;
                    saveEdit(record.id, 'quantity', Number(value) || 1);
                  }}
                  onChange={(value) => {
                    if (value !== null) {
                      saveEdit(record.id, 'quantity', value);
                    }
                  }}
                />
              );
            }

            return (
              <div
                onClick={() => startEdit(record.id, 'quantity', qty)}
                style={{ ...editableCellStyle, textAlign: 'right' }}
                className={canEdit ? 'editable-cell' : 'readonly-cell'}
              >
                <Text>{qty}</Text>
              </div>
            );
          },
        },
        {
          title: '',
          key: 'quantity_unit',
          width: 18,
          align: 'right',
          className: 'qty-cell',
          render: (_, record) => (
            <div style={{ textAlign: 'right' }}>
              <Text style={{ fontSize: 11 }}>{record.unit || 'шт'}</Text>
            </div>
          ),
        },
      ],
    },
    {
      title: 'Статус',
      key: 'status',
      width: 180,
      render: (_, record) => {
        const isPurchased = record.is_purchased === true;
        const isContractor = record.manufacturer_type === 'contractor';

        if (isPurchased) {
          const isContractorPurchase = record.purchase_by_contractor === true;
          const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'purchase_status';
          if (isContractorPurchase) {
            return (
              <Tag color="purple">Не требуется (подрядчик)</Tag>
            );
          }
          if (isEditing) {
            return (
              <Select
                autoFocus
                defaultOpen
                size="small"
                style={{ width: '100%', minWidth: 150 }}
                popupMatchSelectWidth={false}
                defaultValue={record.purchase_status}
                options={purchaseStatusOptions}
                onBlur={cancelEdit}
                onChange={(value) => saveEdit(record.id, 'purchase_status', value)}
              />
            );
          }

          const colors: Record<string, string> = {
            waiting_order: 'orange',
            in_order: 'blue',
            closed: 'green',
            written_off: 'lime',
          };
          const label = record.purchase_status_display || record.purchase_status;
          return (
            <div
              onClick={() => startEdit(record.id, 'purchase_status', record.purchase_status)}
              style={editableCellStyle}
              className={canEdit ? 'editable-cell' : 'readonly-cell'}
            >
              <Tooltip title={label}>
                <Tag
                  color={colors[record.purchase_status] || 'default'}
                  style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {label}
                </Tag>
              </Tooltip>
            </div>
          );
        }

        const statusField = isContractor ? 'contractor_status' : 'manufacturing_status';
        const statusValue = isContractor ? record.contractor_status : record.manufacturing_status;
        const statusLabel = isContractor
          ? record.contractor_status_display || record.contractor_status
          : record.manufacturing_status_display || record.manufacturing_status;
        const options = isContractor ? contractorStatusOptions : manufacturingStatusOptions;

        const isEditing = editingCell?.itemId === record.id && editingCell?.field === statusField;
        if (isEditing) {
          return (
            <Select
              autoFocus
              defaultOpen
              size="small"
              style={{ width: '100%', minWidth: 150 }}
              popupMatchSelectWidth={false}
              defaultValue={statusValue}
              options={options}
              onBlur={cancelEdit}
              onChange={(value) => saveEdit(record.id, statusField, value)}
            />
          );
        }

        return (
          <div
            onClick={() => startEdit(record.id, statusField, statusValue)}
            style={editableCellStyle}
            className={canEdit ? 'editable-cell' : 'readonly-cell'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {getStatusIcon(statusValue || '')}
              <Tooltip title={statusLabel}>
                <Text ellipsis style={{ minWidth: 0, flex: 1 }}>
                  {statusLabel}
                </Text>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Исполнитель',
      key: 'executor',
      width: 180,
      render: (_, record) => {
        const isPurchased = record.is_purchased === true;
        
        if (isPurchased) {
          const isContractorPurchase = record.purchase_by_contractor === true;
          // Supplier select for purchased items
          const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'supplier';
          
          if (isContractorPurchase) {
            return (
              <Tag icon={<ShoppingCartOutlined />} color="purple">
                Закупает подрядчик
              </Tag>
            );
          }

          if (isEditing) {
            return (
              <Select
                autoFocus
                defaultOpen
                size="small"
                style={{ width: '100%' }}
                placeholder="Выберите поставщика"
                defaultValue={record.supplier || undefined}
                options={suppliers.map(s => ({ label: s.short_name || s.name, value: s.id }))}
                onBlur={cancelEdit}
                onChange={(value) => saveEdit(record.id, 'supplier', value)}
                allowClear
              />
            );
          }
          
          return (
            <div 
              onClick={() => startEdit(record.id, 'supplier', record.supplier)}
              style={editableCellStyle}
              className={canEdit ? 'editable-cell' : 'readonly-cell'}
            >
              {record.supplier_detail ? (
                <Tag icon={<ShoppingCartOutlined />} color="cyan">
                  {record.supplier_detail.short_name || record.supplier_detail.name}
                </Tag>
              ) : (
                <Text type="warning">Не указан</Text>
              )}
            </div>
          );
        }
        
        // Executor for manufactured items (internal/contractor)
        const isContractor = record.manufacturer_type === 'contractor';
        const label = isContractor
          ? (record.contractor_detail?.short_name || record.contractor_detail?.name || 'Подрядчик не выбран')
          : 'Своими силами';

        return (
          <div
            onClick={() => openExecutorModal(record)}
            style={editableCellStyle}
            className={canEdit ? 'editable-cell' : 'readonly-cell'}
          >
            {isContractor ? (
              <Tag icon={<TeamOutlined />} color="purple">{label}</Tag>
            ) : (
              <Tag icon={<ToolOutlined />} color="blue">{label}</Tag>
            )}
            {isContractor && (
              <div style={{ marginTop: 0, lineHeight: '12px' }}>
                <Text type="secondary" style={{ fontSize: 10, lineHeight: '12px' }}>
                  Снабжение: {record.material_supply_type === 'contractor_supply' ? 'подрядчик' : 'мы'}
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Ответственный',
      key: 'responsible',
      width: 200,
      render: (_, record) => {
        const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'responsible';
        
        if (isEditing) {
          return (
            <Select
              autoFocus
              defaultOpen
              size="small"
              style={{ width: '100%' }}
              placeholder="Выберите ответственного"
              defaultValue={record.responsible || undefined}
              options={users.map(u => ({ label: u.full_name, value: u.id }))}
              onBlur={cancelEdit}
              onChange={(value) => saveEdit(record.id, 'responsible', value)}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
              }
            />
          );
        }
        
        return (
          <div
            onClick={() => startEdit(record.id, 'responsible', record.responsible)}
            style={editableCellStyle}
            className={canEdit ? 'editable-cell' : 'readonly-cell'}
          >
            {record.responsible_detail ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: '12px' }}>
                <UserOutlined style={{ fontSize: 11 }} />
                <Text style={{ fontSize: 11, lineHeight: '12px' }}>
                  {record.responsible_detail.full_name}
                </Text>
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 11, lineHeight: '12px' }}>—</Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'План начала/ Заказать до',
      key: 'planned_start_or_order_date',
      width: 130,
      render: (_, record) => {
        const isPurchased = record.is_purchased === true;

        // Закупаемые позиции: показываем/редактируем "Заказать до" (order_date)
        if (isPurchased) {
          const isContractorPurchase = record.purchase_by_contractor === true;
          if (isContractorPurchase) {
            return <Text type="secondary">—</Text>;
          }

          const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'order_date';
          if (isEditing) {
            return (
              <DatePicker
                autoFocus
                open
                size="small"
                style={{ width: '100%' }}
                format="DD.MM.YYYY"
                defaultValue={record.order_date ? dayjs(record.order_date) : undefined}
                onOpenChange={(open) => {
                  if (!open) cancelEdit();
                }}
                onChange={(date) => saveEdit(record.id, 'order_date', date)}
              />
            );
          }

          return (
            <div
              onClick={() => startEdit(record.id, 'order_date', record.order_date ? dayjs(record.order_date) : null)}
              style={editableCellStyle}
              className={canEdit ? 'editable-cell' : 'readonly-cell'}
            >
              {record.order_date ? (
                <Text>{dayjs(record.order_date).format('DD.MM.YYYY')}</Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </div>
          );
        }

        // Изготавливаемые (включая подрядчика): показываем/редактируем planned_start
        const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'planned_start';
        if (isEditing) {
          return (
            <DatePicker
              autoFocus
              open
              size="small"
              style={{ width: '100%' }}
              format="DD.MM.YYYY"
              defaultValue={record.planned_start ? dayjs(record.planned_start) : undefined}
              onOpenChange={(open) => {
                if (!open) cancelEdit();
              }}
              onChange={(date) => saveEdit(record.id, 'planned_start', date)}
            />
          );
        }

        return (
          <div
            onClick={() => startEdit(record.id, 'planned_start', record.planned_start ? dayjs(record.planned_start) : null)}
            style={editableCellStyle}
            className={canEdit ? 'editable-cell' : 'readonly-cell'}
          >
            {record.planned_start ? (
              <Text>{dayjs(record.planned_start).format('DD.MM.YYYY')}</Text>
            ) : (
              <Text type="secondary">—</Text>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ lineHeight: '12px', display: 'inline-block' }}>
          План оконч./
          <br />
          Срок поставки
        </span>
      ),
      key: 'planned_end',
      width: 130,
      render: (_, record) => {
        const isEditing = editingCell?.itemId === record.id && editingCell?.field === 'planned_end';
        const isPurchased = record.is_purchased === true;
        
        // For purchased - show required_date
        if (isPurchased) {
          const isContractorPurchase = record.purchase_by_contractor === true;
          const isEditingRequired = editingCell?.itemId === record.id && editingCell?.field === 'required_date';
          
          if (isContractorPurchase) {
            return (
              <Text type="secondary">—</Text>
            );
          }

          if (isEditingRequired) {
            return (
              <DatePicker
                autoFocus
                open
                size="small"
                style={{ width: '100%' }}
                format="DD.MM.YYYY"
                defaultValue={record.required_date ? dayjs(record.required_date) : undefined}
                onOpenChange={(open) => {
                  if (!open) cancelEdit();
                }}
                onChange={(date) => saveEdit(record.id, 'required_date', date)}
              />
            );
          }
          
          return (
            <div 
              onClick={() => startEdit(record.id, 'required_date', record.required_date ? dayjs(record.required_date) : null)}
              style={editableCellStyle}
              className={canEdit ? 'editable-cell' : 'readonly-cell'}
            >
              {record.required_date ? (
                <Text>{dayjs(record.required_date).format('DD.MM.YYYY')}</Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </div>
          );
        }
        
        if (isEditing) {
          return (
            <DatePicker
              autoFocus
              open
              size="small"
              style={{ width: '100%' }}
              format="DD.MM.YYYY"
              defaultValue={record.planned_end ? dayjs(record.planned_end) : undefined}
              onOpenChange={(open) => {
                if (!open) cancelEdit();
              }}
              onChange={(date) => saveEdit(record.id, 'planned_end', date)}
            />
          );
        }
        
        return (
          <div 
            onClick={() => startEdit(record.id, 'planned_end', record.planned_end ? dayjs(record.planned_end) : null)}
            style={editableCellStyle}
            className={canEdit ? 'editable-cell' : 'readonly-cell'}
          >
            <Space>
              {record.planned_end ? (
                <Text type={record.is_overdue ? 'danger' : undefined}>
                  {dayjs(record.planned_end).format('DD.MM.YYYY')}
                </Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
              {record.is_overdue && <Tag color="red">!</Tag>}
            </Space>
          </div>
        );
      },
    },
  ];

  // Добавляем кнопки действий и Прогресс в начало таблицы после "Наименование"
  if (canEdit) {
    // Вставляем колонку действий после "Наименование" (на индекс 1)
    columns.splice(1, 0, {
      title: '',
      key: 'actions',
      width: 70,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Добавить в состав">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openAddChildModal(record)}
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteItem(record)}
            />
          </Tooltip>
        </Space>
      ),
    });
  }
  
  // Колонка Прогресс - отображается ВСЕГДА (вне режима редактирования тоже)
  // Вставляем после наименования или после кнопок если в режиме редактирования
  const progressColumn = {
    title: 'Прогресс',
    key: 'progress',
    width: 100,
    align: 'center' as const,
    render: (_: unknown, record: TreeProjectItem) => {
      // Используем calculated_progress (вычисляемый на backend)
      const percent = Math.round(Number(record.calculated_progress ?? record.progress_percent ?? 0));
      const color = percent >= 100 ? '#52c41a' : percent > 0 ? '#1890ff' : '#d9d9d9';
      
      return (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <div style={{ 
            width: 40, 
            height: 6, 
            backgroundColor: '#f0f0f0', 
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${percent}%`, 
              height: '100%', 
              backgroundColor: color,
              borderRadius: 3
            }} />
          </div>
          <Text style={{ fontSize: 11 }}>{percent}%</Text>
        </div>
      );
    },
  };
  
  // Вставляем колонку прогресса на позицию 2 (после наименования и кол-ва)
  columns.splice(2, 0, progressColumn);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Button size="small" onClick={expandAll}>
            <PlusSquareOutlined /> Развернуть все
          </Button>
          <Button size="small" onClick={collapseAll}>
            <MinusSquareOutlined /> Свернуть все
          </Button>
          {/* Level expansion buttons like Excel */}
          {maxLevel > 0 && (
            <>
              <span style={{ marginLeft: 8, color: '#666', fontSize: 12 }}>По уровням:</span>
              {Array.from({ length: maxLevel + 1 }, (_, i) => (
                <Tooltip key={i} title={`Раскрыть до уровня ${i + 1}`}>
                  <Button 
                    size="small" 
                    onClick={() => expandToLevel(i)}
                    style={{ minWidth: 28, padding: '0 6px' }}
                  >
                    {i + 1}
                  </Button>
                </Tooltip>
              ))}
            </>
          )}
        </Space>
        {canEdit && (
          <Space size={8}>
            <Tag color="green">Редактируемое поле</Tag>
            <Text type="secondary">Нажмите на подсвеченные ячейки для изменения</Text>
          </Space>
        )}
        <Text type="secondary">
          Всего: {items.length} позиций | Отображено: {flatData.length}
        </Text>
      </div>
      
      <style>{`
        .editable-cell {
          background-color: #f6ffed;
          border: 1px dashed #b7eb8f;
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        .editable-cell:hover {
          background-color: #e6f7ff;
          border-color: #91caff;
        }
        .readonly-cell {
          opacity: 0.6;
        }
        .readonly-cell:hover {
          background-color: transparent;
        }
        .ant-table-row-level-0 { background-color: #ffffff; }
        .ant-table-row-level-1 { background-color: #ffffff; }
        .ant-table-row-level-2 { background-color: #ffffff; }
        .project-structure-table .ant-table-thead > tr > th {
          padding: 1px 4px;
        }
        .project-structure-table .ant-table-tbody > tr > td {
          padding: 0 4px;
          background-color: inherit;
        }
        .project-structure-table .ant-table-cell {
          line-height: 9px;
        }
        .project-structure-table .structure-parent-expanded > td {
          background-color: rgb(251, 251, 251) !important;
        }
        .project-structure-table .ant-table-tbody > tr:hover > td {
          background-color: rgb(247, 247, 247) !important;
        }
        .project-structure-table .qty-cell {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .project-structure-table .structure-name-link {
          color: #2f6fb0;
        }
        .project-structure-table .structure-name-purchased {
          color: #2f6fb0;
        }
        .project-structure-table .structure-name-manufactured {
          color: #2e7d32;
        }
        .project-structure-table .structure-name-link:hover {
          color: #3b7fbe;
          text-decoration: underline;
        }
        .project-structure-table .structure-name-manufactured:hover {
          color: #388e3c;
        }
        .project-structure-table .structure-name-link:focus-visible {
          outline: 1px dashed #91caff;
          outline-offset: 2px;
        }
      `}</style>

      <Modal
        title="Добавить позицию в состав"
        open={addChildModalOpen}
        onCancel={() => setAddChildModalOpen(false)}
        onOk={handleAddChild}
        okText="Добавить"
        cancelText="Отмена"
        confirmLoading={addChildMutation.isPending}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">
            Родитель: {selectedParentItem?.name}
          </Text>
          <Select
            placeholder="Фильтр по виду справочника"
            allowClear
            style={{ width: '100%' }}
            options={availableCategories}
            value={childCategoryFilter || undefined}
            onChange={(value) => setChildCategoryFilter(value || null)}
          />
          <Select
            placeholder={availableChildrenLoading ? 'Загрузка...' : 'Выберите номенклатуру'}
            loading={availableChildrenLoading}
            style={{ width: '100%' }}
            options={filteredAvailableChildren.map(item => ({
              label: item.name,
              value: item.id,
            }))}
            value={selectedChildId || undefined}
            onChange={(value) => setSelectedChildId(value)}
            showSearch
            filterOption={(input, option) =>
              (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent="Нет доступных позиций по правилам справочников"
          />
          <InputNumber
            min={0.001}
            step={1}
            precision={3}
            value={childQuantity}
            onChange={(value) => setChildQuantity(Number(value || 1))}
            style={{ width: '100%' }}
            placeholder="Количество"
          />
        </Space>
      </Modal>

      <Modal
        title="Исполнитель"
        open={executorModalOpen}
        onCancel={() => setExecutorModalOpen(false)}
        onOk={handleSaveExecutor}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={updateItemMutation.isPending}
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">Позиция: {executorItem?.name}</Text>
          <Select
            style={{ width: '100%' }}
            value={executorType}
            onChange={(value) => setExecutorType(value)}
            options={[
              { value: 'internal', label: 'Своими силами' },
              { value: 'contractor', label: 'Подрядчик' },
            ]}
          />
          {executorType === 'contractor' && (
            <>
              <Select
                placeholder="Выберите подрядчика"
                style={{ width: '100%' }}
                value={executorContractorId || undefined}
                onChange={(value) => setExecutorContractorId(value)}
                options={contractors.map(c => ({ label: c.short_name || c.name, value: c.id }))}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
                }
              />
              <Select
                style={{ width: '100%' }}
                value={executorSupplyType}
                onChange={(value) => setExecutorSupplyType(value)}
                options={[
                  { value: 'our_supply', label: 'Материалы и комплектующие закупаем мы' },
                  { value: 'contractor_supply', label: 'Материалы и комплектующие закупает подрядчик' },
                ]}
              />
            </>
          )}
        </Space>
      </Modal>
      
      <Table
        columns={columns}
        dataSource={flatData}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: 1200, y: 'calc(100vh - 350px)' }}
        rowClassName={(record) => {
          const levelClass = `ant-table-row-level-${record.level % 3}`;
          const parentClass = record.expanded ? 'structure-parent-expanded' : '';
          return `${levelClass} ${parentClass}`.trim();
        }}
        className="project-structure-table"
      />
    </div>
  );
}
