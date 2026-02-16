import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    EditOutlined,
    FileExcelOutlined,
    MoreOutlined,
    SettingOutlined,
    ShoppingCartOutlined,
    SyncOutlined,
    TeamOutlined,
    ToolOutlined,
    UserOutlined,
    WarningOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Col,
    DatePicker,
    Descriptions,
    Dropdown,
    Empty,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popover,
    Progress,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { catalogApi, type CatalogCategory, type Contractor, type Nomenclature, type Supplier } from '../../features/catalog';
import { OrderEditModal } from '../../features/procurement';
import { projectsApi, ProjectStructureTable, type ProjectItem, type ProjectItemHistoryEntry, type ProjectValidationError } from '../../features/projects';
import GanttChart from '../../features/projects/components/GanttChart.tsx';
import { settingsApi } from '../../features/settings';
import { warehouseApi, type StockItem, type Warehouse } from '../../features/warehouse';
import type { PaginatedResponse } from '../../shared/api/types';
import { StatusBadge } from '../../shared/components/data-display';

const { Title, Text } = Typography;

/**
 * Project Detail Page
 */
export default function ProjectDetailPage() {
  const { id, tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(tab);
  const [structureEditMode, setStructureEditMode] = useState(false);
  const openedFromQueryRef = useRef<string | null>(null);
  
  // Modal states
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [miniOpenItemId, setMiniOpenItemId] = useState<string | null>(null);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [contractorModalOpen, setContractorModalOpen] = useState(false);
  const [responsibleModalOpen, setResponsibleModalOpen] = useState(false);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [initialDelayNotes, setInitialDelayNotes] = useState<string>('');

  const [closeActionModalOpen, setCloseActionModalOpen] = useState(false);
  const [closeActionItem, setCloseActionItem] = useState<ProjectItem | null>(null);
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [reserveAllocations, setReserveAllocations] = useState<Record<string, number>>({});
  const [receiveAllocations, setReceiveAllocations] = useState<Array<{ warehouse_id: string; quantity: number }>>([]);

  const [activateReceiptModalOpen, setActivateReceiptModalOpen] = useState(false);
  const [activateAllocations, setActivateAllocations] = useState<Record<string, string>>({});
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  const [editForm] = Form.useForm();
  const [addProductForm] = Form.useForm();
  const [contractorForm] = Form.useForm();
  const [responsibleForm] = Form.useForm();
  
  // Form watch
  const addProductCategoryId = Form.useWatch('catalog_category', addProductForm);
  const editManufacturerType = Form.useWatch('manufacturer_type', editForm);
  const editManufacturingProblemReasonId = Form.useWatch('manufacturing_problem_reason', editForm);
  const editPurchaseProblemReasonId = Form.useWatch('purchase_problem_reason', editForm);

  const formatItemNumber = (value?: number | null) =>
    value ? String(value).padStart(7, '0') : '—';

  const formatUserShort = (value?: string | null) => {
    if (!value) return '—';
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const lastName = parts[0];
    const initials = parts.slice(1).map((p) => `${p[0]}.`).join('');
    return `${lastName} ${initials}`.trim();
  };

  // Fetch project details
  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
    refetch: refetchProject,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (project?.id && project?.name) {
      sessionStorage.setItem(`project-name:${project.id}`, project.name);
      window.dispatchEvent(new Event('project-name-updated'));
    }
  }, [project?.id, project?.name]);

  // Fetch project structure (items tree)
  const { data: projectItems = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['project-items', id],
    queryFn: async () => {
      const response = await projectsApi.items.list({
        project: id,
        page_size: 5000,
        include_purchase_order: false,
        include_calculated_progress: true,
      });
      return response;
    },
    enabled: !!id,
    select: (data: PaginatedResponse<ProjectItem>) => data.results || [],
  });

  // Support deep-linking into an item from external screens (e.g. executive dashboard)
  // URL format: /projects/:id/structure?item=<projectItemId>
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!id || !itemId) return;
    if (openedFromQueryRef.current === itemId) return;

    openedFromQueryRef.current = itemId;

    (async () => {
      try {
        // Ensure we are on a tab that can open/edit items
        setActiveTab('structure');
        navigate(`/projects/${id}/structure?item=${encodeURIComponent(itemId)}`, { replace: true });

        const item = await projectsApi.items.get(itemId);
        setSelectedItem(item);
        setEditModalOpen(true);
      } catch {
        message.error('Не удалось открыть позицию по ссылке');
      }
    })();
  }, [id, navigate, searchParams]);

  // Fetch contractors for selection
  const { data: contractorsData } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => catalogApi.contractors.list(),
  });
  const contractors: Contractor[] = contractorsData?.results || [];
  
  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => catalogApi.suppliers.list(),
  });
  const suppliers: Supplier[] = suppliersData?.results || [];

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.warehouses.list(),
    enabled: reserveModalOpen || receiveModalOpen || activateReceiptModalOpen,
  });
  const warehouses: Warehouse[] = warehousesData?.results || [];

  const emptyStockItems: { count: number; next: string | null; previous: string | null; results: StockItem[] } = {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };

  const { data: stockItemsData, isLoading: stockItemsLoading } = useQuery({
    queryKey: ['stock-items-by-nomenclature', closeActionItem?.nomenclature_item],
    queryFn: () => (
      closeActionItem?.nomenclature_item
        ? warehouseApi.stockItems.list({
            nomenclature_item: closeActionItem.nomenclature_item,
            page_size: 200,
          })
        : Promise.resolve(emptyStockItems)
    ),
    enabled: reserveModalOpen && !!closeActionItem?.nomenclature_item,
  });
  const stockItems: StockItem[] = stockItemsData?.results || [];

  // Fetch manufactured categories for adding products
  const { data: manufacturedCategories = [] } = useQuery({
    queryKey: ['catalog-categories-manufactured'],
    queryFn: () => catalogApi.categories.manufactured(),
  });

  // Fetch nomenclature for selected category
  const { data: nomenclatureData } = useQuery({
    queryKey: ['nomenclature', addProductCategoryId],
    queryFn: () => catalogApi.nomenclature.list({ catalog_category: addProductCategoryId }),
    enabled: !!addProductCategoryId,
  });
  const nomenclatureItems: Nomenclature[] = nomenclatureData?.results || [];

  // Fetch manufacturing/purchase problem reasons (settings)
  const { data: manufacturingProblemReasonsData } = useQuery({
    queryKey: ['manufacturing-problem-reasons'],
    queryFn: () => settingsApi.manufacturingProblemReasons.list(),
  });
  const manufacturingProblemReasons = manufacturingProblemReasonsData?.results || [];

  const { data: purchaseProblemReasonsData } = useQuery({
    queryKey: ['purchase-problem-reasons'],
    queryFn: () => settingsApi.purchaseProblemReasons.list(),
  });
  const purchaseProblemReasons = purchaseProblemReasonsData?.results || [];

  const { data: manufacturingProblemSubreasonsData, isLoading: manufacturingProblemSubreasonsLoading } = useQuery({
    queryKey: ['manufacturing-problem-subreasons', editManufacturingProblemReasonId],
    queryFn: () => settingsApi.manufacturingProblemSubreasons.list({ reason: String(editManufacturingProblemReasonId), page_size: 200 }),
    enabled: !!editManufacturingProblemReasonId,
  });
  const manufacturingProblemSubreasons = manufacturingProblemSubreasonsData?.results || [];

  const { data: purchaseProblemSubreasonsData, isLoading: purchaseProblemSubreasonsLoading } = useQuery({
    queryKey: ['purchase-problem-subreasons', editPurchaseProblemReasonId],
    queryFn: () => settingsApi.purchaseProblemSubreasons.list({ reason: String(editPurchaseProblemReasonId), page_size: 200 }),
    enabled: !!editPurchaseProblemReasonId,
  });
  const purchaseProblemSubreasons = purchaseProblemSubreasonsData?.results || [];

  const { data: itemHistory = [], isLoading: itemHistoryLoading } = useQuery({
    queryKey: ['project-item-history', selectedItem?.id],
    queryFn: () => projectsApi.items.history(selectedItem!.id),
    enabled: editModalOpen && !!selectedItem?.id,
  });

  const statusChangeInfo = useMemo(() => {
    if (!itemHistory.length) return null;
    const entry = itemHistory.find((historyEntry) =>
      (historyEntry.details || []).some((detail) => detail.toLowerCase().includes('статус'))
    );
    if (!entry) return null;
    return {
      date: entry.date,
      user: entry.user,
    };
  }, [itemHistory]);
  
  // Fetch users for responsible selection (only users who can be responsible)
  const { data: usersData } = useQuery({
    queryKey: ['responsible-candidates'],
    queryFn: () => settingsApi.users.responsibleCandidates(),
  });
  const users = usersData || [];

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Partial<ProjectItem> }) =>
      projectsApi.items.update(itemId, data),
    onSuccess: () => {
      message.success('Элемент обновлён');
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setEditModalOpen(false);
      setSelectedItem(null);
    },
    onError: (err: any) => {
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
      message.error('Ошибка обновления');
    },
  });

  const reserveStockMutation = useMutation({
    mutationFn: ({ itemId, allocations }: { itemId: string; allocations: Array<{ stock_item_id: string; quantity: number }> }) =>
      projectsApi.items.reserveStock(itemId, allocations),
    onSuccess: () => {
      message.success('Резерв создан');
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setReserveModalOpen(false);
      setCloseActionModalOpen(false);
      setReserveAllocations({});
      setCloseActionItem(null);
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error || error?.message;
      message.error(apiError || 'Ошибка резервирования');
    },
  });

  const receiveAndCloseMutation = useMutation({
    mutationFn: ({ itemId, allocations }: { itemId: string; allocations: Array<{ warehouse_id: string; quantity: number }> }) =>
      projectsApi.items.receiveAndClose(itemId, allocations),
    onSuccess: () => {
      message.success('Поступление оформлено');
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setReceiveModalOpen(false);
      setCloseActionModalOpen(false);
      setReceiveAllocations([]);
      setCloseActionItem(null);
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error || error?.message;
      message.error(apiError || 'Ошибка поступления');
    },
  });
  
  // Add product mutation
  const addProductMutation = useMutation({
    mutationFn: (data: { nomenclatureItemId: string; quantity: number }) =>
      projectsApi.addProduct(id!, data.nomenclatureItemId, data.quantity),
    onSuccess: (data) => {
      message.success(`Добавлено ${data.items_created} позиций`);
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setAddProductModalOpen(false);
      addProductForm.resetFields();
    },
    onError: () => message.error('Ошибка добавления изделия'),
  });
  
  // Set contractor mutation
  const setContractorMutation = useMutation({
    mutationFn: (data: { itemId: string; contractorId: string; materialSupplyType: 'our_supply' | 'contractor_supply'; cascade: boolean }) =>
      projectsApi.setContractor(id!, data.itemId, data.contractorId, data.materialSupplyType, data.cascade),
    onSuccess: (data) => {
      message.success(`Подрядчик установлен для ${data.updated_count} элементов`);
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      setContractorModalOpen(false);
      setSelectedItem(null);
      contractorForm.resetFields();
    },
    onError: () => message.error('Ошибка установки подрядчика'),
  });
  
  // Set responsible mutation
  const setResponsibleMutation = useMutation({
    mutationFn: (data: { itemId: string; responsibleId: string; cascade: boolean }) =>
      projectsApi.setResponsibleCascade(id!, data.itemId, data.responsibleId, data.cascade),
    onSuccess: (data) => {
      message.success(`Ответственный установлен для ${data.updated_count} элементов`);
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      setResponsibleModalOpen(false);
      setSelectedItem(null);
      responsibleForm.resetFields();
    },
    onError: () => message.error('Ошибка установки ответственного'),
  });
  
  // Validate suppliers mutation
  const validateSuppliersMutation = useMutation({
    mutationFn: () => projectsApi.validateSuppliers(id!),
    onSuccess: (data) => {
      if (data.is_valid) {
        message.success('Все поставщики указаны');
      } else {
        Modal.warning({
          title: 'Не все поставщики указаны',
          content: (
            <div>
              <p>{data.message}</p>
              <ul>
                {data.missing_suppliers.slice(0, 10).map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
                {data.missing_suppliers.length > 10 && (
                  <li>...и ещё {data.missing_suppliers.length - 10}</li>
                )}
              </ul>
            </div>
          ),
        });
      }
    },
    onError: () => message.error('Ошибка валидации'),
  });

  const showValidationErrors = (errors: ProjectValidationError[], title: string) => {
    Modal.error({
      title,
      width: 720,
      content: (
        <div>
          {errors.map((error) => (
            <div key={error.code} style={{ marginBottom: 12 }}>
              <Text strong>{error.message}</Text>
              {Array.isArray(error.items) && error.items.length > 0 && (
                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                  {error.items.slice(0, 10).map((item, idx) => (
                    <li key={idx}>
                      <Text type="secondary">
                        {String(item.name || item.id || 'Позиция')}
                      </Text>
                    </li>
                  ))}
                  {error.items.length > 10 && (
                    <li>
                      <Text type="secondary">...и ещё {error.items.length - 10}</Text>
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      ),
    });
  };

  const validateProjectMutation = useMutation({
    mutationFn: () => projectsApi.validate(id!),
    onSuccess: (data) => {
      if (data.can_activate) {
        message.success('Проект готов к активации');
      } else {
        showValidationErrors(data.errors, 'Проект не готов к активации');
      }
    },
    onError: () => message.error('Ошибка проверки проекта'),
  });

  const activateProjectMutation = useMutation({
    mutationFn: () => projectsApi.activate(id!),
    onSuccess: () => {
      message.success('Проект активирован');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: (error: unknown) => {
      const responseErrors = (error as { response?: { data?: { errors?: ProjectValidationError[] } } })?.response?.data?.errors;
      if (responseErrors && responseErrors.length > 0) {
        showValidationErrors(responseErrors, 'Проект не может быть активирован');
        return;
      }
      message.error('Ошибка активации проекта');
    },
  });

  const activateWithReceiptsMutation = useMutation({
    mutationFn: (receipts: Array<{ project_item_id: string; warehouse_id: string; quantity: number }>) =>
      projectsApi.activateWithReceipts(id!, receipts),
    onSuccess: () => {
      message.success('Проект активирован');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', id] });
      setActivateReceiptModalOpen(false);
      setActivateAllocations({});
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error || error?.message;
      message.error(apiError || 'Ошибка активации проекта');
    },
  });
  
  // Purchase list query
  const { data: purchaseList, isLoading: purchaseListLoading } = useQuery({
    queryKey: ['project-purchase-list', id],
    queryFn: () => projectsApi.getPurchaseList(id!),
    enabled: purchaseListModalOpen,
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    return dayjs(dateStr).format('DD.MM.YYYY');
  };

  const projectItemMap = useMemo(() => {
    const map = new Map<string, ProjectItem>();
    projectItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [projectItems]);

  const projectItemChildrenMap = useMemo(() => {
    const map = new Map<string | null, ProjectItem[]>();
    projectItems.forEach((item) => {
      const parentKey = item.parent_item || null;
      const list = map.get(parentKey) || [];
      list.push(item);
      map.set(parentKey, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const orderA = a.category_sort_order ?? 0;
        const orderB = b.category_sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, 'ru');
      });
    });
    return map;
  }, [projectItems]);

  const getStatusMeta = (item: ProjectItem) => {
    if (item.is_purchased) {
      const colors: Record<string, string> = {
        waiting_order: 'orange',
        in_order: 'blue',
        closed: 'green',
        written_off: 'lime',
      };
      const labels: Record<string, string> = {
        waiting_order: 'Ожидает заказа',
        in_order: 'В заказе',
        closed: 'На складе',
        written_off: 'Списано',
      };
      return {
        color: colors[item.purchase_status] || 'default',
        label: labels[item.purchase_status] || item.purchase_status_display || 'Не определено',
      };
    }

    if (item.manufacturer_type === 'contractor') {
      const colors: Record<string, string> = {
        sent_to_contractor: 'default',
        in_progress_by_contractor: 'blue',
        suspended_by_contractor: 'orange',
        manufactured_by_contractor: 'cyan',
        completed: 'green',
      };
      const labels: Record<string, string> = {
        sent_to_contractor: 'Передано подрядчику',
        in_progress_by_contractor: 'В работе подрядчиком',
        suspended_by_contractor: 'Приостановлено подрядчиком',
        manufactured_by_contractor: 'Изготовлено подрядчиком',
        completed: 'Изготовлено',
      };
      const contractorStatus = item.contractor_status || 'sent_to_contractor';
      return {
        color: colors[contractorStatus] || 'default',
        label: labels[contractorStatus] || item.contractor_status_display || 'Не определено',
      };
    }

    const colors: Record<string, string> = {
      not_started: 'default',
      in_progress: 'blue',
      suspended: 'orange',
      completed: 'green',
    };
    const labels: Record<string, string> = {
      not_started: 'Не начато',
      in_progress: 'В работе',
      suspended: 'Приостановлено',
      completed: 'Изготовлено',
    };
    return {
      color: colors[item.manufacturing_status] || 'default',
      label: labels[item.manufacturing_status] || item.manufacturing_status_display || 'Не определено',
    };
  };

  const formatHistoryComment = (entry: ProjectItemHistoryEntry) => {
    if (entry.details && entry.details.length > 0) return entry.details.join('; ');
    if (entry.changes) return entry.changes;
    const typeLabels: Record<string, string> = {
      '+': 'Создание записи',
      '~': 'Изменение параметров',
      '-': 'Удаление записи',
    };
    return typeLabels[entry.type] || 'Обновление данных';
  };

  const structureRows = useMemo(() => {
    if (!selectedItem) return [] as Array<{ key: string; item: ProjectItem; isChild: boolean }>;
    const children = projectItemChildrenMap.get(selectedItem.id) || [];
    return [
      { key: selectedItem.id, item: selectedItem, isChild: false },
      ...children.map((child) => ({ key: child.id, item: child, isChild: true })),
    ];
  }, [selectedItem, projectItemChildrenMap]);

  const miniUpdateMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ProjectItem> }) => {
      return projectsApi.items.update(itemId, data);
    },
    onSuccess: () => {
      message.success('Позиция обновлена');
      queryClient.invalidateQueries({ queryKey: ['project-items'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: () => {
      message.error('Ошибка при сохранении');
    },
  });

  const MiniItemEditForm = ({ currentItem, onClose }: { currentItem: ProjectItem; onClose: () => void }) => {
    const [miniForm] = Form.useForm();

    const isPurchased = currentItem.is_purchased === true;
    const isContractor = currentItem.manufacturer_type === 'contractor';

    const reasonField = isPurchased ? 'purchase_problem_reason' : 'manufacturing_problem_reason';
    const subreasonField = isPurchased ? 'purchase_problem_subreason' : 'manufacturing_problem_subreason';

    const selectedReasonId = Form.useWatch(reasonField, miniForm);

    const { data: miniManufacturingSubreasonsData, isLoading: miniManufacturingSubreasonsLoading } = useQuery({
      queryKey: ['mini-manufacturing-problem-subreasons', selectedReasonId],
      queryFn: () => settingsApi.manufacturingProblemSubreasons.list({ reason: String(selectedReasonId), page_size: 200 }),
      enabled: editModalOpen && !isPurchased && !!selectedReasonId,
    });
    const miniManufacturingSubreasons = miniManufacturingSubreasonsData?.results || [];

    const { data: miniPurchaseSubreasonsData, isLoading: miniPurchaseSubreasonsLoading } = useQuery({
      queryKey: ['mini-purchase-problem-subreasons', selectedReasonId],
      queryFn: () => settingsApi.purchaseProblemSubreasons.list({ reason: String(selectedReasonId), page_size: 200 }),
      enabled: editModalOpen && isPurchased && !!selectedReasonId,
    });
    const miniPurchaseSubreasons = miniPurchaseSubreasonsData?.results || [];

    useEffect(() => {
      miniForm.setFieldsValue({
        manufacturing_status: currentItem.manufacturing_status ?? null,
        contractor_status: currentItem.contractor_status ?? null,
        purchase_status: currentItem.purchase_status ?? null,

        manufacturing_problem_reason: (currentItem as any).manufacturing_problem_reason ?? null,
        manufacturing_problem_subreason: (currentItem as any).manufacturing_problem_subreason ?? null,
        purchase_problem_reason: (currentItem as any).purchase_problem_reason ?? null,
        purchase_problem_subreason: (currentItem as any).purchase_problem_subreason ?? null,

        notes: currentItem.notes ?? '',
        delay_notes: currentItem.delay_notes ?? '',

        planned_start: !isPurchased && currentItem.planned_start ? dayjs(currentItem.planned_start) : null,
        planned_end: !isPurchased && currentItem.planned_end ? dayjs(currentItem.planned_end) : null,
        order_date: isPurchased && (currentItem as any).order_date ? dayjs((currentItem as any).order_date) : null,
        required_date: isPurchased && (currentItem as any).required_date ? dayjs((currentItem as any).required_date) : null,
        actual_start: currentItem.actual_start ? dayjs(currentItem.actual_start) : null,
        actual_end: currentItem.actual_end ? dayjs(currentItem.actual_end) : null,
      });
    }, [currentItem, isPurchased, miniForm]);

    const statusField = isPurchased ? 'purchase_status' : isContractor ? 'contractor_status' : 'manufacturing_status';
    const statusOptions = isPurchased
      ? [
          { value: 'waiting_order', label: 'Ожидает заказа' },
          { value: 'in_order', label: 'В заказе' },
          { value: 'closed', label: 'На складе' },
          { value: 'written_off', label: 'Списано' },
        ]
      : isContractor
        ? [
            { value: 'sent_to_contractor', label: 'Передано подрядчику' },
            { value: 'in_progress_by_contractor', label: 'В работе подрядчиком' },
            { value: 'suspended_by_contractor', label: 'Приостановлено' },
            { value: 'manufactured_by_contractor', label: 'Изготовлено подрядчиком' },
            { value: 'completed', label: 'Изготовлено' },
          ]
        : [
            { value: 'not_started', label: 'Не начато' },
            { value: 'in_progress', label: 'В работе' },
            { value: 'suspended', label: 'Приостановлено' },
            { value: 'completed', label: 'Изготовлено' },
          ];

    const reasonOptions = isPurchased ? purchaseProblemReasons : manufacturingProblemReasons;
    const subreasonOptions = isPurchased ? miniPurchaseSubreasons : miniManufacturingSubreasons;
    const subreasonsLoading = isPurchased ? miniPurchaseSubreasonsLoading : miniManufacturingSubreasonsLoading;

    const handleSaveMini = async () => {
      const values = await miniForm.validateFields();

      const nextReason = (values as any)[reasonField] ?? null;
      const nextDelayNotes = (values.delay_notes ?? '').trim();
      const previousReason = (currentItem as any)[reasonField] ?? null;
      const previousDelayNotes = (currentItem.delay_notes ?? '').trim();

      if (nextReason) {
        if (!nextDelayNotes) {
          miniForm.setFields([{ name: 'delay_notes', errors: ['Укажите комментарий по проблеме / отклонению.'] }]);
          return;
        }
        if (nextReason !== previousReason && nextDelayNotes === previousDelayNotes) {
          miniForm.setFields([{ name: 'delay_notes', errors: ['Обновите комментарий по проблеме / отклонению.'] }]);
          return;
        }
      } else {
        values.delay_notes = '';
        miniForm.setFieldValue('delay_notes', '');
      }

      (values as any).manufacturing_problem_reason = (values as any).manufacturing_problem_reason ?? null;
      (values as any).manufacturing_problem_subreason = (values as any).manufacturing_problem_subreason ?? null;
      (values as any).purchase_problem_reason = (values as any).purchase_problem_reason ?? null;
      (values as any).purchase_problem_subreason = (values as any).purchase_problem_subreason ?? null;

      if (!(values as any).manufacturing_problem_reason) {
        (values as any).manufacturing_problem_subreason = null;
      }
      if (!(values as any).purchase_problem_reason) {
        (values as any).purchase_problem_subreason = null;
      }

      const formatted: Record<string, any> = {
        ...values,
      };
      for (const key of ['planned_start', 'planned_end', 'order_date', 'required_date', 'actual_start', 'actual_end'] as const) {
        if (!(key in values)) continue;
        const v = (values as any)[key];
        formatted[key] = v ? v.format('YYYY-MM-DD') : null;
      }

      const patch: Partial<ProjectItem> = {};
      for (const [key, nextValue] of Object.entries(formatted)) {
        if (nextValue === undefined) continue;
        const prevValue = (currentItem as any)[key];
        if (prevValue !== nextValue) {
          (patch as any)[key] = nextValue;
        }
      }

      if (currentItem.purchase_by_contractor === true) {
        delete (patch as any).purchase_status;
      }

      if (Object.keys(patch).length === 0) {
        message.info('Изменений нет');
        onClose();
        return;
      }

      miniUpdateMutation.mutate(
        { itemId: currentItem.id, data: patch },
        {
          onSuccess: () => {
            onClose();
          },
        }
      );
    };

    return (
      <Form form={miniForm} layout="vertical" style={{ width: 420 }}>
        <Form.Item label="Статус" name={statusField} style={{ marginBottom: 8 }}>
          {currentItem.purchase_by_contractor === true ? (
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
              Не требуется (подрядчик)
            </Tag>
          ) : (
            <Select size="small" options={statusOptions} />
          )}
        </Form.Item>

        <Form.Item label="Проблема / отклонение" name={reasonField} style={{ marginBottom: 4 }}>
          <Select
            size="small"
            allowClear
            placeholder="Выберите причину"
            showSearch
            filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            onChange={() => {
              miniForm.setFieldValue(subreasonField, null);
            }}
            options={reasonOptions.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>

        {!!selectedReasonId && (
          <Form.Item name={subreasonField} style={{ marginTop: -4, marginBottom: 8 }}>
            <Select
              size="small"
              allowClear
              placeholder="Выберите подпричину"
              loading={subreasonsLoading}
              showSearch
              filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={subreasonOptions.map((sr: { id: string; name: string }) => ({ value: sr.id, label: sr.name }))}
            />
          </Form.Item>
        )}

        <Form.Item label="Комментарий" name="notes" style={{ marginBottom: 8 }}>
          <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Комментарий" />
        </Form.Item>
        <Form.Item label="Комментарий по проблеме / отклонению" name="delay_notes" style={{ marginBottom: 8 }}>
          <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Комментарий по проблеме" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {isPurchased ? (
            <>
              <Form.Item label="План. заказа" name="order_date" style={{ marginBottom: 8 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="План. поставки" name="required_date" style={{ marginBottom: 8 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="Факт. заказа" name="actual_start" style={{ marginBottom: 0 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="Факт. поставки" name="actual_end" style={{ marginBottom: 0 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item label="План. начало" name="planned_start" style={{ marginBottom: 8 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="План. оконч." name="planned_end" style={{ marginBottom: 8 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="Факт. начало" name="actual_start" style={{ marginBottom: 0 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Form.Item label="Факт. оконч." name="actual_end" style={{ marginBottom: 0 }}>
                <DatePicker size="small" style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </>
          )}
        </div>

        <Space style={{ marginTop: 10, justifyContent: 'flex-end', width: '100%' }}>
          <Button size="small" onClick={onClose}>
            Закрыть
          </Button>
          <Button size="small" type="primary" loading={miniUpdateMutation.isPending} onClick={handleSaveMini}>
            Сохранить
          </Button>
        </Space>
      </Form>
    );
  };

  const structureColumns: ColumnsType<{ key: string; item: ProjectItem; isChild: boolean }> = [
    {
      title: 'Наименование',
      dataIndex: 'item',
      key: 'name',
      width: 216,
      render: (item: ProjectItem, row) => {
        const nameNode = (
          <Text
            strong={!row.isChild}
            style={{ fontSize: 12, cursor: row.isChild ? 'pointer' : 'default', maxWidth: '100%' }}
            ellipsis={{ tooltip: item.name }}
          >
            {item.name}
          </Text>
        );
        return (
          <div style={{ paddingLeft: row.isChild ? 16 : 0 }}>
            {row.isChild ? (
              <Popover
                trigger="click"
                open={miniOpenItemId === item.id}
                onOpenChange={(nextOpen) => setMiniOpenItemId(nextOpen ? item.id : null)}
                placement="rightTop"
                overlayStyle={{ maxWidth: 480 }}
                content={<MiniItemEditForm currentItem={item} onClose={() => setMiniOpenItemId(null)} />}
              >
                {nameNode}
              </Popover>
            ) : (
              nameNode
            )}
          </div>
        );
      },
    },
    {
      title: '%',
      dataIndex: 'item',
      key: 'progress',
      width: 70,
      render: (item: ProjectItem) => {
        const value = Math.round(item.calculated_progress ?? item.progress_percent ?? 0);
        return <Tag color={value >= 100 ? 'green' : 'blue'}>{value}%</Tag>;
      },
    },
    {
      title: 'Статус',
      dataIndex: 'item',
      key: 'status',
      width: 160,
      ellipsis: { showTitle: false },
      render: (item: ProjectItem) => {
        const status = getStatusMeta(item);
        return (
          <Tooltip title={status.label}>
            <Tag
              color={status.color}
              style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {status.label}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Ответственный',
      dataIndex: 'item',
      key: 'responsible',
      width: 150,
      ellipsis: { showTitle: false },
      render: (item: ProjectItem) => {
        const fullName = item.responsible_detail?.full_name || '';
        if (!fullName) return <Text style={{ fontSize: 12 }}>—</Text>;
        const shortName = formatUserShort(fullName);
        return (
          <Tooltip title={fullName}>
            <Text style={{ fontSize: 12, display: 'block', maxWidth: '100%' }} ellipsis>
              {shortName}
            </Text>
          </Tooltip>
        );
      },
    },
  ];

  const getStructureRowStyle = (item: ProjectItem, isChild: boolean) => {
    const baseStyle = { fontSize: 12, lineHeight: '16px', height: 26 } as const;
    if (!isChild) return baseStyle;
    if (item.has_problem) {
      return { ...baseStyle, background: '#fff1f0' };
    }
    const status = getStatusMeta(item);
    const map: Record<string, string> = {
      green: '#f6ffed',
      blue: '#e6f4ff',
      orange: '#fff7e6',
      red: '#fff1f0',
      default: '#fafafa',
      purple: '#f9f0ff',
      geekblue: '#f0f5ff',
    };
    return { ...baseStyle, background: map[status.color] || '#fafafa' };
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    navigate(`/projects/${id}/${key}`, { replace: true });
  };

  const handleEditItem = (item: ProjectItem) => {
    setSelectedItem(item);
    editForm.setFieldsValue({
      ...item,
      planned_start: item.planned_start ? dayjs(item.planned_start) : null,
      planned_end: item.planned_end ? dayjs(item.planned_end) : null,
      actual_start: item.actual_start ? dayjs(item.actual_start) : null,
      actual_end: item.actual_end ? dayjs(item.actual_end) : null,
      required_date: item.required_date ? dayjs(item.required_date) : null,
      order_date: item.order_date ? dayjs(item.order_date) : null,
    });
    setInitialDelayNotes(item.delay_notes || '');
    setEditModalOpen(true);
  };
  
  const handleSetContractor = (item: ProjectItem) => {
    setSelectedItem(item);
    contractorForm.setFieldsValue({
      contractor_id: item.contractor || undefined,
      material_supply_type: item.material_supply_type || 'our_supply',
      cascade: false,
    });
    setContractorModalOpen(true);
  };
  
  const handleSetResponsible = (item: ProjectItem) => {
    setSelectedItem(item);
    responsibleForm.setFieldsValue({
      responsible_id: item.responsible || undefined,
      cascade: true,
    });
    setResponsibleModalOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    const values = await editForm.validateFields();

    const reasonField = selectedItem.is_purchased ? 'purchase_problem_reason' : 'manufacturing_problem_reason';
    const nextReason = (values as any)[reasonField] ?? null;
    const nextDelayNotes = (values.delay_notes ?? '').trim();
    const previousReason = (selectedItem as any)[reasonField] ?? null;
    const previousDelayNotes = (initialDelayNotes ?? '').trim();

    // Normalize cleared values for PATCH (Select allowClear -> undefined).
    values.supplier = values.supplier ?? null;
    values.manufacturing_problem_reason = values.manufacturing_problem_reason ?? null;
    values.manufacturing_problem_subreason = values.manufacturing_problem_subreason ?? null;
    values.purchase_problem_reason = values.purchase_problem_reason ?? null;
    values.purchase_problem_subreason = values.purchase_problem_subreason ?? null;

    if (!values.manufacturing_problem_reason) {
      values.manufacturing_problem_subreason = null;
      editForm.setFieldValue('manufacturing_problem_subreason', null);
    }
    if (!values.purchase_problem_reason) {
      values.purchase_problem_subreason = null;
      editForm.setFieldValue('purchase_problem_subreason', null);
    }

    if (nextReason) {
      if (!nextDelayNotes) {
        editForm.setFields([{ name: 'delay_notes', errors: ['Укажите комментарий по проблеме / отклонению.'] }]);
        return;
      }
      if (nextReason !== previousReason && nextDelayNotes === previousDelayNotes) {
        editForm.setFields([{ name: 'delay_notes', errors: ['Обновите комментарий по проблеме / отклонению.'] }]);
        return;
      }
    } else {
      // При снятии причины очищаем комментарий при сохранении
      values.delay_notes = '';
      editForm.setFieldValue('delay_notes', '');
    }

    if (selectedItem.is_purchased && project?.status === 'in_progress') {
      const nextStatus = values.purchase_status as string | undefined;
      const currentStatus = selectedItem.purchase_status;

      if (currentStatus === 'in_order' && nextStatus && nextStatus !== currentStatus) {
        message.warning('Статус «В заказе» меняется автоматически при отмене заказа или при приёмке.');
        return;
      }

      if (currentStatus === 'waiting_order' && nextStatus && nextStatus !== currentStatus) {
        if (nextStatus === 'closed') {
          setCloseActionItem(selectedItem);
          setCloseActionModalOpen(true);
          setEditModalOpen(false);
          return;
        }
        message.warning('Статус «Ожидает заказа» меняется автоматически через заказ.');
        return;
      }
    }

    const formatted: Record<string, any> = {
      ...values,
      planned_start: values.planned_start ? values.planned_start.format('YYYY-MM-DD') : null,
      planned_end: values.planned_end ? values.planned_end.format('YYYY-MM-DD') : null,
      actual_start: values.actual_start ? values.actual_start.format('YYYY-MM-DD') : null,
      actual_end: values.actual_end ? values.actual_end.format('YYYY-MM-DD') : null,
      required_date: values.required_date ? values.required_date.format('YYYY-MM-DD') : null,
      order_date: values.order_date ? values.order_date.format('YYYY-MM-DD') : null,
    };

    const patch: Partial<ProjectItem> = {};
    for (const [key, nextValue] of Object.entries(formatted)) {
      if (nextValue === undefined) continue;
      const prevValue = (selectedItem as any)[key];
      if (prevValue !== nextValue) {
        (patch as any)[key] = nextValue;
      }
    }

    if (Object.keys(patch).length === 0) {
      message.info('Изменений нет');
      setEditModalOpen(false);
      setSelectedItem(null);
      return;
    }

    updateItemMutation.mutate({
      itemId: selectedItem.id,
      data: patch,
    });
  };

  const handleConfirmReserve = () => {
    if (!closeActionItem) return;
    if (!canReserve) {
      message.warning('Укажите корректный объём резерва по складам.');
      return;
    }
    const allocations = Object.entries(reserveAllocations)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([stock_item_id, qty]) => ({ stock_item_id, quantity: Number(qty) }));
    reserveStockMutation.mutate({ itemId: closeActionItem.id, allocations });
  };

  const handleConfirmReceive = () => {
    if (!closeActionItem) return;
    if (!canReceive) {
      message.warning('Сумма поступления должна быть равна количеству позиции, укажите склад(а).');
      return;
    }
    const allocations = receiveAllocations
      .filter((a) => Number(a.quantity) > 0)
      .map((a) => ({ warehouse_id: a.warehouse_id, quantity: Number(a.quantity) }));
    receiveAndCloseMutation.mutate({ itemId: closeActionItem.id, allocations });
  };

  const handleConfirmActivateReceipts = () => {
    if (planningClosedItems.length === 0) {
      activateProjectMutation.mutate();
      return;
    }

    const missing = planningClosedItems.filter((item) => !activateAllocations[item.id]);
    if (missing.length > 0) {
      message.warning('Укажите склад для всех позиций «На складе».');
      return;
    }

    const receipts = planningClosedItems.map((item) => ({
      project_item_id: item.id,
      warehouse_id: activateAllocations[item.id],
      quantity: Number(item.quantity),
    }));

    activateWithReceiptsMutation.mutate(receipts);
  };
  
  const handleAddProduct = async () => {
    const values = await addProductForm.validateFields();
    addProductMutation.mutate({
      nomenclatureItemId: values.nomenclature_item,
      quantity: values.quantity || 1,
    });
  };
  
  const handleSetContractorSubmit = async () => {
    if (!selectedItem) return;
    const values = await contractorForm.validateFields();
    setContractorMutation.mutate({
      itemId: selectedItem.id,
      contractorId: values.contractor_id,
      materialSupplyType: values.material_supply_type,
      cascade: values.cascade || false,
    });
  };
  
  const handleSetResponsibleSubmit = async () => {
    if (!selectedItem) return;
    const values = await responsibleForm.validateFields();
    setResponsibleMutation.mutate({
      itemId: selectedItem.id,
      responsibleId: values.responsible_id,
      cascade: values.cascade ?? true,
    });
  };

  const planningClosedItems = useMemo(() => {
    if (project?.status !== 'planning') return [];
    return projectItems.filter(i => i.is_purchased && i.purchase_status === 'closed');
  }, [project?.status, projectItems]);

  const handleActivateProject = () => {
    if (project?.status === 'planning' && planningClosedItems.length > 0) {
      const initialAllocations = planningClosedItems.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = acc[item.id] || '';
        return acc;
      }, {});
      setActivateAllocations(initialAllocations);
      setActivateReceiptModalOpen(true);
      return;
    }
    activateProjectMutation.mutate();
  };

  const purchaseStatusOptions = useMemo(() => {
    if (!selectedItem?.is_purchased) return [];

    const labels: Record<string, string> = {
      waiting_order: 'Ожидает заказа',
      in_order: 'В заказе',
      partially_delivered: 'Частично поставлен',
      partially_received: 'Частично получено',
      delivered: 'Получено',
      closed: 'На складе',
      written_off: 'Списано',
    };

    const currentOption = selectedItem.purchase_status
      ? [{
          value: selectedItem.purchase_status,
          label: labels[selectedItem.purchase_status]
            || selectedItem.purchase_status_display
            || selectedItem.purchase_status,
        }]
      : [];

    const uniqByValue = (options: Array<{ value: string; label: string }>) => {
      const seen = new Set<string>();
      return options.filter((opt) => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      });
    };

    if (project?.status === 'planning') {
      if (selectedItem.purchase_status === 'closed') {
        return uniqByValue([
          ...currentOption,
          { value: 'written_off', label: labels.written_off },
        ]);
      }
      if (selectedItem.purchase_status === 'written_off') {
        return uniqByValue([
          ...currentOption,
          { value: 'closed', label: labels.closed },
        ]);
      }
      return uniqByValue([
        ...currentOption,
        { value: 'waiting_order', label: labels.waiting_order },
      ]);
    }

    if (project?.status === 'in_progress') {
      if (selectedItem.purchase_status === 'in_order') {
        return uniqByValue([
          ...currentOption,
          { value: 'in_order', label: labels.in_order },
        ]);
      }
      if (selectedItem.purchase_status === 'waiting_order') {
        return uniqByValue([
          ...currentOption,
          { value: 'waiting_order', label: labels.waiting_order },
          { value: 'closed', label: labels.closed },
        ]);
      }
      if (selectedItem.purchase_status === 'closed') {
        return uniqByValue([
          ...currentOption,
          { value: 'written_off', label: labels.written_off },
        ]);
      }
      if (selectedItem.purchase_status === 'written_off') {
        return uniqByValue([
          ...currentOption,
          { value: 'closed', label: labels.closed },
        ]);
      }
      return uniqByValue([...currentOption]);
    }

    return uniqByValue([
      ...currentOption,
      { value: 'waiting_order', label: labels.waiting_order },
      { value: 'in_order', label: labels.in_order },
      { value: 'closed', label: labels.closed },
      { value: 'written_off', label: labels.written_off },
    ]);
  }, [project?.status, selectedItem?.is_purchased, selectedItem?.purchase_status]);

  const requiredCloseQty = closeActionItem ? Number(closeActionItem.quantity) : 0;

  const reserveTotal = useMemo(() => {
    return Object.values(reserveAllocations).reduce((sum, qty) => sum + Number(qty || 0), 0);
  }, [reserveAllocations]);

  const reserveHasOver = useMemo(() => {
    return stockItems.some(item => (reserveAllocations[item.id] || 0) > Number(item.available_quantity || 0));
  }, [reserveAllocations, stockItems]);

  const canReserve = requiredCloseQty > 0 && reserveTotal === requiredCloseQty && !reserveHasOver;

  const receiveTotal = useMemo(() => {
    return receiveAllocations.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [receiveAllocations]);

  const canReceive = requiredCloseQty > 0 && receiveTotal === requiredCloseQty && receiveAllocations.every(a => a.warehouse_id);

  const reserveColumns: ColumnsType<StockItem> = useMemo(() => [
    {
      title: 'Склад',
      dataIndex: 'warehouse_name',
      key: 'warehouse',
      render: (_, record) => record.warehouse_name || record.warehouse,
    },
    {
      title: 'Доступно',
      dataIndex: 'available_quantity',
      key: 'available',
      width: 120,
      align: 'right',
      render: (val) => Number(val || 0).toLocaleString('ru-RU'),
    },
    {
      title: 'Резерв',
      key: 'reserve',
      width: 140,
      render: (_, record) => (
        <InputNumber
          min={0}
          max={Number(record.available_quantity || 0)}
          value={reserveAllocations[record.id] || 0}
          onChange={(val) => {
            const qty = Number(val || 0);
            setReserveAllocations(prev => ({ ...prev, [record.id]: qty }));
          }}
          style={{ width: '100%' }}
        />
      ),
    },
  ], [reserveAllocations, stockItems]);

  const activationColumns: ColumnsType<ProjectItem> = useMemo(() => [
    {
      title: 'Позиция',
      key: 'item',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.name}</Text>
        </Space>
      ),
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      width: 120,
      align: 'right',
      render: (val, item) => `${Number(val).toLocaleString('ru-RU')} ${item.unit || ''}`,
    },
    {
      title: 'Склад',
      key: 'warehouse',
      width: 240,
      render: (_, item) => (
        <Select
          placeholder="Выберите склад"
          style={{ width: '100%' }}
          value={activateAllocations[item.id]}
          onChange={(value) => {
            setActivateAllocations(prev => ({ ...prev, [item.id]: value }));
          }}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        />
      ),
    },
  ], [activateAllocations, warehouses]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: projectItems.length,
    completed: projectItems.filter((i: ProjectItem) => i.manufacturing_status === 'completed').length,
    inProgress: projectItems.filter((i: ProjectItem) => i.manufacturing_status === 'in_progress').length,
    notStarted: projectItems.filter((i: ProjectItem) => i.manufacturing_status === 'not_started').length,
    overdue: projectItems.filter((i: ProjectItem) => i.is_overdue).length,
    withoutSupplier: projectItems.filter((i: ProjectItem) => 
      ['material', 'standard_product', 'other_product'].includes(i.category) && !i.supplier
    ).length,
    withoutContractor: projectItems.filter((i: ProjectItem) => 
      i.manufacturer_type === 'contractor' && !i.contractor
    ).length,
  }), [projectItems]);

  // Group items for tables
  const manufacturedItems = useMemo(() => 
    projectItems.filter((i: ProjectItem) => !i.is_purchased),
    [projectItems]
  );
  const purchasedItems = useMemo(() => 
    projectItems.filter((i: ProjectItem) => i.is_purchased),
    [projectItems]
  );

  // Get unique responsibles for filter
  const uniqueResponsibles = useMemo(() => {
    const responsiblesMap = new Map<string, string>();
    projectItems.forEach((item: ProjectItem) => {
      if (item.responsible && item.responsible_detail) {
        responsiblesMap.set(item.responsible, item.responsible_detail.full_name);
      }
    });
    return Array.from(responsiblesMap.entries()).map(([id, name]) => ({
      text: name,
      value: id,
    }));
  }, [projectItems]);

  // Item columns for Production tab
  // Уникальные категории для фильтрации производства (только изготавливаемые)
  const uniqueManufacturingCategories = useMemo(() => {
    const categories = new Map<string, string>();
    manufacturedItems.forEach(item => {
      if (item.category_display) {
        categories.set(item.category, item.category_display);
      }
    });
    return Array.from(categories.entries()).map(([value, text]) => ({ text, value }));
  }, [manufacturedItems]);

  // Уникальные категории для фильтрации закупок (только закупаемые)
  const uniquePurchaseCategories = useMemo(() => {
    const categories = new Map<string, string>();
    purchasedItems.forEach(item => {
      if (item.category_display) {
        categories.set(item.category, item.category_display);
      }
    });
    return Array.from(categories.entries()).map(([value, text]) => ({ text, value }));
  }, [purchasedItems]);

  // Колонки для вкладки Производство
  const itemColumns: ColumnsType<ProjectItem> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name, 'ru'),
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Text>{name}</Text>
          {record.drawing_number && <Text type="secondary">{record.drawing_number}</Text>}
        </Space>
      ),
    },
    {
      title: 'Вид справочника',
      dataIndex: 'category_display',
      key: 'category',
      width: 150,
      filters: uniqueManufacturingCategories,
      onFilter: (value, record) => record.category === value,
      render: (category) => category || '—',
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty, record) => `${qty} ${record.unit || 'шт'}`,
    },
    {
      title: 'Статус',
      dataIndex: 'manufacturing_status',
      key: 'status',
      width: 150,
      filters: [
        { text: 'Не начато', value: 'not_started' },
        { text: 'В работе', value: 'in_progress' },
        { text: 'Выполнено', value: 'completed' },
        { text: 'Приостановлено', value: 'suspended' },
        { text: 'Ожидание материалов', value: 'waiting_materials' },
        { text: 'Передано подрядчику', value: 'contractor:sent_to_contractor' },
        { text: 'В работе подрядчиком', value: 'contractor:in_progress_by_contractor' },
        { text: 'Приостановлено подрядчиком', value: 'contractor:suspended_by_contractor' },
        { text: 'Изготовлено подрядчиком', value: 'contractor:manufactured_by_contractor' },
        { text: 'Изготовлено (подрядчик)', value: 'contractor:completed' },
      ],
      onFilter: (value, record) => {
        const filterValue = String(value);
        if (filterValue.startsWith('contractor:')) {
          const contractorStatus = filterValue.replace('contractor:', '');
          return record.manufacturer_type === 'contractor' && record.contractor_status === contractorStatus;
        }
        return record.manufacturer_type !== 'contractor' && record.manufacturing_status === filterValue;
      },
      render: (status, record) => {
        if (record.manufacturer_type === 'contractor') {
          const labels: Record<string, string> = {
            sent_to_contractor: 'Передано подрядчику',
            in_progress_by_contractor: 'В работе подрядчиком',
            suspended_by_contractor: 'Приостановлено подрядчиком',
            manufactured_by_contractor: 'Изготовлено подрядчиком',
            completed: 'Изготовлено',
          };
          const colors: Record<string, string> = {
            sent_to_contractor: 'default',
            in_progress_by_contractor: 'blue',
            suspended_by_contractor: 'orange',
            manufactured_by_contractor: 'cyan',
            completed: 'green',
          };
          const contractorStatus = record.contractor_status || 'sent_to_contractor';
          const label = record.contractor_status_display || labels[contractorStatus] || contractorStatus || '—';
          return <Tag color={colors[contractorStatus] || 'default'}>{label}</Tag>;
        }

        return <StatusBadge status={status} size="small" />;
      },
    },
    {
      title: 'Изготовитель',
      key: 'manufacturer',
      width: 200,
      filters: [
        { text: 'Своими силами', value: 'internal' },
        { text: 'Подрядчик', value: 'contractor' },
      ],
      onFilter: (value, record) => record.manufacturer_type === value,
      render: (_, record) => (
        record.manufacturer_type === 'contractor' && record.contractor_detail ? (
          <Tag icon={<TeamOutlined />} color="purple">
            {record.contractor_detail.short_name || record.contractor_detail.name}
          </Tag>
        ) : record.manufacturer_type === 'contractor' ? (
          <Tag icon={<TeamOutlined />} color="orange">Не выбран</Tag>
        ) : (
          <Tag icon={<ToolOutlined />} color="blue">Своими силами</Tag>
        )
      ),
    },
    {
      title: 'Плановое начало',
      dataIndex: 'planned_start',
      key: 'planned_start',
      width: 120,
      sorter: (a, b) => {
        if (!a.planned_start) return 1;
        if (!b.planned_start) return -1;
        return new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime();
      },
      render: formatDate,
    },
    {
      title: 'Плановое окончание',
      dataIndex: 'planned_end',
      key: 'planned_end',
      width: 120,
      sorter: (a, b) => {
        if (!a.planned_end) return 1;
        if (!b.planned_end) return -1;
        return new Date(a.planned_end).getTime() - new Date(b.planned_end).getTime();
      },
      render: (date, record) => (
        <Space>
          {formatDate(date)}
          {record.is_overdue && <Tag color="red">!</Tag>}
        </Space>
      ),
    },
    {
      title: 'Ответственный',
      key: 'responsible',
      width: 150,
      filters: uniqueResponsibles,
      onFilter: (value, record) => record.responsible === value,
      render: (_, record) => record.responsible_detail?.full_name || <Text type="secondary">—</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Редактировать">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditItem(record)} />
          </Tooltip>
          <Tooltip title="Назначить подрядчика">
            <Button type="text" size="small" icon={<TeamOutlined />} onClick={() => handleSetContractor(record)} />
          </Tooltip>
          <Tooltip title="Назначить ответственного">
            <Button type="text" size="small" icon={<UserOutlined />} onClick={() => handleSetResponsible(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Purchase columns for Procurement tab
  // Колонки для вкладки Закупки
  const purchaseColumns: ColumnsType<ProjectItem> = [
    {
      title: 'Наименование',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name, 'ru'),
    },
    {
      title: 'Вид справочника',
      dataIndex: 'category_display',
      key: 'category',
      width: 150,
      filters: uniquePurchaseCategories,
      onFilter: (value, record) => record.category === value,
      render: (category) => category || '—',
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty, record) => `${qty} ${record.unit || 'шт'}`,
    },
    {
      title: 'Статус',
      dataIndex: 'purchase_status',
      key: 'purchase_status',
      width: 130,
      filters: [
        { text: 'Ожидает заказа', value: 'waiting_order' },
        { text: 'В заказе', value: 'in_order' },
        { text: 'На складе', value: 'closed' },
      ],
      onFilter: (value, record) => record.purchase_status === value,
      render: (status, record) => {
        if (record.purchase_by_contractor) {
          return <Tag color="purple">Передано подрядчику</Tag>;
        }
        const colors: Record<string, string> = {
          not_required: 'default',
          pending: 'orange',
          waiting_order: 'orange',
          in_order: 'blue',
          closed: 'green',
          written_off: 'lime',
        };
        const labels: Record<string, string> = {
          not_required: 'Не требуется',
          pending: 'Ожидает заказа',
          waiting_order: 'Ожидает заказа',
          in_order: 'В заказе',
          closed: 'На складе',
          written_off: 'Списано',
        };
        return (
          <Tag color={colors[status] || 'default'}>
            {labels[status] || record.purchase_status_display || 'Не определен'}
          </Tag>
        );
      },
    },
    {
      title: 'Проблема',
      dataIndex: 'has_problem',
      key: 'has_problem',
      width: 100,
      align: 'center',
      render: (val) => (val ? <Tag color="red">Да</Tag> : <Tag color="green">Нет</Tag>),
      filters: [
        { text: 'Да', value: true },
        { text: 'Нет', value: false },
      ],
      onFilter: (value, record) => record.has_problem === value,
    },
    {
      title: 'Причина проблемы',
      key: 'problem_reason',
      width: 200,
      render: (_, record) => record.problem_reason_detail?.name || '—',
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      width: 180,
      render: (_, record) => {
        if (record.purchase_by_contractor) {
          return <Tag color="purple">Не требуется (подрядчик)</Tag>;
        }
        return record.supplier_detail?.name || <Text type="warning">Не указан</Text>;
      },
    },
    {
      title: 'Заказать до',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 110,
      sorter: (a, b) => {
        if (!a.order_date) return 1;
        if (!b.order_date) return -1;
        return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
      },
      render: (date, record) => record.purchase_by_contractor ? '—' : formatDate(date),
    },
    {
      title: 'Срок поставки',
      dataIndex: 'required_date',
      key: 'required_date',
      width: 110,
      sorter: (a, b) => {
        if (!a.required_date) return 1;
        if (!b.required_date) return -1;
        return new Date(a.required_date).getTime() - new Date(b.required_date).getTime();
      },
      render: formatDate,
    },
    {
      title: 'Ответственный',
      key: 'responsible',
      width: 150,
      filters: uniqueResponsibles,
      onFilter: (value, record) => record.responsible === value,
      render: (_, record) => record.responsible_detail?.full_name || <Text type="secondary">—</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditItem(record)} />
      ),
    },
  ];

  if (projectLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Не удалось загрузить проект"
          description="Проверьте доступность API и повторите попытку."
          action={<Button onClick={() => refetchProject()}>Повторить</Button>}
          showIcon
        />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'overview',
      label: 'Обзор',
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Warnings */}
          {(stats.withoutSupplier > 0 || stats.withoutContractor > 0 || stats.overdue > 0) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {stats.withoutSupplier > 0 && (
                  <Alert
                    type="warning"
                    message={`${stats.withoutSupplier} закупаемых позиций без поставщика`}
                    action={
                      <Button size="small" onClick={() => validateSuppliersMutation.mutate()}>
                        Показать
                      </Button>
                    }
                  />
                )}
                {stats.withoutContractor > 0 && (
                  <Alert
                    type="warning"
                    message={`${stats.withoutContractor} позиций у подрядчиков без указания подрядчика`}
                  />
                )}
                {stats.overdue > 0 && (
                  <Alert type="error" message={`${stats.overdue} просроченных позиций`} />
                )}
              </Space>
            </div>
          )}
          
          {/* Project Info */}
          <Card title="Информация о проекте" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Наименование">{project.name}</Descriptions.Item>
              <Descriptions.Item label="Описание">{project.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="Изделие">
                {project.nomenclature_item_detail ? (
                  <Tag color="blue">
                    {project.nomenclature_item_detail.name}
                  </Tag>
                ) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Руководитель">
                <Space>
                  <UserOutlined />
                  {project.project_manager_name || 'Не назначен'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Создан">{formatDate(project.created_at)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Dates & Progress */}
          <Card title="Сроки и прогресс" size="small">
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Общий прогресс</Text>
              <Progress
                percent={project.progress || 0}
                strokeColor={(project.progress || 0) >= 70 ? '#52c41a' : '#1890ff'}
              />
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="План начала">{formatDate(project.start_date)}</Descriptions.Item>
              <Descriptions.Item label="План окончания">{formatDate(project.planned_end_date)}</Descriptions.Item>
              <Descriptions.Item label="Факт окончания">{formatDate(project.actual_end_date)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Quick Stats */}
          <Card title="Статистика" size="small" style={{ gridColumn: '1 / -1' }}>
            <Space size="large" wrap>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }}>{stats.total}</div>
                <Text type="secondary">Всего позиций</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>{stats.completed}</div>
                <Text type="secondary">Выполнено</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }}>{stats.inProgress}</div>
                <Text type="secondary">В работе</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#faad14' }}>{stats.notStarted}</div>
                <Text type="secondary">Не начато</Text>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>{stats.overdue}</div>
                <Text type="secondary">Просрочено</Text>
              </div>
            </Space>
          </Card>
          
          {/* Actions */}
          <Card title="Действия" size="small" style={{ gridColumn: '1 / -1' }}>
            <Space wrap>
              <Button
                icon={<WarningOutlined />}
                onClick={() => validateProjectMutation.mutate()}
                loading={validateProjectMutation.isPending}
              >
                Проверить готовность
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleActivateProject}
                loading={activateProjectMutation.isPending || activateWithReceiptsMutation.isPending}
                disabled={project?.status === 'in_progress'}
              >
                Активировать проект
              </Button>
              <Button icon={<CheckCircleOutlined />} onClick={() => validateSuppliersMutation.mutate()} loading={validateSuppliersMutation.isPending}>
                Проверить поставщиков
              </Button>
              <Button icon={<ShoppingCartOutlined />} onClick={() => setPurchaseListModalOpen(true)}>
                Ведомость закупок
              </Button>
              <Button icon={<SyncOutlined />} onClick={() => refetchItems()}>
                Обновить
              </Button>
            </Space>
          </Card>
        </div>
      ),
    },
    {
      key: 'structure',
      label: (
        <Space>
          Структура
          <Badge count={stats.total} style={{ backgroundColor: '#1890ff' }} overflowCount={999} />
        </Space>
      ),
      children: (
        <Card 
          title="Структура изделия" 
          size="small"
          extra={
            <Space>
              <Button
                type={structureEditMode ? 'primary' : 'default'}
                icon={<EditOutlined />}
                onClick={() => setStructureEditMode(prev => !prev)}
              >
                {structureEditMode ? 'Завершить редактирование' : 'Редактировать структуру'}
              </Button>
            </Space>
          }
        >
          {itemsLoading ? (
            <Spin />
          ) : projectItems.length === 0 ? (
            <Empty description="Структура пуста">
            </Empty>
          ) : (
            <ProjectStructureTable
              projectId={id!}
              items={projectItems}
              users={users}
              contractors={contractors}
              suppliers={suppliers}
              loading={itemsLoading}
              onRefetch={refetchItems}
              editMode={structureEditMode}
              onOpenItem={handleEditItem}
            />
          )}
        </Card>
      ),
    },
    {
      key: 'gantt',
      label: 'Gantt',
      children: (
        <Card size="small" title="Диаграмма Ганта">
          <GanttChart items={projectItems} loading={itemsLoading} onOpenItem={handleEditItem} />
        </Card>
      ),
    },
    {
      key: 'production',
      label: (
        <Space>
          Производство
          <Badge count={manufacturedItems.length} style={{ backgroundColor: '#52c41a' }} overflowCount={999} />
        </Space>
      ),
      children: (
        <Card title="Ведомость производства" size="small">
          <Table
            columns={itemColumns}
            dataSource={manufacturedItems}
            rowKey="id"
            size="small"
            pagination={{ 
              defaultPageSize: 20, 
              showTotal: (total) => `Всего ${total}`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100', '200'],
            }}
            loading={itemsLoading}
            rowClassName={(record) => record.is_overdue ? 'row-overdue' : ''}
          />
        </Card>
      ),
    },
    {
      key: 'procurement',
      label: (
        <Space>
          Снабжение
          <Badge count={purchasedItems.length} style={{ backgroundColor: '#1890ff' }} overflowCount={999} />
        </Space>
      ),
      children: (
        <Card 
          title="Ведомость закупок" 
          size="small"
          extra={
            <Space>
              <Button icon={<ShoppingCartOutlined />} onClick={() => setPurchaseListModalOpen(true)}>
                По поставщикам
              </Button>
              <Button icon={<CheckCircleOutlined />} onClick={() => validateSuppliersMutation.mutate()}>
                Проверить
              </Button>
            </Space>
          }
        >
          <Table
            columns={purchaseColumns}
            dataSource={purchasedItems}
            rowKey="id"
            size="small"
            pagination={{ 
              defaultPageSize: 20, 
              showTotal: (total) => `Всего ${total}`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100', '200'],
            }}
            loading={itemsLoading}
          />
        </Card>
      ),
    },
    {
      key: 'history',
      label: 'История',
      children: (
        <Card title="История изменений" size="small">
          <Empty description="Нет записей истории" />
        </Card>
      ),
    },
  ];

  return (
    <div className="page-container">
      {/* Page header */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Space align="center" style={{ marginBottom: 8 }}>
              <Button 
                type="text" 
                icon={<ArrowLeftOutlined />} 
                onClick={() => navigate('/projects')}
              />
              <Title level={4} style={{ margin: 0 }}>
                {project.name}
              </Title>
              <StatusBadge status={project.status} />
            </Space>
            <div>
              <Text>{project.name}</Text>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={project.progress || 0}
                style={{ width: 300 }}
                strokeColor={(project.progress || 0) >= 70 ? '#52c41a' : '#1890ff'}
              />
            </div>
          </div>
          <Space>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'validate',
                    icon: <CheckCircleOutlined />,
                    label: 'Проверить поставщиков',
                    onClick: () => validateSuppliersMutation.mutate(),
                  },
                  {
                    key: 'purchase-list',
                    icon: <ShoppingCartOutlined />,
                    label: 'Ведомость закупок',
                    onClick: () => setPurchaseListModalOpen(true),
                  },
                  { type: 'divider' },
                  {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: 'Настройки проекта',
                  },
                ],
              }}
              trigger={['click']}
            >
              <Button icon={<MoreOutlined />}>Действия</Button>
            </Dropdown>
            <Button icon={<EditOutlined />}>Редактировать</Button>
          </Space>
        </div>
      </Card>

      {/* Tabs (липкая панель вкладок внутри рабочей зоны Content) */}
      <Card size="small" className="project-detail-tabs">
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size="small"
        />
      </Card>

      {/* Edit Item Modal - адаптивная форма для производства/закупок */}
      <Modal
        title={selectedItem?.name || ''}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setSelectedItem(null); editForm.resetFields(); }}
        onOk={handleUpdateItem}
        confirmLoading={updateItemMutation.isPending}
        width={1350}
        style={{ top: 12 }}
      >
        <Form form={editForm} layout="vertical">
          {/* === ПРОИЗВОДСТВО (изготавливаемые позиции) === */}
          {selectedItem && !selectedItem.is_purchased && (
            <Tabs
              defaultActiveKey="main"
              items={[
                {
                  key: 'main',
                  label: 'Основная информация',
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <Card title="Общая информация" size="small" styles={{ body: { paddingBottom: 8 } }}>
                          <Descriptions
                            column={1}
                            size="small"
                            labelStyle={{ width: 180 }}
                            contentStyle={{ width: '100%' }}
                          >
                            <Descriptions.Item label="ID позиции">
                              {formatItemNumber(selectedItem.item_number)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Проект">
                              {project?.name || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Наименование позиции">
                              {selectedItem.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Родительская структура">
                              {selectedItem.parent_item
                                ? projectItemMap.get(selectedItem.parent_item)?.name || '—'
                                : 'Корневая позиция'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Row gutter={12} style={{ marginTop: 8 }}>
                            <Col span={24}>
                              <Form.Item name="manufacturer_type" label="Изготовитель">
                                <Select
                                  options={[
                                    { value: 'internal', label: 'Своими силами' },
                                    { value: 'contractor', label: 'Подрядчик' },
                                  ]}
                                />
                              </Form.Item>
                            </Col>
                            {editManufacturerType === 'contractor' && (
                              <>
                                <Col span={24}>
                                  <Form.Item name="contractor" label="Подрядчик">
                                    <Select
                                      allowClear
                                      placeholder="Выберите подрядчика"
                                      showSearch
                                      filterOption={(input, option) =>
                                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                      }
                                      options={contractors.map(c => ({ value: c.id, label: c.name }))}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col span={24}>
                                  <Form.Item name="material_supply_type" label="Снабжение материалами и комплектующими">
                                    <Select
                                      options={[
                                        { value: 'our_supply', label: 'Мы снабжаем' },
                                        { value: 'contractor_supply', label: 'Подрядчик закупает' },
                                      ]}
                                    />
                                  </Form.Item>
                                </Col>
                              </>
                            )}
                          </Row>
                        </Card>

                        <Card title="Текущая ситуация" size="small">
                          <Row gutter={12}>
                            <Col span={12}>
                              {editManufacturerType === 'contractor' ? (
                                <Form.Item
                                  name="contractor_status"
                                  label="Статус позиции"
                                  style={{ marginBottom: 4 }}
                                  extra={
                                    statusChangeInfo ? (
                                      <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}>
                                        дата смены: {dayjs(statusChangeInfo.date).format('DD.MM.YYYY')}, {formatUserShort(statusChangeInfo.user)}
                                      </Text>
                                    ) : null
                                  }
                                >
                                  <Select
                                    options={[
                                      { value: 'sent_to_contractor', label: 'Передано подрядчику' },
                                      { value: 'in_progress_by_contractor', label: 'В работе подрядчиком' },
                                      { value: 'suspended_by_contractor', label: 'Приостановлено подрядчиком' },
                                      { value: 'manufactured_by_contractor', label: 'Изготовлено подрядчиком' },
                                      { value: 'completed', label: 'Изготовлено' },
                                    ]}
                                  />
                                </Form.Item>
                              ) : (
                                <Form.Item
                                  name="manufacturing_status"
                                  label="Статус позиции"
                                  style={{ marginBottom: 4 }}
                                  extra={
                                    statusChangeInfo ? (
                                      <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}>
                                        дата смены: {dayjs(statusChangeInfo.date).format('DD.MM.YYYY')}, {formatUserShort(statusChangeInfo.user)}
                                      </Text>
                                    ) : null
                                  }
                                >
                                  <Select
                                    options={[
                                      { value: 'not_started', label: 'Не начато' },
                                      { value: 'in_progress', label: 'В работе' },
                                      { value: 'suspended', label: 'Приостановлено' },
                                      { value: 'completed', label: 'Изготовлено' },
                                    ]}
                                  />
                                </Form.Item>
                              )}
                            </Col>
                            <Col span={12}>
                              <Form.Item name="manufacturing_problem_reason" label="Проблема / отклонение" style={{ marginBottom: 4 }}>
                                <Select
                                  allowClear
                                  placeholder="Выберите причину"
                                  showSearch
                                  filterOption={(input, option) =>
                                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                  }
                                  onChange={() => {
                                    editForm.setFieldValue('manufacturing_problem_subreason', null);
                                  }}
                                  options={manufacturingProblemReasons.map((r: { id: string; name: string }) => ({
                                    value: r.id,
                                    label: r.name,
                                  }))}
                                />
                              </Form.Item>

                              {!!editManufacturingProblemReasonId && (
                                <Form.Item name="manufacturing_problem_subreason" style={{ marginTop: -8, marginBottom: 12 }}>
                                  <Select
                                    allowClear
                                    placeholder="Выберите подпричину"
                                    loading={manufacturingProblemSubreasonsLoading}
                                    showSearch
                                    filterOption={(input, option) =>
                                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={manufacturingProblemSubreasons.map((sr: { id: string; name: string }) => ({
                                      value: sr.id,
                                      label: sr.name,
                                    }))}
                                  />
                                </Form.Item>
                              )}
                            </Col>
                            <Col span={24}>
                              <Form.Item name="notes" label="Комментарий">
                                <Input.TextArea rows={2} placeholder="Опишите текущую ситуацию или решение" />
                              </Form.Item>
                            </Col>
                            <Col span={24}>
                              <Form.Item name="delay_notes" label="Комментарий по проблеме / отклонению">
                                <Input.TextArea rows={2} placeholder="Зафиксируйте детали причины/отклонения" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>
                      </Col>

                      <Col xs={24} lg={12}>
                        <Card title="План / Факт" size="small">
                          <Row gutter={12}>
                            <Col span={12}>
                              <Form.Item
                                name="planned_start"
                                label="Планируемая дата начала"
                                dependencies={['planned_end']}
                                rules={[
                                  ({ getFieldValue }) => ({
                                    validator(_, value) {
                                      const end = getFieldValue('planned_end');
                                      if (!value || !end) return Promise.resolve();
                                      if (dayjs(value).isAfter(dayjs(end), 'day')) {
                                        return Promise.reject(new Error('План начала не может быть позже планового окончания'));
                                      }
                                      return Promise.resolve();
                                    },
                                  }),
                                ]}
                              >
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="planned_end" label="Планируемая дата окончания">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="actual_start" label="Фактическая дата начала">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="actual_end" label="Фактическая дата окончания">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>

                        <Card
                          title="Структура"
                          size="small"
                          extra={<Tag color="blue">Элементов: {(projectItemChildrenMap.get(selectedItem.id) || []).length}</Tag>}
                        >
                          <Table
                            rowKey="key"
                            size="small"
                            pagination={false}
                            tableLayout="fixed"
                            dataSource={structureRows}
                            columns={structureColumns}
                            locale={{ emptyText: 'Нет дочерних позиций' }}
                            onRow={(record) => ({
                              style: getStructureRowStyle(record.item, record.isChild),
                            })}
                          />
                        </Card>
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: 'history',
                  label: 'История',
                  children: (
                    <Card title="История изменений" size="small">
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        loading={itemHistoryLoading}
                        dataSource={itemHistory}
                        columns={[
                          {
                            title: 'Дата',
                            dataIndex: 'date',
                            key: 'date',
                            width: 110,
                            render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
                          },
                          {
                            title: 'Время',
                            dataIndex: 'date',
                            key: 'time',
                            width: 90,
                            render: (value: string) => dayjs(value).format('HH:mm'),
                          },
                          {
                            title: 'Автор',
                            dataIndex: 'user',
                            key: 'user',
                            width: 180,
                            render: (value: string | null) => value || 'Система',
                          },
                          {
                            title: 'Комментарий',
                            key: 'comment',
                            render: (_: unknown, record: ProjectItemHistoryEntry) => {
                              if (record.details && record.details.length > 0) {
                                return (
                                  <Space direction="vertical" size={2}>
                                    {record.details.map((detail, idx) => (
                                      <Text key={`${record.id}-d-${idx}`} style={{ fontSize: 12 }}>
                                        {detail}
                                      </Text>
                                    ))}
                                  </Space>
                                );
                              }
                              return <Text style={{ fontSize: 12 }}>{formatHistoryComment(record)}</Text>;
                            },
                          },
                        ]}
                        locale={{ emptyText: 'История пока не сформирована' }}
                      />
                    </Card>
                  ),
                },
              ]}
            />
          )}

          {/* === ЗАКУПКИ (закупаемые позиции) === */}
          {selectedItem && selectedItem.is_purchased && (
            <Tabs
              defaultActiveKey="main"
              items={[
                {
                  key: 'main',
                  label: 'Основная информация',
                  children: (
                    <Row gutter={[12, 12]}>
                      <Col xs={24} lg={12}>
                        <Card title="Общая информация" size="small" styles={{ body: { paddingBottom: 8 } }}>
                          <Descriptions
                            column={1}
                            size="small"
                            labelStyle={{ width: 180 }}
                            contentStyle={{ width: '100%' }}
                          >
                            <Descriptions.Item label="ID позиции">
                              {formatItemNumber(selectedItem.item_number)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Проект">
                              {project?.name || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Наименование позиции">
                              {selectedItem.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Родительская структура">
                              {selectedItem.parent_item
                                ? projectItemMap.get(selectedItem.parent_item)?.name || '—'
                                : 'Корневая позиция'}
                            </Descriptions.Item>
                          </Descriptions>
                          <Row gutter={12} style={{ marginTop: 8 }}>
                            <Col span={24}>
                              <Form.Item name="supplier" label="Поставщик">
                                <Select
                                  allowClear
                                  placeholder="Выберите поставщика"
                                  showSearch
                                  filterOption={(input, option) =>
                                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                  }
                                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>

                        <Card title="Текущая ситуация" size="small">
                          <Row gutter={12}>
                            <Col span={12}>
                              <Form.Item
                                name="purchase_status"
                                label="Статус закупки"
                                style={{ marginBottom: 4 }}
                                extra={
                                  statusChangeInfo ? (
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}>
                                      дата смены: {dayjs(statusChangeInfo.date).format('DD.MM.YYYY')}, {formatUserShort(statusChangeInfo.user)}
                                    </Text>
                                  ) : null
                                }
                              >
                                <Select options={purchaseStatusOptions} />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="purchase_problem_reason" label="Проблема / отклонение" style={{ marginBottom: 4 }}>
                                <Select
                                  allowClear
                                  placeholder="Выберите причину"
                                  showSearch
                                  filterOption={(input, option) =>
                                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                  }
                                  onChange={() => {
                                    editForm.setFieldValue('purchase_problem_subreason', null);
                                  }}
                                  options={purchaseProblemReasons.map((r: { id: string; name: string }) => ({
                                    value: r.id,
                                    label: r.name,
                                  }))}
                                />
                              </Form.Item>

                              {!!editPurchaseProblemReasonId && (
                                <Form.Item name="purchase_problem_subreason" style={{ marginTop: -8, marginBottom: 12 }}>
                                  <Select
                                    allowClear
                                    placeholder="Выберите подпричину"
                                    loading={purchaseProblemSubreasonsLoading}
                                    showSearch
                                    filterOption={(input, option) =>
                                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={purchaseProblemSubreasons.map((sr: { id: string; name: string }) => ({
                                      value: sr.id,
                                      label: sr.name,
                                    }))}
                                  />
                                </Form.Item>
                              )}
                            </Col>
                            <Col span={24}>
                              <Form.Item name="notes" label="Комментарий">
                                <Input.TextArea rows={2} placeholder="Опишите текущую ситуацию или решение" />
                              </Form.Item>
                            </Col>
                            <Col span={24}>
                              <Form.Item name="delay_notes" label="Комментарий по проблеме / отклонению">
                                <Input.TextArea rows={2} placeholder="Зафиксируйте детали причины/отклонения" />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>
                      </Col>

                      <Col xs={24} lg={12}>
                        <Card title="План / Факт" size="small">
                          <Row gutter={12}>
                            <Col span={12}>
                              <Form.Item name="order_date" label="Планируемая дата заказа">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="required_date" label="Планируемая дата поставки">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="actual_start" label="Фактическая дата заказа">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabled />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="actual_end" label="Фактическая дата поставки">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabled />
                              </Form.Item>
                            </Col>
                            <Col span={24}>
                              <Form.Item label="Заказ">
                                {selectedItem.purchase_order_number && selectedItem.purchase_order_id ? (
                                  <Button
                                    type="link"
                                    onClick={() => {
                                      setSelectedOrderId(selectedItem.purchase_order_id || null);
                                      setOrderModalOpen(true);
                                    }}
                                  >
                                    {selectedItem.purchase_order_number}
                                  </Button>
                                ) : (
                                  <Text type="secondary">—</Text>
                                )}
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>

                        <Card
                          title="Структура"
                          size="small"
                          extra={<Tag color="blue">Элементов: {(projectItemChildrenMap.get(selectedItem.id) || []).length}</Tag>}
                        >
                          <Table
                            rowKey="key"
                            size="small"
                            pagination={false}
                            tableLayout="fixed"
                            dataSource={structureRows}
                            columns={structureColumns}
                            locale={{ emptyText: 'Нет дочерних позиций' }}
                            onRow={(record) => ({
                              style: getStructureRowStyle(record.item, record.isChild),
                            })}
                          />
                        </Card>
                      </Col>
                    </Row>
                  ),
                },
                {
                  key: 'history',
                  label: 'История',
                  children: (
                    <Card title="История изменений" size="small">
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        loading={itemHistoryLoading}
                        dataSource={itemHistory}
                        columns={[
                          {
                            title: 'Дата',
                            dataIndex: 'date',
                            key: 'date',
                            width: 110,
                            render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
                          },
                          {
                            title: 'Время',
                            dataIndex: 'date',
                            key: 'time',
                            width: 90,
                            render: (value: string) => dayjs(value).format('HH:mm'),
                          },
                          {
                            title: 'Автор',
                            dataIndex: 'user',
                            key: 'user',
                            width: 180,
                            render: (value: string | null) => value || 'Система',
                          },
                          {
                            title: 'Комментарий',
                            key: 'comment',
                            render: (_: unknown, record: ProjectItemHistoryEntry) => {
                              if (record.details && record.details.length > 0) {
                                return (
                                  <Space direction="vertical" size={2}>
                                    {record.details.map((detail, idx) => (
                                      <Text key={`${record.id}-d-${idx}`} style={{ fontSize: 12 }}>
                                        {detail}
                                      </Text>
                                    ))}
                                  </Space>
                                );
                              }
                              return <Text style={{ fontSize: 12 }}>{formatHistoryComment(record)}</Text>;
                            },
                          },
                        ]}
                        locale={{ emptyText: 'История пока не сформирована' }}
                      />
                    </Card>
                  ),
                },
              ]}
            />
          )}

        </Form>
      </Modal>

      <Modal
        title="Закрытие закупаемой позиции"
        open={closeActionModalOpen}
        onCancel={() => {
          setCloseActionModalOpen(false);
          setCloseActionItem(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setCloseActionModalOpen(false);
            setCloseActionItem(null);
          }}>
            Отмена
          </Button>,
          <Button key="reserve" onClick={() => {
            setReserveAllocations({});
            setReserveModalOpen(true);
            setCloseActionModalOpen(false);
          }}>
            Зарезервировать
          </Button>,
          <Button
            key="receive"
            type="primary"
            onClick={() => {
              setReceiveAllocations([{ warehouse_id: '', quantity: requiredCloseQty }]);
              setReceiveModalOpen(true);
              setCloseActionModalOpen(false);
            }}
          >
            Оформить поступление
          </Button>,
        ]}
      >
        <Text>
          По позиции «{closeActionItem?.name || '-'}» выберите действие: 
          зарезервировать текущий остаток на складе или оформить поступление на склад.
        </Text>
      </Modal>

      <Modal
        title="Резервирование остатка"
        open={reserveModalOpen}
        onCancel={() => {
          setReserveModalOpen(false);
          setReserveAllocations({});
        }}
        onOk={handleConfirmReserve}
        okText="Зарезервировать"
        cancelText="Отмена"
        okButtonProps={{ disabled: !canReserve, loading: reserveStockMutation.isPending }}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Требуется зарезервировать: <Text strong>{requiredCloseQty}</Text>
          </Text>
          <Table
            columns={reserveColumns}
            dataSource={stockItems}
            rowKey="id"
            pagination={false}
            size="small"
            loading={stockItemsLoading}
            locale={{ emptyText: 'Нет остатков на складах' }}
          />
          <Text type={canReserve ? 'success' : 'warning'}>
            Выбрано к резерву: {reserveTotal} из {requiredCloseQty}
          </Text>
          {!canReserve && (
            <Text type="secondary">
              Если остатков недостаточно, оформите поступление или установите другой статус.
            </Text>
          )}
        </Space>
      </Modal>

      <Modal
        title="Поступление на склад"
        open={receiveModalOpen}
        onCancel={() => {
          setReceiveModalOpen(false);
          setReceiveAllocations([]);
        }}
        onOk={handleConfirmReceive}
        okText="Оформить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !canReceive, loading: receiveAndCloseMutation.isPending }}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Укажите распределение поступления по складам. Сумма должна быть равна: <Text strong>{requiredCloseQty}</Text>
          </Text>
          {receiveAllocations.map((row, index) => (
            <Space key={index} style={{ width: '100%' }} align="start">
              <Select
                placeholder="Склад"
                style={{ flex: 1 }}
                value={row.warehouse_id}
                onChange={(value) => {
                  setReceiveAllocations((prev) => prev.map((r, idx) => idx === index ? { ...r, warehouse_id: value } : r));
                }}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
              <InputNumber
                min={0}
                value={row.quantity}
                onChange={(val) => {
                  const qty = Number(val || 0);
                  setReceiveAllocations((prev) => prev.map((r, idx) => idx === index ? { ...r, quantity: qty } : r));
                }}
                style={{ width: 160 }}
              />
              <Button
                onClick={() => {
                  setReceiveAllocations((prev) => prev.filter((_, idx) => idx !== index));
                }}
                disabled={receiveAllocations.length === 1}
              >
                Удалить
              </Button>
            </Space>
          ))}
          <Button onClick={() => setReceiveAllocations((prev) => [...prev, { warehouse_id: '', quantity: 0 }])}>
            Добавить склад
          </Button>
          <Text type={canReceive ? 'success' : 'warning'}>
            Итого: {receiveTotal} из {requiredCloseQty}
          </Text>
        </Space>
      </Modal>

      <OrderEditModal
        open={orderModalOpen}
        orderId={selectedOrderId}
        onClose={() => {
          setOrderModalOpen(false);
          setSelectedOrderId(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['project-items', id] });
        }}
      />

      <Modal
        title="Активация проекта: поступление по закрытым позициям"
        open={activateReceiptModalOpen}
        onCancel={() => {
          setActivateReceiptModalOpen(false);
          setActivateAllocations({});
        }}
        onOk={handleConfirmActivateReceipts}
        okText="Активировать"
        cancelText="Отмена"
        okButtonProps={{ loading: activateWithReceiptsMutation.isPending }}
        width={900}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Для закрытых закупаемых позиций укажите склад поступления. После подтверждения будут созданы резервы под проект.
          </Text>
          <Table
            columns={activationColumns}
            dataSource={planningClosedItems}
            rowKey="id"
            pagination={false}
            size="small"
            locale={{ emptyText: 'Закрытых закупаемых позиций нет' }}
          />
        </Space>
      </Modal>
      
      {/* Add Product Modal */}
      <Modal
        title="Добавить изделие в проект"
        open={addProductModalOpen}
        onCancel={() => { setAddProductModalOpen(false); addProductForm.resetFields(); }}
        onOk={handleAddProduct}
        confirmLoading={addProductMutation.isPending}
        width={600}
      >
        <Form form={addProductForm} layout="vertical">
          <Alert
            message="Автоматическое развёртывание BOM"
            description="При добавлении изделия автоматически будут созданы все позиции из его состава (BOM). Для каждой закупаемой позиции будет установлен основной поставщик."
            type="info"
            style={{ marginBottom: 16 }}
          />
          
          <Form.Item 
            name="catalog_category" 
            label="Вид справочника" 
            rules={[{ required: true, message: 'Выберите вид справочника' }]}
          >
            <Select 
              placeholder="Выберите вид справочника"
              options={manufacturedCategories.map((c: CatalogCategory) => ({ 
                label: c.name, 
                value: c.id 
              }))}
              onChange={() => addProductForm.setFieldValue('nomenclature_item', undefined)}
            />
          </Form.Item>
          
          <Form.Item 
            name="nomenclature_item" 
            label="Изделие" 
            rules={[{ required: true, message: 'Выберите изделие' }]}
          >
            <Select 
              placeholder={addProductCategoryId ? "Выберите изделие" : "Сначала выберите вид справочника"}
              disabled={!addProductCategoryId}
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={nomenclatureItems.map((n: Nomenclature) => ({ 
                label: n.name, 
                value: n.id 
              }))}
            />
          </Form.Item>
          
          <Form.Item name="quantity" label="Количество" initialValue={1}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Set Contractor Modal */}
      <Modal
        title={`Назначить подрядчика: ${selectedItem?.name || ''}`}
        open={contractorModalOpen}
        onCancel={() => { setContractorModalOpen(false); setSelectedItem(null); contractorForm.resetFields(); }}
        onOk={handleSetContractorSubmit}
        confirmLoading={setContractorMutation.isPending}
        width={500}
      >
        <Form form={contractorForm} layout="vertical">
          <Form.Item 
            name="contractor_id" 
            label="Подрядчик" 
            rules={[{ required: true, message: 'Выберите подрядчика' }]}
          >
            <Select
              placeholder="Выберите подрядчика"
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={contractors.map(c => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          
          <Form.Item name="material_supply_type" label="Снабжение материалами" initialValue="our_supply">
            <Select
              options={[
                { value: 'our_supply', label: 'Мы снабжаем материалами' },
                { value: 'contractor_supply', label: 'Подрядчик закупает материалы сам' },
              ]}
            />
          </Form.Item>
          
          <Form.Item name="cascade" valuePropName="checked" initialValue={false}>
            <Checkbox>Применить ко всем дочерним изготавливаемым элементам</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Set Responsible Modal */}
      <Modal
        title={`Назначить ответственного: ${selectedItem?.name || ''}`}
        open={responsibleModalOpen}
        onCancel={() => { setResponsibleModalOpen(false); setSelectedItem(null); responsibleForm.resetFields(); }}
        onOk={handleSetResponsibleSubmit}
        confirmLoading={setResponsibleMutation.isPending}
        width={500}
      >
        <Form form={responsibleForm} layout="vertical">
          <Form.Item 
            name="responsible_id" 
            label="Ответственный" 
            rules={[{ required: true, message: 'Выберите ответственного' }]}
          >
            <Select
              placeholder="Выберите ответственного"
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={users.map((u: { id: string; full_name?: string; username: string }) => ({ 
                value: u.id, 
                label: u.full_name || u.username 
              }))}
            />
          </Form.Item>
          
          <Form.Item name="cascade" valuePropName="checked" initialValue={true}>
            <Checkbox>Применить ко всем дочерним элементам</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Purchase List Modal */}
      <Modal
        title="Ведомость закупок по поставщикам"
        open={purchaseListModalOpen}
        onCancel={() => setPurchaseListModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPurchaseListModalOpen(false)}>
            Закрыть
          </Button>,
          <Button key="export" icon={<FileExcelOutlined />} type="primary">
            Экспорт в Excel
          </Button>,
        ]}
        width={900}
      >
        {purchaseListLoading ? (
          <Spin />
        ) : purchaseList ? (
          <div>
            {purchaseList.by_supplier.map((group) => (
              <Card 
                key={group.supplier.id} 
                title={
                  <Space>
                    <ShoppingCartOutlined />
                    {group.supplier.name}
                    <Badge count={group.total_items} style={{ backgroundColor: '#1890ff' }} />
                  </Space>
                }
                size="small"
                style={{ marginBottom: 16 }}
              >
                <Table
                  dataSource={group.items}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Наименование', dataIndex: 'name' },
                    { title: 'Кол-во', dataIndex: 'quantity', width: 80, render: (q, r) => `${q} ${r.unit}` },
                    { title: 'Требуется к', dataIndex: 'required_date', width: 120, render: formatDate },
                    { 
                      title: 'Статус', 
                      dataIndex: 'purchase_status', 
                      width: 120,
                      render: (_status, record) => (
                        <Tag
                          color={
                            record.purchase_status === 'closed' || record.purchase_status === 'delivered'
                              ? 'green'
                              : record.purchase_status === 'in_order' || record.purchase_status === 'ordered'
                                ? 'blue'
                                : record.purchase_status === 'written_off'
                                  ? 'lime'
                                : record.purchase_status === 'not_required'
                                  ? 'default'
                                  : 'orange'
                          }
                        >
                          {(record.purchase_status === 'not_required' ? 'Не требуется'
                            : record.purchase_status === 'pending' ? 'Ожидает заказа'
                              : record.purchase_status === 'waiting_order' ? 'Ожидает заказа'
                                : record.purchase_status === 'in_order' ? 'В заказе'
                                  : record.purchase_status === 'ordered' ? 'Заказано'
                                    : record.purchase_status === 'closed' ? 'На складе'
                                      : record.purchase_status === 'written_off' ? 'Списано'
                                      : record.purchase_status === 'delivered' ? 'Получено'
                                        : record.purchase_status_display || record.purchase_status || '—')}
                        </Tag>
                      )
                    },
                  ]}
                />
              </Card>
            ))}
            
            {purchaseList.without_supplier.length > 0 && (
              <Card
                title={
                  <Space>
                    <WarningOutlined style={{ color: '#faad14' }} />
                    Без поставщика
                    <Badge count={purchaseList.without_supplier.length} style={{ backgroundColor: '#faad14' }} />
                  </Space>
                }
                size="small"
              >
                <Table
                  dataSource={purchaseList.without_supplier}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Наименование', dataIndex: 'name' },
                    { title: 'Кол-во', dataIndex: 'quantity', width: 80, render: (q, r) => `${q} ${r.unit}` },
                  ]}
                />
              </Card>
            )}
          </div>
        ) : (
          <Empty description="Нет данных" />
        )}
      </Modal>
    </div>
  );
}
