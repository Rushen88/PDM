import {
    ArrowRightOutlined,
    ExclamationCircleOutlined,
    ProjectOutlined,
    ReloadOutlined,
    ToolOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Checkbox, Col, Empty, List, Progress, Row, Space, Spin, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../app/providers/AuthProvider';
import {
    dashboardApi,
    getHealthColor,
    getProblemTypeLabel,
    getSeverityColor,
    getWarningTypeLabel,
    type DashboardSummary,
    type HealthStatus,
    type ProblemItem,
    type ProjectOverview,
    type WarningItem,
} from '../../features/dashboard';
import { projectsApi, type ProjectItem } from '../../features/projects/api';
import { type PaginatedResponse } from '../../shared/api/types';
import { ItemEditModal } from '../workplace/components/ItemEditModal';

const { Title, Text } = Typography;

const formatItemNumber = (value?: number | null) => (value ? String(value).padStart(7, '0') : '—');
const formatDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

const truncateText = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

function IssueDetailsContent({
  itemId,
  baseTitle,
  enabled,
  meta,
}: {
  itemId: string;
  baseTitle?: string;
  enabled: boolean;
  meta?:
    | { kind: 'problem'; item: ProblemItem }
    | { kind: 'warning'; item: WarningItem };
}) {
  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['project-item', itemId],
    queryFn: () => projectsApi.items.get(itemId),
    enabled: enabled && !!itemId,
    staleTime: 5 * 60_000,
  });

  const statusLabel = (() => {
    if (!item) return null;
    if (item.is_purchased) return item.purchase_status_display || item.purchase_status || null;
    if (item.manufacturer_type === 'contractor') return item.contractor_status_display || item.contractor_status || null;
    return item.manufacturing_status_display || item.manufacturing_status || null;
  })();

  const deviationReason = (() => {
    if (!item) return null;
    return item.is_purchased
      ? item.purchase_problem_reason_detail?.name
      : item.manufacturing_problem_reason_detail?.name;
  })();

  const deviationSubreason = (() => {
    if (!item) return null;
    return item.is_purchased
      ? item.purchase_problem_subreason_detail?.name
      : item.manufacturing_problem_subreason_detail?.name;
  })();

  const deviationNotes = (item?.delay_notes || '').trim();
  const problemReason = item?.problem_reason_detail?.name || null;
  const problemNotes = (item?.problem_notes || '').trim();
  const delayReason = item?.delay_reason_detail?.name || item?.delay_reason || null;

  const dashboardTypeLabel = useMemo(() => {
    if (!meta) return null;
    if (meta.kind === 'problem') {
      const types = meta.item.problem_types || [];
      if (!types.length) return null;
      return types.map(getProblemTypeLabel).join(', ');
    }
    return getWarningTypeLabel(meta.item.warning_type);
  }, [meta]);

  const dashboardReason = meta?.kind === 'problem' ? meta.item.reason : null;
  const dashboardNotes = meta?.kind === 'problem' ? (meta.item.notes || '').trim() : '';
  const dashboardDate = meta?.kind === 'problem' ? meta.item.planned_date : meta?.item.warning_date;
  const dashboardDaysText = meta
    ? meta.kind === 'problem'
      ? `${meta.item.days_overdue} дн.`
      : meta.item.days_until != null
        ? `${meta.item.days_until} дн.`
        : null
    : null;

  const primaryDate = item?.required_date || dashboardDate || null;

  const responsibleLabel =
    item?.responsible_detail?.full_name ||
    meta?.item.responsible ||
    null;

  const problemLabel =
    problemReason ||
    dashboardReason ||
    null;

  const deviationLabel =
    deviationReason
      ? deviationSubreason
        ? `${deviationReason} / ${deviationSubreason}`
        : deviationReason
      : deviationSubreason || null;

  const commentLabel = truncateText(
    deviationNotes || problemNotes || dashboardNotes || '',
    160
  );

  const Line = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' }}>
      <div style={{ width: 120, color: '#111111', opacity: 0.65, fontSize: 12, lineHeight: 1.35 }}>{label}</div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: '#000000',
          fontSize: 12,
          lineHeight: 1.35,
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value || '—'}
      </div>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: '#000000', fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>
          {baseTitle || (item ? `${formatItemNumber(item.item_number)} • ${item.name}` : 'Детали позиции')}
        </div>
      </div>

      {meta ? <Line label="Тип" value={dashboardTypeLabel || ''} /> : null}
      <Line label="Срок" value={formatDate(primaryDate)} />
      {meta && dashboardDaysText ? <Line label="Остаток" value={dashboardDaysText} /> : null}
      <Line label="Ответственный" value={responsibleLabel || ''} />

      <div style={{ margin: '8px 0', height: 1, background: '#e5e7eb' }} />

      <Line label="Статус" value={statusLabel || (isLoading ? 'Загрузка…' : '')} />
      <Line label="Проблема" value={problemLabel || (isLoading ? 'Загрузка…' : '')} />
      <Line label="Отклонение" value={deviationLabel || (isLoading ? 'Загрузка…' : '')} />

      {delayReason ? <Line label="Причина" value={delayReason} /> : null}
      {commentLabel ? <Line label="Комментарий" value={commentLabel} /> : null}

      {enabled && isError ? (
        <div style={{ marginTop: 8, color: '#111111', opacity: 0.6, fontSize: 11, lineHeight: 1.35 }}>
          Детали позиции временно недоступны.
        </div>
      ) : null}
    </div>
  );
}

