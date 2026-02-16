/**
 * Workplace Page
 * 
 * Employee workstation - the operational center of ERP.
 * Contains three main tabs:
 * 1. Dashboard - "My Responsibility" overview with statistics, problems, deadlines
 * 2. Structure - Tree view of items with customizable columns
 * 3. Gantt - Gantt chart for responsible items
 */

import {
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    ShoppingCartOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
    Badge,
    Card,
    Col,
    Empty,
    List,
    message,
    Progress,
    Row,
    Select,
    Spin,
    Statistic,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../app/providers/AuthProvider';
import { projectsApi, type ProjectItem } from '../../features/projects/api';
import GanttChart from '../../features/projects/components/GanttChart.tsx';
import {
    workplaceApi,
    type DashboardData,
    type ManufacturingDeadline,
    type ProblemItem,
    type ProcurementDeadline,
} from '../../features/workplace';
import { useModuleAccess } from '../../shared/hooks/useModuleAccess';
import { ItemEditModal, WorkplaceProblemsTab, WorkplaceStructureTable } from './components';

const { Title, Text } = Typography;

/**
 * Dashboard Tab Content
 */
function DashboardTab({ 
  data, 
  isLoading, 
  onNavigateToItem 
}: { 
  data: DashboardData | undefined; 
  isLoading: boolean;
  onNavigateToItem: (projectId: string, itemId: string) => void;
}) {

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip="Загрузка данных..." />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty description="Нет данных для отображения" />
    );
  }

  const { manufacturing_summary, procurement_summary, problems, manufacturing_deadlines, procurement_deadlines } = data;

  // Calculate totals
  const manufacturingTotal = manufacturing_summary.total;
  const manufacturingDone = manufacturing_summary.completed;
  const manufacturingProgress = manufacturingTotal > 0 
    ? Math.round((manufacturingDone / manufacturingTotal) * 100) 
    : 0;

  const procurementTotal = procurement_summary.total;
  const procurementDone = procurement_summary.closed + procurement_summary.written_off;
  const procurementProgress = procurementTotal > 0 
    ? Math.round((procurementDone / procurementTotal) * 100) 
    : 0;

  const totalItems = data.total_items ?? manufacturingTotal + procurementTotal;
  const problemManufactured = problems.filter(p => p.type === 'manufactured').length;
  const problemPurchased = problems.filter(p => p.type === 'purchased').length;

  const formatItemNumber = (num: number | null) => num ? String(num).padStart(7, '0') : '—';

  return (
    <div>
      {/* Responsibility Summary */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={12} sm={8} lg={5}>
            <Statistic title="Всего в ответственности" value={totalItems} />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic title="Изготавливаемые" value={manufacturingTotal} />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic title="Закупаемые" value={procurementTotal} />
          </Col>
          <Col xs={12} sm={12} lg={5}>
            <Statistic title="Проблемные (изг.)" value={problemManufactured} />
          </Col>
          <Col xs={12} sm={12} lg={5}>
            <Statistic title="Проблемные (зак.)" value={problemPurchased} />
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Manufacturing Summary */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <span>
                <ToolOutlined style={{ marginRight: 8 }} />
                Изготавливаемые позиции
              </span>
            }
            size="small"
          >
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Всего"
                  value={manufacturingTotal}
                  suffix={
                    <Progress 
                      type="circle" 
                      percent={manufacturingProgress} 
                      size={40}
                      strokeColor="#52c41a"
                    />
                  }
                />
              </Col>
              <Col span={12}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary">
                    <Badge status="default" /> Не начато: {manufacturing_summary.not_started}
                  </Text>
                  <Text type="secondary">
                    <Badge status="processing" /> В работе: {manufacturing_summary.in_progress}
                  </Text>
                  <Text type="secondary">
                    <Badge status="success" /> Завершено: {manufacturing_summary.completed}
                  </Text>
                  <Text type="secondary">
                    <Badge status="warning" /> Приостановлено: {manufacturing_summary.suspended}
                  </Text>
                </div>
              </Col>
            </Row>
            <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Своими силами: {manufacturing_summary.internal} | Подрядчиком: {manufacturing_summary.contractor}
              </Text>
            </div>
          </Card>
        </Col>

        {/* Procurement Summary */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <span>
                <ShoppingCartOutlined style={{ marginRight: 8 }} />
                Закупаемые позиции
              </span>
            }
            size="small"
          >
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Всего"
                  value={procurementTotal}
                  suffix={
                    <Progress 
                      type="circle" 
                      percent={procurementProgress} 
                      size={40}
                      strokeColor="#1890ff"
                    />
                  }
                />
              </Col>
              <Col span={12}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary">
                    <Badge status="default" /> Ожидает заказа: {procurement_summary.waiting_order}
                  </Text>
                  <Text type="secondary">
                    <Badge status="processing" /> В заказе: {procurement_summary.in_order}
                  </Text>
                  <Text type="secondary">
                    <Badge status="success" /> На складе: {procurement_summary.closed}
                  </Text>
                  <Text type="secondary">
                    <Badge status="default" /> Списано: {procurement_summary.written_off}
                  </Text>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Problems & Overdue Section - 4 columns */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Column 1: Work Not Started (Manufacturing) */}
        <Col xs={24} sm={12} lg={6}>
          <Card 
            title={
              <span style={{ fontSize: 13 }}>
                <ToolOutlined style={{ marginRight: 6, color: '#faad14' }} />
                Работы не начаты
              </span>
            }
            size="small"
            styles={{ body: { padding: '8px 12px', maxHeight: 300, overflow: 'auto' } }}
            extra={
              <Tag color="orange">
                {problems.filter(p => p.problems.includes('work_not_started')).length}
              </Tag>
            }
          >
            {(() => {
              const filtered = problems.filter(p => p.problems.includes('work_not_started'));
              if (filtered.length === 0) {
                return <Text type="secondary" style={{ fontSize: 12 }}>Нет позиций</Text>;
              }
              return filtered.slice(0, 8).map((item: ProblemItem) => (
                <div 
                  key={item.id}
                  onClick={() => onNavigateToItem(item.project_id, item.id)}
                  style={{ 
                    padding: '4px 0', 
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#52c41a' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {formatItemNumber(item.item_number)} • {item.project_name}
                  </div>
                </div>
              ));
            })()}
          </Card>
        </Col>

        {/* Column 2: Work Not Completed (Manufacturing) */}
        <Col xs={24} sm={12} lg={6}>
          <Card 
            title={
              <span style={{ fontSize: 13 }}>
                <ToolOutlined style={{ marginRight: 6, color: '#ff4d4f' }} />
                Работы не завершены
              </span>
            }
            size="small"
            styles={{ body: { padding: '8px 12px', maxHeight: 300, overflow: 'auto' } }}
            extra={
              <Tag color="red">
                {problems.filter(p => p.problems.includes('work_not_completed')).length}
              </Tag>
            }
          >
            {(() => {
              const filtered = problems.filter(p => p.problems.includes('work_not_completed'));
              if (filtered.length === 0) {
                return <Text type="secondary" style={{ fontSize: 12 }}>Нет позиций</Text>;
              }
              return filtered.slice(0, 8).map((item: ProblemItem) => (
                <div 
                  key={item.id}
                  onClick={() => onNavigateToItem(item.project_id, item.id)}
                  style={{ 
                    padding: '4px 0', 
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#52c41a' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {formatItemNumber(item.item_number)} • {item.project_name}
                  </div>
                </div>
              ));
            })()}
          </Card>
        </Col>

        {/* Column 3: Order Not Placed (Procurement) */}
        <Col xs={24} sm={12} lg={6}>
          <Card 
            title={
              <span style={{ fontSize: 13 }}>
                <ShoppingCartOutlined style={{ marginRight: 6, color: '#faad14' }} />
                Заказ не оформлен
              </span>
            }
            size="small"
            styles={{ body: { padding: '8px 12px', maxHeight: 300, overflow: 'auto' } }}
            extra={
              <Tag color="orange">
                {problems.filter(p => p.problems.includes('order_not_placed')).length}
              </Tag>
            }
          >
            {(() => {
              const filtered = problems.filter(p => p.problems.includes('order_not_placed'));
              if (filtered.length === 0) {
                return <Text type="secondary" style={{ fontSize: 12 }}>Нет позиций</Text>;
              }
              return filtered.slice(0, 8).map((item: ProblemItem) => (
                <div 
                  key={item.id}
                  onClick={() => onNavigateToItem(item.project_id, item.id)}
                  style={{ 
                    padding: '4px 0', 
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1890ff' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {formatItemNumber(item.item_number)} • {item.project_name}
                  </div>
                </div>
              ));
            })()}
          </Card>
        </Col>

        {/* Column 4: Not Delivered (Procurement) */}
        <Col xs={24} sm={12} lg={6}>
          <Card 
            title={
              <span style={{ fontSize: 13 }}>
                <ShoppingCartOutlined style={{ marginRight: 6, color: '#ff4d4f' }} />
                Не поставлено
              </span>
            }
            size="small"
            styles={{ body: { padding: '8px 12px', maxHeight: 300, overflow: 'auto' } }}
            extra={
              <Tag color="red">
                {problems.filter(p => p.problems.includes('not_delivered')).length}
              </Tag>
            }
          >
            {(() => {
              const filtered = problems.filter(p => p.problems.includes('not_delivered'));
              if (filtered.length === 0) {
                return <Text type="secondary" style={{ fontSize: 12 }}>Нет позиций</Text>;
              }
              return filtered.slice(0, 8).map((item: ProblemItem) => (
                <div 
                  key={item.id}
                  onClick={() => onNavigateToItem(item.project_id, item.id)}
                  style={{ 
                    padding: '4px 0', 
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1890ff' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {formatItemNumber(item.item_number)} • {item.project_name}
                  </div>
                </div>
              ));
            })()}
          </Card>
        </Col>
      </Row>

      {/* Upcoming Deadlines */}
      <Row gutter={[16, 16]}>
        {/* Manufacturing Deadlines */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <span>
                <ClockCircleOutlined style={{ marginRight: 8 }} />
                Скоро дедлайн (Производство)
              </span>
            }
            size="small"
          >
            {manufacturing_deadlines.length === 0 ? (
              <Empty description="Нет ближайших дедлайнов" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={manufacturing_deadlines.slice(0, 8)}
                renderItem={(item: ManufacturingDeadline) => (
                  <List.Item
                    style={{ cursor: 'pointer', paddingLeft: 0, paddingRight: 0 }}
                    onClick={() => onNavigateToItem(item.project_id, item.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <Tooltip
                        title={
                          <div style={{ fontSize: 12 }}>
                            <div><b>Статус:</b> {item.status_display || item.status}</div>
                            {item.problem_reason && <div><b>Проблема:</b> {item.problem_reason}</div>}
                            {item.problem_notes && <div><b>Комментарий:</b> {item.problem_notes}</div>}
                            {(item.problem_deviation_reason || item.problem_deviation_subreason) && (
                              <div>
                                <b>Проблема/отклонение:</b> {item.problem_deviation_reason || '—'}
                                {item.problem_deviation_subreason ? ` / ${item.problem_deviation_subreason}` : ''}
                              </div>
                            )}
                            {(item.problem_deviation_notes || item.delay_notes) && (
                              <div><b>Комментарий:</b> {item.problem_deviation_notes || item.delay_notes}</div>
                            )}
                          </div>
                        }
                      >
                        <Badge
                          count={item.days_until}
                          style={{
                            backgroundColor: item.days_until <= 3 ? '#ff4d4f' :
                              item.days_until <= 7 ? '#faad14' : '#52c41a',
                            fontSize: 10,
                            minWidth: 18,
                            height: 18,
                            lineHeight: '18px',
                          }}
                        />
                      </Tooltip>
                      <Text code style={{ marginRight: 2 }}>{formatItemNumber(item.item_number)}</Text>
                      <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                      <Text type="secondary">• {item.project_name || '—'}</Text>
                      <Text type="secondary">
                        • {item.deadline_type === 'start' ? 'Запуск' : 'Завершение'}: {dayjs(item.deadline_date).format('DD.MM.YYYY')}
                      </Text>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* Procurement Deadlines */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <span>
                <ClockCircleOutlined style={{ marginRight: 8 }} />
                Скоро дедлайн (Закупки)
              </span>
            }
            size="small"
          >
            {procurement_deadlines.length === 0 ? (
              <Empty description="Нет ближайших дедлайнов" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={procurement_deadlines.slice(0, 8)}
                renderItem={(item: ProcurementDeadline) => (
                  <List.Item
                    style={{ cursor: 'pointer', paddingLeft: 0, paddingRight: 0 }}
                    onClick={() => onNavigateToItem(item.project_id, item.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <Tooltip
                        title={
                          <div style={{ fontSize: 12 }}>
                            <div><b>Статус:</b> {item.status_display || item.status}</div>
                            {item.problem_reason && <div><b>Проблема:</b> {item.problem_reason}</div>}
                            {item.problem_notes && <div><b>Комментарий:</b> {item.problem_notes}</div>}
                            {(item.problem_deviation_reason || item.problem_deviation_subreason) && (
                              <div>
                                <b>Проблема/отклонение:</b> {item.problem_deviation_reason || '—'}
                                {item.problem_deviation_subreason ? ` / ${item.problem_deviation_subreason}` : ''}
                              </div>
                            )}
                            {(item.problem_deviation_notes || item.delay_notes) && (
                              <div><b>Комментарий:</b> {item.problem_deviation_notes || item.delay_notes}</div>
                            )}
                          </div>
                        }
                      >
                        <Badge
                          count={item.days_until}
                          style={{
                            backgroundColor: item.days_until <= 3 ? '#ff4d4f' :
                              item.days_until <= 7 ? '#faad14' : '#52c41a',
                            fontSize: 10,
                            minWidth: 18,
                            height: 18,
                            lineHeight: '18px',
                          }}
                        />
                      </Tooltip>
                      <Text code style={{ marginRight: 2 }}>{formatItemNumber(item.item_number)}</Text>
                      <Text style={{ fontWeight: 500 }}>{item.name}</Text>
                      <Text type="secondary">• {item.project_name || '—'}</Text>
                      <Text type="secondary">
                        • {item.deadline_type === 'order' ? 'Заказ' : 'Поставка'}: {dayjs(item.deadline_date).format('DD.MM.YYYY')}
                      </Text>
                      {item.supplier && <Text type="secondary">• {item.supplier}</Text>}
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/**
 * Main Workplace Page Component
 */
export default function WorkplacePage() {
  const { tab = 'dashboard' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canEdit } = useModuleAccess('workplace');
  const [activeTab, setActiveTab] = useState(tab);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const [editItem, setEditItem] = useState<ProjectItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Fetch dashboard data
  const { 
    data: dashboardData, 
    isLoading: dashboardLoading,
  } = useQuery({
    queryKey: ['workplace-dashboard'],
    queryFn: () => workplaceApi.getDashboard({ days_ahead: 14 }),
  });

  // Fetch all items for structure tab
  const { 
    data: itemsData, 
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ['workplace-items', selectedProject],
    queryFn: () => workplaceApi.getMyItems({ project: selectedProject }),
    enabled: activeTab === 'structure' || activeTab === 'gantt',
  });

  // Fetch project items for edit modal (full structure)
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
    select: (data) => data.results || [],
  });

  // Fetch Gantt data (manufactured items only)
  const { 
    data: ganttData, 
    isLoading: ganttLoading,
  } = useQuery({
    queryKey: ['workplace-gantt', selectedProject],
    queryFn: () => workplaceApi.getGantt({ project: selectedProject }),
    enabled: activeTab === 'gantt',
  });

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    navigate(`/workplace/${key}`, { replace: true });
  };

  // Open item edit modal instead of navigation
  const handleNavigateToItem = useCallback(async (_projectId: string, itemId: string) => {
    try {
      const item = await projectsApi.items.get(itemId);
      setEditItem(item);
      setEditModalOpen(true);
    } catch {
      message.error('Не удалось открыть позицию');
    }
  }, []);

  const handleOpenItem = useCallback((item: ProjectItem) => {
    setEditItem(item);
    setEditModalOpen(true);
  }, []);

  const handleEditModalClose = () => {
    setEditModalOpen(false);
    setEditItem(null);
  };

  const handleEditSuccess = () => {
    refetchItems();
  };

  // Projects list from dashboard
  const projects = dashboardData?.projects || [];

  // Get full name for header
  const userName = user?.full_name || user?.username || 'Пользователь';

  const tabItems = [
    {
      key: 'dashboard',
      label: 'Моя ответственность',
      children: (
        <DashboardTab 
          data={dashboardData} 
          isLoading={dashboardLoading}
          onNavigateToItem={handleNavigateToItem}
        />
      ),
    },
    {
      key: 'problems',
      label: (
        <span>
          <ExclamationCircleOutlined style={{ marginRight: 4 }} />
          Проблемы
          {dashboardData?.problems && dashboardData.problems.length > 0 && (
            <Badge 
              count={dashboardData.problems.length} 
              style={{ marginLeft: 8, backgroundColor: '#ff4d4f' }}
              size="small"
            />
          )}
        </span>
      ),
      children: (
        <WorkplaceProblemsTab
          problems={dashboardData?.problems || []}
          projects={projects}
          loading={dashboardLoading}
          onOpenItem={handleNavigateToItem}
        />
      ),
    },
    {
      key: 'structure',
      label: 'Структура',
      children: (
        <WorkplaceStructureTable
          items={itemsData?.results || []}
          loading={itemsLoading}
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          onOpenItem={handleOpenItem}
          onRefetch={refetchItems}
        />
      ),
    },
    {
      key: 'gantt',
      label: 'Gantt',
      children: (
        <div>
          {/* Project filter for Gantt */}
          <div style={{ marginBottom: 16 }}>
            <Select
              placeholder="Все проекты"
              allowClear
              style={{ width: 300 }}
              value={selectedProject}
              onChange={setSelectedProject}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
            />
          </div>
          
          <GanttChart 
            items={ganttData?.results || []} 
            loading={ganttLoading}
            onOpenItem={handleOpenItem}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 2 }}>
        <Title level={3} style={{ margin: 0 }}>
          Рабочее место
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
          {userName} • Позиций в зоне ответственности: {dashboardData?.total_items || 0}
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        size="large"
      />

      {/* Item Edit Modal */}
      <ItemEditModal
        item={editItem}
        items={modalItemsData || itemsData?.results || []}
        open={editModalOpen}
        onCancel={handleEditModalClose}
        onSuccess={handleEditSuccess}
        projectName={projects.find(p => p.id === editItem?.project)?.name || undefined}
        readOnly={!canEdit}
      />
    </div>
  );
}
