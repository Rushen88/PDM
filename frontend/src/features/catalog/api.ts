import { api, endpoints } from '../../shared/api';
import type { ListParams, PaginatedResponse } from '../../shared/api/types';

// ============================================================================
// Виды справочников (CatalogCategory)
// ============================================================================

/**
 * Вид справочника номенклатуры
 */
export interface CatalogCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  is_purchased: boolean;
  sort_order: number;
  is_active: boolean;
  allowed_children?: CatalogCategory[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Типы номенклатуры (NomenclatureType)
// ============================================================================

/**
 * Тип номенклатуры (только для закупаемых позиций)
 */
export interface NomenclatureType {
  id: string;
  catalog_category: string;
  catalog_category_name?: string;
  name: string;
  description: string;
  default_unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Контактные лица (ContactPerson)
// ============================================================================

/**
 * Контактное лицо
 */
export interface ContactPerson {
  id: string;
  supplier?: string;
  contractor?: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  full_name: string;
  position: string;
  phone: string;
  mobile_phone: string;
  email: string;
  is_primary: boolean;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Поставщики (Supplier)
// ============================================================================

/**
 * Поставщик
 */
export interface Supplier {
  id: string;
  name: string;
  full_name: string;
  short_name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  phone: string;
  email: string;
  payment_terms: string;
  default_delivery_days: number;
  contacts?: ContactPerson[];
  primary_contact?: string;
  rating: number | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Подрядчики (Contractor)
// ============================================================================

/**
 * Подрядчик
 */
export interface Contractor {
  id: string;
  name: string;
  full_name: string;
  short_name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  phone: string;
  email: string;
  specialization: string;
  certifications: string[];
  contract_number: string;
  contract_date: string | null;
  default_lead_time_days: number;
  contacts?: ContactPerson[];
  primary_contact?: string;
  rating: number | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Связь номенклатуры с поставщиком (NomenclatureSupplier)
// ============================================================================

/**
 * Связь номенклатуры с поставщиком
 */
export interface NomenclatureSupplier {
  id: string;
  nomenclature_item: string;
  supplier: string;
  supplier_name?: string;
  supplier_short_name?: string;
  delivery_days: number;
  supplier_article: string;
  price: number | null;
  currency: string;
  min_order_qty: number | null;
  is_primary: boolean;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Номенклатура (NomenclatureItem)
// ============================================================================

/**
 * Номенклатурная позиция
 */
export interface Nomenclature {
  id: string;
  code: string;
  name: string;
  catalog_category: string;
  catalog_category_name?: string;
  catalog_category_detail?: CatalogCategory;
  nomenclature_type: string | null;
  nomenclature_type_name?: string;
  nomenclature_type_detail?: NomenclatureType;
  drawing_number: string;
  description: string;
  specifications: string;
  unit: string;
  item_suppliers?: NomenclatureSupplier[];
  is_purchased: boolean;
  is_manufactured: boolean;
  has_bom?: boolean;
  bom_id?: string | null;
  primary_supplier_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Импорт номенклатуры из Excel
// ============================================================================

export interface NomenclatureImportError {
  row: number;
  column: string;
  message: string;
}

export interface NomenclatureImportRow {
  row: number;
  catalog_category: string | null;
  catalog_category_name: string;
  is_purchased: boolean | null;
  name: string;
  drawing_number: string;
  unit: string;
  description: string;
  specifications: string;
  nomenclature_type: string | null;
  nomenclature_type_name: string;
  can_import: boolean;
  row_errors: NomenclatureImportError[];
}

export interface NomenclatureImportSummary {
  total_rows: number;
  parsed_rows: number;
  valid_rows: number;
  error_rows: number;
  errors_count: number;
}

export interface NomenclatureImportPreviewResponse {
  rows: NomenclatureImportRow[];
  errors: NomenclatureImportError[];
  summary: NomenclatureImportSummary;
}

export interface NomenclatureImportConfirmResponse {
  created: number;
  created_ids: string[];
}

// ============================================================================
// Причины задержек (DelayReason)
// ============================================================================

/**
 * Причина задержки
 */
export interface DelayReason {
  id: string;
  name: string;
  description: string;
  applies_to_procurement: boolean;
  applies_to_production: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Банковские реквизиты (BankDetails)
// ============================================================================

export type Currency = 'RUB' | 'USD' | 'EUR' | 'CNY';

/**
 * Банковские реквизиты
 */
export interface BankDetails {
  id: string;
  supplier?: string;
  supplier_name?: string;
  contractor?: string;
  contractor_name?: string;
  bank_name: string;
  bik: string;
  correspondent_account: string;
  settlement_account: string;
  currency: Currency;
  currency_display?: string;
  is_primary: boolean;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Параметры запросов
// ============================================================================

export interface NomenclatureListParams extends ListParams {
  catalog_category?: string;
  nomenclature_type?: string;
  nomenclature_type_isnull?: boolean;
  is_active?: boolean;
  has_bom?: boolean;
  is_purchased?: boolean;
  unit?: string;
  primary_supplier?: string;
}

export interface SupplierListParams extends ListParams {
  is_active?: boolean;
  rating?: number;
}

export interface ContractorListParams extends ListParams {
  is_active?: boolean;
  rating?: number;
  specialization?: string;
}

// ============================================================================
// Catalog API
// ============================================================================

export const catalogApi = {
  // -------------------------------------------------------------------------
  // Виды справочников
  // -------------------------------------------------------------------------
  categories: {
    list: async (): Promise<CatalogCategory[]> => {
      const response = await api.get<PaginatedResponse<CatalogCategory>>(endpoints.catalog.categories.list);
      return response.results;
    },
    
    get: async (id: string): Promise<CatalogCategory> => {
      return api.get<CatalogCategory>(endpoints.catalog.categories.detail(id));
    },
    
    create: async (data: Partial<CatalogCategory>): Promise<CatalogCategory> => {
      return api.post<CatalogCategory>(endpoints.catalog.categories.list, data);
    },
    
    update: async (id: string, data: Partial<CatalogCategory>): Promise<CatalogCategory> => {
      return api.patch<CatalogCategory>(endpoints.catalog.categories.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.categories.detail(id));
    },
    
    purchased: async (): Promise<CatalogCategory[]> => {
      return api.get<CatalogCategory[]>(endpoints.catalog.categories.purchased);
    },
    
    manufactured: async (): Promise<CatalogCategory[]> => {
      return api.get<CatalogCategory[]>(endpoints.catalog.categories.manufactured);
    },
  },

  // -------------------------------------------------------------------------
  // Типы номенклатуры
  // -------------------------------------------------------------------------
  nomenclatureTypes: {
    list: async (categoryId?: string): Promise<NomenclatureType[]> => {
      const params = categoryId ? { catalog_category: categoryId } : undefined;
      const response = await api.get<PaginatedResponse<NomenclatureType>>(
        endpoints.catalog.nomenclature.types,
        { params }
      );
      return response.results;
    },
    
    get: async (id: string): Promise<NomenclatureType> => {
      return api.get<NomenclatureType>(endpoints.catalog.nomenclature.typeDetail(id));
    },
    
    create: async (data: Partial<NomenclatureType>): Promise<NomenclatureType> => {
      return api.post<NomenclatureType>(endpoints.catalog.nomenclature.types, data);
    },
    
    update: async (id: string, data: Partial<NomenclatureType>): Promise<NomenclatureType> => {
      return api.patch<NomenclatureType>(endpoints.catalog.nomenclature.typeDetail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.nomenclature.typeDetail(id));
    },
  },

  // -------------------------------------------------------------------------
  // Номенклатура
  // -------------------------------------------------------------------------
  nomenclature: {
    list: async (params?: NomenclatureListParams): Promise<PaginatedResponse<Nomenclature>> => {
      return api.get<PaginatedResponse<Nomenclature>>(endpoints.catalog.nomenclature.list, { params });
    },
    
    get: async (id: string): Promise<Nomenclature> => {
      return api.get<Nomenclature>(endpoints.catalog.nomenclature.detail(id));
    },
    
    create: async (data: Partial<Nomenclature>): Promise<Nomenclature> => {
      return api.post<Nomenclature>(endpoints.catalog.nomenclature.list, data);
    },
    
    update: async (id: string, data: Partial<Nomenclature>): Promise<Nomenclature> => {
      return api.patch<Nomenclature>(endpoints.catalog.nomenclature.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.nomenclature.detail(id));
    },
    
    getSuppliers: async (id: string): Promise<NomenclatureSupplier[]> => {
      return api.get<NomenclatureSupplier[]>(endpoints.catalog.nomenclature.suppliers(id));
    },
    
    addSupplier: async (id: string, data: Partial<NomenclatureSupplier>): Promise<NomenclatureSupplier> => {
      return api.post<NomenclatureSupplier>(endpoints.catalog.nomenclature.suppliers(id), data);
    },
    
    removeSupplier: async (nomenclatureId: string, supplierId: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.nomenclature.suppliers(nomenclatureId), {
        data: { supplier_id: supplierId }
      });
    },

    importExcelPreview: async (file: File): Promise<NomenclatureImportPreviewResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post<NomenclatureImportPreviewResponse>(
        endpoints.catalog.nomenclature.importExcelPreview,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    },

    importExcelConfirm: async (file: File): Promise<NomenclatureImportConfirmResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post<NomenclatureImportConfirmResponse>(
        endpoints.catalog.nomenclature.importExcelConfirm,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    },
  },

  // -------------------------------------------------------------------------
  // Связи номенклатуры с поставщиками
  // -------------------------------------------------------------------------
  nomenclatureSuppliers: {
    list: async (params?: { nomenclature_item?: string; supplier?: string }): Promise<PaginatedResponse<NomenclatureSupplier>> => {
      return api.get<PaginatedResponse<NomenclatureSupplier>>(endpoints.catalog.nomenclatureSuppliers.list, { params });
    },
    
    create: async (data: Partial<NomenclatureSupplier>): Promise<NomenclatureSupplier> => {
      return api.post<NomenclatureSupplier>(endpoints.catalog.nomenclatureSuppliers.list, data);
    },
    
    update: async (id: string, data: Partial<NomenclatureSupplier>): Promise<NomenclatureSupplier> => {
      return api.patch<NomenclatureSupplier>(endpoints.catalog.nomenclatureSuppliers.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.nomenclatureSuppliers.detail(id));
    },
  },

  // -------------------------------------------------------------------------
  // Поставщики
  // -------------------------------------------------------------------------
  suppliers: {
    list: async (params?: SupplierListParams): Promise<PaginatedResponse<Supplier>> => {
      return api.get<PaginatedResponse<Supplier>>(endpoints.catalog.suppliers.list, { params });
    },
    
    get: async (id: string): Promise<Supplier> => {
      return api.get<Supplier>(endpoints.catalog.suppliers.detail(id));
    },
    
    create: async (data: Partial<Supplier>): Promise<Supplier> => {
      return api.post<Supplier>(endpoints.catalog.suppliers.list, data);
    },
    
    update: async (id: string, data: Partial<Supplier>): Promise<Supplier> => {
      return api.patch<Supplier>(endpoints.catalog.suppliers.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.suppliers.detail(id));
    },
    
    getContacts: async (id: string): Promise<ContactPerson[]> => {
      return api.get<ContactPerson[]>(endpoints.catalog.suppliers.contacts(id));
    },
    
    addContact: async (supplierId: string, data: Partial<ContactPerson>): Promise<ContactPerson> => {
      return api.post<ContactPerson>(endpoints.catalog.suppliers.contacts(supplierId), data);
    },
    
    removeContact: async (supplierId: string, contactId: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.suppliers.contacts(supplierId), {
        data: { contact_id: contactId }
      });
    },
    
    getNomenclature: async (id: string): Promise<Nomenclature[]> => {
      return api.get<Nomenclature[]>(endpoints.catalog.suppliers.nomenclature(id));
    },
  },

  // -------------------------------------------------------------------------
  // Подрядчики
  // -------------------------------------------------------------------------
  contractors: {
    list: async (params?: ContractorListParams): Promise<PaginatedResponse<Contractor>> => {
      return api.get<PaginatedResponse<Contractor>>(endpoints.catalog.contractors.list, { params });
    },
    
    get: async (id: string): Promise<Contractor> => {
      return api.get<Contractor>(endpoints.catalog.contractors.detail(id));
    },
    
    create: async (data: Partial<Contractor>): Promise<Contractor> => {
      return api.post<Contractor>(endpoints.catalog.contractors.list, data);
    },
    
    update: async (id: string, data: Partial<Contractor>): Promise<Contractor> => {
      return api.patch<Contractor>(endpoints.catalog.contractors.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.contractors.detail(id));
    },
    
    getContacts: async (id: string): Promise<ContactPerson[]> => {
      return api.get<ContactPerson[]>(endpoints.catalog.contractors.contacts(id));
    },
    
    addContact: async (contractorId: string, data: Partial<ContactPerson>): Promise<ContactPerson> => {
      return api.post<ContactPerson>(endpoints.catalog.contractors.contacts(contractorId), data);
    },
    
    removeContact: async (contractorId: string, contactId: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.contractors.contacts(contractorId), {
        data: { contact_id: contactId }
      });
    },
  },

  // -------------------------------------------------------------------------
  // Контактные лица
  // -------------------------------------------------------------------------
  contactPersons: {
    list: async (params?: { supplier?: string; contractor?: string }): Promise<PaginatedResponse<ContactPerson>> => {
      return api.get<PaginatedResponse<ContactPerson>>(endpoints.catalog.contactPersons.list, { params });
    },
    
    get: async (id: string): Promise<ContactPerson> => {
      return api.get<ContactPerson>(endpoints.catalog.contactPersons.detail(id));
    },
    
    create: async (data: Partial<ContactPerson>): Promise<ContactPerson> => {
      return api.post<ContactPerson>(endpoints.catalog.contactPersons.list, data);
    },
    
    update: async (id: string, data: Partial<ContactPerson>): Promise<ContactPerson> => {
      return api.patch<ContactPerson>(endpoints.catalog.contactPersons.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.contactPersons.detail(id));
    },
  },

  // -------------------------------------------------------------------------
  // Банковские реквизиты
  // -------------------------------------------------------------------------
  bankDetails: {
    list: async (params?: { supplier?: string; contractor?: string }): Promise<PaginatedResponse<BankDetails>> => {
      return api.get<PaginatedResponse<BankDetails>>(endpoints.catalog.bankDetails.list, { params });
    },
    
    get: async (id: string): Promise<BankDetails> => {
      return api.get<BankDetails>(endpoints.catalog.bankDetails.detail(id));
    },
    
    create: async (data: Partial<BankDetails>): Promise<BankDetails> => {
      return api.post<BankDetails>(endpoints.catalog.bankDetails.list, data);
    },
    
    update: async (id: string, data: Partial<BankDetails>): Promise<BankDetails> => {
      return api.patch<BankDetails>(endpoints.catalog.bankDetails.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.bankDetails.detail(id));
    },
    
    bySupplier: async (supplierId: string): Promise<BankDetails[]> => {
      return api.get<BankDetails[]>(endpoints.catalog.bankDetails.bySupplier(supplierId));
    },
    
    byContractor: async (contractorId: string): Promise<BankDetails[]> => {
      return api.get<BankDetails[]>(endpoints.catalog.bankDetails.byContractor(contractorId));
    },
    
    setPrimary: async (id: string): Promise<BankDetails> => {
      return api.post<BankDetails>(endpoints.catalog.bankDetails.setPrimary(id), {});
    },
  },

  // -------------------------------------------------------------------------
  // Причины задержек
  // -------------------------------------------------------------------------
  delayReasons: {
    list: async (): Promise<DelayReason[]> => {
      const response = await api.get<PaginatedResponse<DelayReason>>(endpoints.catalog.delayReasons.list);
      return response.results;
    },
    
    get: async (id: string): Promise<DelayReason> => {
      return api.get<DelayReason>(endpoints.catalog.delayReasons.detail(id));
    },
    
    create: async (data: Partial<DelayReason>): Promise<DelayReason> => {
      return api.post<DelayReason>(endpoints.catalog.delayReasons.list, data);
    },
    
    update: async (id: string, data: Partial<DelayReason>): Promise<DelayReason> => {
      return api.patch<DelayReason>(endpoints.catalog.delayReasons.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.catalog.delayReasons.detail(id));
    },
  },
};
