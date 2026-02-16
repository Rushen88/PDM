/**
 * Workplace Structure Table
 * 
 * Tree view of items where user is responsible.
 * Features:
 * - Hierarchical tree display
 * - Customizable columns (user settings saved)
 * - Column ordering and visibility
 * - Progress, status, responsible display
 * - Problem indicators with tooltips
 */

import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    HolderOutlined,
    MinusSquareOutlined,
    PauseCircleOutlined,
    PlusSquareOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import {
    Button,
    Checkbox,
    Dropdown,
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

import type { ProjectItem } from '../../../features/projects/api';
import type { WorkplaceProject } from '../../../features/workplace';

const { Text } = Typography;

/**
 * Column definition with metadata for settings
 */
interface ColumnConfig {
  key: string;
  title: string;
  dataIndex?: string | string[];
  width?: number;
  fixed?: 'left' | 'right';
  defaultVisible?: boolean;
  sortOrder?: number;
}

/**
 * Default column configurations
 * Name is first, then item_number
 */
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'name', title: 'Наименование', width: 320, fixed: 'left', defaultVisible: true, sortOrder: 0 },
  { key: 'item_number', title: 'ID', width: 90, fixed: 'left', defaultVisible: true, sortOrder: 1 },
  { key: 'progress', title: 'Прогресс', width: 80, defaultVisible: true, sortOrder: 2 },
  { key: 'project', title: 'Проект', width: 150, defaultVisible: true, sortOrder: 3 },
  { key: 'status', title: 'Статус', width: 180, defaultVisible: true, sortOrder: 4 },
  { key: 'responsible', title: 'Ответственный', width: 140, defaultVisible: true, sortOrder: 5 },
  { key: 'executor', title: 'Исполнитель', width: 180, defaultVisible: true, sortOrder: 6 },
  { key: 'planned_start', title: 'План.начало / Заказ', width: 120, defaultVisible: true, sortOrder: 7 },
  { key: 'planned_end', title: 'План.окончание / Поставка', width: 130, defaultVisible: true, sortOrder: 8 },
  { key: 'actual_start', title: 'Факт.начало / Заказ', width: 120, defaultVisible: false, sortOrder: 9 },
  { key: 'actual_end', title: 'Факт.окончание / Поставка', width: 130, defaultVisible: false, sortOrder: 10 },
];

const STORAGE_KEY = 'workplace-structure-columns';

/**
 * Helper to build tree structure from flat items
 */
interface TreeItem extends ProjectItem {
  children?: TreeItem[];
  level: number;
}

function buildTree(items: ProjectItem[]): TreeItem[] {
  const itemMap = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  // First pass: create all items
  items.forEach(item => {
    itemMap.set(String(item.id), { ...item, children: [], level: 0 });
  });

  // Second pass: build tree relations
  items.forEach(item => {
    const treeItem = itemMap.get(String(item.id))!;
    const parentId = item.parent_item ? String(item.parent_item) : null;
    if (parentId) {
      const parent = itemMap.get(parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(treeItem);
      } else {
        roots.push(treeItem);
      }
    } else {
      roots.push(treeItem);
    }
  });

  // Sort children by category_sort_order then name (matching ProjectStructureTable)
  const sortChildren = (nodes: TreeItem[]) => {
    nodes.sort((a, b) => {
      const orderA = a.category_sort_order ?? 999;
      const orderB = b.category_sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, 'ru');
    });
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortChildren(node.children);
      }
    });
  };

  // Assign levels
  const assignLevels = (nodes: TreeItem[], level: number) => {
    nodes.forEach(n => {
      n.level = level;
      if (n.children && n.children.length > 0) {
        assignLevels(n.children, level + 1);
      }
    });
  };
  sortChildren(roots);
  assignLevels(roots, 0);

  return roots;
}

/**
 * Flatten tree using expanded keys (like ProjectStructureTable)
 */
