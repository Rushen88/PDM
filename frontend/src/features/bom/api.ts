import { api, endpoints } from '../../shared/api';
import type { ListParams, PaginatedResponse } from '../../shared/api/types';
import type { Nomenclature } from '../catalog/api';

/**
 * BOM Structure (Bill of Materials)
 */
export interface BOMStructure {
  id: string;
  root_item: string;
  root_item_detail: Nomenclature | null;
  root_category: string;
  root_category_display: string;
  name: string;
  description: string;
  current_version: number;
  is_active: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  items_count?: number;
}

/**
 * BOM Item (component in BOM)
 */
export interface BOMItem {
  id: string;
  bom: string;
  parent_item: string | null;
  parent_item_detail: Nomenclature | null;
  child_item: string;
  child_item_detail: Nomenclature | null;
  child_category: string;
  child_category_display: string;
  quantity: number;
  unit: string;
  position: number;
  drawing_number_override: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: BOMItem[];
}

/**
 * BOM Tree (ответ /bom/{id}/tree/)
 *
 * Backend возвращает BOMStructureTreeSerializer, где поле `tree` — массив узлов.
 */
export interface BOMTreeItem {
  id: string;
  child_item: Pick<Nomenclature, 'id' | 'code' | 'name' | 'unit' | 'catalog_category' | 'catalog_category_name'>;
  quantity: number | string;
  unit: string;
  position: number;
  notes: string;
  level: number;
  children: BOMTreeItem[];
}

export interface BOMStructureTree {
  id: string;
  name: string;
  root_item: string;
  root_item_detail: Nomenclature | null;
  root_category: string;
  root_category_display: string;
  current_version: number;
  tree: BOMTreeItem[];
}

/**
 * BOM list params
 */
export interface BOMListParams extends ListParams {
  nomenclature?: string;
  root_item?: string;
  status?: string;
  is_active?: boolean;
}

/**
 * BOM API
 */
export const bomApi = {
  // BOM Structures
  structures: {
    list: async (params?: BOMListParams): Promise<PaginatedResponse<BOMStructure>> => {
      return api.get<PaginatedResponse<BOMStructure>>(endpoints.bom.structures.list, { params });
    },
    
    get: async (id: string): Promise<BOMStructure> => {
      return api.get<BOMStructure>(endpoints.bom.structures.detail(id));
    },
    
    getTree: async (id: string): Promise<BOMStructureTree> => {
      return api.get<BOMStructureTree>(endpoints.bom.structures.tree(id));
    },
    
    create: async (data: Partial<BOMStructure>): Promise<BOMStructure> => {
      return api.post<BOMStructure>(endpoints.bom.structures.list, data);
    },
    
    update: async (id: string, data: Partial<BOMStructure>): Promise<BOMStructure> => {
      return api.patch<BOMStructure>(endpoints.bom.structures.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.bom.structures.detail(id));
    },
    
    approve: async (id: string): Promise<BOMStructure> => {
      return api.post<BOMStructure>(`${endpoints.bom.structures.detail(id)}approve/`);
    },
  },

  // BOM Items
  items: {
    list: async (params?: ListParams & { bom?: string; child_category?: string }): Promise<PaginatedResponse<BOMItem>> => {
      return api.get<PaginatedResponse<BOMItem>>(endpoints.bom.items.list, { params });
    },
    
    get: async (id: string): Promise<BOMItem> => {
      return api.get<BOMItem>(endpoints.bom.items.detail(id));
    },
    
    create: async (data: Partial<BOMItem>): Promise<BOMItem> => {
      return api.post<BOMItem>(endpoints.bom.items.list, data);
    },
    
    update: async (id: string, data: Partial<BOMItem>): Promise<BOMItem> => {
      return api.patch<BOMItem>(endpoints.bom.items.detail(id), data);
    },
    
    delete: async (id: string): Promise<void> => {
      return api.delete<void>(endpoints.bom.items.detail(id));
    },
  },
};
