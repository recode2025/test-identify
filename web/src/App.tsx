import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './lib/auth';
import { Login } from './Login';

// Staff phones never download the admin bundle and vice versa.
const StaffApp = lazy(() => import('./staff/StaffApp'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

const Loading = () => (
  <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size="large" />
  </div>
);

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  const home = user.role === 'admin' ? '/admin' : '/m';
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {user.role === 'admin' && <Route path="/admin/*" element={<AdminApp />} />}
        <Route path="/m/*" element={<StaffApp />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  );
}
