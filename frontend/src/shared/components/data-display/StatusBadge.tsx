import { Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  MinusCircleOutlined,
  CarOutlined,
  InboxOutlined,
} from '@ant-design/icons';

/**
 * Status type definitions
 */
export type ManufacturingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'suspended'
  | 'waiting_materials'
  | 'quality_check'
  | 'rejected';

export type PurchaseStatus =
  | 'not_required'
  | 'pending'
  | 'ordered'
  | 'in_transit'
  | 'delivered'
  | 'delayed'
  | 'partially_delivered'
  | 'cancelled';

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export type StatusType = ManufacturingStatus | PurchaseStatus | ProjectStatus;

/**
 * Status configuration
 */
interface StatusConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
  tagColor: string;
}

const statusConfigs: Record<StatusType, StatusConfig> = {
  // Manufacturing statuses
  not_started: {
    label: 'Не начато',
    color: '#8c8c8c',
    icon: <MinusCircleOutlined />,
    tagColor: 'default',
  },
  in_progress: {
    label: 'В процессе',
    color: '#1890ff',
    icon: <SyncOutlined spin />,
    tagColor: 'processing',
  },
  completed: {
    label: 'Выполнено',
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
    tagColor: 'success',
  },
  suspended: {
    label: 'Приостановлено',
    color: '#faad14',
    icon: <PauseCircleOutlined />,
    tagColor: 'warning',
  },
  waiting_materials: {
    label: 'Ожидание материалов',
    color: '#fa8c16',
    icon: <ClockCircleOutlined />,
    tagColor: 'orange',
  },
  quality_check: {
    label: 'Контроль качества',
    color: '#722ed1',
    icon: <CheckCircleOutlined />,
    tagColor: 'purple',
  },
  rejected: {
    label: 'Брак',
    color: '#ff4d4f',
    icon: <CloseCircleOutlined />,
    tagColor: 'error',
  },

  // Purchase statuses
  not_required: {
    label: 'Не требуется',
    color: '#d9d9d9',
    icon: <MinusCircleOutlined />,
    tagColor: 'default',
  },
  pending: {
    label: 'Ожидает заказа',
    color: '#8c8c8c',
    icon: <ClockCircleOutlined />,
    tagColor: 'default',
  },
  ordered: {
    label: 'Заказано',
    color: '#1890ff',
    icon: <SyncOutlined />,
    tagColor: 'processing',
  },
  in_transit: {
    label: 'В пути',
    color: '#13c2c2',
    icon: <CarOutlined />,
    tagColor: 'cyan',
  },
  delivered: {
    label: 'Доставлено',
    color: '#52c41a',
    icon: <InboxOutlined />,
    tagColor: 'success',
  },
  delayed: {
    label: 'Задержка',
    color: '#ff4d4f',
    icon: <ExclamationCircleOutlined />,
    tagColor: 'error',
  },
  partially_delivered: {
    label: 'Частично доставлено',
    color: '#faad14',
    icon: <InboxOutlined />,
    tagColor: 'warning',
  },
  cancelled: {
    label: 'Отменено',
    color: '#595959',
    icon: <CloseCircleOutlined />,
    tagColor: 'default',
  },

  // Project statuses
  draft: {
    label: 'Черновик',
    color: '#8c8c8c',
    icon: <MinusCircleOutlined />,
    tagColor: 'default',
  },
  planning: {
    label: 'Планирование',
    color: '#1890ff',
    icon: <ClockCircleOutlined />,
    tagColor: 'processing',
  },
  on_hold: {
    label: 'Приостановлен',
    color: '#faad14',
    icon: <PauseCircleOutlined />,
    tagColor: 'warning',
  },
};

interface StatusBadgeProps {
  status: StatusType;
  showText?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'default';
  pulsate?: boolean;
  tooltip?: string;
}

/**
 * Status Badge Component
 *
 * Displays status with consistent color coding across the application.
 */
export function StatusBadge({
  status,
  showText = true,
  showIcon = true,
  size = 'default',
  pulsate = false,
  tooltip,
}: StatusBadgeProps) {
  const config = statusConfigs[status] || {
    label: status,
    color: '#8c8c8c',
    icon: <MinusCircleOutlined />,
    tagColor: 'default',
  };

  const tag = (
    <Tag
      color={config.tagColor}
      icon={showIcon ? config.icon : undefined}
      style={{
        margin: 0,
        ...(pulsate && status === 'delayed' && { animation: 'pulse 2s infinite' }),
        ...(size === 'small' && { fontSize: 12, padding: '0 4px', lineHeight: '18px' }),
      }}
    >
      {showText && config.label}
    </Tag>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{tag}</Tooltip>;
  }

  return tag;
}

/**
 * Get status configuration
 */
export function getStatusConfig(status: StatusType): StatusConfig {
  return statusConfigs[status] || {
    label: status,
    color: '#8c8c8c',
    icon: <MinusCircleOutlined />,
    tagColor: 'default',
  };
}
