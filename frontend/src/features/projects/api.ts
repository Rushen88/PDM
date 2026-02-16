import { api, endpoints } from '../../shared/api';
import type { ListParams, PaginatedResponse } from '../../shared/api/types';
import type { BOMStructure } from '../bom/api';

/**
 * Project status
 */
export type ProjectStatus = 
  | 'planning'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

/**
 * Manufacturing status
 */
export type ManufacturingStatus =
  | 'not_started'
  | 'in_progress'
  | 'suspended'
  | 'completed';

/**
 * Contractor status (for items made by contractors)
 */
export type ContractorStatus =
  | 'sent_to_contractor'
  | 'suspended_by_contractor'
  | 'manufactured_by_contractor'
  | 'completed';

/**
 * Project
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  customer: string | null;
  customer_name?: string;
  status: ProjectStatus;
  priority: number;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  budget: number | null;
  actual_cost: number | null;
  project_manager: string | null;
  project_manager_name?: string;
  nomenclature_item: string | null;
  nomenclature_item_detail?: {
    id: string;
    name: string;
  } | null;
  // Root nomenclature (корневое изделие проекта)
  root_nomenclature: string | null;
  root_nomenclature_detail?: {
    id: string;
    name: string;
    catalog_category_name?: string;
  } | null;
  bom_structure: string | null;
  bom_structure_detail: BOMStructure | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  progress?: number;
  items_count?: number;
  // New fields
  has_structure?: boolean;
  structure_modified?: boolean;
  can_activate?: boolean;
  validation_errors?: ProjectValidationError[];
  root_item_id?: string;
}

/**
 * Project validation error
 */
export interface ProjectValidationError {
  code: string;
  message: string;
  items: Array<Record<string, unknown>>;
}

/**
 * Available child item (from BOM)
 */
export interface AvailableChildItem {
  id: string;
  code: string;
  name: string;
  unit?: string;
  catalog_category?: string;
  catalog_category_name?: string;
}

/**
 * Manufacturer type
 */
export type ManufacturerType = 'internal' | 'contractor';

/**
 * Material supply type
 */
export type MaterialSupplyType = 'our_supply' | 'contractor_supply';

/**
 * Purchase status
 */
export type PurchaseStatus = 
  | 'waiting_order'
  | 'in_order'
  | 'closed'
  | 'written_off';

/**
 * Project item (task/component in project)
 */
export interface ProjectItem {
  id: string;
  project: string;
  parent_item: string | null;
  bom_item: string | null;
  nomenclature_item: string | null;
  nomenclature_item_detail: {
    id: string;
    name: string;
    catalog_category_name?: string;
  } | null;
  category: string;
  category_display?: string;
  category_sort_order?: number; // For hierarchical sorting by catalog category
  name: string;
  drawing_number: string;
  quantity: number;
  unit: string;
  // Manufacturing
  manufacturing_status: ManufacturingStatus;
  manufacturing_status_display?: string;
  contractor_status?: ContractorStatus;  // Added: status for contractor work
  contractor_status_display?: string;
  manufacturer_type: ManufacturerType;
  manufacturer_type_display?: string;
  contractor: string | null;
  contractor_detail?: {
    id: string;
    name: string;
    short_name?: string;
  } | null;
  material_supply_type: MaterialSupplyType;
  material_supply_type_display?: string;
  // Purchase
  purchase_status: PurchaseStatus;
  purchase_status_display?: string;
  supplier: string | null;
  supplier_detail?: {
    id: string;
    name: string;
    short_name?: string;
  } | null;
  article_number: string;
  purchase_by_contractor?: boolean;
  // Dates
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  order_date: string | null;  // Added: order date for purchased items
    purchase_order_id?: string | null;
    purchase_order_number?: string | null;
  required_date: string | null;
  // Responsibility
  responsible: string | null;
  responsible_detail?: {
    id: string;
    full_name: string;
  } | null;
  // Progress
  progress_percent: number;
  calculated_progress?: number;  // Computed progress based on status
  // Delay
  delay_reason: string | null;
  delay_reason_detail?: {
    id: string;
    name: string;
  } | null;
  delay_notes: string;

  // Manufacturing problem analytics (settings: manufacturing problem reasons/subreasons)
  manufacturing_problem_reason?: string | null;
  manufacturing_problem_reason_detail?: {
    id: string;
    name: string;
  } | null;
  manufacturing_problem_subreason?: string | null;
  manufacturing_problem_subreason_detail?: {
    id: string;
    name: string;
    reason?: string;
  } | null;

  // Purchase problem analytics (settings: purchase problem reasons/subreasons)
  purchase_problem_reason?: string | null;
  purchase_problem_reason_detail?: {
    id: string;
    name: string;
  } | null;
  purchase_problem_subreason?: string | null;
  purchase_problem_subreason_detail?: {
    id: string;
    name: string;
    reason?: string;
  } | null;
  // Problems (procurement)
  has_problem?: boolean;
  problem_reason?: string | null;
  problem_reason_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  problem_notes?: string;  // Comment for problem
  // Computed
  is_overdue?: boolean;
  days_remaining?: number;
  children_count?: number;
  is_purchased?: boolean;
  // Position
  position: number;
  item_number?: number;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: ProjectItem[];
}

