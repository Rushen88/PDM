/**
 * ContractorWriteOffsPage - Страница передач подрядчикам
 * 
 * Согласно ERP-требованиям:
 * - Списание материалов при передаче подрядчику
 * - Остатки изменяются только при подтверждении
 */

import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    EyeOutlined,
    FileAddOutlined,
    PlusOutlined,
    ReloadOutlined,
    SendOutlined,
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
    Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { catalogApi } from '../../features/catalog';
import { projectsApi } from '../../features/projects';
import {
    warehouseApi,
    type ContractorWriteOff,
    type ContractorWriteOffStatus,
} from '../../features/warehouse';

const { Title, Text } = Typography;

const statusConfig: Record<ContractorWriteOffStatus, { color: string; label: string }> = {
    draft: { color: 'default', label: 'Черновик' },
    confirmed: { color: 'green', label: 'Подтверждено' },
    cancelled: { color: 'red', label: 'Отменено' },
};

export default function ContractorWriteOffsPage() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ContractorWriteOffStatus | undefined>();
    const [selectedWriteOff, setSelectedWriteOff] = useState<ContractorWriteOff | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [createWarehouseId, setCreateWarehouseId] = useState<string | undefined>();
    const [createForm] = Form.useForm();
    const [selectedProject, setSelectedProject] = useState<string | undefined>();

    // Fetch writeoffs
    const { data: writeoffsData, isLoading, refetch } = useQuery({
        queryKey: ['contractor-writeoffs', statusFilter, search],
        queryFn: () => warehouseApi.contractorWriteoffs.list({
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

    const { data: stockItemsData } = useQuery({
        queryKey: ['stock-items-for-writeoff', createWarehouseId],
        queryFn: () => warehouseApi.stockItems.list({ warehouse: createWarehouseId, page_size: 500 }),
        enabled: !!createWarehouseId && createModalVisible,
    });

    const writeoffs = writeoffsData?.results || [];
    const contractors = contractorsData?.results || [];
    const warehouses = warehousesData?.results || [];
    const projects = projectsData?.results || [];
    const projectItems = projectItemsData?.results || [];
    const stockItems = stockItemsData?.results || [];

    // Confirm mutation
    const confirmMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorWriteoffs.confirm(id),
        onSuccess: () => {
            message.success('Передача подтверждена');
            queryClient.invalidateQueries({ queryKey: ['contractor-writeoffs'] });
            queryClient.invalidateQueries({ queryKey: ['stock-items'] });
        },
        onError: () => {
            message.error('Ошибка при подтверждении');
        },
    });

    // Cancel mutation
    const cancelMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorWriteoffs.cancel(id),
        onSuccess: () => {
            message.success('Передача отменена');
            queryClient.invalidateQueries({ queryKey: ['contractor-writeoffs'] });
        },
        onError: () => {
            message.error('Ошибка при отмене');
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => warehouseApi.contractorWriteoffs.delete(id),
        onSuccess: () => {
            message.success('Передача удалена');
            queryClient.invalidateQueries({ queryKey: ['contractor-writeoffs'] });
        },
        onError: () => {
            message.error('Ошибка при удалении');
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<ContractorWriteOff>) => warehouseApi.contractorWriteoffs.create(data),
        onSuccess: () => {
            message.success('Передача создана');
            queryClient.invalidateQueries({ queryKey: ['contractor-writeoffs'] });
            setCreateModalVisible(false);
            setCreateWarehouseId(undefined);
            createForm.resetFields();
        },
        onError: () => {
            message.error('Ошибка при создании передачи');
        },
    });

    const handleCreate = (values: any) => {
        const items = stockItems
            .map((item) => ({
                stockItemId: item.id,
                nomenclatureItemId: item.nomenclature_item,
                quantity: Number(values.items?.[item.id]?.quantity || 0),
            }))
            .filter((item) => item.quantity > 0)
            .map((item) => ({
                nomenclature_item: item.nomenclatureItemId,
                quantity: item.quantity,
            }));

        if (items.length === 0) {
            message.warning('Укажите хотя бы одну позицию для передачи');
            return;
        }

        createMutation.mutate({
            contractor: values.contractor,
            warehouse: values.warehouse,
            project: values.project || null,
            project_item: values.project_item || null,
            writeoff_date: values.writeoff_date?.format('YYYY-MM-DD'),
            notes: values.notes || '',
            items: items as any,
        });
    };

    // Calculate statistics
    const stats = useMemo(() => {
        const total = writeoffs.length;
        const drafts = writeoffs.filter((w) => w.status === 'draft').length;
        const confirmed = writeoffs.filter((w) => w.status === 'confirmed').length;
        return { total, drafts, confirmed };
    }, [writeoffs]);

    // Show detail
    const showDetail = async (writeoff: ContractorWriteOff) => {
        const detail = await warehouseApi.contractorWriteoffs.get(writeoff.id);
        setSelectedWriteOff(detail);
        setDetailModalVisible(true);
    };

    // Table columns
    const columns: ColumnsType<ContractorWriteOff> = [
        {
            title: 'Номер',
            dataIndex: 'number',
            key: 'number',
            width: 120,
            render: (val) => <Text strong>{val}</Text>,
        },
        {
            title: 'Дата',
            dataIndex: 'writeoff_date',
            key: 'writeoff_date',
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
            render: (status: ContractorWriteOffStatus) => {
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
                                    title="Подтвердить передачу?"
                                    description="Материалы будут списаны со склада"
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
                                    title="Отменить передачу?"
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
                                    title="Удалить передачу?"
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
                        <SendOutlined style={{ marginRight: 8 }} />
                        Передачи подрядчикам
                    </Title>
                    <Text type="secondary">
                        Списание материалов при передаче работ подрядчику
                    </Text>
                </Col>
                <Col>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                            Обновить
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                            Создать передачу
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
                    dataSource={writeoffs}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{
                        showSizeChanger: true,
                        showTotal: (total) => `Всего: ${total}`,
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                description="Нет передач подрядчикам"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button type="primary" icon={<FileAddOutlined />} onClick={() => setCreateModalVisible(true)}>
                                    Создать первую передачу
                                </Button>
                            </Empty>
                        ),
                    }}
                />
            </Card>

            {/* Create Modal */}
            <Modal
                title="Создать передачу подрядчику"
                open={createModalVisible}
                onCancel={() => {
                    setCreateModalVisible(false);
                    setCreateWarehouseId(undefined);
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
                    initialValues={{ writeoff_date: dayjs() }}
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
                                <Select
                                    placeholder="Выберите склад"
                                    onChange={(value) => setCreateWarehouseId(value)}
                                >
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
                                name="writeoff_date"
                                label="Дата передачи"
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

                    {createWarehouseId && (
                        <>
                            <Divider>Позиции для передачи</Divider>
                            <Table
                                dataSource={stockItems}
                                rowKey="id"
                                pagination={false}
                                size="small"
                                columns={[
                                    {
                                        title: 'Номенклатура',
                                        key: 'nomenclature',
                                        render: (_, item) => (
                                            <Space direction="vertical" size={0}>
                                                <Text strong>{item.nomenclature_name || '-'}</Text>
                                            </Space>
                                        ),
                                    },
                                    {
                                        title: 'Доступно',
                                        dataIndex: 'quantity',
                                        width: 120,
                                        align: 'right',
                                        render: (val) => Number(val).toLocaleString('ru-RU'),
                                    },
                                    {
                                        title: 'Передать',
                                        key: 'qty',
                                        width: 140,
                                        render: (_, item) => (
                                            <Form.Item name={['items', item.id, 'quantity']} noStyle>
                                                <InputNumber min={0} max={Number(item.quantity)} style={{ width: '100%' }} />
                                            </Form.Item>
                                        ),
                                    },
                                ]}
                            />
                        </>
                    )}

                    <Form.Item style={{ marginTop: 16, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => {
                                setCreateModalVisible(false);
                                setCreateWarehouseId(undefined);
                                setSelectedProject(undefined);
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
                title={`Передача ${selectedWriteOff?.number}`}
                open={detailModalVisible}
                onCancel={() => setDetailModalVisible(false)}
                footer={null}
                width={800}
            >
                {selectedWriteOff && (
                    <div>
                        <Row gutter={[16, 16]}>
                            <Col span={8}>
                                <Text type="secondary">Дата:</Text>
                                <br />
                                <Text strong>
                                    {dayjs(selectedWriteOff.writeoff_date).format('DD.MM.YYYY')}
                                </Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Подрядчик:</Text>
                                <br />
                                <Text strong>{selectedWriteOff.contractor_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Статус:</Text>
                                <br />
                                <Tag color={statusConfig[selectedWriteOff.status].color}>
                                    {statusConfig[selectedWriteOff.status].label}
                                </Tag>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Склад:</Text>
                                <br />
                                <Text>{selectedWriteOff.warehouse_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Проект:</Text>
                                <br />
                                <Text>{selectedWriteOff.project_detail?.name || '-'}</Text>
                            </Col>
                            <Col span={8}>
                                <Text type="secondary">Передал:</Text>
                                <br />
                                <Text>
                                    {selectedWriteOff.transferred_by_detail?.full_name || '-'}
                                </Text>
                            </Col>
                        </Row>
                        {selectedWriteOff.notes && (
                            <div style={{ marginTop: 16 }}>
                                <Text type="secondary">Примечания:</Text>
                                <br />
                                <Text>{selectedWriteOff.notes}</Text>
                            </div>
                        )}
                        {selectedWriteOff.items && selectedWriteOff.items.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <Text type="secondary">Позиции:</Text>
                                <Table
                                    size="small"
                                    dataSource={selectedWriteOff.items}
                                    rowKey="id"
                                    pagination={false}
                                    columns={[
                                        {
                                            title: 'Номенклатура',
                                            key: 'nomenclature',
                                            render: (_, item) => (
                                                <span>
                                                    {item.nomenclature_name}
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
