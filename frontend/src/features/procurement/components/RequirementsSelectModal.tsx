/**
 * RequirementsSelectModal - Модальное окно выбора потребностей для добавления в заказ.
 * 
 * Согласно ERP-требованиям:
 * - Фильтрация по поставщику (обязательно)
 * - Показываются только потребности в статусе waiting_order
 * - Потребности, уже добавленные в заказ, не показываются
 */

import {
    SearchOutlined,
    ShoppingCartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { projectsApi } from '../../projects';
import { warehouseApi, type MaterialRequirement } from '../../warehouse';

const { Text } = Typography;

interface RequirementsSelectModalProps {
    visible: boolean;
    supplierId: string | null;
    onSelect: (requirements: MaterialRequirement[]) => void;
    onCancel: () => void;
    selectedIds?: string[];
}

export function RequirementsSelectModal({
    visible,
    supplierId,
    onSelect,
    onCancel,
    selectedIds = [],
}: RequirementsSelectModalProps) {
    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState<string | undefined>();
    const [selectedRows, setSelectedRows] = useState<MaterialRequirement[]>([]);

    // Fetch available requirements
    const { data: requirementsData, isLoading } = useQuery({
        queryKey: ['available-requirements', supplierId, projectFilter, search],
        queryFn: () =>
            supplierId
                ? warehouseApi.materialRequirements.availableForOrder({
                    supplier: supplierId,
                    project: projectFilter,
                    search: search || undefined,
                })
                : Promise.resolve({ count: 0, results: [] }),
        enabled: visible && !!supplierId,
    });

    // Fetch projects for filter
    const { data: projectsData } = useQuery({
        queryKey: ['projects-active'],
        queryFn: () => projectsApi.list({ status: 'in_progress' }),
        enabled: visible,
    });

    const requirements = useMemo(() => {
        const data = requirementsData?.results || [];
        // Исключаем уже выбранные позиции
        return data.filter(r => !selectedIds.includes(r.id));
    }, [requirementsData, selectedIds]);

    const projects = projectsData?.results || [];

    // Table columns
    const columns: ColumnsType<MaterialRequirement> = [
        {
            title: 'Материал/комплектующее',
            key: 'nomenclature',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.nomenclature_detail?.name || '-'}</Text>
                </Space>
            ),
        },
        {
            title: 'Проект',
            key: 'project',
            width: 150,
            render: (_, record) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.project_detail?.name || '-'}
                </Text>
            ),
        },
        {
            title: 'Позиция',
            key: 'project_item',
            width: 200,
            ellipsis: true,
            render: (_, record) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.project_item_detail?.full_path || '-'}
                </Text>
            ),
        },
        {
            title: 'К заказу',
            key: 'to_order',
            width: 100,
            align: 'right',
            render: (_, record) => (
                <Text strong type="danger">
                    {Number(record.to_order).toLocaleString('ru-RU')}
                </Text>
            ),
        },
        {
            title: 'Приоритет',
            key: 'priority',
            width: 100,
            align: 'center',
            render: (_, record) => {
                const config: Record<string, { color: string; label: string }> = {
                    critical: { color: 'red', label: 'Критич.' },
                    high: { color: 'orange', label: 'Высокий' },
                    normal: { color: 'blue', label: 'Обычный' },
                    low: { color: 'default', label: 'Низкий' },
                };
                const { color, label } = config[record.priority] || { color: 'default', label: record.priority };
                return <Tag color={color}>{label}</Tag>;
            },
        },
    ];

    const handleOk = () => {
        onSelect(selectedRows);
        setSelectedRows([]);
        setSearch('');
        setProjectFilter(undefined);
    };

    const handleCancel = () => {
        setSelectedRows([]);
        setSearch('');
        setProjectFilter(undefined);
        onCancel();
    };

    return (
        <Modal
            title={
                <Space>
                    <ShoppingCartOutlined />
                    Выбор потребностей для добавления в заказ
                </Space>
            }
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
            width={900}
            okText={`Добавить (${selectedRows.length})`}
            okButtonProps={{ disabled: selectedRows.length === 0 }}
            cancelText="Отмена"
        >
            {!supplierId ? (
                <Empty
                    description="Сначала выберите поставщика"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            ) : (
                <>
                    {/* Filters */}
                    <Space style={{ marginBottom: 16, width: '100%' }} wrap>
                        <Input
                            placeholder="Поиск по названию..."
                            prefix={<SearchOutlined />}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: 280 }}
                            allowClear
                        />
                        <Select
                            placeholder="Фильтр по проекту"
                            style={{ width: 200 }}
                            value={projectFilter}
                            onChange={setProjectFilter}
                            allowClear
                            showSearch
                            optionFilterProp="children"
                        >
                            {projects.map((p) => (
                                <Select.Option key={p.id} value={p.id}>
                                    {p.name}
                                </Select.Option>
                            ))}
                        </Select>
                        <Text type="secondary">
                            Найдено: {requirements.length} потребностей
                        </Text>
                    </Space>

                    {/* Table */}
                    <Spin spinning={isLoading}>
                        <Table
                            columns={columns}
                            dataSource={requirements}
                            rowKey="id"
                            size="small"
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: false,
                                showTotal: (total) => `Всего: ${total}`,
                            }}
                            rowSelection={{
                                type: 'checkbox',
                                selectedRowKeys: selectedRows.map(r => r.id),
                                onChange: (_, rows) => setSelectedRows(rows),
                            }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        description="Нет потребностей для добавления"
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    />
                                ),
                            }}
                            scroll={{ y: 400 }}
                        />
                    </Spin>

                    {selectedRows.length > 0 && (
                        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                            <Space direction="vertical" size={4}>
                                <Text strong>
                                    Выбрано позиций: {selectedRows.length}
                                </Text>
                                <Text type="secondary">
                                    Общее количество к заказу:{' '}
                                    {selectedRows.reduce((sum, r) => sum + Number(r.to_order), 0).toLocaleString('ru-RU')}
                                </Text>
                            </Space>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}

export default RequirementsSelectModal;