/**
 * Project item history entry
 */
export interface ProjectItemHistoryEntry {
  id: string;
  date: string;
  user: string | null;
  type: string;
  changes: string | null;
  details?: string[];
}

/**
 * Project progress info
 */
export interface ProjectProgress {
  total_items: number;
  completed_items: number;
  in_progress_items: number;
  not_started_items: number;
  on_hold_items: number;
  progress_percentage: number;
  purchase_progress: {
    total: number;
    received: number;
    ordered: number;
    pending: number;
  };
}

/**
 * Project list params
 */
export interface ProjectListParams extends ListParams {
  status?: ProjectStatus;
  customer?: string;
  project_manager?: string;
  is_active?: boolean;
}

/**
 * Add product response
 */
export interface AddProductResponse {
  message: string;
  items_created: number;
  root_item_id: string;
}

/**
 * Set responsible response
 */
export interface SetResponsibleResponse {
  message: string;
  updated_count: number;
}

/**
 * Purchase list item
 */
export interface PurchaseListItem {
  id: string;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  required_date: string | null;
  purchase_status?: string;
  purchase_status_display?: string;
}

/**
 * Purchase list by supplier
 */
export interface PurchaseListBySupplier {
  supplier: {
    id: string;
    name: string;
    short_name: string;
  };
  items: PurchaseListItem[];
  total_items: number;
}

/**
 * Purchase list response
 */
export interface PurchaseListResponse {
  by_supplier: PurchaseListBySupplier[];
  without_supplier: PurchaseListItem[];
  total_purchased: number;
}

/**
 * Validate suppliers response
 */
export interface ValidateSuppliersResponse {
  is_valid: boolean;
  missing_suppliers: Array<{ id: string; name: string; nomenclature_item__code: string }>;
  message: string;
}

/**
 * Projects API
 */
