import { Spin } from 'antd';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../shared/components/layout';
import { useAuth } from './providers/AuthProvider';

// Pages
import LoginPage from '../pages/auth/LoginPage';
import BOMListPage from '../pages/bom/BOMListPage';
import CatalogSettingsPage from '../pages/catalog/CatalogSettingsPage';
import ContractorsPage from '../pages/catalog/ContractorsPage';
import NomenclaturePage from '../pages/catalog/NomenclaturePage';
import SuppliersPage from '../pages/catalog/SuppliersPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import MaterialRequirementsPage from '../pages/procurement/MaterialRequirementsPage';
import ProcurementPage from '../pages/procurement/ProcurementPage';
import PurchaseOrdersPage from '../pages/procurement/PurchaseOrdersPage';
import ProjectDetailPage from '../pages/projects/ProjectDetailPage';
import ProjectListPage from '../pages/projects/ProjectListPage';
import ManufacturingProblemReasonsPage from '../pages/settings/ManufacturingProblemReasonsPage';
import ManufacturingStatusesPage from '../pages/settings/ManufacturingStatusesPage';
import PurchaseProblemReasonsPage from '../pages/settings/PurchaseProblemReasonsPage';
import PurchaseStatusesPage from '../pages/settings/PurchaseStatusesPage';
import RolesPage from '../pages/settings/RolesPage';
import SystemSettingsPage from '../pages/settings/SystemSettingsPage';
import UsersPage from '../pages/settings/UsersPage';
import WarehousesSettingsPage from '../pages/settings/WarehousesSettingsPage';
import ContractorReceiptsPage from '../pages/warehouse/ContractorReceiptsPage';
import ContractorWriteOffsPage from '../pages/warehouse/ContractorWriteOffsPage';
import GoodsReceiptsPage from '../pages/warehouse/GoodsReceiptsPage';
import InventoryPage from '../pages/warehouse/InventoryPage';
import StockMovementsPage from '../pages/warehouse/StockMovementsPage';
import StockTransfersPage from '../pages/warehouse/StockTransfersPage';
import WarehousePage from '../pages/warehouse/WarehousePage';
import WorkplacePage from '../pages/workplace/WorkplacePage';

// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <Spin size="large" tip="Загрузка..." />
  </div>
);

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route index element={<DashboardPage />} />

          {/* Projects */}
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/:tab" element={<ProjectDetailPage />} />

          {/* Catalog */}
          <Route path="catalog/nomenclature" element={<NomenclaturePage />} />
          <Route path="catalog/suppliers" element={<SuppliersPage />} />
          <Route path="catalog/contractors" element={<ContractorsPage />} />
          <Route path="catalog/settings" element={<CatalogSettingsPage />} />

          {/* BOM */}
          <Route path="bom" element={<BOMListPage />} />

          {/* Procurement - согласно ТЗ */}
          <Route path="procurement" element={<ProcurementPage />} />
          <Route path="procurement/requirements" element={<MaterialRequirementsPage />} />
          <Route path="procurement/orders" element={<PurchaseOrdersPage />} />

          {/* Workplace - Рабочее место сотрудника */}
          <Route path="workplace" element={<WorkplacePage />} />
          <Route path="workplace/:tab" element={<WorkplacePage />} />

          {/* Warehouse - согласно ТЗ */}
          <Route path="warehouse" element={<WarehousePage />} />
          <Route path="warehouse/receipts" element={<GoodsReceiptsPage />} />
          <Route path="warehouse/movements" element={<StockMovementsPage />} />
          <Route path="warehouse/transfers" element={<StockTransfersPage />} />
          <Route path="warehouse/inventory" element={<InventoryPage />} />
          <Route path="warehouse/contractor-writeoffs" element={<ContractorWriteOffsPage />} />
          <Route path="warehouse/contractor-receipts" element={<ContractorReceiptsPage />} />

          {/* Settings */}
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/roles" element={<RolesPage />} />
          <Route path="settings/warehouses" element={<WarehousesSettingsPage />} />
          <Route path="settings/system" element={<SystemSettingsPage />} />
          <Route path="settings/manufacturing-statuses" element={<ManufacturingStatusesPage />} />
          <Route path="settings/purchase-statuses" element={<PurchaseStatusesPage />} />
          <Route path="settings/manufacturing-problem-reasons" element={<ManufacturingProblemReasonsPage />} />
          <Route path="settings/purchase-problem-reasons" element={<PurchaseProblemReasonsPage />} />

          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
