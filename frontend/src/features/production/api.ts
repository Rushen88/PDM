import { api, endpoints } from '../../shared/api';
import type { PaginatedResponse, ListParams } from '../../shared/api/types';

/**
 * Production Order Status
 */
export type ProductionOrderStatus = 
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Production Task Status (Manufacturing Status)
 */
export type ProductionTaskStatus = 
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'suspended'
  | 'waiting_materials'
  | 'quality_check'
  | 'rejected';

/**
 * Manufacturer Type
 */
export type ManufacturerType = 'internal' | 'contractor';

/**
 * Production Order
 */
export interface ProductionOrder {
  id: string;
  number: string;
  project: string;
  project_name?: string;
  project_detail?: {
    id: string;
    name: string;
  } | null;
  status: ProductionOrderStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string;
  tasks?: ProductionTask[];
  tasks_count?: number;
  progress?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Production Task
 */
export interface ProductionTask {
  id: string;
  order: string | null;
  project_item: string;
  project_item_detail: {
    id: string;
    project_id: string | null;
  } | null;
  nomenclature_item: string;
  nomenclature_detail: {
    id: string;
    designation: string;
    name: string;
  } | null;
  quantity: number;
  unit: string;
  completed_quantity: number;
  progress?: number;
  status: ProductionTaskStatus;
  manufacturer_type: ManufacturerType;
  contractor: string | null;
  contractor_detail: {
    id: string;
    code: string;
    name: string;
  } | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Production Statistics
 */
export interface ProductionStats {
  total_orders: number;
  in_progress: number;
  completed: number;
  total_tasks: number;
  tasks_not_started: number;
  tasks_in_progress: number;
  tasks_completed: number;
  tasks_delayed: number;
  overall_progress: number;
}

/**
 * Production Order list params
 */
export interface ProductionOrderListParams extends ListParams {
  status?: ProductionOrderStatus;
  project?: string;
  is_active?: boolean;
}

/**
 * Production Task list params
 */
export interface ProductionTaskListParams extends ListParams {
  order?: string;
  status?: ProductionTaskStatus;
  manufacturer_type?: ManufacturerType;
  contractor?: string;
  project_item?: string;
  is_active?: boolean;
}

/**
 * Production API
 */
export const productionApi = {
  // Production Orders
  orders: {
    list: async (params?: ProductionOrderListParams): Promise<PaginatedResponse<ProductionOrder>> => {
      return api.get<PaginatedResponse<ProductionOrder>>(endpoints.production.orders.list, { params });
    },
    
    get: async (id: string): Promise<ProductionOrder> => {
      return api.get<ProductionOrder>(endpoints.production.orders.detail(id));
    },
    
    create: async (data: Partial<ProductionOrder>): Promise<ProductionOrder> => {
      return api.post<ProductionOrder>(endpoints.production.orders.list, data);
    },
    
    update: async (id: string, data: Partial<ProductionOrder>): Promise<ProductionOrder> => {
      return api.patch<ProductionOrder>(endpoints.production.orders.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.production.orders.detail(id));
    },
    
    stats: async (): Promise<ProductionStats> => {
      return api.get<ProductionStats>(endpoints.production.orders.stats);
    },
    
    start: async (id: string): Promise<ProductionOrder> => {
      return api.post<ProductionOrder>(endpoints.production.orders.start(id));
    },
    
    complete: async (id: string): Promise<ProductionOrder> => {
      return api.post<ProductionOrder>(endpoints.production.orders.complete(id));
    },
    
    cancel: async (id: string): Promise<ProductionOrder> => {
      return api.post<ProductionOrder>(endpoints.production.orders.cancel(id));
    },
  },

  // Production Tasks
  tasks: {
    list: async (params?: ProductionTaskListParams): Promise<PaginatedResponse<ProductionTask>> => {
      return api.get<PaginatedResponse<ProductionTask>>(endpoints.production.tasks.list, { params });
    },
    
    get: async (id: string): Promise<ProductionTask> => {
      return api.get<ProductionTask>(endpoints.production.tasks.detail(id));
    },
    
    create: async (data: Partial<ProductionTask>): Promise<ProductionTask> => {
      return api.post<ProductionTask>(endpoints.production.tasks.list, data);
    },
    
    update: async (id: string, data: Partial<ProductionTask>): Promise<ProductionTask> => {
      return api.patch<ProductionTask>(endpoints.production.tasks.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.production.tasks.detail(id));
    },
    
    start: async (id: string): Promise<ProductionTask> => {
      return api.post<ProductionTask>(endpoints.production.tasks.start(id));
    },
    
    complete: async (id: string): Promise<ProductionTask> => {
      return api.post<ProductionTask>(endpoints.production.tasks.complete(id));
    },
    
    reportProgress: async (id: string, completedQuantity: number): Promise<ProductionTask> => {
      return api.post<ProductionTask>(endpoints.production.tasks.reportProgress(id), { 
        completed_quantity: completedQuantity 
      });
    },
  },
};
