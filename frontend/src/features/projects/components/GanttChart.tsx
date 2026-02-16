import {
    CheckCircleFilled,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleFilled,
    MinusCircleOutlined,
    MinusSquareOutlined,
    PauseCircleOutlined,
    PlusSquareOutlined,
    ShopOutlined,
    WarningOutlined,
    ZoomInOutlined,
    ZoomOutOutlined
} from '@ant-design/icons';
import {
    Button,
    Card,
    Empty,
    Radio,
    Slider,
    Space,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProjectItem } from '../api';

const { Text } = Typography;

interface GanttChartProps {
  items: ProjectItem[];
  loading?: boolean;
  onOpenItem?: (item: ProjectItem) => void;
}

type ViewMode = 'planned' | 'actual' | 'both';
type ZoomLevel = 'months' | 'weeks' | 'days';

type Severity = 'ok' | 'risk' | 'deviation' | 'overdue' | 'paused' | 'done' | 'in_progress' | 'not_started';

type VisualRowState = {
  severity: Severity;
  isContractor: boolean;
  showActualBar: boolean;
  plannedBarStyle: React.CSSProperties | null;
  actualBarStyle: React.CSSProperties | null;
  progressOverlayStyle: React.CSSProperties | null;
  rowBackground?: string;
  icons: Array<{ key: string; icon: React.ReactNode; tooltip: React.ReactNode }>;
  tooltip: React.ReactNode;
};

// Helper to build tree structure
interface TreeItem extends ProjectItem {
  children: TreeItem[];
  level: number;
  hasChildren: boolean;
}

function buildTree(items: ProjectItem[]): TreeItem[] {
  const itemMap = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  // First pass: create all items
  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [], level: 0, hasChildren: false });
  });

  const sortKey = (it: ProjectItem) => {
    const categoryOrder = typeof it.category_sort_order === 'number' ? it.category_sort_order : 9999;
    const purchasedOrder = it.is_purchased ? 1 : 0; // закупаемые вниз
    const positionOrder = typeof it.position === 'number' ? it.position : 999999;
    const name = (it.name || '').toLowerCase();
    return { categoryOrder, purchasedOrder, positionOrder, name };
  };

  const compareItems = (a: ProjectItem, b: ProjectItem) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka.categoryOrder !== kb.categoryOrder) return ka.categoryOrder - kb.categoryOrder;
    if (ka.purchasedOrder !== kb.purchasedOrder) return ka.purchasedOrder - kb.purchasedOrder;
    if (ka.positionOrder !== kb.positionOrder) return ka.positionOrder - kb.positionOrder;
    if (ka.name < kb.name) return -1;
    if (ka.name > kb.name) return 1;
    return 0;
  };

  // Second pass: build tree relations (levels will be assigned by traversal)
  items.forEach(item => {
    const treeItem = itemMap.get(item.id)!;
    if (item.parent_item) {
      const parent = itemMap.get(item.parent_item);
      if (parent) {
        parent.children.push(treeItem);
        parent.hasChildren = true;
      } else {
        roots.push(treeItem);
      }
    } else {
      roots.push(treeItem);
    }
  });

  const assignLevelsAndSort = (nodes: TreeItem[], level: number) => {
    nodes.sort(compareItems);
    nodes.forEach(n => {
      n.level = level;
      if (n.children.length > 0) {
        assignLevelsAndSort(n.children, level + 1);
      }
      n.hasChildren = n.children.length > 0;
    });
  };

  assignLevelsAndSort(roots, 0);
  return roots;
}

// Flatten tree to array preserving hierarchy order, respecting collapsed state
function flattenTree(nodes: TreeItem[], collapsed: Set<string>): TreeItem[] {
  const result: TreeItem[] = [];
  
  function traverse(items: TreeItem[]) {
    items.forEach(item => {
      result.push(item);
      if (item.children.length > 0 && !collapsed.has(item.id)) {
        traverse(item.children);
      }
    });
  }
  
  traverse(nodes);
  return result;
}

// Calculate date range for the chart
function getDateRange(items: ProjectItem[]): { start: dayjs.Dayjs; end: dayjs.Dayjs } {
  let minDate: dayjs.Dayjs | null = null;
  let maxDate: dayjs.Dayjs | null = null;

  items.forEach(item => {
    const dates = [
      item.planned_start,
      item.planned_end,
      item.actual_start,
      item.actual_end,
      item.order_date,
      item.required_date,
    ].filter(Boolean);

    dates.forEach(d => {
      const date = dayjs(d);
      if (!minDate || date.isBefore(minDate)) minDate = date;
      if (!maxDate || date.isAfter(maxDate)) maxDate = date;
    });
  });

  // Default to current month if no dates
  if (!minDate) minDate = dayjs().startOf('month');
  if (!maxDate) maxDate = dayjs().endOf('month').add(1, 'month');

  // Add padding
  return {
    start: minDate.subtract(7, 'day'),
    end: maxDate.add(7, 'day'),
  };
}

