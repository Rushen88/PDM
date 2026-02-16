/**
 * Workplace Problems Tab
 * 
 * Comprehensive view of all problems across responsible items.
 * Features:
 * - Grouped by problem type (Manufacturing/Procurement)
 * - Filterable and searchable
 * - Quick actions to resolve problems
 * - Detailed problem information with tooltips
 */

import {
    ExclamationCircleOutlined,
    FilterOutlined,
    ShoppingCartOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import {
    Badge,
    Button,
    Card,
    Col,
    Empty,
    Input,
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
import { useMemo, useState } from 'react';

import type { ProblemItem, ProblemType, WorkplaceProject } from '../../../features/workplace';

const { Text } = Typography;

interface WorkplaceProblemsTabProps {
  problems: ProblemItem[];
  projects: WorkplaceProject[];
  loading?: boolean;
  onOpenItem: (projectId: string, itemId: string) => void;
}

/**
 * Problem type labels and colors
 */
const PROBLEM_LABELS: Record<ProblemType, { label: string; color: string; icon: React.ReactNode }> = {
  work_not_started: {
    label: 'Работа не начата',
    color: 'orange',
    icon: <ToolOutlined />,
  },
  work_not_completed: {
    label: 'Работа не завершена',
    color: 'red',
    icon: <ToolOutlined />,
  },
  order_not_placed: {
    label: 'Заказ не оформлен',
    color: 'orange',
    icon: <ShoppingCartOutlined />,
  },
  not_delivered: {
    label: 'Не поставлено',
    color: 'red',
    icon: <ShoppingCartOutlined />,
  },
  has_problem_flag: {
    label: 'Проблема',
    color: 'volcano',
    icon: <ExclamationCircleOutlined />,
  },
  has_delay_reason: {
    label: 'Отклонение',
    color: 'gold',
    icon: <WarningOutlined />,
  },
};

/**
 * Format item number to 7-digit string
 */
const formatItemNumber = (num: number | null) => 
  num ? String(num).padStart(7, '0') : '—';

export function WorkplaceProblemsTab({
  problems,
  projects,
  loading,
  onOpenItem,
}: WorkplaceProblemsTabProps) {
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const [selectedType, setSelectedType] = useState<'all' | 'manufactured' | 'purchased'>('all');
  const [selectedProblem, setSelectedProblem] = useState<ProblemType | 'all'>('all');

  // Statistics
  const stats = useMemo(() => {
    const manufactured = problems.filter(p => p.type === 'manufactured');
    const purchased = problems.filter(p => p.type === 'purchased');
    
    return {
      total: problems.length,
      manufactured: manufactured.length,
      purchased: purchased.length,
      workNotStarted: problems.filter(p => p.problems.includes('work_not_started')).length,
      workNotCompleted: problems.filter(p => p.problems.includes('work_not_completed')).length,
      orderNotPlaced: problems.filter(p => p.problems.includes('order_not_placed')).length,
      notDelivered: problems.filter(p => p.problems.includes('not_delivered')).length,
      hasProblemFlag: problems.filter(p => p.problems.includes('has_problem_flag')).length,
      hasDelayReason: problems.filter(p => p.problems.includes('has_delay_reason')).length,
    };
  }, [problems]);

  // Filtered data
  const filteredProblems = useMemo(() => {
    let result = [...problems];

    // Filter by search text
    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.project_name?.toLowerCase().includes(search) ||
        (p.item_number && formatItemNumber(p.item_number).includes(search))
      );
    }

    // Filter by project
    if (selectedProject) {
      result = result.filter(p => p.project_id === selectedProject);
    }

    // Filter by type
    if (selectedType !== 'all') {
      result = result.filter(p => p.type === selectedType);
    }

    // Filter by problem type
    if (selectedProblem !== 'all') {
      result = result.filter(p => p.problems.includes(selectedProblem));
    }

    return result;
  }, [problems, searchText, selectedProject, selectedType, selectedProblem]);

  // Table columns
  const columns: ColumnsType<ProblemItem> = [
    {
      title: 'ID',
      key: 'item_number',
      width: 90,
      fixed: 'left',
      render: (_, record) => (
        <Text code style={{ fontSize: 12 }}>
          {formatItemNumber(record.item_number)}
        </Text>
      ),
    },
    {
      title: 'Наименование',
      key: 'name',
      width: 250,
      fixed: 'left',
      render: (_, record) => (
        <div>
          <Button
            type="link"
            size="small"
            onClick={() => onOpenItem(record.project_id, record.id)}
            style={{
              padding: 0,
              height: 'auto',
              fontSize: 12,
              fontWeight: 500,
              color: record.type === 'manufactured' ? '#52c41a' : '#1890ff',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 230,
              display: 'block',
            }}
          >
            {record.name}
          </Button>
          <div style={{ fontSize: 11, color: '#999' }}>
            {record.project_name || '—'}
          </div>
        </div>
      ),
    },
    {
      title: 'Тип',
      key: 'type',
      width: 80,
      render: (_, record) => (
        <Tag color={record.type === 'manufactured' ? 'green' : 'blue'} style={{ margin: 0 }}>
          {record.type === 'manufactured' ? 'ИЗГОТ' : 'ЗАКУП'}
        </Tag>
      ),
    },
    {
      title: 'Проблемы',
      key: 'problems',
      width: 220,
      render: (_, record) => (
        <Space size={4} wrap>
          {record.problems.map((problemType) => {
            const config = PROBLEM_LABELS[problemType];
            return (
              <Tooltip key={problemType} title={config.label}>
                <Tag
                  color={config.color}
                  icon={config.icon}
                  style={{ margin: 0, fontSize: 10 }}
                >
                  {config.label}
                </Tag>
              </Tooltip>
            );
          })}
        </Space>
      ),
    },
    {
      title: 'Причина / Комментарий',
      key: 'reason',
      width: 200,
      ellipsis: true,
      render: (_, record) => {
        const reason = record.problem_deviation_reason || record.problem_reason || record.delay_reason;
        const notes = record.problem_deviation_notes || record.problem_notes || record.delay_notes;
        
        if (!reason && !notes) {
          return <Text type="secondary">—</Text>;
        }

        return (
          <Tooltip
            title={
              <div>
                {reason && <div><b>Причина:</b> {reason}</div>}
                {notes && <div><b>Комментарий:</b> {notes}</div>}
              </div>
            }
          >
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {reason && <Text type="danger" style={{ fontSize: 11 }}>{reason}</Text>}
              {notes && !reason && <Text type="secondary" style={{ fontSize: 11 }}>{notes}</Text>}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Статус',
      key: 'status',
      width: 130,
      render: (_, record) => {
        const status = record.type === 'manufactured' 
          ? record.manufacturing_status 
          : record.purchase_status;
        
        const statusLabels: Record<string, string> = {
          not_started: 'Не начато',
          in_progress: 'В работе',
          suspended: 'Приостановлено',
          completed: 'Завершено',
          waiting_order: 'Ожидает заказа',
          in_order: 'В заказе',
          closed: 'На складе',
          written_off: 'Списано',
        };

        return (
          <Text style={{ fontSize: 11 }}>
            {statusLabels[status] || status}
          </Text>
        );
      },
    },
    {
      title: 'План. дата',
      key: 'planned_date',
      width: 100,
      render: (_, record) => {
        const date = record.type === 'manufactured'
          ? (record.planned_end || record.planned_start)
          : (record.required_date || record.order_date);
        
        if (!date) return <Text type="secondary">—</Text>;

        const isPast = dayjs(date).isBefore(dayjs(), 'day');
        return (
          <Text type={isPast ? 'danger' : undefined} style={{ fontSize: 11 }}>
            {dayjs(date).format('DD.MM.YY')}
          </Text>
        );
      },
    },
    {
      title: 'Факт. дата',
      key: 'actual_date',
      width: 100,
      render: (_, record) => {
        const date = record.type === 'manufactured'
          ? record.actual_start
          : record.actual_start;
        
        if (!date) return <Text type="secondary">—</Text>;

        return (
          <Text type="success" style={{ fontSize: 11 }}>
            {dayjs(date).format('DD.MM.YY')}
          </Text>
        );
      },
    },
  ];

  return (
    <div>
      {/* Statistics Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>
              {stats.total}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>Всего проблем</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card 
            size="small" 
            style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setSelectedType('manufactured')}
          >
            <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
              {stats.manufactured}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <ToolOutlined style={{ marginRight: 4 }} />
              Изготовление
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card 
            size="small" 
            style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setSelectedType('purchased')}
          >
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }}>
              {stats.purchased}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <ShoppingCartOutlined style={{ marginRight: 4 }} />
              Закупки
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card 
            size="small" 
            style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setSelectedProblem('work_not_started')}
          >
            <Badge count={stats.workNotStarted} style={{ backgroundColor: '#faad14' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#faad14', paddingRight: 8 }}>
                {stats.workNotStarted}
              </div>
            </Badge>
            <div style={{ fontSize: 11, color: '#666' }}>Не начато</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card 
            size="small" 
            style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setSelectedProblem('work_not_completed')}
          >
            <Badge count={stats.workNotCompleted} style={{ backgroundColor: '#ff4d4f' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#ff4d4f', paddingRight: 8 }}>
                {stats.workNotCompleted}
              </div>
            </Badge>
            <div style={{ fontSize: 11, color: '#666' }}>Не завершено</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card 
            size="small" 
            style={{ textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setSelectedProblem('not_delivered')}
          >
            <Badge count={stats.notDelivered} style={{ backgroundColor: '#ff4d4f' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#ff4d4f', paddingRight: 8 }}>
                {stats.notDelivered}
              </div>
            </Badge>
            <div style={{ fontSize: 11, color: '#666' }}>Не поставлено</div>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input.Search
              placeholder="Поиск по названию или ID..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Все проекты"
              allowClear
              style={{ width: '100%' }}
              value={selectedProject}
              onChange={setSelectedProject}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              value={selectedType}
              onChange={setSelectedType}
              options={[
                { value: 'all', label: 'Все типы' },
                { value: 'manufactured', label: 'Изготовление' },
                { value: 'purchased', label: 'Закупки' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              style={{ width: '100%' }}
              value={selectedProblem}
              onChange={setSelectedProblem}
              options={[
                { value: 'all', label: 'Все проблемы' },
                { value: 'work_not_started', label: 'Работа не начата' },
                { value: 'work_not_completed', label: 'Работа не завершена' },
                { value: 'order_not_placed', label: 'Заказ не оформлен' },
                { value: 'not_delivered', label: 'Не поставлено' },
                { value: 'has_problem_flag', label: 'Проблема' },
                { value: 'has_delay_reason', label: 'Отклонение' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => {
                setSearchText('');
                setSelectedProject(undefined);
                setSelectedType('all');
                setSelectedProblem('all');
              }}
            >
              Сбросить фильтры
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Problems Table */}
      {filteredProblems.length === 0 ? (
        <Card>
          <Empty
            description={
              problems.length === 0 
                ? "Отлично! Нет проблемных позиций" 
                : "Нет позиций, соответствующих фильтрам"
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <Table
          className="workplace-problems-table"
          columns={columns}
          dataSource={filteredProblems}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} проблем`,
          }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <style>{`
        .workplace-problems-table .ant-table-thead > tr > th {
          padding: 8px 8px;
          font-size: 12px;
          white-space: nowrap;
        }
        .workplace-problems-table .ant-table-tbody > tr > td {
          padding: 6px 8px;
        }
        .workplace-problems-table .ant-table-tbody > tr:hover > td {
          background-color: #f5f5f5 !important;
        }
      `}</style>
    </div>
  );
}