export const projectsApi = {
  // Projects
  list: async (params?: ProjectListParams): Promise<PaginatedResponse<Project>> => {
    return api.get<PaginatedResponse<Project>>(endpoints.projects.list, { params });
  },
  
  get: async (id: string): Promise<Project> => {
    return api.get<Project>(endpoints.projects.detail(id));
  },
  
  getProgress: async (id: string): Promise<ProjectProgress> => {
    return api.get<ProjectProgress>(endpoints.projects.progress(id));
  },
  
  getStructure: async (id: string): Promise<ProjectItem[]> => {
    return api.get<ProjectItem[]>(endpoints.projects.structure(id));
  },
  
  create: async (data: Partial<Project>): Promise<Project> => {
    return api.post<Project>(endpoints.projects.list, data);
  },
  
  update: async (id: string, data: Partial<Project>): Promise<Project> => {
    return api.patch<Project>(endpoints.projects.detail(id), data);
  },
  
  delete: async (id: string): Promise<void> => {
    return api.delete<void>(endpoints.projects.detail(id));
  },
  
  // Добавить изделие в проект с развёртыванием BOM
  addProduct: async (projectId: string, nomenclatureItemId: string, quantity = 1): Promise<AddProductResponse> => {
    return api.post<AddProductResponse>(`${endpoints.projects.detail(projectId)}add_product/`, {
      nomenclature_item_id: nomenclatureItemId,
      quantity,
    });
  },
  
  // Установить ответственного с каскадом
  setResponsibleCascade: async (
    projectId: string, 
    itemId: string, 
    responsibleId: string, 
    cascade = true
  ): Promise<SetResponsibleResponse> => {
    return api.post<SetResponsibleResponse>(`${endpoints.projects.detail(projectId)}set_responsible_cascade/`, {
      item_id: itemId,
      responsible_id: responsibleId,
      cascade,
    });
  },
  
  // Установить подрядчика
  setContractor: async (
    projectId: string,
    itemId: string,
    contractorId: string,
    materialSupplyType: 'our_supply' | 'contractor_supply' = 'our_supply',
    cascade = false
  ): Promise<SetResponsibleResponse> => {
    return api.post<SetResponsibleResponse>(`${endpoints.projects.detail(projectId)}set_contractor/`, {
      item_id: itemId,
      contractor_id: contractorId,
      material_supply_type: materialSupplyType,
      cascade,
    });
  },
  
  // Установить исполнителя "Своими силами" (убрать подрядчика)
  setInternalManufacturer: async (
    projectId: string,
    itemId: string,
    cascade = false
  ): Promise<SetResponsibleResponse> => {
    return api.post<SetResponsibleResponse>(`${endpoints.projects.detail(projectId)}set_internal_manufacturer/`, {
      item_id: itemId,
      cascade,
    });
  },
  
  // Установить даты
  setDates: async (
    projectId: string,
    itemId: string,
    plannedStart?: string,
    plannedEnd?: string,
    autoRequired = true
  ): Promise<ProjectItem> => {
    return api.post<ProjectItem>(`${endpoints.projects.detail(projectId)}set_dates/`, {
      item_id: itemId,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      auto_required: autoRequired,
    });
  },
  
  // Валидация поставщиков
  validateSuppliers: async (projectId: string): Promise<ValidateSuppliersResponse> => {
    return api.post<ValidateSuppliersResponse>(`${endpoints.projects.detail(projectId)}validate_suppliers/`);
  },
  
  // Получить ведомость закупок
  getPurchaseList: async (projectId: string): Promise<PurchaseListResponse> => {
    return api.get<PurchaseListResponse>(`${endpoints.projects.detail(projectId)}purchase_list/`);
  },
  
  // Получить дерево проекта
  getTree: async (id: string): Promise<{ tree: ProjectItem[] }> => {
    return api.get<{ tree: ProjectItem[] }>(`${endpoints.projects.detail(id)}tree/`);
  },
  
  // Пересчитать прогресс
  recalculate: async (id: string): Promise<{ progress_percent: number; last_calculation: string }> => {
    return api.post<{ progress_percent: number; last_calculation: string }>(`${endpoints.projects.detail(id)}recalculate_progress/`);
  },
  
  // Валидация проекта перед активацией
  validate: async (id: string): Promise<{ valid: boolean; errors: ProjectValidationError[]; can_activate: boolean }> => {
    return api.get<{ valid: boolean; errors: ProjectValidationError[]; can_activate: boolean }>(`${endpoints.projects.detail(id)}validate/`);
  },
  
  // Активировать проект
  activate: async (id: string): Promise<{ success: boolean; message: string; errors?: ProjectValidationError[] }> => {
    return api.post<{ success: boolean; message: string; errors?: ProjectValidationError[] }>(`${endpoints.projects.detail(id)}activate/`);
  },

  // Активировать проект с поступлениями по закрытым позициям
  activateWithReceipts: async (
    id: string,
    receipts: Array<{ project_item_id: string; warehouse_id: string; quantity: number }>
  ): Promise<{ success: boolean; message: string; status?: ProjectStatus }> => {
    return api.post<{ success: boolean; message: string; status?: ProjectStatus }>(
      `${endpoints.projects.detail(id)}activate_with_receipts/`,
      { receipts }
    );
  },
  
  // Каскадный расчёт дат
  cascadeDates: async (projectId: string, itemId: string): Promise<{ message: string; updated_count: number }> => {
    return api.post<{ message: string; updated_count: number }>(`${endpoints.projects.detail(projectId)}cascade_dates/`, {
      item_id: itemId,
    });
  },
  
  // Обновить статус
  updateStatus: async (id: string, status: ProjectStatus): Promise<Project> => {
    return api.post<Project>(`${endpoints.projects.detail(id)}update_status/`, { status });
  },

  // Project Items
  items: {
    list: async (params?: ListParams & {
      project?: string;
      include_purchase_order?: boolean;
      include_calculated_progress?: boolean;
    }): Promise<PaginatedResponse<ProjectItem>> => {
      return api.get<PaginatedResponse<ProjectItem>>(endpoints.projects.items.list, { params });
    },
    
    get: async (id: string): Promise<ProjectItem> => {
      return api.get<ProjectItem>(endpoints.projects.items.detail(id));
    },
    
    create: async (data: Partial<ProjectItem>): Promise<ProjectItem> => {
      return api.post<ProjectItem>(endpoints.projects.items.list, data);
    },
    
    update: async (id: string, data: Partial<ProjectItem>): Promise<ProjectItem> => {
      return api.patch<ProjectItem>(endpoints.projects.items.detail(id), data);
    },

    reserveStock: async (
      id: string,
      allocations: Array<{ stock_item_id: string; quantity: number }>
    ): Promise<{ success: boolean; message: string }> => {
      return api.post<{ success: boolean; message: string }>(
        `${endpoints.projects.items.detail(id)}reserve_stock/`,
        { allocations }
      );
    },

    receiveAndClose: async (
      id: string,
      allocations: Array<{ warehouse_id: string; quantity: number }>
    ): Promise<{ success: boolean; message: string }> => {
      return api.post<{ success: boolean; message: string }>(
        `${endpoints.projects.items.detail(id)}receive_and_close/`,
        { allocations }
      );
    },

    getAvailableChildren: async (parentItemId: string, categoryId?: string): Promise<{ items: AvailableChildItem[] }> => {
      return api.get<{ items: AvailableChildItem[] }>(`${endpoints.projects.items.detail(parentItemId)}available_children/`, {
        params: categoryId ? { category: categoryId } : undefined,
      });
    },

    addChild: async (parentItemId: string, data: { nomenclature_item: string; quantity?: number }): Promise<ProjectItem> => {
      return api.post<ProjectItem>(`${endpoints.projects.items.detail(parentItemId)}add_child/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.projects.items.detail(id));
    },
    
    updateStatus: async (id: string, status: ManufacturingStatus): Promise<ProjectItem> => {
      return api.patch<ProjectItem>(endpoints.projects.items.detail(id), { manufacturing_status: status });
    },

    history: async (id: string): Promise<ProjectItemHistoryEntry[]> => {
      return api.get<ProjectItemHistoryEntry[]>(`${endpoints.projects.items.detail(id)}history/`);
    },
  },
};
