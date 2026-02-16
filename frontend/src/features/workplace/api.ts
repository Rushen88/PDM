/**
 * Workplace API Service
 * 
 * Employee workstation - the heart of ERP operational activity.
 * Provides access to items where current user is responsible,
 * with statistics, problems tracking, and deadlines management.
 */

import { api, endpoints } from '../../shared/api';
import type { ProjectItem } from '../projects/api';

/**
 * Problem type identifiers
 */
export type ProblemType = 
  | 'work_not_started'     // Work should have started but didn't
  | 'work_not_completed'   // Work should have finished but didn't  
  | 'order_not_placed'     // Order should have been placed
  | 'not_delivered'        // Item should have been delivered
  | 'has_problem_flag'     // Item has explicit problem flag
  | 'has_delay_reason';    // Item has delay reason set

/**
 * Deadline type for upcoming deadlines
 */
export type DeadlineType = 'start' | 'end' | 'order' | 'delivery';

/**
 * Manufacturing statistics summary
 */
export interface ManufacturingSummary {
  total: number;
  not_started: number;
  in_progress: number;
  completed: number;
  suspended: number;
  internal: number;
  contractor: number;
}

/**
 * Procurement statistics summary
 */
export interface ProcurementSummary {
  total: number;
  waiting_order: number;
  in_order: number;
  closed: number;
  written_off: number;
}

/**
 * Problem item in dashboard
 */
export interface ProblemItem {
  id: string;
  item_number: number | null;
  name: string;
  project_id: string;
  project_name: string | null;
  type: 'manufactured' | 'purchased';
  problems: ProblemType[];
  delay_reason: string | null;
  delay_notes: string | null;
  problem_reason: string | null;
  problem_notes: string | null;
  problem_deviation_reason?: string | null;
  problem_deviation_subreason?: string | null;
  problem_deviation_notes?: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  order_date: string | null;
  required_date: string | null;
  manufacturing_status: string;
  purchase_status: string;
}

/**
 * Manufacturing deadline item
 */
export interface ManufacturingDeadline {
  id: string;
  item_number: number | null;
  name: string;
  project_id: string;
  project_name: string | null;
  deadline_type: 'start' | 'end';
  deadline_date: string;
  days_until: number;
  status: string;
  status_display?: string | null;
  manufacturer_type: string;
  delay_reason?: string | null;
  delay_notes?: string | null;
  problem_reason?: string | null;
  problem_notes?: string | null;
  problem_deviation_reason?: string | null;
  problem_deviation_subreason?: string | null;
  problem_deviation_notes?: string | null;
}

/**
 * Procurement deadline item
 */
export interface ProcurementDeadline {
  id: string;
  item_number: number | null;
  name: string;
  project_id: string;
  project_name: string | null;
  deadline_type: 'order' | 'delivery';
  deadline_date: string;
  days_until: number;
  status: string;
  status_display?: string | null;
  supplier: string | null;
  delay_reason?: string | null;
  delay_notes?: string | null;
  problem_reason?: string | null;
  problem_notes?: string | null;
  problem_deviation_reason?: string | null;
  problem_deviation_subreason?: string | null;
  problem_deviation_notes?: string | null;
}

/**
 * Project reference in workplace
 */
export interface WorkplaceProject {
  id: string;
  name: string | null;
}

/**
 * Dashboard response
 */
export interface DashboardData {
  manufacturing_summary: ManufacturingSummary;
  procurement_summary: ProcurementSummary;
  problems: ProblemItem[];
  manufacturing_deadlines: ManufacturingDeadline[];
  procurement_deadlines: ProcurementDeadline[];
  projects: WorkplaceProject[];
  total_items: number;
}

/**
 * Items list response
 */
export interface WorkplaceItemsResponse {
  count: number;
  results: ProjectItem[];
}

/**
 * Problem items response with additional problem type info
 */
export interface ProblemItemsResponse {
  count: number;
  results: (ProjectItem & { problems: ProblemType[] })[];
}

/**
 * Query params for workplace endpoints
 */
export interface WorkplaceQueryParams {
  project?: string;
  type?: 'manufactured' | 'purchased';
  days_ahead?: number;
}

/**
 * Workplace API
 */
export const workplaceApi = {
  /**
   * Get all items where current user is responsible
   */
  getMyItems: async (params?: WorkplaceQueryParams): Promise<WorkplaceItemsResponse> => {
    return api.get<WorkplaceItemsResponse>(endpoints.workplace.myItems, { params });
  },

  /**
   * Get dashboard data with statistics, problems and deadlines
   */
  getDashboard: async (params?: { days_ahead?: number }): Promise<DashboardData> => {
    return api.get<DashboardData>(endpoints.workplace.dashboard, { params });
  },

  /**
   * Get only manufactured items where user is responsible
   */
  getManufacturing: async (params?: WorkplaceQueryParams): Promise<WorkplaceItemsResponse> => {
    return api.get<WorkplaceItemsResponse>(endpoints.workplace.manufacturing, { params });
  },

  /**
   * Get only purchased items where user is responsible
   */
  getProcurement: async (params?: WorkplaceQueryParams): Promise<WorkplaceItemsResponse> => {
    return api.get<WorkplaceItemsResponse>(endpoints.workplace.procurement, { params });
  },

  /**
   * Get items with problems or overdue
   */
  getProblems: async (): Promise<ProblemItemsResponse> => {
    return api.get<ProblemItemsResponse>(endpoints.workplace.problems);
  },

  /**
   * Get Gantt chart data for items where user is responsible
   */
  getGantt: async (params?: WorkplaceQueryParams): Promise<WorkplaceItemsResponse> => {
    return api.get<WorkplaceItemsResponse>(endpoints.workplace.gantt, { params });
  },
};
