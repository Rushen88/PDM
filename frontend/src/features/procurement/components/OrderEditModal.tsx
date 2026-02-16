/**
 * OrderEditModal - Модальное окно редактирования заказа на закупку
 */

import {
    DeleteOutlined,
    FileExcelOutlined,
    PlusOutlined,
    SaveOutlined,
    SendOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Form,
    InputNumber,
    message,
    Modal,
    Row,
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

import { exportOrderToExcel } from '../../../shared/utils/exportOrderExcel';
import { projectsApi } from '../../projects';
import { warehouseApi, type MaterialRequirement } from '../../warehouse';
import { procurementApi } from '../api';

const { Text } = Typography;

const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  waiting_order: 'Ожидает заказа',
  in_order: 'В заказе',
  closed: 'На складе',
  written_off: 'Списано',
};

interface EditOrderItem {
  id: string;
  order_item_id?: string;
  requirement_id?: string | null;
  project_item?: string | null;
  project_item_number?: number | null;
  nomenclature_item: string;
  nomenclature_name: string;
  project_name: string;
  quantity: number;
  base_quantity: number;
  order_by_date?: string;
  requirement_status?: string;
  requirement_status_display?: string;
}

interface OrderEditModalProps {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OrderEditModal({ open, orderId, onClose, onSuccess }: OrderEditModalProps) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<EditOrderItem[]>([]);
  const [searchAvailable, setSearchAvailable] = useState('');
  const [excessDistribution, setExcessDistribution] = useState<Record<string, { distribute: boolean; projectIds: string[] }>>({});
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [distributionItemId, setDistributionItemId] = useState<string | null>(null);
  const [distributionProjectIds, setDistributionProjectIds] = useState<string[]>([]);

  const { data: orderData, isLoading: loadingOrder } = useQuery({
    queryKey: ['purchase-order-detail', orderId],
    queryFn: () => procurementApi.purchaseOrders.get(orderId!),
    enabled: open && !!orderId,
  });

  const orderStatus = Form.useWatch('status', form);
  const canEdit = (orderData?.status || 'draft') === 'draft';
  const willConfirm = (orderStatus || orderData?.status || 'draft') === 'ordered';

