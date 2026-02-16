/**
 * OrderCreateModal - Модальное окно создания заказа на закупку
 * 
 * Согласно ERP-требованиям:
 * - Шапка: Поставщик (обязателен), Дата заказа, Ожидаемая дата, Статус
 * - Левая панель: Позиции в заказе
 * - Правая панель: Доступные потребности (фильтр по поставщику)
 * - Номер присваивается автоматически (З-ХХХХ)
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
import { catalogApi } from '../../catalog';
import { projectsApi } from '../../projects';
import { warehouseApi, type MaterialRequirement } from '../../warehouse';
import { procurementApi } from '../api';

const { Text } = Typography;

interface OrderItem {
  id: string;
  requirement?: MaterialRequirement;
  project_item_number?: number | null;
  nomenclature_item: string;
  nomenclature_name: string;
  project_name: string;
  quantity: number;
  base_quantity: number;
  order_by_date?: string;
  has_problem?: boolean;
  requirement_status?: string;
  requirement_status_display?: string;
}

interface OrderCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialRequirementIds?: string[];
  initialSupplierId?: string | null;
}

export function OrderCreateModal({ open, onClose, onSuccess, initialRequirementIds, initialSupplierId }: OrderCreateModalProps) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchAvailable, setSearchAvailable] = useState('');
  const [excessDistribution, setExcessDistribution] = useState<Record<string, { distribute: boolean; projectIds: string[] }>>({});
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [distributionItemId, setDistributionItemId] = useState<string | null>(null);
  const [distributionProjectIds, setDistributionProjectIds] = useState<string[]>([]);
  const [preloadDone, setPreloadDone] = useState(false);

  const orderStatus = Form.useWatch('status', form);
  const isDraft = (orderStatus || 'draft') === 'draft';
  const willConfirm = (orderStatus || 'draft') === 'ordered';
  
  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => catalogApi.suppliers.list({}),
    enabled: open,
  });
  
  // Fetch available requirements (filtered by supplier)
  const { data: availableData, isLoading: loadingAvailable } = useQuery({
    queryKey: ['available-requirements', selectedSupplier, searchAvailable],
    queryFn: () => warehouseApi.materialRequirements.availableForOrder({
      supplier: selectedSupplier!,
      search: searchAvailable || undefined,
    }),
    enabled: !!selectedSupplier && open,
  });
  
  const suppliers = suppliersData?.results || [];
  const availableRequirements = availableData?.results || [];

  const { data: projectsData } = useQuery({
    queryKey: ['active-projects-for-excess'],
    queryFn: () => projectsApi.list({ status: 'in_progress', page_size: 200 }),
    enabled: open,
  });

  const activeProjects = projectsData?.results || [];
  
  // Filter out already added items and items with wrong status
  const filteredAvailable = useMemo(() => {
    const addedIds = new Set(orderItems.map(item => item.requirement?.id).filter(Boolean));
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
  
  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (values: any) => {
      const desiredStatus = values.status || 'draft';
      // Create order
      const order = await procurementApi.purchaseOrders.create({
        supplier: values.supplier,
        order_date: values.order_date?.format('YYYY-MM-DD'),
        expected_delivery_date: values.expected_delivery_date?.format('YYYY-MM-DD'),
        status: 'draft',
        notes: values.notes || '',
      });

      if (!order?.id) {
        throw new Error('OrderCreate: missing order id');
      }
      
      // Add items to order - material_requirement field automatically links requirement to order
      try {
        for (const item of orderItems) {
          await procurementApi.items.create({
            order: order.id,
            nomenclature_item: item.nomenclature_item,
            quantity: item.quantity,
            project_item: item.requirement?.project_item || undefined,
            material_requirement: item.requirement?.id || undefined,
          });
        }

        // Distribute excess quantity if requested
        for (const item of orderItems) {
          const baseQty = item.base_quantity || 0;
          const excessQty = item.quantity - baseQty;
          const dist = excessDistribution[item.id];
          if (item.requirement && dist?.distribute && excessQty > 0) {
            await warehouseApi.materialRequirements.distributeExcess({
              order_id: order.id,
              nomenclature_item_id: item.nomenclature_item,
              exclude_requirement_id: item.requirement.id,
              project_ids: dist.projectIds,
              excess_quantity: excessQty,
            });
          }
        }
      } catch (err) {
        // Roll back draft order if items creation failed
        try {
          await procurementApi.purchaseOrders.delete(order.id);
        } catch {
          // ignore rollback errors
        }
        throw err;
      }

      if (desiredStatus === 'ordered') {
        await procurementApi.purchaseOrders.confirm(order.id);
      }
      
      return order;
    },
    onSuccess: () => {
      message.success('Заказ создан');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['material-requirements'] });
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      const apiError = error?.response?.data?.error
        || error?.response?.data?.detail
        || error?.message;
      message.error(apiError || 'Ошибка при создании заказа');
    },
  });
  
  // Add requirement to order
  const buildOrderItem = useCallback((requirement: MaterialRequirement): OrderItem => {
    const baseQuantity = Number(requirement.to_order) || Number(requirement.total_required) || 1;
    return {
      id: `temp-${Date.now()}-${Math.random()}`,
      requirement,
      project_item_number: requirement.project_item_number ?? null,
      nomenclature_item: requirement.nomenclature_item,
      nomenclature_name: requirement.nomenclature_detail?.name || '',
      project_name: requirement.project_detail?.name || '',
      quantity: baseQuantity,
      base_quantity: baseQuantity,
      order_by_date: requirement.order_by_date || undefined,
      has_problem: requirement.has_problem,
      requirement_status: requirement.status,
      requirement_status_display: requirement.status_display,
    };
  }, []);

  const addToOrder = useCallback((requirement: MaterialRequirement) => {
    const newItem = buildOrderItem(requirement);
    setOrderItems(prev => [...prev, newItem]);
  }, [buildOrderItem]);
  
  // Remove item from order
  const removeFromOrder = useCallback((itemId: string) => {
    setOrderItems(prev => prev.filter(item => item.id !== itemId));
  }, []);
  
  // Update item quantity
  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    setOrderItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity } : item
    ));

    const item = orderItems.find(i => i.id === itemId);
    if (item?.requirement && quantity > item.base_quantity) {
      if (!excessDistribution[itemId]) {
        Modal.confirm({
          title: 'Распределить излишек количества заказываемой позиции на другие позиции проекта/проектов?',
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
  }, [orderItems, excessDistribution]);
  
  // Handle supplier change
  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplier(supplierId);
    setOrderItems([]);  // Clear items when supplier changes
  };
  
  // Handle close
  const handleClose = () => {
    form.resetFields();
    setSelectedSupplier(null);
    setOrderItems([]);
    setSearchAvailable('');
    setExcessDistribution({});
    setPreloadDone(false);
    onClose();
  };
  
  // Handle submit
  const handleSubmit = () => {
    form.validateFields().then(values => {
      if (orderItems.length === 0) {
        message.warning('Добавьте хотя бы одну позицию в заказ');
        return;
      }
      createOrderMutation.mutate(values);
    });
  };

  const handleExport = () => {
    const supplier = suppliers.find((s) => s.id === selectedSupplier);
    const supplierName = supplier?.name || null;
    const supplierInn = supplier?.inn || null;
    const orderDateValue = form.getFieldValue('order_date');
    const orderDate = orderDateValue?.format ? orderDateValue.format('YYYY-MM-DD') : null;
    exportOrderToExcel({
      fileName: 'Заказ_черновик',
      orderNumber: null,
      supplierName,
      supplierInn,
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
  
  // Order items sorted by order_by_date
  const sortedOrderItems = useMemo(() => {
    return [...orderItems].sort((a, b) => {
      if (!a.order_by_date && !b.order_by_date) return 0;
      if (!a.order_by_date) return 1;
      if (!b.order_by_date) return -1;
      return a.order_by_date.localeCompare(b.order_by_date);
    });
  }, [orderItems]);

  useEffect(() => {
    if (!open) return;
    if (preloadDone) return;
    if (!initialRequirementIds || initialRequirementIds.length === 0) {
      setPreloadDone(true);
      return;
    }

    const loadRequirements = async () => {
      try {
        const requirements = await Promise.all(
          initialRequirementIds.map((id) => warehouseApi.materialRequirements.get(id))
        );

        const inferredSupplier = initialSupplierId || requirements.find(r => r.supplier)?.supplier || null;
        if (inferredSupplier) {
          setSelectedSupplier(inferredSupplier);
          form.setFieldsValue({ supplier: inferredSupplier });
        }

        const validRequirements = requirements.filter(r =>
          r.status === 'waiting_order' && Number(r.to_order) > 0 && (!inferredSupplier || r.supplier === inferredSupplier)
        );

        if (requirements.length > validRequirements.length) {
          message.warning('Некоторые потребности не добавлены из-за статуса или другого поставщика.');
        }

        if (validRequirements.length > 0) {
          setOrderItems(validRequirements.map(buildOrderItem));
        }
      } catch (error: any) {
        const apiError = error?.response?.data?.error || error?.message;
        message.error(apiError || 'Не удалось загрузить потребности');
      } finally {
        setPreloadDone(true);
      }
    };

    loadRequirements();
  }, [open, preloadDone, initialRequirementIds, initialSupplierId, buildOrderItem, form]);

  // Order items table columns
  const orderItemsColumns: ColumnsType<OrderItem> = [
    {
      title: 'ID',
      key: 'project_item_number',
      width: 90,
      align: 'center',
      render: (_, item) => (
        <Text code style={{ fontSize: 12 }}>
          {item.project_item_number ? String(item.project_item_number).padStart(7, '0') : '—'}
        </Text>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Номенклатура</span>,
      key: 'nomenclature',
      width: 140,
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
      width: 110,
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
      width: 70,
      render: (_, item) => (
        <InputNumber
          min={0.001}
          value={item.quantity}
          onChange={(val) => updateQuantity(item.id, val || 0)}
          size="small"
          style={{ width: '100%', fontSize: 12 }}
          disabled={!isDraft}
        />
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap', paddingRight: 8, display: 'inline-block' }}>Заказать до</span>,
      key: 'order_by_date',
      width: 90,
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
      width: 70,
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
      width: 32,
      render: (_, item) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeFromOrder(item.id)}
          size="small"
          disabled={!isDraft}
        />
      ),
    },
  ];
  
  // Available requirements table columns
  const availableColumns: ColumnsType<MaterialRequirement> = [
    {
      title: 'ID',
      key: 'project_item_number',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Text code style={{ fontSize: 12 }}>
          {record.project_item_number ? String(record.project_item_number).padStart(7, '0') : '—'}
        </Text>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Номенклатура</span>,
      key: 'nomenclature',
      width: 140,
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
      width: 110,
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
      width: 90,
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
      width: 120,
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
          disabled={!isDraft}
        />
      ),
    },
  ];

  return (
    <Modal
      title="Создать заказ на закупку"
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
          disabled={orderItems.length === 0}
        >
          {willConfirm ? 'Отправить поставщику' : 'Создать заказ'}
        </Button>,
      ]}
      styles={{ body: { padding: '16px 24px' } }}
    >
      {/* Header / Form */}
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
                onChange={handleSupplierChange}
              >
                {suppliers.map(s => (
                  <Select.Option key={s.id} value={s.id}>
                    {s.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="order_date" label="Дата заказа">
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="expected_delivery_date" label="Ожидаемая дата поставки">
              <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item name="status" label="Статус" initialValue="draft">
              <Select>
                <Select.Option value="draft">Черновик</Select.Option>
                <Select.Option value="ordered">Заказан</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider style={{ margin: '8px 0 16px' }} />

      <style>{`
        .order-create-table .ant-table-thead > tr > th {
          font-size: 12px;
          padding: 4px 6px;
          line-height: 14px;
          white-space: nowrap;
        }
      `}</style>

      {/* Two-panel layout */}
      <Row gutter={16}>
        {/* Left panel: Order items */}
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
          >
            <Table
              className="order-create-table"
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
        
        {/* Right panel: Available requirements */}
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
              className="order-create-table"
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

export default OrderCreateModal;