function SeverityTag({
  label,
  color,
  itemId,
  baseTitle,
  meta,
}: {
  label: string;
  color: string;
  itemId: string;
  baseTitle?: string;
  meta?:
    | { kind: 'problem'; item: ProblemItem }
    | { kind: 'warning'; item: WarningItem };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={setOpen}
      placement="topLeft"
      color="rgba(243, 244, 246, 0.97)"
      overlayInnerStyle={{
        color: '#000000',
        boxSizing: 'border-box',
        padding: '10px 12px',
        backgroundColor: 'rgba(243, 244, 246, 0.97)',
        border: '1px solid rgba(229, 231, 235, 0.9)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        width: 560,
        minWidth: 560,
        maxWidth: 560,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
      }}
      title={<IssueDetailsContent itemId={itemId} baseTitle={baseTitle} enabled={open} meta={meta} />}
    >
      <Tag color={color} style={{ marginRight: 0 }}>
        {label}
      </Tag>
    </Tooltip>
  );
}

function healthLabel(status: HealthStatus): string {
  if (status === 'critical') return 'Критично';
  if (status === 'risk') return 'Риск';
  return 'Норма';
}

/**
 * Dashboard page - executive management panel
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [editItem, setEditItem] = useState<ProjectItem | null>(null);
  const [editProjectName, setEditProjectName] = useState<string | undefined>(undefined);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.getSummary(7),
    refetchInterval: 60_000,
  });

  const summary: DashboardSummary | undefined = data;
  const business = summary?.business_status;
  const projects: ProjectOverview[] = summary?.projects ?? [];
  const problems: ProblemItem[] = summary?.problems ?? [];
  const warnings: WarningItem[] = summary?.warnings ?? [];
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  const overallStatus: HealthStatus = useMemo(() => {
    if (!business) return 'normal';
    if (business.projects_critical > 0 || business.total_overdue > 0) return 'critical';
    if (business.projects_risk > 0 || business.problems_manufacturing + business.problems_purchasing + business.problems_contractor > 0) return 'risk';
    return 'normal';
  }, [business]);

  const activeProjects = useMemo(
    () => projects.filter(p => p.project_status === 'in_progress'),
    [projects]
  );

  const activeProjectIds = useMemo(
    () => new Set(activeProjects.map(p => p.id)),
    [activeProjects]
  );

  const topProjects = useMemo(() => {
    const severityOrder: Record<HealthStatus, number> = { critical: 0, risk: 1, normal: 2 };
    return [...activeProjects]
      .sort((a, b) => {
        const s = severityOrder[a.health_status] - severityOrder[b.health_status];
        if (s !== 0) return s;
        return (b.problem_count || 0) - (a.problem_count || 0);
      })
      .slice(0, 8);
  }, [activeProjects]);

  useEffect(() => {
    if (selectedProjectIds.size === 0) return;
    const next = new Set(Array.from(selectedProjectIds).filter(id => activeProjectIds.has(id)));
    if (next.size !== selectedProjectIds.size) {
      setSelectedProjectIds(next);
    }
  }, [activeProjectIds, selectedProjectIds]);

  const scopedProblems = useMemo(() => {
    const base = problems.filter(p => activeProjectIds.has(p.project_id));
    if (selectedProjectIds.size === 0) return base;
    return base.filter(p => selectedProjectIds.has(p.project_id));
  }, [problems, activeProjectIds, selectedProjectIds]);

  const scopedWarnings = useMemo(() => {
    const base = warnings.filter(w => activeProjectIds.has(w.project_id));
    if (selectedProjectIds.size === 0) return base;
    return base.filter(w => selectedProjectIds.has(w.project_id));
  }, [warnings, activeProjectIds, selectedProjectIds]);

  const topProblems = useMemo(() => scopedProblems.slice(0, 8), [scopedProblems]);
  const topWarnings = useMemo(() => scopedWarnings.slice(0, 8), [scopedWarnings]);

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const resetProjectSelection = () => setSelectedProjectIds(new Set());

  const onOpenProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleOpenItemModal = async (itemId: string, projectName?: string | null) => {
    try {
      const item = await projectsApi.items.get(itemId);
      setEditItem(item);
      setEditProjectName(projectName || undefined);
      setEditModalOpen(true);
    } catch {
      message.error('Не удалось открыть позицию');
    }
  };

  const { data: modalItemsData } = useQuery({
    queryKey: ['project-items', editItem?.project],
    queryFn: async () => {
      const response = await projectsApi.items.list({
        project: editItem?.project,
        page_size: 5000,
        include_purchase_order: false,
        include_calculated_progress: true,
      });
      return response;
    },
    enabled: editModalOpen && !!editItem?.project,
    select: (data: PaginatedResponse<ProjectItem>) => data.results || [],
  });

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Загрузка панели управления..." />
      </div>
    );
  }

  if (isError || !summary || !business) {
    return (
      <div className="page-container">
        <Title level={4} style={{ margin: 0 }}>Панель управления</Title>
        <Text type="secondary">Не удалось загрузить данные</Text>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => window.location.reload()}>Обновить</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {getGreeting()}, {user?.first_name || user?.username}!
          </Title>
          <Space size={8} style={{ marginTop: 4 }}>
            <Tag color={getHealthColor(overallStatus)} style={{ marginRight: 0 }}>
              {healthLabel(overallStatus)}
            </Tag>
            <Text type="secondary">обновлено: {dayjs(summary.generated_at).format('DD.MM.YYYY')}</Text>
          </Space>
        </div>
        <Space>
          <Button size="small" onClick={() => navigate('/projects')}>Проекты</Button>
          <Button size="small" onClick={() => navigate('/workplace/dashboard')}>Оперативная панель</Button>
        </Space>
      </div>

      {/* Zone 1: Business status */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable onClick={() => navigate('/projects')}>
            <Statistic
              title="Активные проекты"
              value={business.active_projects}
              prefix={<ProjectOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Space size={6} wrap>
                <Tag color="green">Норма: {business.projects_normal}</Tag>
                <Tag color="orange">Риски: {business.projects_risk}</Tag>
                <Tag color="red">Критично: {business.projects_critical}</Tag>
              </Space>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable onClick={() => navigate('/projects?status=in_progress')}>
            <Statistic
              title="Проектов с отклонениями"
              value={business.projects_risk + business.projects_critical}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: business.projects_critical > 0 ? '#ff4d4f' : business.projects_risk > 0 ? '#faad14' : undefined }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Требуют внимания управленца</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title="Активные проблемы"
              value={business.problems_manufacturing + business.problems_purchasing + business.problems_contractor}
              prefix={<WarningOutlined />}
              valueStyle={{ color: business.total_overdue > 0 ? '#ff4d4f' : undefined }}
            />
            <div style={{ marginTop: 8 }}>
              <Space size={6} wrap>
                <Tag color="blue">Произв.: {business.problems_manufacturing}</Tag>
                <Tag color="orange">Закуп.: {business.problems_purchasing}</Tag>
                <Tag color="purple">Подряд.: {business.problems_contractor}</Tag>
              </Space>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title="Просроченных позиций"
              value={business.total_overdue}
              prefix={<ToolOutlined />}
              valueStyle={{ color: business.total_overdue > 0 ? '#ff4d4f' : '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Суммарно по всем активным проектам</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Zone 2: Projects overview */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24}>
          <Card
            size="small"
            title="Проекты — срез по состоянию"
            extra={<Link to="/projects">Открыть список</Link>}
            styles={{ body: { padding: 12 } }}
          >
            {topProjects.length === 0 ? (
              <Empty description="Нет активных проектов" />
            ) : (
              <Table
                size="small"
                rowKey="id"
                dataSource={topProjects}
                pagination={false}
                onRow={(record) => ({
                  onClick: () => onOpenProject(record.id),
                  style: { cursor: 'pointer' },
                })}
                columns={[
                  {
                    title: (
                      <Space size={6}>
                        <Button
                          size="small"
                          type="text"
                          icon={<ReloadOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            resetProjectSelection();
                          }}
                        />
                        <span>Проект</span>
                      </Space>
                    ),
                    dataIndex: 'name',
                    render: (_: string, record: ProjectOverview) => (
                      <Space size={8}>
                        <Checkbox
                          checked={selectedProjectIds.has(record.id)}
                          onChange={() => toggleProjectSelection(record.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <Text strong>{record.name}</Text>
                      </Space>
                    ),
                    ellipsis: true,
                  },
                  {
                    title: 'Статус',
                    dataIndex: 'health_status',
                    width: 110,
                    render: (s: HealthStatus) => (
                      <Tag color={getHealthColor(s)} style={{ marginRight: 0 }}>{healthLabel(s)}</Tag>
                    ),
                  },
                  {
                    title: 'Готовн.',
                    dataIndex: 'progress',
                    width: 120,
                    render: (v: number) => (
                      <Progress percent={Math.round(v || 0)} size="small" showInfo={false} strokeColor={v >= 70 ? '#52c41a' : v >= 40 ? '#1890ff' : '#faad14'} />
                    ),
                  },
                  {
                    title: 'Пробл.',
                    dataIndex: 'problem_count',
                    width: 70,
                    render: (v: number, r: ProjectOverview) => (
                      <Tooltip title={r.critical_date ? `Критичная дата: ${dayjs(r.critical_date).format('DD.MM.YYYY')}` : undefined}>
                        <Badge count={v} color={r.health_status === 'critical' ? '#ff4d4f' : r.health_status === 'risk' ? '#faad14' : '#52c41a'} />
                      </Tooltip>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Zone 3-4: Problems + Warnings */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Проблемы и отклонения"
            extra={<Text type="secondary">{scopedProblems.length} всего</Text>}
            styles={{ body: { padding: 12 } }}
          >
            {topProblems.length === 0 ? (
              <Empty description="Проблем не обнаружено" />
            ) : (
              <List
                dataSource={topProblems}
                renderItem={(p) => (
                  <List.Item
                    style={{ paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }}
                    onClick={() => handleOpenItemModal(p.id, p.project_name)}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <Space size={8} wrap>
                          <SeverityTag
                            itemId={p.id}
                            color={getSeverityColor(p.severity)}
                            label={p.severity === 'critical' ? 'Критично' : p.severity === 'risk' ? 'Риск' : 'Норма'}
                            baseTitle={`${formatItemNumber(p.item_number)} • ${p.name}`}
                            meta={{ kind: 'problem', item: p }}
                          />
                          <Tag style={{ marginRight: 0 }}>{p.project_name || '—'}</Tag>
                          <Text strong>{p.name}</Text>
                        </Space>
                        <Text type={p.severity === 'critical' ? 'danger' : 'secondary'}>
                          {p.days_overdue} дн.
                        </Text>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {p.problem_types.slice(0, 2).map(getProblemTypeLabel).join(' • ')}
                          {p.reason ? ` • ${p.reason}` : ''}
                          {p.responsible ? ` • ${p.responsible}` : ''}
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
            {scopedProblems.length > topProblems.length ? (
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" type="link" onClick={() => navigate('/workplace/problems')}>Показать все <ArrowRightOutlined /></Button>
              </div>
            ) : null}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            size="small"
            title="Сигналы и предупреждения"
            extra={<Text type="secondary">ближайшие 7 дней</Text>}
            styles={{ body: { padding: 12 } }}
          >
            {topWarnings.length === 0 ? (
              <Empty description="Предупреждений нет" />
            ) : (
              <List
                dataSource={topWarnings}
                renderItem={(w) => (
                  <List.Item
                    style={{ paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }}
                    onClick={() => handleOpenItemModal(w.id, w.project_name)}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <Space size={8} wrap>
                          <SeverityTag
                            itemId={w.id}
                            color="#faad14"
                            label="Скоро"
                            baseTitle={`${formatItemNumber(w.item_number)} • ${w.name}`}
                            meta={{ kind: 'warning', item: w }}
                          />
                          <Tag style={{ marginRight: 0 }}>{w.project_name || '—'}</Tag>
                          <Text strong>{w.name}</Text>
                        </Space>
                        <Text type="secondary">{w.days_until ?? '—'} дн.</Text>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {getWarningTypeLabel(w.warning_type)}
                          {w.warning_date ? ` • ${dayjs(w.warning_date).format('DD.MM.YYYY')}` : ''}
                          {w.responsible ? ` • ${w.responsible}` : ''}
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <ItemEditModal
        item={editItem}
        items={modalItemsData || []}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditItem(null);
          setEditProjectName(undefined);
        }}
        onSuccess={() => {
          // в панели управления данных немного, достаточно закрыть; фоновые refetch уже идут
        }}
        projectName={editProjectName}
      />
    </div>
  );
}
