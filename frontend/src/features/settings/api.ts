import { api } from '../../shared/api';
import type { PaginatedResponse } from '../../shared/api/types';

// Note: BASE_URL is already configured in the api client (/api/v1), 
// so we use relative paths here

/**
 * Manufacturing Status
 */
export interface ManufacturingStatusRef {
  id: string;
  code: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_completed: boolean;
  progress_percent: number;
  auto_trigger: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Purchase Status
 */
export interface PurchaseStatusRef {
  id: string;
  code: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_delivered: boolean;
  is_not_required: boolean;
  progress_percent: number;
  auto_trigger: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Manufacturing Problem Reason
 */
export interface ManufacturingProblemReason {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: number;
  severity_display: string;
  sort_order: number;
  suggested_action: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Manufacturing Problem Subreason
 */
export interface ManufacturingProblemSubreason {
  id: string;
  reason: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Purchase Problem Reason
 */
export interface PurchaseProblemReason {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: number;
  severity_display: string;
  sort_order: number;
  suggested_action: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Purchase Problem Subreason
 */
export interface PurchaseProblemSubreason {
  id: string;
  reason: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Project Item Problem
 */
export interface ProjectItemProblem {
  id: string;
  project_item: string;
  problem_type: 'manufacturing' | 'purchasing';
  problem_type_display: string;
  manufacturing_reason: string | null;
  manufacturing_reason_detail: ManufacturingProblemReason | null;
  purchase_reason: string | null;
  purchase_reason_detail: PurchaseProblemReason | null;
  description: string;
  impact_description: string;
  is_resolved: boolean;
  resolution_date: string | null;
  resolution_notes: string;
  reported_by: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Project Settings API
 */
export const settingsApi = {
  // Manufacturing Statuses
  manufacturingStatuses: {
    list: async (): Promise<PaginatedResponse<ManufacturingStatusRef>> => {
      return api.get<PaginatedResponse<ManufacturingStatusRef>>(`/manufacturing-statuses/`);
    },
    
    get: async (id: string): Promise<ManufacturingStatusRef> => {
      return api.get<ManufacturingStatusRef>(`/manufacturing-statuses/${id}/`);
    },
    
    create: async (data: Partial<ManufacturingStatusRef>): Promise<ManufacturingStatusRef> => {
      return api.post<ManufacturingStatusRef>(`/manufacturing-statuses/`, data);
    },
    
    update: async (id: string, data: Partial<ManufacturingStatusRef>): Promise<ManufacturingStatusRef> => {
      return api.patch<ManufacturingStatusRef>(`/manufacturing-statuses/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/manufacturing-statuses/${id}/`);
    },
    
    setDefault: async (id: string): Promise<{ message: string }> => {
      return api.post<{ message: string }>(`/manufacturing-statuses/${id}/set_default/`);
    },
  },
  
  // Purchase Statuses
  purchaseStatuses: {
    list: async (): Promise<PaginatedResponse<PurchaseStatusRef>> => {
      return api.get<PaginatedResponse<PurchaseStatusRef>>(`/purchase-statuses/`);
    },
    
    get: async (id: string): Promise<PurchaseStatusRef> => {
      return api.get<PurchaseStatusRef>(`/purchase-statuses/${id}/`);
    },
    
    create: async (data: Partial<PurchaseStatusRef>): Promise<PurchaseStatusRef> => {
      return api.post<PurchaseStatusRef>(`/purchase-statuses/`, data);
    },
    
    update: async (id: string, data: Partial<PurchaseStatusRef>): Promise<PurchaseStatusRef> => {
      return api.patch<PurchaseStatusRef>(`/purchase-statuses/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/purchase-statuses/${id}/`);
    },
    
    setDefault: async (id: string): Promise<{ message: string }> => {
      return api.post<{ message: string }>(`/purchase-statuses/${id}/set_default/`);
    },
  },
  
  // Manufacturing Problem Reasons
  manufacturingProblemReasons: {
    list: async (): Promise<PaginatedResponse<ManufacturingProblemReason>> => {
      return api.get<PaginatedResponse<ManufacturingProblemReason>>(`/manufacturing-problem-reasons/`);
    },
    
    get: async (id: string): Promise<ManufacturingProblemReason> => {
      return api.get<ManufacturingProblemReason>(`/manufacturing-problem-reasons/${id}/`);
    },
    
    create: async (data: Partial<ManufacturingProblemReason>): Promise<ManufacturingProblemReason> => {
      return api.post<ManufacturingProblemReason>(`/manufacturing-problem-reasons/`, data);
    },
    
    update: async (id: string, data: Partial<ManufacturingProblemReason>): Promise<ManufacturingProblemReason> => {
      return api.patch<ManufacturingProblemReason>(`/manufacturing-problem-reasons/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/manufacturing-problem-reasons/${id}/`);
    },
  },

  // Manufacturing Problem Subreasons
  manufacturingProblemSubreasons: {
    list: async (params?: { reason?: string; page_size?: number }): Promise<PaginatedResponse<ManufacturingProblemSubreason>> => {
      return api.get<PaginatedResponse<ManufacturingProblemSubreason>>(`/manufacturing-problem-subreasons/`, { params });
    },

    get: async (id: string): Promise<ManufacturingProblemSubreason> => {
      return api.get<ManufacturingProblemSubreason>(`/manufacturing-problem-subreasons/${id}/`);
    },

    create: async (data: Partial<ManufacturingProblemSubreason>): Promise<ManufacturingProblemSubreason> => {
      return api.post<ManufacturingProblemSubreason>(`/manufacturing-problem-subreasons/`, data);
    },

    update: async (id: string, data: Partial<ManufacturingProblemSubreason>): Promise<ManufacturingProblemSubreason> => {
      return api.patch<ManufacturingProblemSubreason>(`/manufacturing-problem-subreasons/${id}/`, data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/manufacturing-problem-subreasons/${id}/`);
    },
  },
  
  // Purchase Problem Reasons
  purchaseProblemReasons: {
    list: async (): Promise<PaginatedResponse<PurchaseProblemReason>> => {
      return api.get<PaginatedResponse<PurchaseProblemReason>>(`/purchase-problem-reasons/`);
    },
    
    get: async (id: string): Promise<PurchaseProblemReason> => {
      return api.get<PurchaseProblemReason>(`/purchase-problem-reasons/${id}/`);
    },
    
    create: async (data: Partial<PurchaseProblemReason>): Promise<PurchaseProblemReason> => {
      return api.post<PurchaseProblemReason>(`/purchase-problem-reasons/`, data);
    },
    
    update: async (id: string, data: Partial<PurchaseProblemReason>): Promise<PurchaseProblemReason> => {
      return api.patch<PurchaseProblemReason>(`/purchase-problem-reasons/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/purchase-problem-reasons/${id}/`);
    },
  },

  // Purchase Problem Subreasons
  purchaseProblemSubreasons: {
    list: async (params?: { reason?: string; page_size?: number }): Promise<PaginatedResponse<PurchaseProblemSubreason>> => {
      return api.get<PaginatedResponse<PurchaseProblemSubreason>>(`/purchase-problem-subreasons/`, { params });
    },

    get: async (id: string): Promise<PurchaseProblemSubreason> => {
      return api.get<PurchaseProblemSubreason>(`/purchase-problem-subreasons/${id}/`);
    },

    create: async (data: Partial<PurchaseProblemSubreason>): Promise<PurchaseProblemSubreason> => {
      return api.post<PurchaseProblemSubreason>(`/purchase-problem-subreasons/`, data);
    },

    update: async (id: string, data: Partial<PurchaseProblemSubreason>): Promise<PurchaseProblemSubreason> => {
      return api.patch<PurchaseProblemSubreason>(`/purchase-problem-subreasons/${id}/`, data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/purchase-problem-subreasons/${id}/`);
    },
  },
  
  // Project Item Problems
  projectItemProblems: {
    list: async (params?: { project_item?: string; is_resolved?: boolean }): Promise<PaginatedResponse<ProjectItemProblem>> => {
      return api.get<PaginatedResponse<ProjectItemProblem>>(`/project-item-problems/`, { params });
    },
    
    get: async (id: string): Promise<ProjectItemProblem> => {
      return api.get<ProjectItemProblem>(`/project-item-problems/${id}/`);
    },
    
    create: async (data: Partial<ProjectItemProblem>): Promise<ProjectItemProblem> => {
      return api.post<ProjectItemProblem>(`/project-item-problems/`, data);
    },
    
    update: async (id: string, data: Partial<ProjectItemProblem>): Promise<ProjectItemProblem> => {
      return api.patch<ProjectItemProblem>(`/project-item-problems/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/project-item-problems/${id}/`);
    },
    
    resolve: async (id: string, resolutionNotes?: string): Promise<{ message: string; resolution_date: string }> => {
      return api.post<{ message: string; resolution_date: string }>(`/project-item-problems/${id}/resolve/`, {
        resolution_notes: resolutionNotes,
      });
    },
  },

  // Users
  users: {
    list: async (params?: { search?: string; is_active?: boolean }): Promise<PaginatedResponse<User>> => {
      return api.get<PaginatedResponse<User>>(`/users/`, { params });
    },
    
    get: async (id: string): Promise<UserDetail> => {
      return api.get<UserDetail>(`/users/${id}/`);
    },
    
    create: async (data: CreateUserData): Promise<UserDetail> => {
      return api.post<UserDetail>(`/users/`, data);
    },
    
    update: async (id: string, data: Partial<UserDetail>): Promise<UserDetail> => {
      return api.patch<UserDetail>(`/users/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/users/${id}/`);
    },
    
    activate: async (id: string): Promise<{ message: string }> => {
      return api.post<{ message: string }>(`/users/${id}/activate/`);
    },
    
    deactivate: async (id: string): Promise<{ message: string }> => {
      return api.post<{ message: string }>(`/users/${id}/deactivate/`);
    },
    
    resetPassword: async (id: string, newPassword: string): Promise<{ message: string }> => {
      return api.post<{ message: string }>(`/users/${id}/reset_password/`, { new_password: newPassword });
    },
    
    /**
     * Get users who can be assigned as responsible
     */
    responsibleCandidates: async (): Promise<ResponsibleCandidate[]> => {
      return api.get<ResponsibleCandidate[]>(`/users/responsible_candidates/`);
    },
  },

  // Roles
  roles: {
    list: async (): Promise<PaginatedResponse<Role>> => {
      return api.get<PaginatedResponse<Role>>(`/roles/`);
    },
    
    get: async (id: string): Promise<Role> => {
      return api.get<Role>(`/roles/${id}/`);
    },
    
    create: async (data: Partial<Role>): Promise<Role> => {
      return api.post<Role>(`/roles/`, data);
    },
    
    update: async (id: string, data: Partial<Role>): Promise<Role> => {
      return api.patch<Role>(`/roles/${id}/`, data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(`/roles/${id}/`);
    },
    
    setModuleAccess: async (
      id: string, 
      moduleAccess: Array<{ module_id: string; access_level: ModuleAccessLevel }>
    ): Promise<Role> => {
      return api.post<Role>(`/roles/${id}/set_module_access/`, { module_access: moduleAccess });
    },
  },
  
  // System Modules
  systemModules: {
    list: async (): Promise<PaginatedResponse<SystemModule>> => {
      return api.get<PaginatedResponse<SystemModule>>(`/system-modules/`);
    },
  },
};

/**
 * User
 */
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  department: string;
  position: string;
  is_active: boolean;
  roles_display: string[];
  last_login: string | null;
}

/**
 * User Detail
 */
export interface UserDetail extends User {
  middle_name: string;
  phone: string;
  timezone: string;
  language: string;
  user_roles: UserRole[];
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_activity: string | null;
}

/**
 * User Role
 */
export interface UserRole {
  id: string;
  user: string;
  role: string;
  role_detail: {
    id: string;
    name: string;
    code: string;
  };
  project_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

/**
 * Module Access Level
 */
export type ModuleAccessLevel = 'none' | 'view' | 'edit' | 'full';

/**
 * Role Module Access
 */
export interface RoleModuleAccess {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  access_level: ModuleAccessLevel;
}

/**
 * System Module
 */
export interface SystemModule {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  parent: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * Visibility type for roles
 */
export type VisibilityType = 'own' | 'own_and_children' | 'all';

/**
 * Child structure access type for roles
 */
export type ChildStructureAccessType = 'name_only' | 'view' | 'edit';

/**
 * Project access scope for roles
 */
export type ProjectAccessScope =
  | 'own'
  | 'own_children_name_only'
  | 'own_children_view'
  | 'own_children_edit'
  | 'all';

/**
 * Role
 */
export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  parent_role: string | null;
  is_system_role: boolean;
  is_active: boolean;
  // Production responsibility
  can_be_production_responsible: boolean;
  project_access_scope: ProjectAccessScope;
  project_access_scope_display?: string;
  visibility_type: VisibilityType;
  visibility_type_display?: string;
  // Child structure access settings
  child_structure_access: ChildStructureAccessType;
  child_structure_access_display?: string;
  // Inventory responsibility
  can_be_inventory_responsible: boolean;
  // Legacy fields (deprecated)
  can_be_responsible: boolean;
  see_only_own_items: boolean;
  see_child_structures: boolean;
  users_count: number;
  module_access?: RoleModuleAccess[];
  created_at: string;
  updated_at: string;
}

/**
 * Responsible Candidate - user who can be assigned as responsible
 */
export interface ResponsibleCandidate {
  id: string;
  full_name: string;
  username: string;
  position: string;
  department: string;
}

/**
 * Create User Data
 */
export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  position?: string;
  department?: string;
  role_ids?: string[];
  is_active?: boolean;
}
