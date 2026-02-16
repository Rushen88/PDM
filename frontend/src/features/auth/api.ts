import { api, endpoints } from '../../shared/api';

/**
 * Role model (matches backend RoleMinimalSerializer)
 */
export interface Role {
  id: string;
  name: string;
  code: string;
}

/**
 * User role model (matches backend UserRoleSerializer)
 */
export interface UserRole {
  id: string;
  user: string;
  user_name: string;
  role: string;
  role_detail: Role;
  project_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * User model (matches backend UserProfileSerializer)
 */
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  full_name: string;
  phone: string;
  position: string;
  department: string;
  timezone: string;
  language: string;
  user_roles: UserRole[];
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  last_activity: string | null;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Login response (matches backend AuthViewSet.login response)
 */
export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

/**
 * Refresh token response
 */
export interface RefreshResponse {
  access: string;
}

/**
 * Auth API functions
 */
export const authApi = {
  /**
   * Login with username and password
   */
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    return api.post<LoginResponse>(endpoints.auth.login, credentials);
  },

  /**
   * Logout current user
   */
  logout: async (refreshToken?: string): Promise<void> => {
    return api.post<void>(endpoints.auth.logout, { refresh: refreshToken });
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<RefreshResponse> => {
    return api.post<RefreshResponse>(endpoints.auth.refresh, { refresh: refreshToken });
  },

  /**
   * Get current user info
   */
  getCurrentUser: async (): Promise<User> => {
    return api.get<User>(endpoints.auth.me);
  },

  /**
   * Update current user profile
   */
  updateProfile: async (data: Partial<Pick<User, 'first_name' | 'last_name' | 'middle_name' | 'phone' | 'email'>>): Promise<User> => {
    return api.put<User>('/auth/update_profile/', data);
  },

  /**
   * Change password
   */
  changePassword: async (oldPassword: string, newPassword: string, newPasswordConfirm: string): Promise<void> => {
    return api.post<void>('/auth/change_password/', {
      old_password: oldPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    });
  },
};

/**
 * Module access level
 */
export type ModuleAccessLevel = 'none' | 'view' | 'edit' | 'full';

/**
 * System module
 */
export interface SystemModule {
  id: string;
  code: string;
  name: string;
  description: string;
  parent: string | null;
  parent_name?: string;
  sort_order: number;
  icon: string;
  is_active: boolean;
  children_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * User module access
 */
export interface UserModuleAccess {
  id: string;
  user: string;
  user_name: string;
  module: string;
  module_name: string;
  module_code: string;
  access_level: ModuleAccessLevel;
  access_level_display: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Module access API
 */
export const moduleAccessApi = {
  /**
   * Get all system modules as tree
   */
  getModulesTree: async (): Promise<SystemModule[]> => {
    return api.get<SystemModule[]>('/system-modules/tree/');
  },

  /**
   * Get current user's module access
   */
  getMyAccess: async (): Promise<UserModuleAccess[]> => {
    return api.get<UserModuleAccess[]>('/user-module-access/my_access/');
  },

  /**
   * Bulk update user module access
   */
  bulkUpdateAccess: async (userId: string, access: Array<{ module: string; access_level: ModuleAccessLevel; project_id?: string }>): Promise<void> => {
    return api.post<void>('/user-module-access/bulk_update/', { user_id: userId, access });
  },
};
