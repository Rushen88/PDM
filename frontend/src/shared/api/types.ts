/**
 * Paginated API Response
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * API Error Response
 */
export interface ApiError {
  detail?: string;
  message?: string;
  errors?: Record<string, string[]>;
  code?: string;
}

/**
 * Base model fields (from Django)
 */
export interface BaseModel {
  id: number;
  created_at: string;
  updated_at: string;
}

/**
 * Soft-delete model
 */
export interface SoftDeleteModel extends BaseModel {
  is_deleted: boolean;
  deleted_at: string | null;
}

/**
 * Query parameters for list endpoints
 */
export interface ListParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  [key: string]: string | number | boolean | undefined;
}