  // Fetch available requirements (filtered by supplier)
  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['available-requirements', selectedSupplier, searchAvailable],
    queryFn: () => warehouseApi.materialRequirements.availableForOrder({
      supplier: selectedSupplier!,
      search: searchAvailable || undefined,
    }),
    enabled: !!selectedSupplier && open,
  });

  const availableRequirements = availableData?.results || [];

  const { data: projectsData } = useQuery({
    queryKey: ['active-projects-for-excess'],
    queryFn: () => projectsApi.list({ status: 'in_progress', page_size: 200 }),
    enabled: open,
  });

  const activeProjects = projectsData?.results || [];

  // Initialize form and items from order
  useEffect(() => {
    if (!orderData || !open) return;
    form.setFieldsValue({
      supplier: orderData.supplier,
      order_date: orderData.order_date ? dayjs(orderData.order_date) : null,
      expected_delivery_date: orderData.expected_delivery_date ? dayjs(orderData.expected_delivery_date) : null,
      status: orderData.status || 'draft',
      notes: orderData.notes || '',
    });
    setSelectedSupplier(orderData.supplier);

    const initialItems: EditOrderItem[] = (orderData.items || []).map((item) => ({
      id: item.id,
      order_item_id: item.id,
      requirement_id: item.material_requirement_detail?.id || null,
      project_item: item.project_item || null,
      project_item_number: item.material_requirement_detail?.project_item_number ?? null,
      nomenclature_item: item.nomenclature_item,
      nomenclature_name: item.nomenclature_detail?.name || '',
      project_name: item.project_item_detail?.project_name || orderData.project_detail?.name || '',
      quantity: Number(item.quantity) || 0,
      base_quantity: Number(item.quantity) || 0,
      order_by_date: item.material_requirement_detail?.order_by_date || undefined,
      requirement_status: item.material_requirement_detail?.status,
      requirement_status_display: item.material_requirement_detail?.status_display
        || (item.material_requirement_detail?.status
          ? REQUIREMENT_STATUS_LABELS[item.material_requirement_detail.status]
          : undefined),
    }));
    setOrderItems(initialItems);
  }, [orderData, open, form]);

  // Filter out already added items and items with wrong status
  const filteredAvailable = useMemo(() => {
    const addedIds = new Set(orderItems.map(item => item.requirement_id).filter(Boolean));
    return availableRequirements.filter(req =>
      !addedIds.has(req.id) && req.status === 'waiting_order'
    );
  }, [availableRequirements, orderItems]);

  const sortedAvailable = useMemo(() => {
    return [...filteredAvailable].sort((a, b) => {
      if (!a.order_by_date && !b.order_by_date) return 0;
      if (!a.order_by_date) return 1;
      if (!b.order_by_date) return -1;
      return a.order_by_date.localeCompare(b.order_by_date);
    });
  }, [filteredAvailable]);

  const sortedOrderItems = useMemo(() => {
    return [...orderItems].sort((a, b) => {
      if (!a.order_by_date && !b.order_by_date) return 0;
      if (!a.order_by_date) return 1;
      if (!b.order_by_date) return -1;
      return a.order_by_date.localeCompare(b.order_by_date);
    });
  }, [orderItems]);

  const addToOrder = useCallback((requirement: MaterialRequirement) => {
    const baseQuantity = Number(requirement.to_order) || Number(requirement.total_required) || 1;
    const newItem: EditOrderItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      requirement_id: requirement.id,
      project_item: requirement.project_item || null,
      project_item_number: requirement.project_item_number ?? null,
      nomenclature_item: requirement.nomenclature_item,
      nomenclature_name: requirement.nomenclature_detail?.name || '',
      project_name: requirement.project_detail?.name || '',
      quantity: baseQuantity,
      base_quantity: baseQuantity,
      order_by_date: requirement.order_by_date || undefined,
      requirement_status: requirement.status,
      requirement_status_display: requirement.status_display
        || REQUIREMENT_STATUS_LABELS[requirement.status]
        || requirement.status,
    };
    setOrderItems(prev => [...prev, newItem]);
  }, [orderItems, excessDistribution]);

  const removeFromOrder = useCallback((itemId: string) => {
    setOrderItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    setOrderItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity } : item
    ));
    const item = orderItems.find(i => i.id === itemId);
    if (item?.requirement_id && quantity > item.base_quantity) {
      if (!excessDistribution[itemId]) {
        Modal.confirm({
          title: 'Распределить излишек количества заказываемой позиции на другие проекты?',
          okText: 'Да',
          cancelText: 'Нет',
          onOk: () => {
            setDistributionItemId(itemId);
            setDistributionProjectIds([]);
            setDistributionModalOpen(true);
          },
          onCancel: () => {
            setExcessDistribution(prev => ({
              ...prev,
              [itemId]: { distribute: false, projectIds: [] },
            }));
          },
        });
      }
    }
  }, []);

  const handleClose = () => {
    form.resetFields();
    setSelectedSupplier(null);
    setOrderItems([]);
    setSearchAvailable('');
    setExcessDistribution({});
    onClose();
  };

  const saveOrderMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!orderId) throw new Error('OrderEdit: missing order id');
      const desiredStatus = values.status || orderData?.status || 'draft';

      await procurementApi.purchaseOrders.update(orderId, {
        order_date: values.order_date?.format('YYYY-MM-DD'),
        expected_delivery_date: values.expected_delivery_date?.format('YYYY-MM-DD'),
        notes: values.notes || '',
      });

      // Sync items only for draft
      if ((orderData?.status || 'draft') === 'draft') {
        const existingIds = new Set((orderData?.items || []).map(i => i.id));
        const currentExistingIds = new Set(orderItems.filter(i => i.order_item_id).map(i => i.order_item_id!));

        // Remove deleted items
        for (const id of existingIds) {
          if (!currentExistingIds.has(id)) {
            await procurementApi.items.delete(id);
          }
        }

        // Update existing items
        for (const item of orderItems) {
          if (item.order_item_id) {
            await procurementApi.items.update(item.order_item_id, {
              quantity: item.quantity,
            });
          }
        }

        // Create new items
        for (const item of orderItems) {
          if (!item.order_item_id) {
            await procurementApi.items.create({
              order: orderId,
              nomenclature_item: item.nomenclature_item,
              quantity: item.quantity,
              project_item: item.project_item || undefined,
              material_requirement: item.requirement_id || undefined,
            });
          }
        }

        // Distribute excess quantity if requested
        for (const item of orderItems) {
          const baseQty = item.base_quantity || 0;
          const excessQty = item.quantity - baseQty;
          const dist = excessDistribution[item.id];
          if (item.requirement_id && dist?.distribute && excessQty > 0) {
            await warehouseApi.materialRequirements.distributeExcess({
              order_id: orderId,
              nomenclature_item_id: item.nomenclature_item,
              exclude_requirement_id: item.requirement_id,
              project_ids: dist.projectIds,
              excess_quantity: excessQty,
            });
          }
        }
      }

      if (desiredStatus === 'ordered' && orderData?.status === 'draft') {
        await procurementApi.purchaseOrders.confirm(orderId);
      }

      return true;
    },
    onSuccess: () => {
      message.success('Заказ обновлён');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', orderId] });
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error
        || error?.response?.data?.detail
        || error?.message;
      message.error(apiError || 'Ошибка при сохранении заказа');
    },
  });

  const handleSubmit = () => {
    form.validateFields().then(values => {
      if (orderItems.length === 0) {
        message.warning('Добавьте хотя бы одну позицию в заказ');
        return;
      }
      saveOrderMutation.mutate(values);
    });
  };

  const orderItemsColumns: ColumnsType<EditOrderItem> = [
    {
      title: 'ID',
      key: 'project_item_number',
      width: 70,
      align: 'center',
      render: (_, item) => (
        <Text code style={{ fontSize: 11 }}>
          {item.project_item_number ? String(item.project_item_number).padStart(7, '0') : '—'}
        </Text>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Номенклатура</span>,
      key: 'nomenclature',
      width: 210,
      ellipsis: true,
      render: (_, item) => (
        <Tooltip title={item.nomenclature_name}>
          <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
            <Text strong style={{ fontSize: 12 }}>{item.nomenclature_name}</Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Проект</span>,
      key: 'project',
      width: 120,
      ellipsis: true,
      render: (_, item) => (
        <Tooltip title={item.project_name}>
          <Text style={{ fontSize: 12 }}>{item.project_name || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Кол-во</span>,
      key: 'quantity',
      width: 80,
      render: (_, item) => (
        <InputNumber
          min={0.001}
          value={item.quantity}
          onChange={(val) => updateQuantity(item.id, val || 0)}
          size="small"
          style={{ width: '100%', fontSize: 12 }}
          disabled={!canEdit}
        />
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap', paddingRight: 8, display: 'inline-block' }}>Заказать до</span>,
      key: 'order_by_date',
      width: 105,
      dataIndex: 'order_by_date',
      render: (val) => <Text style={{ fontSize: 12 }}>{val ? dayjs(val).format('DD.MM.YY') : '-'}</Text>,
      sorter: (a, b) => {
        if (!a.order_by_date) return 1;
        if (!b.order_by_date) return -1;
        return a.order_by_date.localeCompare(b.order_by_date);
      },
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Статус</span>,
      key: 'status',
      width: 85,
      ellipsis: true,
      render: (_, item) => (
        <Tag style={{ margin: 0, fontSize: 10 }}>
          {item.requirement_status_display || 'Ожидает заказа'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_, item) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeFromOrder(item.id)}
          size="small"
          disabled={!canEdit}
        />
      ),
    },
  ];

  const availableColumns: ColumnsType<MaterialRequirement> = [
    {
      title: 'ID',
      key: 'project_item_number',
      width: 70,
      align: 'center',
      render: (_, record) => (
        <Text code style={{ fontSize: 11 }}>
          {record.project_item_number ? String(record.project_item_number).padStart(7, '0') : '—'}
        </Text>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Номенклатура</span>,
      key: 'nomenclature',
      width: 210,
      ellipsis: true,
      render: (_, record) => (
        <Tooltip title={record.nomenclature_detail?.name}>
          <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
            <Text strong style={{ fontSize: 12 }}>{record.nomenclature_detail?.name}</Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Проект</span>,
      key: 'project',
      width: 120,
      ellipsis: true,
      render: (_, record) => (
        <Tooltip title={record.project_detail?.name}>
          <Text style={{ fontSize: 12 }}>{record.project_detail?.name || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap', paddingRight: 8, display: 'inline-block' }}>Заказать до</span>,
      key: 'order_by_date',
      width: 105,
      dataIndex: 'order_by_date',
      render: (val) => <Text style={{ fontSize: 12 }}>{val ? dayjs(val).format('DD.MM.YY') : '-'}</Text>,
      sorter: (a, b) => {
        if (!a.order_by_date) return 1;
        if (!b.order_by_date) return -1;
        return a.order_by_date.localeCompare(b.order_by_date);
      },
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Проблема</span>,
      key: 'problem',
      width: 145,
      ellipsis: true,
      render: (_, record) => {
        if (!record.has_problem) return '-';
        const reasonName = record.problem_reason_detail?.name || 'Проблема';
        return (
          <Tooltip title={reasonName}>
            <Text type="danger" style={{ fontSize: 11 }} ellipsis>
              {reasonName}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_, record) => (
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={() => addToOrder(record)}
          size="small"
          disabled={!canEdit}
        />
      ),
    },
  ];

  const handleExport = () => {
    if (!orderId) return;
    const orderDateValue = form.getFieldValue('order_date');
    const orderDate = orderDateValue?.format ? orderDateValue.format('YYYY-MM-DD') : orderData?.order_date || null;
    exportOrderToExcel({
      fileName: `Заказ_${orderData?.number || 'черновик'}`,
      orderNumber: orderData?.number || null,
      supplierName: orderData?.supplier_detail?.name || null,
      supplierInn: orderData?.supplier_detail?.inn || null,
      orderDate,
      items: sortedOrderItems.map((item, index) => ({
        index: index + 1,
        nomenclatureName: item.nomenclature_name,
        projectName: item.project_name,
        quantity: item.quantity,
        unit: undefined,
        orderByDate: item.order_by_date || null,
      })),
    });
  };

  const handleConfirmDistribution = () => {
    if (!distributionItemId) return;
    if (distributionProjectIds.length === 0) {
      message.warning('Выберите хотя бы один проект');
      return;
    }
    setExcessDistribution(prev => ({
      ...prev,
      [distributionItemId]: { distribute: true, projectIds: distributionProjectIds },
    }));
    setDistributionModalOpen(false);
    setDistributionItemId(null);
    setDistributionProjectIds([]);
  };

  return (
    <Modal
      title="Редактировать заказ на закупку"
      open={open}
      onCancel={handleClose}
      width={1400}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          Отмена
        </Button>,
        <Button key="print" icon={<FileExcelOutlined />} onClick={handleExport} disabled={orderItems.length === 0}>
          Печать заказа
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={willConfirm ? <SendOutlined /> : <SaveOutlined />}
          onClick={handleSubmit}
          loading={saveOrderMutation.isPending}
          disabled={orderItems.length === 0 || !orderId || !canEdit}
        >
          {willConfirm ? 'Отправить поставщику' : 'Сохранить'}
        </Button>,
      ]}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="supplier"
              label="Поставщик"
              rules={[{ required: true, message: 'Выберите поставщика' }]}
            >
              <Select
                placeholder="Выберите поставщика"
                showSearch
                optionFilterProp="children"
                disabled
              >
                {orderData?.supplier_detail ? (
                  <Select.Option key={orderData.supplier_detail.id} value={orderData.supplier_detail.id}>
                    {orderData.supplier_detail.name}
                  </Select.Option>
                ) : null}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="order_date" label="Дата заказа">
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabled={!canEdit} />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="expected_delivery_date" label="Ожидаемая дата поставки">
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabled={!canEdit} />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="status" label="Статус" initialValue="draft">
              <Select disabled={!canEdit}>
                <Select.Option value="draft">Черновик</Select.Option>
                <Select.Option value="ordered">Заказан</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider style={{ margin: '8px 0 16px' }} />

      <Row gutter={16}>
        <Col span={12}>
          <Card
            title={
              <Space>
                <Text strong>Позиции в заказе</Text>
                <Tag color="blue">{orderItems.length}</Tag>
              </Space>
            }
            size="small"
            styles={{ body: { padding: 0 } }}
            loading={loadingOrder}
          >
            <Table
              columns={orderItemsColumns}
              dataSource={sortedOrderItems}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ y: 350 }}
              locale={{
                emptyText: 'Добавьте позиции из правой панели',
              }}
            />
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title={
              <Space>
                <Text strong>Доступные потребности</Text>
                <Tag>{filteredAvailable.length}</Tag>
              </Space>
            }
            size="small"
            styles={{ body: { padding: 0 } }}
            extra={
              !selectedSupplier && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Выберите поставщика
                </Text>
              )
            }
          >
            <Table
              columns={availableColumns}
              dataSource={sortedAvailable}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ y: 350 }}
              loading={loadingAvailable}
              locale={{
                emptyText: selectedSupplier
                  ? 'Нет доступных потребностей'
                  : 'Выберите поставщика',
              }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="Распределение излишка"
        open={distributionModalOpen}
        onCancel={() => {
          setDistributionModalOpen(false);
          setDistributionItemId(null);
          setDistributionProjectIds([]);
        }}
        onOk={handleConfirmDistribution}
        okText="ОК"
        cancelText="Отмена"
      >
        <Text>Выберите проекты, на которые распределить излишек:</Text>
        <div style={{ marginTop: 12 }}>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Проекты в работе"
            value={distributionProjectIds}
            onChange={setDistributionProjectIds}
            options={activeProjects.map((p: { id: string; name: string }) => ({
              label: p.name,
              value: p.id,
            }))}
          />
        </div>
      </Modal>
    </Modal>
  );
}

export default OrderEditModal;
