/**
 * Dashboard API Module
 * 
 * Provides data for the executive management dashboard.
 * This is NOT a detailed report - it's a control panel for business owners.
 */

import { api } from '../../shared/api';

// ============================================
// Types
// ============================================

/**
 * Severity level for problems
 */
export type SeverityLevel = 'normal' | 'risk' | 'critical';

/**
 * Health status for projects
 */
export type HealthStatus = 'normal' | 'risk' | 'critical';

/**
 * Problem type category
 */
export type ProblemCategory = 'manufacturing' | 'purchasing';

/**
 * Problem type codes
 */
export type ProblemType =
  | 'work_not_started'
  | 'work_not_completed'
  | 'order_not_placed'
  | 'not_delivered'
  | 'suspended'
  | 'has_problem_flag'
  | 'has_delay_reason';

/**
 * Warning type codes
 */
export type WarningType =
  | 'work_start_due_soon'
  | 'work_end_due_soon'
  | 'order_due_soon'
  | 'delivery_due_soon';

/**
 * Business status KPIs
 */
export interface BusinessStatus {
  active_projects: number;
  projects_normal: number;
  projects_risk: number;
  projects_critical: number;
  problems_manufacturing: number;
  problems_purchasing: number;
  problems_contractor: number;
  total_overdue: number;
}

/**
 * Project overview for dashboard
 */
export interface ProjectOverview {
  id: string;
  name: string;
  project_status: string;
  project_status_display: string;
  health_status: HealthStatus;
  progress: number;
  problem_count: number;
  critical_count: number;
  critical_date: string | null;
  planned_end: string | null;
  project_manager: string | null;
}

/**
 * Problem item for dashboard
 */
export interface ProblemItem {
  id: string;
  item_number: number | null;
  name: string;
  project_id: string;
  project_name: string | null;
  type: ProblemCategory;
  problem_types: ProblemType[];
  days_overdue: number;
  severity: SeverityLevel;
  reason: string | null;
  notes: string;
  responsible: string | null;
  planned_date: string | null;
}

/**
 * Warning item for dashboard
 */
export interface WarningItem {
  id: string;
  item_number: number | null;
  name: string;
  project_id: string;
  project_name: string | null;
  type: ProblemCategory;
  warning_type: WarningType;
  warning_date: string | null;
  days_until: number | null;
  responsible: string | null;
}

/**
 * Complete dashboard response
 */
export interface DashboardSummary {
  business_status: BusinessStatus;
  projects: ProjectOverview[];
  problems: ProblemItem[];
  warnings: WarningItem[];
  generated_at: string;
}

/**
 * Problems list response
 */
export interface ProblemsResponse {
  count: number;
  results: ProblemItem[];
}

/**
 * Warnings list response
 */
export interface WarningsResponse {
  count: number;
  results: WarningItem[];
}

// ============================================
// API Functions
// ============================================

/**
 * Dashboard API endpoints
 */
export const dashboardApi = {
  /**
   * Get complete dashboard summary in single request
   */
  getSummary: async (warningDays?: number): Promise<DashboardSummary> => {
    const params = warningDays ? { warning_days: warningDays } : undefined;
    return api.get<DashboardSummary>('/dashboard/summary/', { params });
  },

  /**
   * Get business status KPIs only
   */
  getBusinessStatus: async (): Promise<BusinessStatus> => {
    return api.get<BusinessStatus>('/dashboard/business-status/');
  },

  /**
   * Get projects overview
   */
  getProjectsOverview: async (): Promise<ProjectOverview[]> => {
    return api.get<ProjectOverview[]>('/dashboard/projects-overview/');
  },

  /**
   * Get active problems list
   */
  getProblems: async (params?: {
    type?: ProblemCategory;
    severity?: SeverityLevel;
    project?: string;
  }): Promise<ProblemsResponse> => {
    return api.get<ProblemsResponse>('/dashboard/problems/', { params });
  },

  /**
   * Get early warnings list
   */
  getWarnings: async (params?: {
    days_ahead?: number;
    type?: ProblemCategory;
    project?: string;
  }): Promise<WarningsResponse> => {
    return api.get<WarningsResponse>('/dashboard/warnings/', { params });
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get color for severity level
 */
export function getSeverityColor(severity: SeverityLevel): string {
  switch (severity) {
    case 'critical':
      return '#ff4d4f'; // red
    case 'risk':
      return '#faad14'; // yellow/orange
    case 'normal':
    default:
      return '#52c41a'; // green
  }
}

/**
 * Get color for health status
 */
export function getHealthColor(status: HealthStatus): string {
  return getSeverityColor(status);
}

/**
 * Get display text for problem type
 */
export function getProblemTypeLabel(type: ProblemType): string {
  const labels: Record<ProblemType, string> = {
    work_not_started: 'Работа не начата',
    work_not_completed: 'Работа не завершена',
    order_not_placed: 'Заказ не размещён',
    not_delivered: 'Не поставлено',
    suspended: 'Приостановлено',
    has_problem_flag: 'Отмечена проблема',
    has_delay_reason: 'Указана причина задержки',
  };
  return labels[type] || type;
}

/**
 * Get display text for warning type
 */
export function getWarningTypeLabel(type: WarningType): string {
  const labels: Record<WarningType, string> = {
    work_start_due_soon: 'Скоро начало работ',
    work_end_due_soon: 'Скоро окончание работ',
    order_due_soon: 'Скоро срок заказа',
    delivery_due_soon: 'Скоро срок поставки',
  };
  return labels[type] || type;
}

/**
 * Get icon name for problem type category
 */
export function getProblemCategoryIcon(category: ProblemCategory): string {
  return category === 'manufacturing' ? 'tool' : 'shopping-cart';
}

export default dashboardApi;
