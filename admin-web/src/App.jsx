import { useRoutes, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/router/ProtectedRoute.jsx'
import BasicLayout from '@/layouts/BasicLayout.jsx'
import LoginPage from '@/pages/login/index.jsx'
import DashboardPage from '@/pages/dashboard/index.jsx'
import CategoryPage from '@/pages/category/index.jsx'
import EquipmentPage from '@/pages/equipment/index.jsx'
import EquipmentUnitPage from '@/pages/equipment-unit/index.jsx'
import OrderPage from '@/pages/order/index.jsx'
import InvoicePage from '@/pages/invoice/index.jsx'
import ShippingPage from '@/pages/shipping/index.jsx'
import MerchantPage from '@/pages/merchant/index.jsx'
import UserPage from '@/pages/user/index.jsx'
import UpgradePage from '@/pages/upgrade/index.jsx'

export default function App() {
  return useRoutes([
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <BasicLayout />
        </ProtectedRoute>
      ),
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'category', element: <CategoryPage /> },
        { path: 'equipment', element: <EquipmentPage /> },
        { path: 'equipment-unit', element: <EquipmentUnitPage /> },
        { path: 'order', element: <OrderPage /> },
        { path: 'invoice', element: <InvoicePage /> },
        { path: 'shipping', element: <ShippingPage /> },
        { path: 'merchant', element: <MerchantPage /> },
        { path: 'user', element: <UserPage /> },
        // BE / EE 专属功能：保留导航入口，页面为统一升级提示（与商家管理同策略）
        { path: 'branding', element: <UpgradePage /> },
        { path: 'accounts', element: <UpgradePage /> },
        { path: 'chat', element: <UpgradePage /> },
        // Enterprise 专属：面单打印
        { path: 'printing', element: <UpgradePage /> },
      ],
    },
    { path: '*', element: <Navigate to="/dashboard" replace /> },
  ])
}