function flattenTree(nodes: TreeItem[], expanded: Set<string>): TreeItem[] {
  const result: TreeItem[] = [];
  const traverse = (node: TreeItem) => {
    result.push(node);
    if (node.children && node.children.length > 0 && expanded.has(node.id)) {
      node.children.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return result;
}

/**
 * Get all IDs from tree
 */
function getAllIds(nodes: TreeItem[]): string[] {
  const ids: string[] = [];
  const traverse = (node: TreeItem) => {
    ids.push(node.id);
    node.children?.forEach(traverse);
  };
  nodes.forEach(traverse);
  return ids;
}

/**
 * Get IDs at specific level (for expand to level)
 */
function getIdsByLevel(nodes: TreeItem[], targetLevel: number): string[] {
  const ids: string[] = [];
  const traverse = (node: TreeItem, level: number) => {
    if (level <= targetLevel && node.children && node.children.length > 0) {
      ids.push(node.id);
    }
    if (level < targetLevel) {
      node.children?.forEach(child => traverse(child, level + 1));
    }
  };
  nodes.forEach(node => traverse(node, 0));
  return ids;
}

/**
 * Get max level in tree
 */
function getMaxLevel(nodes: TreeItem[]): number {
  let maxLevel = 0;
  const traverse = (node: TreeItem, level: number) => {
    maxLevel = Math.max(maxLevel, level);
    node.children?.forEach(child => traverse(child, level + 1));
  };
  nodes.forEach(node => traverse(node, 0));
  return maxLevel;
}

interface WorkplaceStructureTableProps {
  items: ProjectItem[];
  loading?: boolean;
  projects: WorkplaceProject[];
  selectedProject?: string;
  onProjectChange: (projectId: string | undefined) => void;
  onOpenItem?: (item: ProjectItem) => void;
  onRefetch?: () => void;
}

export function WorkplaceStructureTable({
  items,
  loading,
  projects,
  selectedProject,
  onProjectChange,
  onOpenItem,
  onRefetch,
}: WorkplaceStructureTableProps) {
  // Column settings state
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        setVisibleColumns(new Set(settings.visible || []));
        setColumnOrder(settings.order || []);
      } else {
        // Default settings
        setVisibleColumns(new Set(DEFAULT_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
        setColumnOrder(DEFAULT_COLUMNS.map(c => c.key));
      }
    } catch {
      setVisibleColumns(new Set(DEFAULT_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));
      setColumnOrder(DEFAULT_COLUMNS.map(c => c.key));
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((visible: Set<string>, order: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        visible: Array.from(visible),
        order,
      }));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleColumn = (key: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
    saveSettings(newVisible, columnOrder);
  };

  // Drag and drop handlers for column reordering
  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedColumn(key);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetKey) {
      setDraggedColumn(null);
      return;
    }

    const newOrder = [...columnOrder];
    const dragIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetKey);

    if (dragIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(dragIndex, 1);
      newOrder.splice(targetIndex, 0, draggedColumn);
      setColumnOrder(newOrder);
      saveSettings(visibleColumns, newOrder);
    }
    setDraggedColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  // Build tree from items
  const treeData = useMemo(() => buildTree(items), [items]);
  const expandedSet = useMemo(() => new Set(expandedRowKeys), [expandedRowKeys]);
  const flatData = useMemo(() => flattenTree(treeData, expandedSet), [treeData, expandedSet]);

  // Get max level for level expansion controls
  const maxLevel = useMemo(() => getMaxLevel(treeData), [treeData]);

  // Initialize expanded keys when items change - expand all by default
  useEffect(() => {
    if (items.length > 0 && expandedRowKeys.length === 0) {
      setExpandedRowKeys(getAllIds(treeData));
    }
  }, [items, treeData]);

  // Expand/collapse functions
  const expandAll = useCallback(() => {
    setExpandedRowKeys(getAllIds(treeData));
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpandedRowKeys([]);
  }, []);

  const expandToLevel = useCallback((level: number) => {
    setExpandedRowKeys(getIdsByLevel(treeData, level));
  }, [treeData]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return Array.from(next);
    });
  }, []);

  // Format helpers
  const formatItemNumber = (num?: number | null) => 
    num ? String(num).padStart(7, '0') : '—';

  const formatUserShort = (fullName?: string | null) => {
    if (!fullName) return '—';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const lastName = parts[0];
    const initials = parts.slice(1).map(p => `${p[0]}.`).join('');
    return `${lastName} ${initials}`.trim();
  };

  // Status icon helper (matching ProjectStructureTable)
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

  // Get status display for item
  const getStatusTag = (item: ProjectItem) => {
    const isPurchased = item.is_purchased;
    
    if (isPurchased) {
      const colors: Record<string, string> = {
        waiting_order: 'orange',
        in_order: 'blue',
        closed: 'green',
        written_off: 'lime',
      };
      return (
        <Tag color={colors[item.purchase_status] || 'default'}>
          {item.purchase_status_display || item.purchase_status}
        </Tag>
      );
    }

    const isContractor = item.manufacturer_type === 'contractor';
    const statusValue = isContractor ? item.contractor_status : item.manufacturing_status;
    const statusLabel = isContractor
      ? item.contractor_status_display || item.contractor_status
      : item.manufacturing_status_display || item.manufacturing_status;

    return (
      <Space size={4}>
        {getStatusIcon(statusValue || '')}
        <Text>{statusLabel}</Text>
      </Space>
    );
  };

  // Build columns based on settings
  const columns: ColumnsType<TreeItem> = useMemo(() => {
    const orderedConfigs = columnOrder
      .map(key => DEFAULT_COLUMNS.find(c => c.key === key))
      .filter((c): c is ColumnConfig => c !== undefined && visibleColumns.has(c.key));

    return orderedConfigs.map(config => {
      switch (config.key) {
        case 'item_number':
          return {
            title: config.title,
            dataIndex: 'item_number',
            key: config.key,
            width: config.width,
            fixed: config.fixed,
            render: (val: number) => <Text code>{formatItemNumber(val)}</Text>,
          };

        case 'name':
          return {
            title: config.title,
            dataIndex: 'name',
            key: config.key,
            width: config.width,
            fixed: config.fixed,
            render: (name: string, record: TreeItem) => {
              const isPurchased = record.is_purchased;
              const deviationReason = (() => {
                const reason = isPurchased
                  ? record.purchase_problem_reason_detail?.name
                  : record.manufacturing_problem_reason_detail?.name;
                const subreason = isPurchased
                  ? record.purchase_problem_subreason_detail?.name
                  : record.manufacturing_problem_subreason_detail?.name;

                if (reason && subreason) return `${reason} / ${subreason}`;
                if (reason) return reason;
                return (
                  record.delay_reason_detail?.name ||
                  record.delay_reason ||
                  null
                );
              })();
              const deviationNotes = (record.delay_notes || '').trim();
              const hasProblem = Boolean(record.has_problem || deviationReason || deviationNotes);
              
              const hasChildren = record.children && record.children.length > 0;
              const isExpanded = expandedRowKeys.includes(record.id);
              const safeLevel = Number.isFinite(record.level) ? record.level : 0;
              const indent = safeLevel * 20;

              return (
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent, minHeight: 16 }}>
                  {hasChildren ? (
                    <Button
                      type="text"
                      size="small"
                      icon={isExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
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
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {name}
                    </Button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                      {hasProblem && (
                        <Tooltip
                          title={
                            <div>
                              {record.problem_reason_detail?.name && <div><b>Проблема:</b> {record.problem_reason_detail.name}</div>}
                              {record.problem_notes && <div><b>Комментарий:</b> {record.problem_notes}</div>}
                              {deviationReason && <div><b>Проблема/отклонение:</b> {deviationReason}</div>}
                              {deviationNotes && <div><b>Комментарий:</b> {deviationNotes}</div>}
                            </div>
                          }
                        >
                          <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                        </Tooltip>
                      )}
                      <Tag
                        color={isPurchased ? 'blue' : 'green'}
                        style={{ margin: 0, fontSize: 10, lineHeight: '14px' }}
                      >
                        {isPurchased ? 'ЗАКУП' : 'ИЗГОТ'}
                      </Tag>
                    </div>
                  </div>
                </div>
              );
            },
          };

        case 'progress':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            align: 'center' as const,
            render: (_: unknown, record: TreeItem) => {
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

        case 'project':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              const proj = projects.find(p => p.id === record.project);
              return proj?.name || '—';
            },
          };

        case 'status':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => getStatusTag(record),
          };

        case 'responsible':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              const fullName = record.responsible_detail?.full_name;
              const shortName = formatUserShort(fullName);
              return fullName ? (
                <Tooltip title={fullName}>
                  <span>{shortName}</span>
                </Tooltip>
              ) : '—';
            },
          };

        case 'executor':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            ellipsis: true,
            render: (_: unknown, record: TreeItem) => {
              if (record.is_purchased) return '—';
              if (record.manufacturer_type === 'contractor') {
                const name = record.contractor_detail?.name || 'Подрядчик';
                return (
                  <Tooltip title={name}>
                    <span style={{ 
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {name}
                    </span>
                  </Tooltip>
                );
              }
              return 'Своими силами';
            },
          };

        case 'planned_start':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              const date = record.is_purchased ? record.order_date : record.planned_start;
              if (!date) return <Text type="secondary">—</Text>;
              // Check if start is overdue (not started but past planned start)
              const isOverdue = dayjs(date).isBefore(dayjs(), 'day') && !record.actual_start;
              return <Text type={isOverdue ? 'danger' : undefined}>{dayjs(date).format('DD.MM.YY')}</Text>;
            },
          };

        case 'planned_end':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              const date = record.is_purchased ? record.required_date : record.planned_end;
              if (!date) return <Text type="secondary">—</Text>;
              // Check if item is overdue (flag or past end date)
              const isOverdue = record.is_overdue || (dayjs(date).isBefore(dayjs(), 'day') && !record.actual_end);
              return <Text type={isOverdue ? 'danger' : undefined}>{dayjs(date).format('DD.MM.YY')}</Text>;
            },
          };

        case 'actual_start':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              // For purchased items, actual_start means order was placed (check purchase_order_id)
              const date = record.is_purchased 
                ? (record.purchase_order_id ? record.actual_start : null)
                : record.actual_start;
              if (!date) return <Text type="secondary">—</Text>;
              return <Text type="success">{dayjs(date).format('DD.MM.YY')}</Text>;
            },
          };

        case 'actual_end':
          return {
            title: config.title,
            key: config.key,
            width: config.width,
            render: (_: unknown, record: TreeItem) => {
              const date = record.actual_end;
              if (!date) return <Text type="secondary">—</Text>;
              return <Text type="success">{dayjs(date).format('DD.MM.YY')}</Text>;
            },
          };

        default:
          return {
            title: config.title,
            key: config.key,
            width: config.width,
          };
      }
    });
  }, [columnOrder, visibleColumns, projects, onOpenItem, expandedRowKeys, toggleExpand]);

  // Column settings dropdown content with drag-and-drop reordering
  const settingsMenu = (
    <div style={{ padding: 12, minWidth: 280, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Настройка столбцов</div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
        Перетащите для изменения порядка
      </div>
      {columnOrder.map(key => {
        const col = DEFAULT_COLUMNS.find(c => c.key === key);
        if (!col) return null;
        return (
          <div 
            key={col.key} 
            draggable
            onDragStart={(e) => handleDragStart(e, col.key)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.key)}
            onDragEnd={handleDragEnd}
            style={{ 
              padding: '6px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 4,
              backgroundColor: draggedColumn === col.key ? '#e6f7ff' : undefined,
              cursor: 'grab',
              transition: 'background-color 0.2s',
            }}
          >
            <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />
            <Checkbox
              checked={visibleColumns.has(col.key)}
              onChange={() => toggleColumn(col.key)}
              disabled={col.key === 'name'} // Name is always visible
              style={{ flex: 1 }}
            >
              {col.title}
            </Checkbox>
          </div>
        );
      })}
      <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
        <Button 
          size="small" 
          onClick={() => {
            const defaults = new Set(DEFAULT_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
            const order = DEFAULT_COLUMNS.map(c => c.key);
            setVisibleColumns(defaults);
            setColumnOrder(order);
            saveSettings(defaults, order);
          }}
        >
          Сбросить
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Select
            placeholder="Все проекты"
            allowClear
            style={{ width: 250 }}
            value={selectedProject}
            onChange={onProjectChange}
            options={projects.map(p => ({ value: p.id, label: p.name }))}
          />
          <Button size="small" onClick={expandAll}>
            <PlusSquareOutlined /> Развернуть все
          </Button>
          <Button size="small" onClick={collapseAll}>
            <MinusSquareOutlined /> Свернуть все
          </Button>
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

        <Space>
          <Dropdown
            trigger={['click']}
            dropdownRender={() => settingsMenu}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          >
            <Button icon={<SettingOutlined />}>
              Столбцы
            </Button>
          </Dropdown>
          <Button onClick={onRefetch}>
            Обновить
          </Button>
          <Text type="secondary">
            Всего: {items.length}
          </Text>
        </Space>
      </div>

      {/* Table */}
      <Table<TreeItem>
        className="project-structure-table"
        columns={columns}
        dataSource={flatData}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ x: 'max-content', y: 'calc(100vh - 350px)' }}
      />

      <style>{`
        .project-structure-table .ant-table-thead > tr > th {
          padding: 6px 6px;
          white-space: nowrap;
          line-height: 14px;
        }
        .project-structure-table .ant-table-tbody > tr > td {
          padding: 0 4px;
          background-color: inherit;
        }
        .project-structure-table .ant-table-cell {
          line-height: 12px;
        }
        .project-structure-table .ant-table-row-indent,
        .project-structure-table .ant-table-row-expand-icon {
          display: none !important;
          width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .project-structure-table .tree-expand-icon,
        .project-structure-table .tree-expand-placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 18px;
          margin-right: 4px;
          color: #1890ff;
        }
        .project-structure-table .ant-table-tbody > tr:hover > td {
          background-color: rgb(247, 247, 247) !important;
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
    </div>
  );
}
