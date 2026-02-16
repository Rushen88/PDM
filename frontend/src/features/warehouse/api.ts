import { api } from '../../shared/api';
import type { ListParams, PaginatedResponse } from '../../shared/api/types';

// ===================== Types =====================

/**
 * Warehouse
 */
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  description: string;
  address: string;
  warehouse_type?: string;
  responsible?: string;
  responsible_name?: string;
  notes?: string;
  is_active: boolean;
  items_count?: number;
  total_value?: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stock Batch - for tracking partial consumption items (e.g., cable spools)
 */
export interface StockBatch {
  id: string;
  stock_item: string;
  batch_number: string;
  initial_quantity: number;
  current_quantity: number;
  receipt_date: string;
  expiry_date: string | null;
  supplier_batch_number: string;
  purchase_order: string | null;
  unit_cost: number | null;
  is_active: boolean;
  is_empty: boolean;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Stock Item - inventory position at warehouse
 */
export interface StockItem {
  id: string;
  warehouse: string;
  warehouse_name?: string;
  nomenclature_item: string;
  nomenclature_name?: string;
  nomenclature_code?: string;
  catalog_category?: string | null;
  catalog_category_name?: string | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit: string;
  min_quantity: number;
  location: string;
  is_low_stock: boolean;
  last_inventory_date: string | null;
  batches?: StockBatch[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Stock Movement Type
 */
export type StockMovementType = 
  | 'receipt'      // Приём на склад
  | 'issue'        // Выдача со склада
  | 'transfer_out' // Перемещение - отправка
  | 'transfer_in'  // Перемещение - приём
  | 'transfer'     // Перемещение (legacy)
  | 'adjustment'   // Корректировка
  | 'inventory'    // Инвентаризация
  | 'write_off'    // Списание
  | 'return'       // Возврат
  | 'contractor_writeoff' // Списание подрядчику
  | 'contractor_receipt'  // Приёмка от подрядчика
  | 'production'   // Производство
  | 'consumption'; // Потребление

/**
 * Stock Movement - history record
 */
export interface StockMovement {
  id: string;
  stock_item: string;
  nomenclature_name?: string;
  warehouse_name?: string;
  movement_type: StockMovementType;
  movement_type_display?: string;
  quantity: number;
  balance_after: number;
  project: string | null;
  project_name?: string | null;
  project_item: string | null;
  destination_warehouse: string | null;
  source_document: string | null;
  performed_by: string;
  performed_by_name?: string;
  performed_at: string;
  reason: string;
  notes: string;
}

/**
 * Stock Reservation Status
 */
export type StockReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

/**
 * Stock Reservation
 */
export interface StockReservation {
  id: string;
  stock_item: string;
  nomenclature_name?: string;
  project: string;
  project_name?: string;
  project_item: string | null;
  quantity: number;
  status: StockReservationStatus;
  status_display?: string;
  required_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Inventory Document Status
 */
export type InventoryDocumentStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Inventory Document Type
 */
export type InventoryDocumentType = 'full' | 'partial' | 'spot_check';

/**
 * Inventory Document - header for inventory count
 */
export interface InventoryDocument {
  id: string;
  number: string;
  warehouse: string;
  warehouse_name?: string;
  document_type: InventoryDocumentType;
  document_type_display?: string;
  status: InventoryDocumentStatus;
  status_display?: string;
  planned_date: string;
  actual_date: string | null;
  responsible: string;
  responsible_name?: string;
  commission_members?: string;
  notes?: string;
  result_notes?: string;
  items?: InventoryItem[];
  items_count?: number;
  counted_items?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Inventory Item - line item in inventory document
 */
export interface InventoryItem {
  id: string;
  inventory_document: string;
  stock_item: string;
  nomenclature_name?: string;
  nomenclature_code?: string;
  unit?: string;
  location?: string;
  system_quantity: number;
  actual_quantity: number | null;
  difference?: number;
  difference_percent?: number | null;
  is_counted: boolean;
  notes: string;
}

// ===================== Stock Transfer Types =====================

/**
 * Stock Transfer Status
 */
export type StockTransferStatus = 'draft' | 'pending' | 'in_transit' | 'completed' | 'cancelled';

/**
 * Stock Transfer Item
 */
export interface StockTransferItem {
  id: string;
  transfer: string;
  source_stock_item: string;
  destination_stock_item?: string | null;
  nomenclature_name?: string;
  nomenclature_code?: string;
  unit?: string;
  quantity: number;
  available_quantity?: number;
  notes: string;
}

/**
 * Stock Transfer - document for moving items between warehouses
 */
export interface StockTransfer {
  id: string;
  number: string;
  source_warehouse: string;
  source_warehouse_name?: string;
  destination_warehouse: string;
  destination_warehouse_name?: string;
  status: StockTransferStatus;
  status_display?: string;
  created_date: string;
  shipped_date?: string | null;
  received_date?: string | null;
  created_by?: string;
  created_by_name?: string;
  shipped_by?: string | null;
  shipped_by_name?: string | null;
  received_by?: string | null;
  received_by_name?: string | null;
  reason: string;
  notes: string;
  items?: StockTransferItem[];
  items_count?: number;
  created_at?: string;
  updated_at?: string;
}

// ===================== Material Requirement Types =====================

/**
 * Material Requirement Status
 * Согласно ERP-требованиям: только 3 рабочих статуса
 */
export type MaterialRequirementStatus = 
  | 'waiting_order'      // Ожидает заказа
  | 'in_order'           // В заказе
  | 'closed'             // На складе
  | 'written_off';       // Списано

/**
 * Material Requirement Priority
 */
export type MaterialRequirementPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Material Requirement - потребность в материалах/комплектующих
 * Согласно ERP-требованиям: формируются автоматически из проектов
 */
export interface MaterialRequirement {
  id: string;
  nomenclature_item: string;
  nomenclature_name?: string;
  nomenclature_code?: string;
  nomenclature_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  unit?: string;
  // Связь с проектной структурой
  project?: string | null;
  project_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project_item?: string | null;
  project_item_number?: number | null;
  project_item_detail?: {
    id: string;
    full_path: string;
    parent_id?: string | null;
    parent_name?: string | null;
  } | null;
  bom_item?: string | null;
  bom_item_detail?: {
    id: string;
    path: string;
  } | null;
  // Даты согласно ERP
  calculation_date: string;
  order_by_date?: string | null;        // Заказать до
  delivery_date?: string | null;        // Срок поставки
  // Связь с поставщиком и заказом
  supplier?: string | null;
  supplier_detail?: {
    id: string;
    name: string;
  } | null;
  purchase_order?: string | null;       // Один заказ на одну потребность
  purchase_order_detail?: {
    id: string;
    number: string;
    status: string;
    status_display?: string;
  } | null;
  // Количества
  total_required: number;
  total_available: number;
  total_reserved: number;
  free_available?: number;
  total_in_order: number;
  to_order: number;
  safety_stock: number;
  lead_time_days: number;
  avg_daily_consumption: number;
  days_until_depletion?: number | null;
  reorder_date?: string | null;
  // Статус и приоритет
  status: MaterialRequirementStatus;
  status_display?: string;
  priority: MaterialRequirementPriority;
  priority_display?: string;
  // Флаг проблемы (отдельно от статуса!)
  has_problem: boolean;
  problem_reason?: string | null;
  problem_reason_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  problem_notes?: string;
  // Вычисляемые
  deficit: number;
  is_critical: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Material Requirement Summary
 */
export interface MaterialRequirementSummary {
  total_items: number;
  critical_items: number;
  high_priority_items: number;
  items_to_order: number;
  total_to_order_value: number;
  status_breakdown: Record<string, { label: string; count: number }>;
  priority_breakdown: Record<string, { label: string; count: number }>;
}

/**
 * Warehouse Summary
 */
export interface WarehouseSummary {
  total_items: number;
  low_stock_items: number;
  out_of_stock_items: number;
  total_reserved?: number;
}

/**
 * Stock Receipt Data
 */
export interface StockReceiptData {
  warehouse_id: string;
  nomenclature_item_id: string;
  quantity: number;
  unit?: string;
  batch_number?: string;
  unit_cost?: number | null;
  purchase_order_id?: string | null;
  supplier_batch_number?: string;
  expiry_date?: string | null;
  location?: string;
  notes?: string;
}

/**
 * Stock Issue Data
 */
export interface StockIssueData {
  stock_item_id: string;
  quantity: number;
  project_id?: string | null;
  project_item_id?: string | null;
  batch_id?: string | null;
  reason?: string;
  notes?: string;
}

// ===================== List Params =====================

export interface StockItemListParams extends ListParams {
  warehouse?: string;
  nomenclature_item?: string;
  category?: string;
  low_stock?: boolean;
  out_of_stock?: boolean;
}

export interface StockMovementListParams extends ListParams {
  stock_item?: string;
  warehouse?: string;
  movement_type?: StockMovementType;
  project?: string;
  date_from?: string;
  date_to?: string;
}

export interface InventoryDocumentListParams extends ListParams {
  warehouse?: string;
  status?: InventoryDocumentStatus;
  document_type?: InventoryDocumentType;
}

export interface StockTransferListParams extends ListParams {
  status?: StockTransferStatus;
  source_warehouse?: string;
  destination_warehouse?: string;
}

export interface MaterialRequirementListParams extends ListParams {
  status?: MaterialRequirementStatus;
  priority?: MaterialRequirementPriority;
  critical_only?: boolean;
  category?: string;
}

// ===================== Contractor WriteOff Types =====================

/**
 * Contractor WriteOff Status
 */
export type ContractorWriteOffStatus = 'draft' | 'confirmed' | 'cancelled';

/**
 * Contractor WriteOff Item - позиция в документе передачи подрядчику
 */
export interface ContractorWriteOffItem {
  id: string;
  writeoff: string;
  stock_item: string;
  nomenclature_name?: string;
  nomenclature_code?: string;
  unit?: string;
  quantity: number;
  notes: string;
}

/**
 * Contractor WriteOff - документ передачи материалов подрядчику
 */
export interface ContractorWriteOff {
  id: string;
  number: string;
  contractor: string;
  contractor_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  warehouse: string;
  warehouse_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project?: string | null;
  project_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project_item?: string | null;
  project_item_detail?: {
    id: string;
    name: string;
  } | null;
  status: ContractorWriteOffStatus;
  writeoff_date: string;
  transferred_by?: string | null;
  transferred_by_detail?: {
    id: string;
    username: string;
    full_name: string;
  } | null;
  notes: string;
  items?: ContractorWriteOffItem[];
  items_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ===================== Contractor Receipt Types =====================

/**
 * Contractor Receipt Status
 */
export type ContractorReceiptStatus = 'draft' | 'confirmed' | 'cancelled';

/**
 * Contractor Receipt Item - позиция в документе приёмки от подрядчика
 */
export interface ContractorReceiptItem {
  id: string;
  receipt: string;
  nomenclature_item?: string;
  nomenclature_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project_item?: string | null;
  quantity: number;
  unit: string;
  notes: string;
}

/**
 * Contractor Receipt - документ приёмки готовых изделий от подрядчика
 */
export interface ContractorReceipt {
  id: string;
  number: string;
  contractor: string;
  contractor_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  warehouse: string;
  warehouse_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project?: string | null;
  project_detail?: {
    id: string;
    code: string;
    name: string;
  } | null;
  project_item?: string | null;
  project_item_detail?: {
    id: string;
    name: string;
  } | null;
  status: ContractorReceiptStatus;
  receipt_date: string;
  received_by?: string | null;
  received_by_detail?: {
    id: string;
    username: string;
    full_name: string;
  } | null;
  notes: string;
  items?: ContractorReceiptItem[];
  items_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractorWriteOffListParams extends ListParams {
  status?: ContractorWriteOffStatus;
  warehouse?: string;
  contractor?: string;
  project?: string;
}

export interface ContractorReceiptListParams extends ListParams {
  status?: ContractorReceiptStatus;
  warehouse?: string;
  contractor?: string;
  project?: string;
}

// ===================== API Endpoints =====================

const ENDPOINTS = {
  warehouses: {
    list: '/warehouses/',
    detail: (id: string) => `/warehouses/${id}/`,
    summary: (id: string) => `/warehouses/${id}/stock_summary/`,
  },
  stockItems: {
    list: '/stock-items/',
    detail: (id: string) => `/stock-items/${id}/`,
    receive: '/stock-items/receive/',
    issue: '/stock-items/issue/',
    distributeToProjects: (id: string) => `/stock-items/${id}/distribute_to_projects/`,
    movements: (id: string) => `/stock-items/${id}/movements/`,
    batches: (id: string) => `/stock-items/${id}/batches/`,
  },
  stockBatches: {
    list: '/stock-batches/',
    detail: (id: string) => `/stock-batches/${id}/`,
  },
  stockMovements: {
    list: '/stock-movements/',
    detail: (id: string) => `/stock-movements/${id}/`,
  },
  stockReservations: {
    list: '/stock-reservations/',
    detail: (id: string) => `/stock-reservations/${id}/`,
    confirm: (id: string) => `/stock-reservations/${id}/confirm/`,
    cancel: (id: string) => `/stock-reservations/${id}/cancel/`,
  },
  inventoryDocuments: {
    list: '/inventory-documents/',
    detail: (id: string) => `/inventory-documents/${id}/`,
    start: (id: string) => `/inventory-documents/${id}/start/`,
    complete: (id: string) => `/inventory-documents/${id}/complete/`,
    cancel: (id: string) => `/inventory-documents/${id}/cancel/`,
  },
  inventoryItems: {
    list: '/inventory-items/',
    detail: (id: string) => `/inventory-items/${id}/`,
  },
  stockTransfers: {
    list: '/stock-transfers/',
    detail: (id: string) => `/stock-transfers/${id}/`,
    addItem: (id: string) => `/stock-transfers/${id}/add_item/`,
    removeItem: (id: string) => `/stock-transfers/${id}/remove_item/`,
    submit: (id: string) => `/stock-transfers/${id}/submit/`,
    ship: (id: string) => `/stock-transfers/${id}/ship/`,
    receive: (id: string) => `/stock-transfers/${id}/receive/`,
    cancel: (id: string) => `/stock-transfers/${id}/cancel/`,
    createForDeletion: '/stock-transfers/create_for_warehouse_deletion/',
  },
  materialRequirements: {
    list: '/material-requirements/',
    detail: (id: string) => `/material-requirements/${id}/`,
    calculate: '/material-requirements/calculate/',
    syncFromProjects: '/material-requirements/sync_from_projects/',
    availableForOrder: '/material-requirements/available_for_order/',
    summary: '/material-requirements/summary/',
    createPurchaseOrder: (id: string) => `/material-requirements/${id}/create_purchase_order/`,
    distributeExcess: '/material-requirements/distribute_excess/',
  },
  contractorWriteoffs: {
    list: '/contractor-writeoffs/',
    detail: (id: string) => `/contractor-writeoffs/${id}/`,
    confirm: (id: string) => `/contractor-writeoffs/${id}/confirm/`,
    cancel: (id: string) => `/contractor-writeoffs/${id}/cancel/`,
  },
  contractorWriteoffItems: {
    list: '/contractor-writeoff-items/',
    detail: (id: string) => `/contractor-writeoff-items/${id}/`,
  },
  contractorReceipts: {
    list: '/contractor-receipts/',
    detail: (id: string) => `/contractor-receipts/${id}/`,
    confirm: (id: string) => `/contractor-receipts/${id}/confirm/`,
    cancel: (id: string) => `/contractor-receipts/${id}/cancel/`,
  },
  contractorReceiptItems: {
    list: '/contractor-receipt-items/',
    detail: (id: string) => `/contractor-receipt-items/${id}/`,
  },
};

// ===================== API Client =====================

export const warehouseApi = {
  // ===================== Warehouses =====================
  warehouses: {
    list: async (params?: ListParams & { is_active?: boolean }): Promise<PaginatedResponse<Warehouse>> => {
      return api.get<PaginatedResponse<Warehouse>>(ENDPOINTS.warehouses.list, { params });
    },

    get: async (id: string): Promise<Warehouse> => {
      return api.get<Warehouse>(ENDPOINTS.warehouses.detail(id));
    },

    create: async (data: Partial<Warehouse>): Promise<Warehouse> => {
      return api.post<Warehouse>(ENDPOINTS.warehouses.list, data);
    },

    update: async (id: string, data: Partial<Warehouse>): Promise<Warehouse> => {
      return api.patch<Warehouse>(ENDPOINTS.warehouses.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.warehouses.detail(id));
    },

    summary: async (id: string): Promise<WarehouseSummary> => {
      return api.get<WarehouseSummary>(ENDPOINTS.warehouses.summary(id));
    },
  },

  // ===================== Stock Items =====================
  stockItems: {
    list: async (params?: StockItemListParams): Promise<PaginatedResponse<StockItem>> => {
      return api.get<PaginatedResponse<StockItem>>(ENDPOINTS.stockItems.list, { params });
    },

    get: async (id: string): Promise<StockItem> => {
      return api.get<StockItem>(ENDPOINTS.stockItems.detail(id));
    },

    create: async (data: Partial<StockItem>): Promise<StockItem> => {
      return api.post<StockItem>(ENDPOINTS.stockItems.list, data);
    },

    update: async (id: string, data: Partial<StockItem>): Promise<StockItem> => {
      return api.patch<StockItem>(ENDPOINTS.stockItems.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.stockItems.detail(id));
    },

    // Receive stock into warehouse
    receive: async (data: StockReceiptData): Promise<{id: string; quantity: number; batch_id: string | null; movement_id: string}> => {
      return api.post<{id: string; quantity: number; batch_id: string | null; movement_id: string}>(
        ENDPOINTS.stockItems.receive, 
        data
      );
    },

    // Issue stock from warehouse
    issue: async (data: StockIssueData): Promise<{id: string; quantity: number; movement_id: string}> => {
      return api.post<{id: string; quantity: number; movement_id: string}>(
        ENDPOINTS.stockItems.issue, 
        data
      );
    },

    // Get movement history for stock item
    movements: async (id: string): Promise<StockMovement[]> => {
      return api.get<StockMovement[]>(ENDPOINTS.stockItems.movements(id));
    },

    // Get active batches for stock item
    batches: async (id: string, hasStock?: boolean): Promise<StockBatch[]> => {
      return api.get<StockBatch[]>(ENDPOINTS.stockItems.batches(id), {
        params: hasStock !== undefined ? { has_stock: hasStock } : undefined,
      });
    },

    distributeToProjects: async (id: string, data: {
      project_ids?: string[];
      quantity?: number;
    }): Promise<{ allocated: Array<{ requirement_id: string; allocated_quantity: number }>; remaining: number }> => {
      return api.post(ENDPOINTS.stockItems.distributeToProjects(id), data);
    },
  },

  // ===================== Stock Batches =====================
  stockBatches: {
    list: async (params?: ListParams & { stock_item?: string; has_stock?: boolean; is_active?: boolean }): Promise<PaginatedResponse<StockBatch>> => {
      return api.get<PaginatedResponse<StockBatch>>(ENDPOINTS.stockBatches.list, { params });
    },

    get: async (id: string): Promise<StockBatch> => {
      return api.get<StockBatch>(ENDPOINTS.stockBatches.detail(id));
    },

    update: async (id: string, data: Partial<StockBatch>): Promise<StockBatch> => {
      return api.patch<StockBatch>(ENDPOINTS.stockBatches.detail(id), data);
    },
  },

  // ===================== Stock Movements =====================
  stockMovements: {
    list: async (params?: StockMovementListParams): Promise<PaginatedResponse<StockMovement>> => {
      return api.get<PaginatedResponse<StockMovement>>(ENDPOINTS.stockMovements.list, { params });
    },

    get: async (id: string): Promise<StockMovement> => {
      return api.get<StockMovement>(ENDPOINTS.stockMovements.detail(id));
    },

    create: async (data: Partial<StockMovement>): Promise<StockMovement> => {
      return api.post<StockMovement>(ENDPOINTS.stockMovements.list, data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.stockMovements.detail(id));
    },
  },

  // ===================== Stock Reservations =====================
  stockReservations: {
    list: async (params?: ListParams & { stock_item?: string; project?: string; status?: StockReservationStatus }): Promise<PaginatedResponse<StockReservation>> => {
      return api.get<PaginatedResponse<StockReservation>>(ENDPOINTS.stockReservations.list, { params });
    },

    get: async (id: string): Promise<StockReservation> => {
      return api.get<StockReservation>(ENDPOINTS.stockReservations.detail(id));
    },

    create: async (data: Partial<StockReservation>): Promise<StockReservation> => {
      return api.post<StockReservation>(ENDPOINTS.stockReservations.list, data);
    },

    update: async (id: string, data: Partial<StockReservation>): Promise<StockReservation> => {
      return api.patch<StockReservation>(ENDPOINTS.stockReservations.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.stockReservations.detail(id));
    },

    confirm: async (id: string): Promise<{status: string}> => {
      return api.post<{status: string}>(ENDPOINTS.stockReservations.confirm(id));
    },

    cancel: async (id: string): Promise<{status: string}> => {
      return api.post<{status: string}>(ENDPOINTS.stockReservations.cancel(id));
    },
  },

  // ===================== Inventory Documents =====================
  inventoryDocuments: {
    list: async (params?: InventoryDocumentListParams): Promise<PaginatedResponse<InventoryDocument>> => {
      return api.get<PaginatedResponse<InventoryDocument>>(ENDPOINTS.inventoryDocuments.list, { params });
    },

    get: async (id: string): Promise<InventoryDocument> => {
      return api.get<InventoryDocument>(ENDPOINTS.inventoryDocuments.detail(id));
    },

    create: async (data: Partial<InventoryDocument>): Promise<InventoryDocument> => {
      return api.post<InventoryDocument>(ENDPOINTS.inventoryDocuments.list, data);
    },

    update: async (id: string, data: Partial<InventoryDocument>): Promise<InventoryDocument> => {
      return api.patch<InventoryDocument>(ENDPOINTS.inventoryDocuments.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.inventoryDocuments.detail(id));
    },

    // Start inventory count - generate items from current stock
    start: async (id: string): Promise<{status: string; items_count: number}> => {
      return api.post<{status: string; items_count: number}>(ENDPOINTS.inventoryDocuments.start(id));
    },

    // Complete inventory and apply adjustments
    complete: async (id: string): Promise<{status: string; actual_date: string}> => {
      return api.post<{status: string; actual_date: string}>(ENDPOINTS.inventoryDocuments.complete(id));
    },

    cancel: async (id: string): Promise<{status: string}> => {
      return api.post<{status: string}>(ENDPOINTS.inventoryDocuments.cancel(id));
    },
  },

  // ===================== Inventory Items =====================
  inventoryItems: {
    list: async (params?: ListParams & { document?: string; is_counted?: boolean; has_difference?: boolean }): Promise<PaginatedResponse<InventoryItem>> => {
      return api.get<PaginatedResponse<InventoryItem>>(ENDPOINTS.inventoryItems.list, { params });
    },

    get: async (id: string): Promise<InventoryItem> => {
      return api.get<InventoryItem>(ENDPOINTS.inventoryItems.detail(id));
    },

    updateCount: async (id: string, data: { actual_quantity: number; notes?: string }): Promise<InventoryItem> => {
      return api.patch<InventoryItem>(ENDPOINTS.inventoryItems.detail(id), data);
    },
  },

  // ===================== Stock Transfers =====================
  stockTransfers: {
    list: async (params?: StockTransferListParams): Promise<PaginatedResponse<StockTransfer>> => {
      return api.get<PaginatedResponse<StockTransfer>>(ENDPOINTS.stockTransfers.list, { params });
    },

    get: async (id: string): Promise<StockTransfer> => {
      return api.get<StockTransfer>(ENDPOINTS.stockTransfers.detail(id));
    },

    create: async (data: {
      source_warehouse: string;
      destination_warehouse: string;
      reason?: string;
      notes?: string;
    }): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.list, data);
    },

    update: async (id: string, data: Partial<StockTransfer>): Promise<StockTransfer> => {
      return api.patch<StockTransfer>(ENDPOINTS.stockTransfers.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.stockTransfers.detail(id));
    },

    addItem: async (id: string, data: {
      stock_item_id: string;
      quantity: number;
      notes?: string;
    }): Promise<StockTransferItem> => {
      return api.post<StockTransferItem>(ENDPOINTS.stockTransfers.addItem(id), data);
    },

    removeItem: async (id: string, itemId: string): Promise<void> => {
      return api.post<void>(ENDPOINTS.stockTransfers.removeItem(id), { item_id: itemId });
    },

    submit: async (id: string): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.submit(id));
    },

    ship: async (id: string): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.ship(id));
    },

    receive: async (id: string): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.receive(id));
    },

