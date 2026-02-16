/**
 * Item Edit Modal
 * 
 * Modal dialog for editing project items directly from Workplace
 * without navigating to Projects module.
 * Similar to the edit modal in ProjectDetailPage.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Descriptions,
    Form,
    Input,
    message,
    Modal,
    Popover,
    Row,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { catalogApi } from '../../../features/catalog';
import { OrderEditModal } from '../../../features/procurement';
import { projectsApi, type ProjectItem } from '../../../features/projects/api';
import { settingsApi } from '../../../features/settings';

const { Text } = Typography;

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

interface ItemEditModalProps {
  item: ProjectItem | null;
  items?: ProjectItem[];
  open: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
  projectName?: string;
  readOnly?: boolean;
}

export function ItemEditModal({ item, items = [], open, onCancel, onSuccess, projectName, readOnly }: ItemEditModalProps) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const isReadOnly = !!readOnly;
  const [initialDelayNotes, setInitialDelayNotes] = useState<string>('');
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [miniOpenItemId, setMiniOpenItemId] = useState<string | null>(null);

  // Fetch contractors
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

  const { data: itemHistory = [], isLoading: itemHistoryLoading } = useQuery({
    queryKey: ['project-item-history', item?.id],
    queryFn: () => projectsApi.items.history(item!.id),
    enabled: open && !!item?.id,
  });

  const statusChangeInfo = useMemo(() => {
    if (!itemHistory.length) return null;
    const entry = itemHistory.find((historyEntry: any) =>
      (historyEntry.details || []).some((detail: string) => detail.toLowerCase().includes('статус'))
    );
    if (!entry) return null;
    return {
      date: entry.date,
      user: entry.user,
    };
  }, [itemHistory]);

  // Update item mutation
  const updateMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ProjectItem> }) => {
      return projectsApi.items.update(itemId, data);
    },
    onSuccess: () => {
      message.success('Позиция обновлена');
      queryClient.invalidateQueries({ queryKey: ['workplace'] });
      queryClient.invalidateQueries({ queryKey: ['project-items'] });
      onCancel();
      onSuccess?.();
    },
    onError: () => {
      message.error('Ошибка при сохранении');
    },
  });

  const miniUpdateMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ProjectItem> }) => {
      return projectsApi.items.update(itemId, data);
    },
    onSuccess: () => {
      message.success('Позиция обновлена');
      queryClient.invalidateQueries({ queryKey: ['workplace'] });
      queryClient.invalidateQueries({ queryKey: ['project-items'] });
    },
    onError: () => {
      message.error('Ошибка при сохранении');
    },
  });

  const MiniItemEditForm = ({ currentItem, onClose }: { currentItem: ProjectItem; onClose: () => void }) => {
    const [miniForm] = Form.useForm();
    const readOnlyMode = isReadOnly;

    const isPurchased = currentItem.is_purchased === true;
    const isContractor = currentItem.manufacturer_type === 'contractor';

    const reasonField = isPurchased ? 'purchase_problem_reason' : 'manufacturing_problem_reason';
    const subreasonField = isPurchased ? 'purchase_problem_subreason' : 'manufacturing_problem_subreason';

    const selectedReasonId = Form.useWatch(reasonField, miniForm);

    const { data: miniManufacturingSubreasonsData, isLoading: miniManufacturingSubreasonsLoading } = useQuery({
      queryKey: ['mini-manufacturing-problem-subreasons', selectedReasonId],
      queryFn: () => settingsApi.manufacturingProblemSubreasons.list({ reason: String(selectedReasonId), page_size: 200 }),
      enabled: open && !isPurchased && !!selectedReasonId,
    });
    const miniManufacturingSubreasons = miniManufacturingSubreasonsData?.results || [];

    const { data: miniPurchaseSubreasonsData, isLoading: miniPurchaseSubreasonsLoading } = useQuery({
      queryKey: ['mini-purchase-problem-subreasons', selectedReasonId],
      queryFn: () => settingsApi.purchaseProblemSubreasons.list({ reason: String(selectedReasonId), page_size: 200 }),
      enabled: open && isPurchased && !!selectedReasonId,
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
      if (readOnlyMode) {
        message.warning('Недостаточно прав для редактирования');
        return;
      }
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

      // normalize empty -> null
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

      // Special case: purchase_by_contractor - don't try to set purchase_status
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
      <Form form={miniForm} layout="vertical" style={{ width: 420 }} disabled={readOnlyMode}>
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
          {!readOnlyMode && (
            <Button size="small" type="primary" loading={miniUpdateMutation.isPending} onClick={handleSaveMini}>
              Сохранить
            </Button>
          )}
        </Space>
      </Form>
    );
  };

  // Populate form when item changes
  useEffect(() => {
    if (item && open) {
      form.setFieldsValue({
        ...item,
        planned_start: item.planned_start ? dayjs(item.planned_start) : null,
        planned_end: item.planned_end ? dayjs(item.planned_end) : null,
        actual_start: item.actual_start ? dayjs(item.actual_start) : null,
        actual_end: item.actual_end ? dayjs(item.actual_end) : null,
        required_date: item.required_date ? dayjs(item.required_date) : null,
        order_date: item.order_date ? dayjs(item.order_date) : null,
      });
      setInitialDelayNotes(item.delay_notes || '');
    }
  }, [item, open, form]);

  const editManufacturerType = Form.useWatch('manufacturer_type', form);
  const editManufacturingProblemReasonId = Form.useWatch('manufacturing_problem_reason', form);
  const editPurchaseProblemReasonId = Form.useWatch('purchase_problem_reason', form);

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

  const handleSubmit = async () => {
    if (!item) return;
    const values = await form.validateFields();

    const reasonField = item.is_purchased ? 'purchase_problem_reason' : 'manufacturing_problem_reason';
    const nextReason = (values as any)[reasonField] ?? null;
    const nextDelayNotes = (values.delay_notes ?? '').trim();
    const previousReason = (item as any)[reasonField] ?? null;
    const previousDelayNotes = (initialDelayNotes ?? '').trim();

    values.manufacturing_problem_reason = values.manufacturing_problem_reason ?? null;
    values.manufacturing_problem_subreason = values.manufacturing_problem_subreason ?? null;
    values.purchase_problem_reason = values.purchase_problem_reason ?? null;
    values.purchase_problem_subreason = values.purchase_problem_subreason ?? null;

    if (!values.manufacturing_problem_reason) {
      values.manufacturing_problem_subreason = null;
      form.setFieldValue('manufacturing_problem_subreason', null);
    }
    if (!values.purchase_problem_reason) {
      values.purchase_problem_subreason = null;
      form.setFieldValue('purchase_problem_subreason', null);
    }

    if (nextReason) {
      if (!nextDelayNotes) {
        form.setFields([{ name: 'delay_notes', errors: ['Укажите комментарий по проблеме / отклонению.'] }]);
        return;
      }
      if (nextReason !== previousReason && nextDelayNotes === previousDelayNotes) {
        form.setFields([{ name: 'delay_notes', errors: ['Обновите комментарий по проблеме / отклонению.'] }]);
        return;
      }
    } else {
      values.delay_notes = '';
      form.setFieldValue('delay_notes', '');
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
      const prevValue = (item as any)[key];
      if (prevValue !== nextValue) {
        (patch as any)[key] = nextValue;
      }
    }

    if (Object.keys(patch).length === 0) {
      message.info('Изменений нет');
      onCancel();
      return;
    }

    if (isReadOnly) {
      message.warning('Недостаточно прав для редактирования');
      return;
    }
    updateMutation.mutate({ itemId: item.id, data: patch });
  };

  const formatItemNumber = (num?: number | null) => num ? String(num).padStart(7, '0') : '—';

  const formatUserShort = (fullName?: string | null) => {
    if (!fullName) return '—';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const lastName = parts[0];
    const initials = parts.slice(1).map(p => `${p[0]}.`).join('');
    return `${lastName} ${initials}`.trim();
  };

  const getStatusMeta = (currentItem: ProjectItem) => {
    if (currentItem.is_purchased) {
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
        color: colors[currentItem.purchase_status] || 'default',
        label: labels[currentItem.purchase_status] || currentItem.purchase_status_display || 'Не определено',
      };
    }

    if (currentItem.manufacturer_type === 'contractor') {
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
      const contractorStatus = currentItem.contractor_status || 'sent_to_contractor';
      return {
        color: colors[contractorStatus] || 'default',
        label: labels[contractorStatus] || currentItem.contractor_status_display || 'Не определено',
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
      color: colors[currentItem.manufacturing_status] || 'default',
      label: labels[currentItem.manufacturing_status] || currentItem.manufacturing_status_display || 'Не определено',
    };
  };

  const formatHistoryComment = (entry: any) => {
    if (entry.details && entry.details.length > 0) return entry.details.join('; ');
    if (entry.changes) return entry.changes;
    const typeLabels: Record<string, string> = {
      '+': 'Создание записи',
      '~': 'Изменение параметров',
      '-': 'Удаление записи',
    };
    return typeLabels[entry.type] || 'Обновление данных';
  };

  const projectItemChildrenMap = useMemo(() => {
    const map = new Map<string | null, ProjectItem[]>();
    items.forEach((entry) => {
      const parentKey = entry.parent_item || null;
      const list = map.get(parentKey) || [];
      list.push(entry);
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
  }, [items]);

  const getStructureRowStyle = (currentItem: ProjectItem, isChild: boolean) => {
    const baseStyle = { fontSize: 12, lineHeight: '16px', height: 26 } as const;
    if (!isChild) return baseStyle;
    if (currentItem.has_problem) {
      return { ...baseStyle, background: '#fff1f0' };
    }
    const status = getStatusMeta(currentItem);
    const map: Record<string, string> = {
      green: '#f6ffed',
      blue: '#e6f4ff',
      orange: '#fff7e6',
      red: '#fff1f0',
      default: '#fafafa',
      purple: '#f9f0ff',
      geekblue: '#f0f5ff',
      cyan: '#e6fffb',
    };
    return { ...baseStyle, background: map[status.color] || '#fafafa' };
  };

  const structureRows = useMemo(() => {
    if (!item) return [] as Array<{ key: string; item: ProjectItem; isChild: boolean }>;
    const children = projectItemChildrenMap.get(item.id) || [];
    return [
      { key: item.id, item, isChild: false },
      ...children.map((child) => ({ key: child.id, item: child, isChild: true })),
    ];
  }, [item, projectItemChildrenMap]);

  const structureColumns = useMemo(() => ([
    {
      title: 'Наименование',
      dataIndex: 'item',
      key: 'name',
      width: 216,
      render: (currentItem: ProjectItem, row: { isChild: boolean }) => {
        const nameNode = (
          <Text
            strong={!row.isChild}
            style={{ fontSize: 12, cursor: row.isChild ? 'pointer' : 'default', maxWidth: '100%' }}
            ellipsis={{ tooltip: currentItem.name }}
          >
            {currentItem.name}
          </Text>
        );

        return (
          <div style={{ paddingLeft: row.isChild ? 16 : 0 }}>
            {row.isChild ? (
              <Popover
                trigger="click"
                open={miniOpenItemId === currentItem.id}
                onOpenChange={(nextOpen) => setMiniOpenItemId(nextOpen ? currentItem.id : null)}
                placement="rightTop"
                overlayStyle={{ maxWidth: 480 }}
                content={
                  <MiniItemEditForm
                    currentItem={currentItem}
                    onClose={() => setMiniOpenItemId(null)}
                  />
                }
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
      render: (currentItem: ProjectItem) => {
        const value = Math.round(currentItem.calculated_progress ?? currentItem.progress_percent ?? 0);
        return <Tag color={value >= 100 ? 'green' : 'blue'}>{value}%</Tag>;
      },
    },
    {
      title: 'Статус',
      dataIndex: 'item',
      key: 'status',
      width: 160,
      ellipsis: { showTitle: false },
      render: (currentItem: ProjectItem) => {
        const status = getStatusMeta(currentItem);
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
      render: (currentItem: ProjectItem) => {
        const fullName = currentItem.responsible_detail?.full_name || '';
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
  ]), [miniOpenItemId, manufacturingProblemReasons, purchaseProblemReasons, open]);

  if (!item) return null;

  const isPurchased = item.is_purchased;

  return (
    <>
      <Modal
        title={item.name}
        open={open}
        onCancel={onCancel}
        onOk={isReadOnly ? undefined : handleSubmit}
        confirmLoading={updateMutation.isPending}
        okButtonProps={{ style: isReadOnly ? { display: 'none' } : undefined }}
        width={1350}
        style={{ top: 12 }}
      >
        <Form form={form} layout="vertical" disabled={isReadOnly}>
        {/* Manufacturing Item */}
        {!isPurchased && (
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
                        <Descriptions column={1} size="small" labelStyle={{ width: 180 }} contentStyle={{ width: '100%' }}>
                          <Descriptions.Item label="ID позиции">
                            {formatItemNumber(item.item_number)}
                          </Descriptions.Item>
                          <Descriptions.Item label="Проект">
                            {projectName || '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Наименование позиции">
                            {item.name}
                          </Descriptions.Item>
                          <Descriptions.Item label="Родительская структура">
                            {item.parent_item
                              ? items.find((entry) => entry.id === item.parent_item)?.name || '—'
                              : 'Корневая позиция'}
                          </Descriptions.Item>
                        </Descriptions>
                        
                        <Row gutter={12} style={{ marginTop: 12 }}>
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

                      <Card title="Текущая ситуация" size="small" style={{ marginTop: 12 }}>
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
                                    { value: 'suspended_by_contractor', label: 'Приостановлено' },
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
                                  form.setFieldValue('manufacturing_problem_subreason', null);
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
                          extra={<Tag color="blue">Элементов: {(projectItemChildrenMap.get(item.id) || []).length}</Tag>}
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

                      <></>
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
                          render: (_: unknown, record: any) => {
                            if (record.details && record.details.length > 0) {
                              return (
                                <div>
                                  {record.details.map((detail: string, idx: number) => (
                                    <Text key={`${record.id}-d-${idx}`} style={{ fontSize: 12, display: 'block' }}>
                                      {detail}
                                    </Text>
                                  ))}
                                </div>
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
                          render: (_: unknown, record: any) => {
                            if (record.details && record.details.length > 0) {
                              return (
                                <div>
                                  {record.details.map((detail: string, idx: number) => (
                                    <Text key={`${record.id}-d-${idx}`} style={{ fontSize: 12, display: 'block' }}>
                                      {detail}
                                    </Text>
                                  ))}
                                </div>
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

        {/* Purchased Item */}
        {isPurchased && (
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
                        <Descriptions column={1} size="small" labelStyle={{ width: 180 }} contentStyle={{ width: '100%' }}>
                          <Descriptions.Item label="ID позиции">
                            {formatItemNumber(item.item_number)}
                          </Descriptions.Item>
                          <Descriptions.Item label="Проект">
                            {projectName || '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Наименование позиции">
                            {item.name}
                          </Descriptions.Item>
                          <Descriptions.Item label="Родительская структура">
                            {item.parent_item
                              ? items.find((entry) => entry.id === item.parent_item)?.name || '—'
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
                              extra={
                                statusChangeInfo ? (
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1.2 }}>
                                    дата смены: {dayjs(statusChangeInfo.date).format('DD.MM.YYYY')}, {formatUserShort(statusChangeInfo.user)}
                                  </Text>
                                ) : null
                              }
                              style={{ marginBottom: 4 }}
                            >
                              <Select
                                options={[
                                  { value: 'waiting_order', label: 'Ожидает заказа' },
                                  { value: 'in_order', label: 'В заказе' },
                                  { value: 'closed', label: 'На складе' },
                                  { value: 'written_off', label: 'Списано' },
                                ]}
                              />
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
                                  form.setFieldValue('purchase_problem_subreason', null);
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
                              {item.purchase_order_number && item.purchase_order_id ? (
                                <Button
                                  type="link"
                                  onClick={() => {
                                    setSelectedOrderId(item.purchase_order_id || null);
                                    setOrderModalOpen(true);
                                  }}
                                >
                                  {item.purchase_order_number}
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
                        style={{ marginTop: 12 }}
                        extra={<Tag color="blue">Элементов: {(projectItemChildrenMap.get(item.id) || []).length}</Tag>}
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

                      <></>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        )}
        </Form>
      </Modal>

      <OrderEditModal
        open={orderModalOpen}
        orderId={selectedOrderId}
        onClose={() => {
          setOrderModalOpen(false);
          setSelectedOrderId(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['project-items'] });
        }}
      />
    </>
  );
}
