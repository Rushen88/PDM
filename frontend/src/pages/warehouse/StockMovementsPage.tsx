import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DeleteOutlined,
    ReloadOutlined,
    SearchOutlined,
    SwapOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Input,
    message,
    Popconfirm,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';

import {
    warehouseApi,
    type StockMovement,
    type StockMovementType,
    type Warehouse
} from '../../features/warehouse';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const MOVEMENT_TYPE_CONFIG: Record<StockMovementType, { color: string; icon: React.ReactNode; label: string }> = {
  receipt: { color: 'green', icon: <ArrowDownOutlined />, label: 'Приём' },
  issue: { color: 'red', icon: <ArrowUpOutlined />, label: 'Выдача' },
  transfer_out: { color: 'orange', icon: <SwapOutlined />, label: 'Перемещение (отпр.)' },
  transfer_in: { color: 'blue', icon: <SwapOutlined />, label: 'Перемещение (приём)' },
  transfer: { color: 'geekblue', icon: <SwapOutlined />, label: 'Перемещение' },
  adjustment: { color: 'purple', icon: <ToolOutlined />, label: 'Корректировка' },
  inventory: { color: 'cyan', icon: <ToolOutlined />, label: 'Инвентаризация' },
  write_off: { color: 'default', icon: <ArrowUpOutlined />, label: 'Списание' },
  return: { color: 'lime', icon: <ArrowDownOutlined />, label: 'Возврат' },
  contractor_writeoff: { color: 'magenta', icon: <ArrowUpOutlined />, label: 'Списание подрядчику' },
  contractor_receipt: { color: 'green', icon: <ArrowDownOutlined />, label: 'Приёмка от подрядчика' },
  production: { color: 'gold', icon: <ToolOutlined />, label: 'Производство' },
  consumption: { color: 'red', icon: <ArrowUpOutlined />, label: 'Потребление' },
};

export default function StockMovementsPage() {
  const queryClient = useQueryClient();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | undefined>();
  const [selectedType, setSelectedType] = useState<StockMovementType | undefined>();
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // Fetch warehouses
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.warehouses.list({ is_active: true }),
  });

  const warehouses: Warehouse[] = warehousesData?.results || [];

  // Fetch movements
  const { data: movementsData, isLoading, refetch } = useQuery({
    queryKey: ['stock-movements', selectedWarehouse, selectedType, searchText, dateRange],
    queryFn: () => warehouseApi.stockMovements.list({
      warehouse: selectedWarehouse,
      movement_type: selectedType,
      search: searchText || undefined,
      date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
      date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
      page_size: 100,
    }),
  });

  const movements: StockMovement[] = movementsData?.results || [];

  const deleteMovementMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.stockMovements.delete(id),
    onSuccess: () => {
      message.success('Движение удалено');
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
    onError: () => message.error('Ошибка при удалении'),
  });

  // Table columns
  const columns: ColumnsType<StockMovement> = [
    {
      title: 'Дата/Время',
      dataIndex: 'performed_at',
      key: 'performed_at',
      width: 150,
      render: (date: string) => (
        <Space direction="vertical" size={0}>
          <Text>{dayjs(date).format('DD.MM.YYYY')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(date).format('HH:mm')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Тип',
      dataIndex: 'movement_type',
      key: 'movement_type',
      width: 150,
      render: (type: StockMovementType, record) => {
        const config = MOVEMENT_TYPE_CONFIG[type] || { color: 'default', icon: <ToolOutlined />, label: type };
        return (
          <Tag color={config.color} icon={config.icon}>
            {record.movement_type_display || config.label}
          </Tag>
        );
      },
    },
    {
      title: 'Номенклатура',
      dataIndex: 'nomenclature_name',
      key: 'nomenclature_name',
      ellipsis: true,
    },
    {
      title: 'Склад',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
      width: 150,
    },
    {
      title: 'Количество',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      render: (qty: number, record) => {
        const isIncrease = ['receipt', 'transfer_in', 'return'].includes(record.movement_type);
        return (
          <Text strong style={{ color: isIncrease ? '#52c41a' : '#ff4d4f' }}>
            {isIncrease ? '+' : '-'}{qty}
          </Text>
        );
      },
    },
    {
      title: 'Остаток',
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 100,
      render: (balance: number) => <Text>{balance}</Text>,
    },
    {
      title: 'Проект',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      render: (name: string | null) => name || '-',
    },
    {
      title: 'Причина',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: 'Пользователь',
      dataIndex: 'performed_by_name',
      key: 'performed_by_name',
      width: 150,
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title="Удалить движение?"
          okText="Удалить"
          okType="danger"
          cancelText="Отмена"
          onConfirm={() => deleteMovementMutation.mutate(record.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>Движение товаров</Title>
        <Text type="secondary">История операций по складам</Text>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col flex="auto">
            <Space wrap>
              <Select
                placeholder="Склад"
                style={{ width: 200 }}
                allowClear
                value={selectedWarehouse}
                onChange={setSelectedWarehouse}
                options={warehouses.map(w => ({ 
                  label: w.name, 
                  value: w.id 
                }))}
              />
              <Select
                placeholder="Тип операции"
                style={{ width: 180 }}
                allowClear
                value={selectedType}
                onChange={setSelectedType}
                options={Object.entries(MOVEMENT_TYPE_CONFIG).map(([key, config]) => ({
                  label: config.label,
                  value: key,
                }))}
              />
              <RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates)}
                format="DD.MM.YYYY"
                placeholder={['Дата с', 'Дата по']}
              />
              <Input
                placeholder="Поиск по номенклатуре..."
                prefix={<SearchOutlined />}
                style={{ width: 250 }}
                allowClear
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Обновить
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={movements}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
          }}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
}