    cancel: async (id: string): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.cancel(id));
    },

    createForWarehouseDeletion: async (
      sourceWarehouseId: string, 
      destinationWarehouseId: string
    ): Promise<StockTransfer> => {
      return api.post<StockTransfer>(ENDPOINTS.stockTransfers.createForDeletion, {
        source_warehouse_id: sourceWarehouseId,
        destination_warehouse_id: destinationWarehouseId,
      });
    },
  },

  // ===================== Material Requirements =====================
  materialRequirements: {
    list: async (params?: MaterialRequirementListParams): Promise<PaginatedResponse<MaterialRequirement>> => {
      return api.get<PaginatedResponse<MaterialRequirement>>(ENDPOINTS.materialRequirements.list, { params });
    },

    get: async (id: string): Promise<MaterialRequirement> => {
      return api.get<MaterialRequirement>(ENDPOINTS.materialRequirements.detail(id));
    },

    update: async (id: string, data: Partial<MaterialRequirement>): Promise<MaterialRequirement> => {
      return api.patch<MaterialRequirement>(ENDPOINTS.materialRequirements.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.materialRequirements.detail(id));
    },

    calculate: async (data?: {
      nomenclature_item_ids?: string[];
      recalculate_all?: boolean;
    }): Promise<{ calculated_count: number; results: MaterialRequirement[] }> => {
      return api.post<{ calculated_count: number; results: MaterialRequirement[] }>(
        ENDPOINTS.materialRequirements.calculate,
        data || {}
      );
    },

    syncFromProjects: async (): Promise<{ synced_count: number; results: MaterialRequirement[] }> => {
      return api.post<{ synced_count: number; results: MaterialRequirement[] }>(
        ENDPOINTS.materialRequirements.syncFromProjects,
        {}
      );
    },

    availableForOrder: async (params: { 
      supplier: string; 
      project?: string; 
      search?: string 
    }): Promise<{ count: number; results: MaterialRequirement[] }> => {
      return api.get<{ count: number; results: MaterialRequirement[] }>(
        ENDPOINTS.materialRequirements.availableForOrder,
        { params }
      );
    },

    summary: async (): Promise<MaterialRequirementSummary> => {
      return api.get<MaterialRequirementSummary>(ENDPOINTS.materialRequirements.summary);
    },

    createPurchaseOrder: async (id: string, supplierId?: string): Promise<{
      purchase_order_id: string;
      purchase_order_number: string;
      message: string;
    }> => {
      return api.post<{
        purchase_order_id: string;
        purchase_order_number: string;
        message: string;
      }>(ENDPOINTS.materialRequirements.createPurchaseOrder(id), {
        supplier_id: supplierId,
      });
    },

    distributeExcess: async (data: {
      order_id: string;
      nomenclature_item_id: string;
      exclude_requirement_id?: string | null;
      project_ids?: string[];
      excess_quantity: number;
    }): Promise<{ allocated: Array<{ requirement_id: string; allocated_quantity: number }>; remaining: number }> => {
      return api.post(ENDPOINTS.materialRequirements.distributeExcess, data);
    },
  },

  // ===================== Contractor WriteOffs =====================
  contractorWriteoffs: {
    list: async (params?: ContractorWriteOffListParams): Promise<PaginatedResponse<ContractorWriteOff>> => {
      return api.get<PaginatedResponse<ContractorWriteOff>>(ENDPOINTS.contractorWriteoffs.list, { params });
    },

    get: async (id: string): Promise<ContractorWriteOff> => {
      return api.get<ContractorWriteOff>(ENDPOINTS.contractorWriteoffs.detail(id));
    },

    create: async (data: Partial<ContractorWriteOff>): Promise<ContractorWriteOff> => {
      return api.post<ContractorWriteOff>(ENDPOINTS.contractorWriteoffs.list, data);
    },

    update: async (id: string, data: Partial<ContractorWriteOff>): Promise<ContractorWriteOff> => {
      return api.patch<ContractorWriteOff>(ENDPOINTS.contractorWriteoffs.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.contractorWriteoffs.detail(id));
    },

    confirm: async (id: string): Promise<ContractorWriteOff> => {
      return api.post<ContractorWriteOff>(ENDPOINTS.contractorWriteoffs.confirm(id));
    },

    cancel: async (id: string): Promise<ContractorWriteOff> => {
      return api.post<ContractorWriteOff>(ENDPOINTS.contractorWriteoffs.cancel(id));
    },
  },

  // ===================== Contractor WriteOff Items =====================
  contractorWriteoffItems: {
    list: async (params?: ListParams & { writeoff?: string }): Promise<PaginatedResponse<ContractorWriteOffItem>> => {
      return api.get<PaginatedResponse<ContractorWriteOffItem>>(ENDPOINTS.contractorWriteoffItems.list, { params });
    },

    create: async (data: Partial<ContractorWriteOffItem>): Promise<ContractorWriteOffItem> => {
      return api.post<ContractorWriteOffItem>(ENDPOINTS.contractorWriteoffItems.list, data);
    },

    update: async (id: string, data: Partial<ContractorWriteOffItem>): Promise<ContractorWriteOffItem> => {
      return api.patch<ContractorWriteOffItem>(ENDPOINTS.contractorWriteoffItems.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.contractorWriteoffItems.detail(id));
    },
  },

  // ===================== Contractor Receipts =====================
  contractorReceipts: {
    list: async (params?: ContractorReceiptListParams): Promise<PaginatedResponse<ContractorReceipt>> => {
      return api.get<PaginatedResponse<ContractorReceipt>>(ENDPOINTS.contractorReceipts.list, { params });
    },

    get: async (id: string): Promise<ContractorReceipt> => {
      return api.get<ContractorReceipt>(ENDPOINTS.contractorReceipts.detail(id));
    },

    create: async (data: Partial<ContractorReceipt>): Promise<ContractorReceipt> => {
      return api.post<ContractorReceipt>(ENDPOINTS.contractorReceipts.list, data);
    },

    update: async (id: string, data: Partial<ContractorReceipt>): Promise<ContractorReceipt> => {
      return api.patch<ContractorReceipt>(ENDPOINTS.contractorReceipts.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.contractorReceipts.detail(id));
    },

    confirm: async (id: string): Promise<ContractorReceipt> => {
      return api.post<ContractorReceipt>(ENDPOINTS.contractorReceipts.confirm(id));
    },

    cancel: async (id: string): Promise<ContractorReceipt> => {
      return api.post<ContractorReceipt>(ENDPOINTS.contractorReceipts.cancel(id));
    },
  },

  // ===================== Contractor Receipt Items =====================
  contractorReceiptItems: {
    list: async (params?: ListParams & { receipt?: string }): Promise<PaginatedResponse<ContractorReceiptItem>> => {
      return api.get<PaginatedResponse<ContractorReceiptItem>>(ENDPOINTS.contractorReceiptItems.list, { params });
    },

    create: async (data: Partial<ContractorReceiptItem>): Promise<ContractorReceiptItem> => {
      return api.post<ContractorReceiptItem>(ENDPOINTS.contractorReceiptItems.list, data);
    },

    update: async (id: string, data: Partial<ContractorReceiptItem>): Promise<ContractorReceiptItem> => {
      return api.patch<ContractorReceiptItem>(ENDPOINTS.contractorReceiptItems.detail(id), data);
    },

    delete: async (id: string): Promise<void> => {
      return api.delete<void>(ENDPOINTS.contractorReceiptItems.detail(id));
    },
  },
};
