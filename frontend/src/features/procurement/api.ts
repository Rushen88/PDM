import { api, endpoints } from '../../shared/api';
import type { ListParams, PaginatedResponse } from '../../shared/api/types';

/**
 * Purchase Order Status (согласно ТЗ + legacy)
 */
export type PurchaseOrderStatus = 
  // Согласно ТЗ
  | 'draft'              // Черновик
  | 'ordered'            // Заказан
  | 'partially_delivered' // Частично поставлен
  | 'closed'             // Закрыт
  | 'cancelled';          // Отменён (legacy)

/**
 * Purchase Order Item Status
 */
export type PurchaseOrderItemStatus = 
  | 'pending'
  | 'ordered'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

/**
 * Purchase Order
 */
export interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  supplier_name?: string;
  supplier_detail?: {
    id: string;
    code: string;
    name: string;
    inn?: string | null;
  } | null;
  project: string | null;
  project_name?: string;
  project_detail?: {
    id: string;
    name: string;
  } | null;
  status: PurchaseOrderStatus;
  status_display?: string;
  order_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  total_amount: number | null;
  currency: string;
  payment_terms: string;
  payment_status: string;
  notes: string;
  items?: PurchaseOrderItem[];
  items_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Purchase Order Item
 */
export interface PurchaseOrderItem {
  id: string;
  order: string;
  nomenclature_item: string;
  nomenclature_detail: {
    id: string;
    code: string;
    designation?: string;
    name: string;
  } | null;
  project_item: string | null;
  project_item_detail: {
    id: string;
    project_name?: string | null;
  } | null;
  material_requirement_detail?: {
    id: string;
    project_item_number?: number | null;
    status: 'waiting_order' | 'in_order' | 'closed';
    status_display?: string;
    order_by_date?: string | null;
  } | null;
  material_requirement_id?: string | null;
  material_requirement?: string;  // UUID потребности для связи при создании
  quantity: number;
  unit: string;
  delivered_quantity: number;
  unit_price: number | null;
  total_price: number | null;
  article_number: string;
  status: PurchaseOrderItemStatus;
  status_display?: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Procurement Schedule Item
 */
export interface ProcurementScheduleItem {
  id: string;
  project_id: string;
  project_name: string;
  nomenclature_id: string;
  designation: string;
  name: string;
  required_quantity: number;
  ordered_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
  unit: string;
  required_date: string | null;
  status: string;
  supplier_id: string | null;
  supplier_name: string | null;
}

/**
 * Procurement Statistics
 */
export interface ProcurementStats {
  total_items: number;
  pending: number;
  ordered: number;
  in_transit: number;
  delivered: number;
  overdue: number;
  total_orders: number;
  total_amount: number | null;
}

/**
 * Purchase Order list params
 */
export interface PurchaseOrderListParams extends ListParams {
  status?: PurchaseOrderStatus;
  supplier?: string;
  project?: string;
  is_active?: boolean;
}

/**
 * Procurement API
 */
export const procurementApi = {
  // Purchase Orders
  orders: {
    list: async (params?: PurchaseOrderListParams): Promise<PaginatedResponse<PurchaseOrder>> => {
      return api.get<PaginatedResponse<PurchaseOrder>>(endpoints.procurement.orders.list, { params });
    },
    
    get: async (id: string): Promise<PurchaseOrder> => {
      return api.get<PurchaseOrder>(endpoints.procurement.orders.detail(id));
    },
    
    create: async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.list, data);
    },
    
    update: async (id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
      return api.patch<PurchaseOrder>(endpoints.procurement.orders.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.procurement.orders.detail(id));
    },
    
    stats: async (): Promise<ProcurementStats> => {
      return api.get<ProcurementStats>(endpoints.procurement.orders.stats);
    },
    
    submit: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.submit(id));
    },
    
    confirm: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.confirm(id));
    },
    
    cancel: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.cancel(id));
    },
  },

  // Purchase Order Items
  items: {
    list: async (params?: ListParams & { order?: string; status?: string }): Promise<PaginatedResponse<PurchaseOrderItem>> => {
      return api.get<PaginatedResponse<PurchaseOrderItem>>(endpoints.procurement.items.list, { params });
    },
    
    get: async (id: string): Promise<PurchaseOrderItem> => {
      return api.get<PurchaseOrderItem>(endpoints.procurement.items.detail(id));
    },
    
    create: async (data: Partial<PurchaseOrderItem>): Promise<PurchaseOrderItem> => {
      return api.post<PurchaseOrderItem>(endpoints.procurement.items.list, data);
    },
    
    update: async (id: string, data: Partial<PurchaseOrderItem>): Promise<PurchaseOrderItem> => {
      return api.patch<PurchaseOrderItem>(endpoints.procurement.items.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.procurement.items.detail(id));
    },
  },

  // Procurement Schedule
  schedule: {
    list: async (params?: { project?: string; status?: string }): Promise<{ count: number; results: ProcurementScheduleItem[] }> => {
      return api.get<{ count: number; results: ProcurementScheduleItem[] }>(endpoints.procurement.schedule, { params });
    },
  },
  
  // Alias for orders (for backward compatibility)
  purchaseOrders: {
    list: async (params?: PurchaseOrderListParams): Promise<PaginatedResponse<PurchaseOrder>> => {
      return api.get<PaginatedResponse<PurchaseOrder>>(endpoints.procurement.orders.list, { params });
    },
    
    get: async (id: string): Promise<PurchaseOrder> => {
      return api.get<PurchaseOrder>(endpoints.procurement.orders.detail(id));
    },
    
    create: async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.list, data);
    },
    
    update: async (id: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
      return api.patch<PurchaseOrder>(endpoints.procurement.orders.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.procurement.orders.detail(id));
    },
    
    submit: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.submit(id));
    },
    
    confirm: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.confirm(id));
    },
    
    cancel: async (id: string): Promise<PurchaseOrder> => {
      return api.post<PurchaseOrder>(endpoints.procurement.orders.cancel(id));
    },
  },
};
