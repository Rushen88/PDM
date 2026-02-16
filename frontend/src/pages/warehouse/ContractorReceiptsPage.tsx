/**
 * ContractorReceiptsPage - Страница приёмок от подрядчиков
 * 
 * Согласно ERP-требованиям:
 * - Приём готовых изделий от подрядчика
 * - Приход на склад при подтверждении
 */

import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    FileAddOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Empty,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { catalogApi } from '../../features/catalog';
import { projectsApi } from '../../features/projects';
import {
    warehouseApi,
    type ContractorReceipt,
    type ContractorReceiptStatus,
} from '../../features/warehouse';

const { Title, Text } = Typography;

const statusConfig: Record<ContractorReceiptStatus, { color: string; label: string }> = {
    draft: { color: 'default', label: 'Черновик' },
    confirmed: { color: 'green', label: 'Подтверждено' },
    cancelled: { color: 'red', label: 'Отменено' },
};

export default function ContractorReceiptsPage() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ContractorReceiptStatus | undefined>();
    const [selectedReceipt, setSelectedReceipt] = useState<ContractorReceipt | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [createForm] = Form.useForm();
    const [selectedProject, setSelectedProject] = useState<string | undefined>();

    // Fetch receipts
    const { data: receiptsData, isLoading, refetch } = useQuery({
        queryKey: ['contractor-receipts', statusFilter, search],
        queryFn: () => warehouseApi.contractorReceipts.list({
            status: statusFilter,
            search: search || undefined,
        }),
    });

    const { data: contractorsData } = useQuery({
        queryKey: ['contractors-list'],
        queryFn: () => catalogApi.contractors.list({ is_active: true, page_size: 200 }),
        enabled: createModalVisible,
    });

    const { data: warehousesData } = useQuery({
        queryKey: ['warehouses-active'],
        queryFn: () => warehouseApi.warehouses.list({ is_active: true, page_size: 200 }),
        enabled: createModalVisible,
    });

    const { data: projectsData } = useQuery({
        queryKey: ['projects-active'],
        queryFn: () => projectsApi.list({ status: 'in_progress' }),
        enabled: createModalVisible,
    });

    // Fetch project items (contractor work items)
    const { data: projectItemsData } = useQuery({
        queryKey: ['project-contractor-items', selectedProject],
        queryFn: () => projectsApi.items.list({ 
            project: selectedProject!, 
            purchase_by_contractor: true,
            page_size: 500 
        }),
        enabled: !!selectedProject && createModalVisible,
    });

    const { data: nomenclatureData } = useQuery({
        queryKey: ['nomenclature-for-receipt'],
        queryFn: () => catalogApi.nomenclature.list({ page_size: 200 }),
        enabled: createModalVisible,
    });

    const receipts = receiptsData?.results || [];
    const contractors = contractorsData?.results || [];
    const warehouses = warehousesData?.results || [];
    const projects = projectsData?.results || [];
    const projectItems = projectItemsData?.results || [];
    const nomenclature = nomenclatureData?.results || [];

    // Confirm mutation
    const confirmMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorReceipts.confirm(id),
        onSuccess: () => {
            message.success('Приёмка подтверждена');
            queryClient.invalidateQueries({ queryKey: ['contractor-receipts'] });
            queryClient.invalidateQueries({ queryKey: ['stock-items'] });
        },
        onError: () => {
            message.error('Ошибка при подтверждении');
        },
    });

    // Cancel mutation
    const cancelMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorReceipts.cancel(id),
        onSuccess: () => {
            message.success('Приёмка отменена');
            queryClient.invalidateQueries({ queryKey: ['contractor-receipts'] });
        },
        onError: () => {
            message.error('Ошибка при отмене');
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorReceipts.delete(id),
        onSuccess: () => {
            message.success('Приёмка удалена');
            queryClient.invalidateQueries({ queryKey: ['contractor-receipts'] });
        },
        onError: () => {
            message.error('Ошибка при удалении');
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<ContractorReceipt>) => warehouseApi.contractorReceipts.create(data),
        onSuccess: () => {
            message.success('Приёмка создана');
            queryClient.invalidateQueries({ queryKey: ['contractor-receipts'] });
            setCreateModalVisible(false);
            createForm.resetFields();
        },
        onError: () => {
            message.error('Ошибка при создании приёмки');
        },
    });

    const handleCreate = (values: any) => {
        const items = nomenclature
            .map((item) => ({
                id: item.id,
                quantity: Number(values.items?.[item.id]?.quantity || 0),
            }))
            .filter((item) => item.quantity > 0)
            .map((item) => ({
                nomenclature_item: item.id,
                quantity: item.quantity,
            }));

        if (items.length === 0) {
            message.warning('Укажите хотя бы одну позицию для приёмки');
            return;
        }

        createMutation.mutate({
            contractor: values.contractor,
            warehouse: values.warehouse,
            project: values.project || null,
            project_item: values.project_item || null,
            receipt_date: values.receipt_date?.format('YYYY-MM-DD'),
            notes: values.notes || '',
            items: items as any,
        });
    };

    // Calculate statistics
    const stats = useMemo(() => {
        const total = receipts.length;
        const drafts = receipts.filter((r) => r.status === 'draft').length;
        const confirmed = receipts.filter((r) => r.status === 'confirmed').length;
        return { total, drafts, confirmed };
    }, [receipts]);

    // Show detail
    const showDetail = async (receipt: ContractorReceipt) => {
        const detail = await warehouseApi.contractorReceipts.get(receipt.id);
        setSelectedReceipt(detail);
        setDetailModalVisible(true);
    };

    // Table columns
    const columns: ColumnsType<ContractorReceipt> = [
        {
            title: 'Номер',
            dataIndex: 'number',
            key: 'number',
            width: 120,
            render: (val) => <Text strong>{val}</Text>,
        },
        {
            title: 'Дата',
            dataIndex: 'receipt_date',
            key: 'receipt_date',
            width: 120,
            render: (val) => val ? dayjs(val).format('DD.MM.YYYY') : '-',
        },
        {
            title: 'Подрядчик',
            key: 'contractor',
            render: (_, record) => record.contractor_detail?.name || '-',
        },
        {
            title: 'Склад',
            key: 'warehouse',
            width: 150,
            render: (_, record) => record.warehouse_detail?.name || '-',
        },
        {
            title: 'Проект',
            key: 'project',
            width: 120,
            render: (_, record) =>
                record.project_detail ? record.project_detail.name : '-',
        },
        {
            title: 'Позиций',
            dataIndex: 'items_count',
            key: 'items_count',
            width: 80,
            align: 'center',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: ContractorReceiptStatus) => {
                const config = statusConfig[status] || { color: 'default', label: status };
                return <Tag color={config.color}>{config.label}</Tag>;
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 150,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Просмотр">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => showDetail(record)}
                        />
                    </Tooltip>
                    {record.status === 'draft' && (
                        <>
                            <Tooltip title="Подтвердить">
                                <Popconfirm
                                    title="Подтвердить приёмку?"
                                    description="Изделия будут оприходованы на склад"
                                    onConfirm={() => confirmMutation.mutate(record.id)}
                                    okText="Да"
                                    cancelText="Нет"
                                >
                                    <Button
                                        type="text"
                                        icon={<CheckCircleOutlined />}
                                        loading={confirmMutation.isPending}
                                    />
                                </Popconfirm>
                            </Tooltip>
                            <Tooltip title="Отменить">
                                <Popconfirm
                                    title="Отменить приёмку?"
                                    onConfirm={() => cancelMutation.mutate(record.id)}
                                    okText="Да"
                                    cancelText="Нет"
                                >
                                    <Button
                                        type="text"
                                        danger
                                        icon={<CloseCircleOutlined />}
                                        loading={cancelMutation.isPending}
                                    />
                                </Popconfirm>
                            </Tooltip>
                            <Tooltip title="Удалить">
                                <Popconfirm
                                    title="Удалить приёмку?"
                                    onConfirm={() => deleteMutation.mutate(record.id)}
                                    okText="Да"
                                    cancelText="Нет"
                                >
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={deleteMutation.isPending}
                                    />
                                </Popconfirm>
                            </Tooltip>
                        </>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            {/* Header */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
                <Col>
                    <Title level={3} style={{ margin: 0 }}>
                        <DownloadOutlined style={{ marginRight: 8 }} />
                        Приёмки от подрядчиков
                    </Title>
                    <Text type="secondary">
                        Приход готовых изделий от подрядчиков на склад
                    </Text>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                            Обновить
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                            Создать приёмку
                        </Button>
                    </Space>
                </Col>
            </Row>

            {/* Statistics */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={8}>
                    <Card size="small">
                        <Statistic title="Всего документов" value={stats.total} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Statistic
                            title="Черновики"
                            value={stats.drafts}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Statistic
                            title="Подтверждено"
                            value={stats.confirmed}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Filters */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                    <Col span={8}>
                        <Input
                            placeholder="Поиск по номеру..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col span={6}>
                        <Select
                            placeholder="Статус"
                            style={{ width: '100%' }}
                            value={statusFilter}
                            onChange={setStatusFilter}
                            allowClear
                        >
                            {Object.entries(statusConfig).map(([key, { label }]) => (
                                <Select.Option key={key} value={key}>
                                    {label}
                                </Select.Option>
                            ))}
                        </Select>
                    </Col>
                </Row>
            </Card>

            {/* Table */}
            <Card>
                <Table
                    columns={columns}
                    dataSource={receipts}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{
                        showSizeChanger: true,
                        showTotal: (total) => `Всего: ${total}`,
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                description="Нет приёмок от подрядчиков"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button type="primary" icon={<FileAddOutlined />} onClick={() => setCreateModalVisible(true)}>
                                    Создать первую приёмку
                                </Button>
                            </Empty>
                        ),
                    }}
                />
            </Card>

            {/* Create Modal */}
            <Modal
                title="Создать приёмку от подрядчика"
                open={createModalVisible}
                onCancel={() => {
                    setCreateModalVisible(false);
                    setSelectedProject(undefined);
                    createForm.resetFields();
                }}
                footer={null}
                width={1000}
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    onFinish={handleCreate}
                    initialValues={{ receipt_date: dayjs() }}
                >
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="contractor"
                                label="Подрядчик"
                                rules={[{ required: true, message: 'Выберите подрядчика' }]}
                            >
                                <Select
                                    placeholder="Выберите подрядчика"
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {contractors.map((c) => (
                                        <Select.Option key={c.id} value={c.id}>
                                            {c.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="warehouse"
                                label="Склад"
                                rules={[{ required: true, message: 'Выберите склад' }]}
                            >
                                <Select placeholder="Выберите склад">
                                    {warehouses.map((w) => (
                                        <Select.Option key={w.id} value={w.id}>
                                            {w.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="receipt_date"
                                label="Дата приёмки"
                                rules={[{ required: true, message: 'Выберите дату' }]}
                            >
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="project" label="Проект">
                                <Select 
                                    placeholder="Проект (опционально)" 
                                    allowClear
                                    onChange={(value) => {
                                        setSelectedProject(value);
                                        createForm.setFieldValue('project_item', undefined);
                                    }}
                                >
                                    {projects.map((p) => (
                                        <Select.Option key={p.id} value={p.id}>
                                            {p.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="project_item" label="Позиция проекта (работа)">
                                <Select 
                                    placeholder="Выберите работу (опционально)" 
                                    allowClear
                                    disabled={!selectedProject}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {projectItems.map((item) => (
                                        <Select.Option key={item.id} value={item.id}>
                                            {item.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="notes" label="Примечания">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider>Позиции приёмки</Divider>
                    <Table
                        dataSource={nomenclature}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        columns={[
                            {
                                title: 'Номенклатура',
                                key: 'nomenclature',
                                render: (_, item) => (
                                    <Space direction="vertical" size={0}>
                                        <Text strong>{item.name || '-'}</Text>
                                    </Space>
                                ),
                            },
                            {
                                title: 'Принять',
                                key: 'qty',
                                width: 140,
                                render: (_, item) => (
                                    <Form.Item name={['items', item.id, 'quantity']} noStyle>
                                        <InputNumber min={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                ),
                            },
                        ]}
                    />

                    <Form.Item style={{ marginTop: 16, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => {
                                setCreateModalVisible(false);
                                createForm.resetFields();
                            }}>
                                Отмена
                            </Button>
                            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                                Создать
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Detail Modal */}
            <Modal
                title={`Приёмка ${selectedReceipt?.number}`}
                open={detailModalVisible}
                onCancel={() => setDetailModalVisible(false)}
                footer={null}
                width={800}
            >
                {selectedReceipt && (
                    <div>
                        <Row gutter={[16, 16]}>
                            <Col span={8}>
                                <Text type="secondary">Дата:</Text>
                                <br />
                                <Text strong>
                                    {dayjs(selectedReceipt.receipt_date).format('DD.MM.YYYY')}
                                </Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Подрядчик:</Text>
                                <br />
                                <Text strong>{selectedReceipt.contractor_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Статус:</Text>
                                <br />
                                <Tag color={statusConfig[selectedReceipt.status].color}>
                                    {statusConfig[selectedReceipt.status].label}
                                </Tag>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Склад:</Text>
                                <br />
                                <Text>{selectedReceipt.warehouse_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Проект:</Text>
                                <br />
                                <Text>{selectedReceipt.project_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Принял:</Text>
                                <br />
                                <Text>
                                    {selectedReceipt.received_by_detail?.full_name || '-'}
                                </Text>
                            </Col>
                        </Row>
                        {selectedReceipt.notes && (
                            <div style={{ marginTop: 16 }}>
                                <Text type="secondary">Примечания:</Text>
                                <br />
                                <Text>{selectedReceipt.notes}</Text>
                            </div>
                        )}
                        {selectedReceipt.items && selectedReceipt.items.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <Text type="secondary">Позиции:</Text>
                                <Table
                                    size="small"
                                    dataSource={selectedReceipt.items}
                                    rowKey="id"
                                    pagination={false}
                                    columns={[
                                        {
                                            title: 'Номенклатура',
                                            key: 'nomenclature',
                                            render: (_, item) => (
                                                <span>
                                                    {item.nomenclature_detail?.name}
                                                </span>
                                            ),
                                        },
                                        {
                                            title: 'Количество',
                                            dataIndex: 'quantity',
                                            width: 120,
                                            render: (qty, item) => `${qty} ${item.unit || ''}`,
                                        },
                                    ]}
                                />
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