export default function GanttChart({ items, onOpenItem }: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'both';
    const raw = localStorage.getItem('workplace-gantt-settings');
    if (!raw) return 'both';
    try {
      const parsed = JSON.parse(raw);
      return parsed.viewMode || 'both';
    } catch {
      return 'both';
    }
  });
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const raw = localStorage.getItem('workplace-gantt-settings');
    if (!raw) return 100;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed.zoom === 'number' ? parsed.zoom : 100;
    } catch {
      return 100;
    }
  });
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(() => {
    if (typeof window === 'undefined') return 'months';
    const raw = localStorage.getItem('workplace-gantt-settings');
    if (!raw) return 'months';
    try {
      const parsed = JSON.parse(raw);
      return parsed.zoomLevel || 'months';
    } catch {
      return 'months';
    }
  });
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({ viewMode, zoom, zoomLevel });
    localStorage.setItem('workplace-gantt-settings', payload);
  }, [viewMode, zoom, zoomLevel]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const chartHeaderXScrollRef = useRef<HTMLDivElement | null>(null);
  const chartXScrollRef = useRef<HTMLDivElement | null>(null);
  const chartBottomXScrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);

  // В диаграмме Ганта не отображаем закупаемые позиции.
  // Важно: фильтр применяется ДО построения дерева/агрегаций/диапазона дат.
  const chartItems = useMemo(
    () => items.filter(i => i.is_purchased !== true),
    [items]
  );

  // Toggle collapse for an item
  const toggleCollapse = useCallback((itemId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Expand all
  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  // Collapse all
  const collapseAll = useCallback(() => {
    const newCollapsed = new Set<string>();
    chartItems.forEach(item => {
      if (chartItems.some(i => i.parent_item === item.id)) {
        newCollapsed.add(item.id);
      }
    });
    setCollapsed(newCollapsed);
  }, [chartItems]);

  // Build tree and flatten
  const tree = useMemo(() => buildTree(chartItems), [chartItems]);
  const flatItems = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const maxLevel = useMemo(() => {
    let max = 0;
    const walk = (n: TreeItem, level: number) => {
      max = Math.max(max, level);
      n.children.forEach(c => walk(c, level + 1));
    };
    tree.forEach(r => walk(r, 0));
    return max;
  }, [tree]);

  const expandToLevel = useCallback((targetLevel: number) => {
    // collapsed хранит id узлов, детей которых скрываем.
    // Чтобы показать уровни до targetLevel включительно: сворачиваем все узлы на уровне >= targetLevel.
    const next = new Set<string>();
    const walk = (n: TreeItem) => {
      if (n.children.length > 0) {
        if (n.level >= targetLevel) {
          next.add(n.id);
        }
        n.children.forEach(walk);
      }
    };
    tree.forEach(walk);
    setCollapsed(next);
  }, [tree]);

  useLayoutEffect(() => {
    const recalc = () => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // небольшой отступ, чтобы не прилипать к самому низу впритык
      const next = Math.max(260, Math.floor(window.innerHeight - rect.top - 8));
      setViewportHeight(next);
    };

    recalc();
    const onResize = () => recalc();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [zoomLevel]);

  // Calculate date range
  const { start: chartStart, end: chartEnd } = useMemo(
    () => getDateRange(chartItems),
    [chartItems]
  );

  const totalDays = chartEnd.diff(chartStart, 'day');
  
  // Calculate day width based on zoom level
  const baseDayWidth = useMemo(() => {
    switch (zoomLevel) {
      case 'days': return 20;
      case 'weeks': return 8;
      case 'months': return 3;
      default: return 3;
    }
  }, [zoomLevel]);
  
  const dayWidth = Math.max(1, (zoom / 100) * baseDayWidth);

  useLayoutEffect(() => {
    const el = chartXScrollRef.current;
    if (!el) return;

    const headerEl = chartHeaderXScrollRef.current;
    const bottomEl = chartBottomXScrollRef.current;

    const updateMax = () => {
      // Проверяем, нужен ли скроллбар
      const contentWidth = totalDays * dayWidth;
      const viewportWidth = el.clientWidth || headerEl?.clientWidth || 0;
      if (viewportWidth === 0) {
        return;
      }
      const needsScroll = contentWidth > viewportWidth + 1;
      setShowScrollbar(needsScroll);

      if (headerEl && headerEl.scrollLeft !== el.scrollLeft) {
        headerEl.scrollLeft = el.scrollLeft;
      }

      if (bottomEl && bottomEl.scrollLeft !== el.scrollLeft) {
        bottomEl.scrollLeft = el.scrollLeft;
      }
    };

    updateMax();
    requestAnimationFrame(updateMax);

    const onScroll = () => {
      if (headerEl && headerEl.scrollLeft !== el.scrollLeft) {
        headerEl.scrollLeft = el.scrollLeft;
      }

      if (bottomEl && bottomEl.scrollLeft !== el.scrollLeft) {
        bottomEl.scrollLeft = el.scrollLeft;
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    const onHeaderScroll = () => {
      if (!headerEl) return;
      if (el.scrollLeft !== headerEl.scrollLeft) {
        el.scrollLeft = headerEl.scrollLeft;
      }

      if (bottomEl && bottomEl.scrollLeft !== headerEl.scrollLeft) {
        bottomEl.scrollLeft = headerEl.scrollLeft;
      }
    };

    headerEl?.addEventListener('scroll', onHeaderScroll, { passive: true });

    const onBottomScroll = () => {
      if (!bottomEl) return;
      if (el.scrollLeft !== bottomEl.scrollLeft) {
        el.scrollLeft = bottomEl.scrollLeft;
      }
      if (headerEl && headerEl.scrollLeft !== bottomEl.scrollLeft) {
        headerEl.scrollLeft = bottomEl.scrollLeft;
      }
    };

    bottomEl?.addEventListener('scroll', onBottomScroll, { passive: true });

    // Отслеживаем изменение ширины контейнера/контента
    const ro = new ResizeObserver(() => updateMax());
    ro.observe(el);
    if (headerEl) ro.observe(headerEl);

    return () => {
      el.removeEventListener('scroll', onScroll);
      headerEl?.removeEventListener('scroll', onHeaderScroll);
      bottomEl?.removeEventListener('scroll', onBottomScroll);
      ro.disconnect();
    };
  }, [dayWidth, totalDays, zoomLevel, viewMode, showScrollbar]);

  useLayoutEffect(() => {
    if (!showScrollbar) return;
    const el = chartXScrollRef.current;
    const bottomEl = chartBottomXScrollRef.current;
    if (el && bottomEl && bottomEl.scrollLeft !== el.scrollLeft) {
      bottomEl.scrollLeft = el.scrollLeft;
    }
  }, [showScrollbar]);

  // Generate month headers
  const months = useMemo(() => {
    const result: { month: dayjs.Dayjs; width: number; label: string }[] = [];
    let current = chartStart.startOf('month');
    
    while (current.isBefore(chartEnd)) {
      const monthStart = current.isBefore(chartStart) ? chartStart : current;
      const monthEnd = current.endOf('month').isAfter(chartEnd) ? chartEnd : current.endOf('month');
      const days = monthEnd.diff(monthStart, 'day') + 1;
      
      result.push({
        month: current,
        width: days * dayWidth,
        label: current.format('MMMM YYYY'),
      });
      
      current = current.add(1, 'month');
    }
    
    return result;
  }, [chartStart, chartEnd, dayWidth]);

  // Generate day markers for detailed view
  const dayMarkers = useMemo(() => {
    if (zoomLevel === 'months') return [];
    
    const markers: { day: dayjs.Dayjs; left: number; label: string }[] = [];
    let current = chartStart.startOf('day');
    
    while (current.isBefore(chartEnd)) {
      const dayNum = current.date();
      
      // For weeks view, show 1, 10, 20, last day of month
      // For days view, show every day
      const showLabel = zoomLevel === 'days' || 
        dayNum === 1 || dayNum === 10 || dayNum === 20 || 
        current.isSame(current.endOf('month'), 'day');
      
      if (showLabel) {
        markers.push({
          day: current,
          left: current.diff(chartStart, 'day') * dayWidth,
          label: dayNum.toString(),
        });
      }
      
      current = current.add(1, 'day');
    }
    
    return markers;
  }, [chartStart, chartEnd, dayWidth, zoomLevel]);

  // Calculate bar position
  const getBarStyle = useCallback((
    start: string | null,
    end: string | null,
    baseStyle: React.CSSProperties
  ) => {
    if (!start || !end) return null;

    const startDate = dayjs(start);
    const endDate = dayjs(end);
    
    const left = startDate.diff(chartStart, 'day') * dayWidth;
    const width = Math.max(dayWidth, (endDate.diff(startDate, 'day') + 1) * dayWidth);

    return {
      left: `${left}px`,
      width: `${width}px`,
      ...baseStyle,
    };
  }, [chartStart, dayWidth]);

  const formatDate = useCallback((d: string | null | undefined) => {
    if (!d) return '—';
    const parsed = dayjs(d);
    return parsed.isValid() ? parsed.format('DD.MM.YYYY') : '—';
  }, []);

  const getProgressPercent = useCallback((item: TreeItem) => {
    return Math.round(Number(item.calculated_progress ?? item.progress_percent ?? 0));
  }, []);

  const getProblemText = useCallback((item: TreeItem) => {
    const isPurchased = item.is_purchased === true;
    const analyticReason = isPurchased
      ? item.purchase_problem_reason_detail?.name
      : item.manufacturing_problem_reason_detail?.name;
    const analyticSubreason = isPurchased
      ? item.purchase_problem_subreason_detail?.name
      : item.manufacturing_problem_subreason_detail?.name;

    const reason =
      (analyticReason && analyticSubreason ? `${analyticReason} / ${analyticSubreason}` : analyticReason) ||
      item.delay_reason_detail?.name ||
      item.problem_reason_detail?.name ||
      item.delay_reason ||
      item.problem_reason ||
      null;
    const notes = (item.delay_notes || '').trim();
    const deviationComment = (item.notes || '').trim();
    return {
      reason,
      notes,
      deviationComment,
      hasDeviation: Boolean(reason || notes),
    };
  }, []);

  // Aggregate child issues for parent indicator
  const aggregatedById = useMemo(() => {
    const now = dayjs();

    type Agg = { hasOverdue: boolean; hasDeviationOrRisk: boolean };
    const result = new Map<string, Agg>();

    const isOverdueCritical = (it: TreeItem) => {
      const isPurchased = it.is_purchased === true;
      const isContractor = it.manufacturer_type === 'contractor' && !isPurchased;
      const plannedEndRaw = it.planned_end || (isPurchased ? it.required_date : null);
      const plannedEnd = plannedEndRaw ? dayjs(plannedEndRaw) : null;
      const isDone = isPurchased
        ? it.purchase_status === 'closed'
        : Boolean(it.actual_end) || (isContractor ? it.contractor_status === 'completed' : it.manufacturing_status === 'completed');
      if (!plannedEnd || isDone) return false;
      return now.isAfter(plannedEnd, 'day');
    };

    const hasRiskOrDeviation = (it: TreeItem) => {
      const isPurchased = it.is_purchased === true;
      const isContractor = it.manufacturer_type === 'contractor' && !isPurchased;
      const plannedStart = it.planned_start ? dayjs(it.planned_start) : null;
      const plannedEndRaw = it.planned_end || (isPurchased ? it.required_date : null);
      const plannedEnd = plannedEndRaw ? dayjs(plannedEndRaw) : null;

      const { hasDeviation } = getProblemText(it);

      const isNotStarted = isPurchased
        ? (it.purchase_status === 'waiting_order' && !it.order_date && !it.actual_start)
        : isContractor
          ? (it.contractor_status === 'sent_to_contractor' && !it.actual_start)
          : (it.manufacturing_status === 'not_started' && !it.actual_start);

      const isDone = isPurchased
        ? it.purchase_status === 'closed'
        : Boolean(it.actual_end) || (isContractor ? it.contractor_status === 'completed' : it.manufacturing_status === 'completed');

      const risk = Boolean(plannedStart && now.isAfter(plannedStart, 'day') && isNotStarted);
      const overdue = Boolean(plannedEnd && now.isAfter(plannedEnd, 'day') && !isDone);

      return hasDeviation || risk || overdue;
    };

    const walk = (node: TreeItem): Agg => {
      const agg: Agg = { hasOverdue: false, hasDeviationOrRisk: false };

      node.children.forEach(child => {
        const childAgg = walk(child);
        agg.hasOverdue = agg.hasOverdue || childAgg.hasOverdue || isOverdueCritical(child);
        agg.hasDeviationOrRisk = agg.hasDeviationOrRisk || childAgg.hasDeviationOrRisk || hasRiskOrDeviation(child);
      });

      result.set(node.id, agg);
      return agg;
    };

    tree.forEach(root => walk(root));
    return result;
  }, [getProblemText, tree]);

  const buildTooltip = useCallback((item: TreeItem, extraTitle?: string) => {
    const statusText = item.is_purchased
      ? (item.purchase_status_display || item.purchase_status || 'Закупка')
      : item.manufacturer_type === 'contractor'
        ? (item.contractor_status_display || item.contractor_status || 'Подрядчик')
        : (item.manufacturing_status_display || item.manufacturing_status || 'Производство');

    const { reason, notes, deviationComment } = getProblemText(item);

    const plannedStart = item.planned_start;
    const plannedEnd = item.planned_end || (item.is_purchased ? item.required_date : null);
    const planned = `${formatDate(plannedStart)} — ${formatDate(plannedEnd)}`;

    const actualStart = item.is_purchased ? (item.order_date || item.actual_start) : item.actual_start;
    const actual = actualStart
      ? `${formatDate(actualStart)} — ${item.actual_end ? formatDate(item.actual_end) : 'в работе'}`
      : '—';

    const contractorName = item.contractor_detail?.short_name || item.contractor_detail?.name || null;
    const responsible = item.responsible_detail?.full_name || null;

    return (
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{extraTitle || item.name}</div>
        <div><strong>Статус:</strong> {statusText}</div>
        {!item.is_purchased && item.manufacturer_type === 'contractor' && contractorName && (
          <div><strong>Подрядчик:</strong> {contractorName}</div>
        )}
        {responsible && (
          <div><strong>Ответственный:</strong> {responsible}</div>
        )}
        <div><strong>План:</strong> {planned}</div>
        <div><strong>Факт:</strong> {actual}</div>
        {reason && (
          <div><strong>Проблема/отклонение:</strong> {reason}</div>
        )}
        {notes && (
          <div><strong>Комментарий:</strong> {notes}</div>
        )}
        {deviationComment && deviationComment !== notes && (
          <div><strong>Комментарий по проблеме / отклонению:</strong> {deviationComment}</div>
        )}
      </div>
    );
  }, [formatDate, getProblemText]);

  const getRowVisualState = useCallback((item: TreeItem): VisualRowState => {
    const now = dayjs();
    const isPurchased = item.is_purchased === true;
    const plannedStart = item.planned_start ? dayjs(item.planned_start) : null;
    const plannedEndRaw = item.planned_end || (isPurchased ? item.required_date : null);
    const plannedEnd = plannedEndRaw ? dayjs(plannedEndRaw) : null;

    const isContractor = item.manufacturer_type === 'contractor' && !isPurchased;

    const { hasDeviation, reason } = getProblemText(item);

    const isDone = isPurchased
      ? item.purchase_status === 'closed'
      : isContractor
        ? item.contractor_status === 'completed'
        : Boolean(item.actual_end) || item.manufacturing_status === 'completed';

    const isPaused = isPurchased
      ? item.purchase_status === 'written_off'
      : isContractor
        ? item.contractor_status === 'suspended_by_contractor'
        : item.manufacturing_status === 'suspended';

    const isNotStarted = isPurchased
      ? (item.purchase_status === 'waiting_order' && !item.order_date && !item.actual_start)
      : isContractor
        ? (item.contractor_status === 'sent_to_contractor' && !item.actual_start)
        : (item.manufacturing_status === 'not_started' && !item.actual_start);

    const isInProgress = isPurchased
      ? (item.purchase_status === 'in_order' || Boolean(item.order_date)) && !isDone
      : Boolean(item.actual_start) && !isDone;

    const isOverdueCritical = Boolean(plannedEnd && now.isAfter(plannedEnd, 'day') && !isDone);
    const riskNotStarted = Boolean(plannedStart && now.isAfter(plannedStart, 'day') && isNotStarted);

    // Bars: planned is always neutral if dates exist
    const plannedBaseStyle: React.CSSProperties = {
      backgroundColor: '#dbe3ee',
      border: '1px solid #c4cfdd',
      boxSizing: 'border-box',
    };

    const plannedBar = getBarStyle(item.planned_start, item.planned_end || (isPurchased ? item.required_date : null), plannedBaseStyle);

    const icons: VisualRowState['icons'] = [];

    // Parent aggregate icon (does not recolor parent row fully)
    if (item.hasChildren) {
      const agg = aggregatedById.get(item.id);
      if (agg?.hasOverdue) {
        icons.push({
          key: 'parent-overdue',
          icon: <ExclamationCircleFilled style={{ color: '#f5222d' }} />,
          tooltip: buildTooltip(item, 'Родитель: есть просрочки в дочерних элементах'),
        });
      } else if (agg?.hasDeviationOrRisk) {
        icons.push({
          key: 'parent-risk',
          icon: <ExclamationCircleFilled style={{ color: '#fa8c16' }} />,
          tooltip: buildTooltip(item, 'Родитель: есть риски/отклонения в дочерних элементах'),
        });
      } else {
        icons.push({
          key: 'parent-ok',
          icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
          tooltip: buildTooltip(item, 'Родитель: дочерние элементы без отклонений'),
        });
      }
    }

    if (isContractor) {
      const contractorName = item.contractor_detail?.short_name || item.contractor_detail?.name;
      icons.push({
        key: 'contractor',
        icon: <ShopOutlined style={{ color: '#531dab' }} />,
        tooltip: buildTooltip(item, contractorName ? `Подрядчик: ${contractorName}` : 'Подрядчик'),
      });
    }

    let severity: Severity = 'ok';
    let rowBackground: string | undefined;
    let actualBar: React.CSSProperties | null = null;
    let progressOverlay: React.CSSProperties | null = null;
    let showActualBar = true;

    // Choose actual bar date range
    const actualStart = isPurchased ? (item.order_date || item.actual_start) : item.actual_start;
    const actualEndForBar = item.actual_end || (actualStart ? now.format('YYYY-MM-DD') : null);

    // Visual rules precedence
    if (isDone) {
      severity = 'done';
      icons.push({
        key: 'done',
        icon: <CheckCircleFilled style={{ color: '#52c41a' }} />,
        tooltip: buildTooltip(item, 'Завершено'),
      });

      if (item.actual_start && item.actual_end) {
        actualBar = getBarStyle(item.actual_start, item.actual_end, {
          backgroundColor: '#52c41a',
        });
      } else if (isPurchased && actualStart && (item.required_date || item.planned_end)) {
        actualBar = getBarStyle(actualStart, (item.required_date || item.planned_end) as string, {
          backgroundColor: '#52c41a',
        });
      } else {
        // If backend doesn't provide end, keep minimal footprint
        showActualBar = false;
      }
    } else if (isPaused) {
      severity = 'paused';
      icons.push({
        key: 'paused',
        icon: <PauseCircleOutlined style={{ color: '#8c8c8c' }} />,
        tooltip: buildTooltip(item, 'Приостановлено'),
      });

      if (isOverdueCritical) {
        icons.push({
          key: 'overdue-dot',
          icon: <ExclamationCircleFilled style={{ color: '#f5222d' }} />,
          tooltip: buildTooltip(item, 'Просрочено'),
        });
      }

      if (actualStart) {
        actualBar = getBarStyle(actualStart, actualEndForBar, {
          backgroundColor: isContractor ? '#b37feb' : '#bfbfbf',
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 6px, rgba(255,255,255,0.0) 6px, rgba(255,255,255,0.0) 12px)',
        });
      } else {
        showActualBar = false;
      }
    } else if (isOverdueCritical) {
      severity = 'overdue';
      rowBackground = '#fff1f0';
      icons.push({
        key: 'overdue',
        icon: <ExclamationCircleFilled style={{ color: '#f5222d' }} />,
        tooltip: buildTooltip(item, reason ? `Просрочено: ${reason}` : 'Просрочено'),
      });

      if (actualStart) {
        actualBar = getBarStyle(actualStart, actualEndForBar, {
          backgroundColor: '#f5222d',
        });
      } else {
        // Not started but overdue: no bar, but strong icon
        showActualBar = false;
      }
    } else if (isNotStarted) {
      severity = 'not_started';
      showActualBar = false;

      if (riskNotStarted) {
        severity = 'risk';
        rowBackground = '#fff7e6';
        icons.push({
          key: 'risk',
          icon: <ExclamationCircleFilled style={{ color: '#fa8c16' }} />,
          tooltip: buildTooltip(item, 'Риск: не начато вовремя'),
        });
      } else {
        icons.push({
          key: 'not-started',
          icon: <MinusCircleOutlined style={{ color: '#8c8c8c' }} />,
          tooltip: buildTooltip(item, 'Не начато'),
        });
      }
    } else if (isInProgress) {
      severity = 'in_progress';
      const withinPlan = Boolean(plannedEnd && (now.isBefore(plannedEnd, 'day') || now.isSame(plannedEnd, 'day')));

      if (hasDeviation && withinPlan) {
        severity = 'deviation';
        icons.push({
          key: 'deviation',
          icon: <WarningOutlined style={{ color: '#fa8c16' }} />,
          tooltip: buildTooltip(item, 'Отклонение'),
        });
      } else {
        icons.push({
          key: 'in-progress',
          icon: <ClockCircleOutlined style={{ color: isContractor ? '#531dab' : '#1677ff' }} />,
          tooltip: buildTooltip(item, 'В работе'),
        });
      }

      actualBar = getBarStyle(actualStart, actualEndForBar, {
        backgroundColor: isContractor
          ? '#722ed1'
          : hasDeviation
            ? '#fa8c16'
            : '#1677ff',
      });

      const percent = getProgressPercent(item);
      if (percent > 0 && actualBar) {
        progressOverlay = {
          left: actualBar.left,
          width: `calc(${actualBar.width} * ${Math.min(100, Math.max(0, percent)) / 100})`,
          backgroundColor: isContractor
            ? '#391085'
            : hasDeviation
              ? '#d46b08'
              : '#0958d9',
          opacity: 0.9,
        };
      }
    } else {
      // Fallback: treat as waiting
      severity = 'not_started';
      showActualBar = false;
      icons.push({
        key: 'waiting',
        icon: <MinusCircleOutlined style={{ color: '#8c8c8c' }} />,
        tooltip: buildTooltip(item, 'Ожидание'),
      });
    }

    // Contractor: manufactured by contractor but not accepted
    if (isContractor && item.contractor_status === 'manufactured_by_contractor') {
      severity = 'deviation';
      showActualBar = Boolean(actualStart);
      icons.push({
        key: 'awaiting-acceptance',
        icon: <CheckCircleOutlined style={{ color: '#9254de' }} />,
        tooltip: buildTooltip(item, 'Ожидает приёмки'),
      });
      if (actualStart) {
        actualBar = getBarStyle(actualStart, actualEndForBar, {
          backgroundColor: '#d3adf7',
        });
      }
    }

    const tooltip = buildTooltip(item);

    return {
      severity,
      isContractor,
      showActualBar,
      plannedBarStyle: plannedBar,
      actualBarStyle: actualBar,
      progressOverlayStyle: progressOverlay,
      rowBackground,
      icons,
      tooltip,
    };
  }, [aggregatedById, buildTooltip, getBarStyle, getProblemText, getProgressPercent]);

  // Today line position
  const todayPosition = useMemo(() => {
    const today = dayjs();
    if (today.isBefore(chartStart) || today.isAfter(chartEnd)) return null;
    return today.diff(chartStart, 'day') * dayWidth;
  }, [chartStart, chartEnd, dayWidth]);

  if (!chartItems.length) {
    return (
      <Card>
        <Empty description="Нет позиций для отображения" />
      </Card>
    );
  }

  const rowHeight = 32;
  const headerHeight = zoomLevel === 'months' ? 44 : 56;
  const nameColumnWidth = 320;
  const progressColumnWidth = 70;

  return (
    <div className="gantt-chart">
      {/* Controls */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
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
                    style={{ minWidth: 22, height: 22, padding: '0 4px', fontSize: 11, lineHeight: '20px' }}
                  >
                    {i + 1}
                  </Button>
                </Tooltip>
              ))}
            </>
          )}
        </Space>

        <Space wrap>
          <Radio.Group
            value={viewMode}
            onChange={e => setViewMode(e.target.value)}
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="planned">План</Radio.Button>
            <Radio.Button value="actual">Факт</Radio.Button>
            <Radio.Button value="both">План и факт</Radio.Button>
          </Radio.Group>

          <Radio.Group
            value={zoomLevel}
            onChange={e => setZoomLevel(e.target.value)}
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="months">Месяцы</Radio.Button>
            <Radio.Button value="weeks">Недели</Radio.Button>
            <Radio.Button value="days">Дни</Radio.Button>
          </Radio.Group>
        </Space>

        <Space>
          <Button icon={<ZoomOutOutlined />} size="small" onClick={() => setZoom(Math.max(50, zoom - 25))} />
          <Slider
            style={{ width: 80 }}
            min={50}
            max={200}
            value={zoom}
            onChange={setZoom}
            tooltip={{ formatter: v => `${v}%` }}
          />
          <Button icon={<ZoomInOutlined />} size="small" onClick={() => setZoom(Math.min(200, zoom + 25))} />
        </Space>
      </div>

      <div
        ref={viewportRef}
        className="gantt-scroll-viewport"
        style={{ height: viewportHeight ?? 'calc(100vh - 260px)' }}
      >
        <div className="gantt-rows-scroll">
          <div className="gantt-main">
            {/* Шапка (закреплена сверху внутри вертикального скролла) */}
            <div className="gantt-sticky-top">
            <div
              style={{
                display: 'flex',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <div
                style={{
                  width: nameColumnWidth + progressColumnWidth,
                  flexShrink: 0,
                  borderRight: '1px solid #f0f0f0',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    height: headerHeight,
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    background: '#fafafa',
                  }}
                >
                  <div
                    style={{
                      width: nameColumnWidth,
                      padding: '0 12px',
                      fontWeight: 500,
                      fontSize: 12,
                    }}
                  >
                    Наименование
                  </div>
                  <div
                    style={{
                      width: progressColumnWidth,
                      textAlign: 'center',
                      fontWeight: 500,
                      borderLeft: '1px solid #f0f0f0',
                      fontSize: 12,
                    }}
                  >
                    %
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, background: '#fafafa' }}>
                <div
                  ref={chartHeaderXScrollRef}
                  className="gantt-header-xscroll"
                  style={{
                    height: headerHeight,
                    // Держим шапку синхронной по scrollLeft, но не показываем отдельный скроллбар
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: totalDays * dayWidth,
                      minWidth: '100%',
                      height: headerHeight,
                      borderBottom: '1px solid #f0f0f0',
                      background: '#fafafa',
                    }}
                  >
                    {/* Today marker in header (поверх шапки) */}
                    {todayPosition !== null && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: todayPosition,
                          width: 2,
                          background: '#ff4d4f',
                          zIndex: 60,
                          pointerEvents: 'none',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: -18,
                            fontSize: 10,
                            background: 'rgba(255, 77, 79, 0.85)',
                            color: '#fff',
                            padding: '1px 4px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Сегодня
                        </div>
                      </div>
                    )}

                    {/* Months row */}
                    <div
                      style={{
                        display: 'flex',
                        height: zoomLevel === 'months' ? '100%' : '50%',
                        borderBottom: zoomLevel !== 'months' ? '1px solid #f0f0f0' : undefined,
                      }}
                    >
                      {months.map((m, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: m.width,
                            flexShrink: 0,
                            textAlign: 'center',
                            borderRight: '1px solid #f0f0f0',
                            fontSize: 11,
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#fafafa',
                          }}
                        >
                          {m.label}
                        </div>
                      ))}
                    </div>

                    {/* Days row (for weeks/days view) */}
                    {zoomLevel !== 'months' && (
                      <div
                        style={{
                          height: '50%',
                          width: totalDays * dayWidth,
                          position: 'relative',
                          background: '#fafafa',
                        }}
                      >
                        {dayMarkers.map((marker, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: 'absolute',
                              left: marker.left,
                              top: 0,
                              bottom: 0,
                              width: zoomLevel === 'days' ? dayWidth : 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              color: '#666',
                              borderLeft: marker.day.date() === 1 ? '1px solid #d9d9d9' : undefined,
                            }}
                          >
                            {marker.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* Тело */}
            <div className="gantt-body">
            <div
              style={{
                display: 'flex',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: 'none',
              }}
            >
            {/* Left panel - names and progress (BODY ONLY) */}
            <div
              style={{
                width: nameColumnWidth + progressColumnWidth,
                flexShrink: 0,
                borderRight: '1px solid #f0f0f0',
                background: '#fafafa',
              }}
            >
              {flatItems.map(item => {
                const vs = getRowVisualState(item);
                const percent = getProgressPercent(item);
                const isCollapsed = collapsed.has(item.id);

                return (
                  <div
                    key={item.id}
                    style={{
                      height: rowHeight,
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid #f5f5f5',
                      background: hoveredItem === item.id ? '#f0f5ff' : vs.rowBackground,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    {/* Name column */}
                    <div
                      style={{
                        width: nameColumnWidth,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        paddingLeft: 8 + item.level * 16,
                        cursor: 'pointer',
                      }}
                    >
                      {/* Expand/collapse button */}
                      {item.hasChildren ? (
                        <Button
                          type="text"
                          size="small"
                          icon={isCollapsed ? <PlusSquareOutlined /> : <MinusSquareOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapse(item.id);
                          }}
                          style={{ marginRight: 4, padding: 0, width: 18, height: 18 }}
                        />
                      ) : (
                        <span style={{ width: 24 }} />
                      )}

                      <Text
                        className={onOpenItem ? 'gantt-item-name' : undefined}
                        ellipsis={{ tooltip: item.name }}
                        style={{ flex: 1, color: '#141414', fontSize: 11 }}
                        role={onOpenItem ? 'button' : undefined}
                        tabIndex={onOpenItem ? 0 : undefined}
                        onClick={(e) => {
                          if (!onOpenItem) return;
                          e.stopPropagation();
                          onOpenItem(item);
                        }}
                        onKeyDown={(e) => {
                          if (!onOpenItem) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenItem(item);
                          }
                        }}
                      >
                        {item.name}
                      </Text>

                      {/* Status icons (справа от наименования, перед % колонкой) */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginLeft: 8,
                          flexShrink: 0,
                        }}
                      >
                        {vs.icons.map(s => (
                          <Tooltip key={s.key} title={s.tooltip}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 18,
                                height: 18,
                              }}
                            >
                              {s.icon}
                            </span>
                          </Tooltip>
                        ))}
                      </div>
                    </div>

                    {/* Progress column */}
                    <div
                      style={{
                        width: progressColumnWidth,
                        textAlign: 'center',
                        borderLeft: '1px solid #f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 6,
                          backgroundColor: '#f0f0f0',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            backgroundColor:
                              percent >= 100 ? '#52c41a' : percent >= 50 ? '#1890ff' : '#d9d9d9',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <Text style={{ fontSize: 11, minWidth: 28 }}>{percent}%</Text>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right panel - chart (BODY ONLY) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
              <div
                ref={chartXScrollRef}
                className="gantt-chart-xscroll"
                style={{
                  flex: 1,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  minWidth: 0,
                }}
              >
                {/* Chart area */}
                <div
                  style={{
                    position: 'relative',
                    width: totalDays * dayWidth,
                    minWidth: '100%',
                  }}
                >
                  {/* Today line */}
                  {todayPosition !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: todayPosition,
                        width: 2,
                        background: '#ff4d4f',
                        // Поверх всего в области тела
                        zIndex: 120,
                      }}
                    />
                  )}

                  {/* Grid lines */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background:
                        zoomLevel === 'days'
                          ? `repeating-linear-gradient(
                              to right,
                              transparent,
                              transparent ${dayWidth - 1}px,
                              #f5f5f5 ${dayWidth - 1}px,
                              #f5f5f5 ${dayWidth}px
                            )`
                          : `repeating-linear-gradient(
                              to right,
                              transparent,
                              transparent ${dayWidth * 7 - 1}px,
                              #f5f5f5 ${dayWidth * 7 - 1}px,
                              #f5f5f5 ${dayWidth * 7}px
                            )`,
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Bars */}
                  {flatItems.map(item => {
                    const vs = getRowVisualState(item);

                    const showPlanned = viewMode === 'planned' || viewMode === 'both';
                    const showActual = viewMode === 'actual' || viewMode === 'both';

                    return (
                      <div
                        key={item.id}
                        style={{
                          height: rowHeight,
                          position: 'relative',
                          borderBottom: '1px solid #f5f5f5',
                          background: hoveredItem === item.id ? '#f0f5ff' : vs.rowBackground,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={() => setHoveredItem(item.id)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        {/* Planned bar */}
                        {showPlanned && vs.plannedBarStyle && (
                          <Tooltip title={vs.tooltip}>
                            <div
                              style={{
                                position: 'absolute',
                                top: viewMode === 'both' ? 3 : 6,
                                height: viewMode === 'both' ? 10 : 18,
                                borderRadius: 3,
                                opacity: 1,
                                cursor: 'pointer',
                                ...vs.plannedBarStyle,
                              }}
                            />
                          </Tooltip>
                        )}

                        {/* Actual bar */}
                        {showActual && vs.showActualBar && vs.actualBarStyle && (
                          <Tooltip title={vs.tooltip}>
                            <div
                              style={{
                                position: 'absolute',
                                top: viewMode === 'both' ? 17 : 6,
                                height: viewMode === 'both' ? 10 : 18,
                                borderRadius: 3,
                                opacity: 0.9,
                                cursor: 'pointer',
                                ...vs.actualBarStyle,
                              }}
                            />
                          </Tooltip>
                        )}

                        {/* Progress indicator for items in progress */}
                        {showActual && vs.showActualBar && vs.progressOverlayStyle && (
                          <div
                            style={{
                              position: 'absolute',
                              top: viewMode === 'both' ? 17 : 6,
                              height: viewMode === 'both' ? 10 : 18,
                              borderRadius: '3px 0 0 3px',
                              ...vs.progressOverlayStyle,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
            </div>
          </div>
          </div>

          {/* Низ (закреплён снизу внутри вертикального скролла): ползунок + легенда */}
          <div className="gantt-sticky-bottom">
            {/* Ползунок горизонтальной прокрутки (над легендой) - показываем только когда нужно */}
            {showScrollbar && (
              <div
                className="gantt-xscrollbar-row"
                title="Горизонтальная прокрутка диаграммы"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(4px)',
                  borderTop: '1px solid rgba(0, 0, 0, 0.06)',
                  padding: 0,
                  lineHeight: 0,
                  height: 12,
                }}
              >
                <div
                  style={{
                    width: nameColumnWidth + progressColumnWidth,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, padding: 0 }}>
                  <div
                    ref={chartBottomXScrollRef}
                    className="gantt-xscrollbar"
                    style={{
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      height: 12,
                    }}
                  >
                    {/* Пустой спейсер — нужен только для формирования scrollWidth */}
                    <div
                      style={{
                        width: totalDays * dayWidth,
                        minWidth: '100%',
                        height: 1,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Область расшифровок */}
            <div
              style={{
                marginTop: 8,
                background: '#fff',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
          {/* Легенда иконок — под областью Наименование/% */}
          <div style={{
            width: nameColumnWidth + progressColumnWidth,
            flexShrink: 0,
            borderRight: '1px solid #f0f0f0',
            padding: '8px 12px',
            background: '#fafafa',
            fontSize: 11,
            color: '#595959',
            lineHeight: '14px',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 10,
              rowGap: 2,
              alignItems: 'start',
            }}>
              {/* Колонка 1: рабочие состояния */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <ClockCircleOutlined style={{ color: '#1677ff' }} />
                  <span>В работе</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <MinusCircleOutlined style={{ color: '#8c8c8c' }} />
                  <span>Не начато</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                  <span>Готово</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <ShopOutlined style={{ color: '#531dab' }} />
                  <span>Подрядчик</span>
                </div>
              </div>

              {/* Колонка 2: риски/проблемы */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <ExclamationCircleFilled style={{ color: '#f5222d' }} />
                  <span>Просрочено</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <ExclamationCircleFilled style={{ color: '#fa8c16' }} />
                  <span>Риск / не начато вовремя</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <WarningOutlined style={{ color: '#fa8c16' }} />
                  <span>Отклонение</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <PauseCircleOutlined style={{ color: '#8c8c8c' }} />
                  <span>Приостановлено</span>
                </div>
              </div>
            </div>
          </div>

          {/* Легенда линий — под областью диаграммы (3 колонки: план/факт/подрядчик) */}
          <div style={{
            flex: 1,
            padding: '8px 12px 8px 28px',
            fontSize: 11,
            color: '#595959',
            lineHeight: '14px',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'max-content max-content max-content',
              columnGap: 18,
              alignItems: 'start',
            }}>
              {/* План */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#dbe3ee', border: '1px solid #c4cfdd', borderRadius: 2 }} />
                  <span>План (эталон)</span>
                </div>
              </div>

              {/* Факт */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#1677ff', borderRadius: 2 }} />
                  <span>Факт: в работе (норма)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#fa8c16', borderRadius: 2 }} />
                  <span>Факт: отклонение</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#f5222d', borderRadius: 2 }} />
                  <span>Факт: просрочено</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 20,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: '#bfbfbf',
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 6px, rgba(255,255,255,0.0) 6px, rgba(255,255,255,0.0) 12px)',
                  }} />
                  <span>Факт: приостановлено</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#52c41a', borderRadius: 2 }} />
                  <span>Факт: готово</span>
                </div>
              </div>

              {/* Подрядчик */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#722ed1', borderRadius: 2 }} />
                  <span>Подрядчик: в работе</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 12, background: '#d3adf7', borderRadius: 2 }} />
                  <span>Подрядчик: изготовлено (ожидает приёмки)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 20,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: '#b37feb',
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 6px, rgba(255,255,255,0.0) 6px, rgba(255,255,255,0.0) 12px)',
                  }} />
                  <span>Подрядчик: приостановлено</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

      </div>

      <style>{`
        .gantt-chart .ant-slider-handle {
          width: 12px;
          height: 12px;
        }

        .gantt-scroll-viewport {
          /* Заполняем доступную высоту до низа экрана; прокрутка только внутри области строк */
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .gantt-rows-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          flex-direction: column;
          position: relative;
          /* вертикальный скролл всей области диаграммы (шапка/тело/низ), закрепления через sticky */
        }
        .gantt-main {
          flex: 1 0 auto;
        }

        .gantt-header-xscroll {
          scrollbar-width: none; /* Firefox */
        }
        .gantt-header-xscroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .gantt-chart-xscroll {
          /* Убираем резкий скроллбар-скачок при появлении */
          scrollbar-gutter: stable;
        }

        .gantt-xscrollbar {
          opacity: 1;
        }
        .gantt-xscrollbar::-webkit-scrollbar {
          height: 12px;
        }
        .gantt-xscrollbar::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 6px;
        }
        .gantt-xscrollbar::-webkit-scrollbar-thumb {
          background: #bfbfbf;
          border-radius: 6px;
          border: 2px solid #f0f0f0;
        }
        .gantt-xscrollbar::-webkit-scrollbar-thumb:hover {
          background: #8c8c8c;
        }
        .gantt-xscrollbar {
          scrollbar-gutter: stable;
        }

        .gantt-sticky-top {
          position: sticky;
          top: var(--gantt-sticky-top, 0px);
          z-index: 30;
        }

        .gantt-sticky-bottom {
          position: sticky;
          bottom: 0;
          z-index: 40;
          background: #fff;
          box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
          margin-top: auto;
        }

        .gantt-item-name {
          cursor: pointer;
          user-select: none;
        }
        .gantt-item-name:hover {
          text-decoration: underline;
          color: #000;
        }
        .gantt-item-name:focus-visible {
          outline: 2px solid #91caff;
          outline-offset: 2px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
