/**
 * API Endpoints Configuration
 */
export const endpoints = {
  // Auth
  auth: {
    login: '/auth/login/',
    logout: '/auth/logout/',
    refresh: '/auth/refresh/',
    me: '/auth/me/',
  },

  // Users
  users: {
    list: '/users/',
    detail: (id: number | string) => `/users/${id}/`,
    roles: '/roles/',
    userRoles: '/user-roles/',
    systemModules: '/system-modules/',
    systemModulesTree: '/system-modules/tree/',
    moduleAccess: '/user-module-access/',
    myAccess: '/user-module-access/my_access/',
    bulkUpdateAccess: '/user-module-access/bulk_update/',
  },

  // Catalog
  catalog: {
    // Виды справочников
    categories: {
      list: '/catalog-categories/',
      detail: (id: number | string) => `/catalog-categories/${id}/`,
      purchased: '/catalog-categories/purchased/',
      manufactured: '/catalog-categories/manufactured/',
    },
    // Номенклатура
    nomenclature: {
      list: '/nomenclature/',
      detail: (id: number | string) => `/nomenclature/${id}/`,
      types: '/nomenclature-types/',
      typeDetail: (id: number | string) => `/nomenclature-types/${id}/`,
      suppliers: (id: number | string) => `/nomenclature/${id}/suppliers/`,
      importExcelPreview: '/nomenclature/import-excel/preview/',
      importExcelConfirm: '/nomenclature/import-excel/confirm/',
    },
    // Связи номенклатуры с поставщиками
    nomenclatureSuppliers: {
      list: '/nomenclature-suppliers/',
      detail: (id: number | string) => `/nomenclature-suppliers/${id}/`,
    },
    // Поставщики
    suppliers: {
      list: '/suppliers/',
      detail: (id: number | string) => `/suppliers/${id}/`,
      contacts: (id: number | string) => `/suppliers/${id}/contacts/`,
      nomenclature: (id: number | string) => `/suppliers/${id}/nomenclature/`,
    },
    // Подрядчики
    contractors: {
      list: '/contractors/',
      detail: (id: number | string) => `/contractors/${id}/`,
      contacts: (id: number | string) => `/contractors/${id}/contacts/`,
    },
    // Контактные лица
    contactPersons: {
      list: '/contact-persons/',
      detail: (id: number | string) => `/contact-persons/${id}/`,
    },
    // Причины задержек
    delayReasons: {
      list: '/delay-reasons/',
      detail: (id: number | string) => `/delay-reasons/${id}/`,
    },
    // Банковские реквизиты
    bankDetails: {
      list: '/bank-details/',
      detail: (id: number | string) => `/bank-details/${id}/`,
      bySupplier: (id: number | string) => `/bank-details/by-supplier/${id}/`,
      byContractor: (id: number | string) => `/bank-details/by-contractor/${id}/`,
      setPrimary: (id: number | string) => `/bank-details/${id}/set_primary/`,
    },
  },

  // BOM
  bom: {
    structures: {
      list: '/bom/',
      detail: (id: number | string) => `/bom/${id}/`,
      tree: (id: number | string) => `/bom/${id}/tree/`,
    },
    items: {
      list: '/bom-items/',
      detail: (id: number | string) => `/bom-items/${id}/`,
    },
  },

  // Projects
  projects: {
    list: '/projects/',
    detail: (id: number | string) => `/projects/${id}/`,
    progress: (id: number | string) => `/projects/${id}/progress/`,
    structure: (id: number | string) => `/projects/${id}/structure/`,
    items: {
      list: '/project-items/',
      detail: (id: number | string) => `/project-items/${id}/`,
    },
  },

  // Procurement
  procurement: {
    orders: {
      list: '/purchase-orders/',
      detail: (id: number | string) => `/purchase-orders/${id}/`,
      stats: '/purchase-orders/stats/',
      submit: (id: number | string) => `/purchase-orders/${id}/submit/`,
      confirm: (id: number | string) => `/purchase-orders/${id}/confirm/`,
      cancel: (id: number | string) => `/purchase-orders/${id}/cancel/`,
    },
    items: {
      list: '/purchase-order-items/',
      detail: (id: number | string) => `/purchase-order-items/${id}/`,
    },
    schedule: '/procurement-schedule/',
    goodsReceipts: {
      list: '/goods-receipts/',
      detail: (id: number | string) => `/goods-receipts/${id}/`,
      confirm: (id: number | string) => `/goods-receipts/${id}/confirm/`,
      cancel: (id: number | string) => `/goods-receipts/${id}/cancel/`,
    },
    goodsReceiptItems: {
      list: '/goods-receipt-items/',
      detail: (id: number | string) => `/goods-receipt-items/${id}/`,
    },
  },

  // Production
  production: {
    orders: {
      list: '/production-orders/',
      detail: (id: number | string) => `/production-orders/${id}/`,
      stats: '/production-orders/stats/',
      start: (id: number | string) => `/production-orders/${id}/start/`,
      complete: (id: number | string) => `/production-orders/${id}/complete/`,
      cancel: (id: number | string) => `/production-orders/${id}/cancel/`,
    },
    tasks: {
      list: '/production-tasks/',
      detail: (id: number | string) => `/production-tasks/${id}/`,
      start: (id: number | string) => `/production-tasks/${id}/start/`,
      complete: (id: number | string) => `/production-tasks/${id}/complete/`,
      reportProgress: (id: number | string) => `/production-tasks/${id}/report-progress/`,
    },
  },

  // Inventory (when implemented)
  inventory: {
    warehouses: {
      list: '/warehouses/',
      detail: (id: number | string) => `/warehouses/${id}/`,
      stockSummary: (id: number | string) => `/warehouses/${id}/stock_summary/`,
    },
    stockItems: {
      list: '/stock-items/',
      detail: (id: number | string) => `/stock-items/${id}/`,
      receive: '/stock-items/receive/',
      issue: '/stock-items/issue/',
      transfer: '/stock-items/transfer/',
      distributeToProjects: (id: number | string) => `/stock-items/${id}/distribute_to_projects/`,
    },
    stockBatches: {
      list: '/stock-batches/',
      detail: (id: number | string) => `/stock-batches/${id}/`,
    },
    stockMovements: {
      list: '/stock-movements/',
      detail: (id: number | string) => `/stock-movements/${id}/`,
    },
    reservations: {
      list: '/stock-reservations/',
      detail: (id: number | string) => `/stock-reservations/${id}/`,
    },
    inventoryDocuments: {
      list: '/inventory-documents/',
      detail: (id: number | string) => `/inventory-documents/${id}/`,
      start: (id: number | string) => `/inventory-documents/${id}/start/`,
      complete: (id: number | string) => `/inventory-documents/${id}/complete/`,
      cancel: (id: number | string) => `/inventory-documents/${id}/cancel/`,
    },
    inventoryItems: {
      list: '/inventory-items/',
      detail: (id: number | string) => `/inventory-items/${id}/`,
    },
    stockTransfers: {
      list: '/stock-transfers/',
      detail: (id: number | string) => `/stock-transfers/${id}/`,
      addItem: (id: number | string) => `/stock-transfers/${id}/add_item/`,
      removeItem: (id: number | string) => `/stock-transfers/${id}/remove_item/`,
      submit: (id: number | string) => `/stock-transfers/${id}/submit/`,
      ship: (id: number | string) => `/stock-transfers/${id}/ship/`,
      receive: (id: number | string) => `/stock-transfers/${id}/receive/`,
      cancel: (id: number | string) => `/stock-transfers/${id}/cancel/`,
      createForDeletion: '/stock-transfers/create_for_warehouse_deletion/',
    },
    materialRequirements: {
      list: '/material-requirements/',
      detail: (id: number | string) => `/material-requirements/${id}/`,
      calculate: '/material-requirements/calculate/',
      summary: '/material-requirements/summary/',
      createPurchaseOrder: (id: number | string) => `/material-requirements/${id}/create_purchase_order/`,
    },
  },

  // Workplace (Employee workstation - heart of ERP operations)
  workplace: {
    myItems: '/workplace/my-items/',
    dashboard: '/workplace/dashboard/',
    manufacturing: '/workplace/manufacturing/',
    procurement: '/workplace/procurement/',
    problems: '/workplace/problems/',
    gantt: '/workplace/gantt/',
  },

  // Dashboard (Executive management panel)
  dashboard: {
    summary: '/dashboard/summary/',
    businessStatus: '/dashboard/business-status/',
    projectsOverview: '/dashboard/projects-overview/',
    problems: '/dashboard/problems/',
    warnings: '/dashboard/warnings/',
  },

  // Analytics (when implemented)
  analytics: {
    projectProgress: (id: number | string) => `/analytics/projects/${id}/`,
    summary: '/analytics/summary/',
  },
} as const;
