import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown, Layout, Menu, Tooltip } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../lib/auth';
import { useSocketConnected } from '../lib/socket';
import { PasswordModal } from '../staff/ExamList';
import { LiveProvider, useLive } from './live';
import { LiveSidebar } from './LiveSidebar';
import { Dashboard } from './Dashboard';
import { ExamDetail } from './ExamDetail';
import { Issues } from './Issues';
import { Users } from './Users';

function Shell() {
  const { user, logout } = useAuth();
  const live = useLive();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const connected = useSocketConnected();
  const [liveOpen, setLiveOpen] = useState(true);
  const [pwdOpen, setPwdOpen] = useState(false);

  // Opening a chat from a notification should reveal the sidebar.
  useEffect(() => {
    if (live.openStaffId != null) setLiveOpen(true);
  }, [live.openStaffId, live.tab]);

  const selected = pathname.startsWith('/admin/issues') ? 'issues' : pathname.startsWith('/admin/users') ? 'users' : 'exams';

  return (
    <Layout className="a-layout" hasSider>
      <Layout.Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', fontWeight: 700, fontSize: 16 }}>
          <SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 22 }} />
          身份核查后台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          style={{ borderInlineEnd: 0 }}
          onClick={({ key }) => navigate(key === 'exams' ? '/admin' : `/admin/${key}`)}
          items={[
            { key: 'exams', icon: <AppstoreOutlined />, label: '考试管理' },
            {
              key: 'issues',
              icon: <AlertOutlined />,
              label: (
                <span>
                  异常处理 <Badge count={live.unhandledIssues} size="small" style={{ marginLeft: 6 }} />
                </span>
              ),
            },
            { key: 'users', icon: <TeamOutlined />, label: '账号管理' },
          ]}
        />
      </Layout.Sider>
      <Layout style={{ minWidth: 0 }}>
        <Layout.Header
          style={{ background: '#fff', height: 56, lineHeight: '56px', padding: '0 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 16 }}
        >
          <div style={{ flex: 1 }} />
          <Tooltip title={connected ? '实时连接正常（WebSocket，断线自动重连并降级轮询）' : '实时连接断开，正在重连…已切换为定时刷新'}>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>
              <span className={`dot ${connected ? 'on' : ''}`} style={{ marginRight: 6, background: connected ? undefined : '#ff4d4f' }} />
              {connected ? '实时在线' : '重连中'}
            </span>
          </Tooltip>
          <Tooltip title="员工端为手机页面，可在此预览">
            <Button icon={<MobileOutlined />} onClick={() => window.open('/m', '_blank', 'width=420,height=860')}>
              员工端预览
            </Button>
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => setPwdOpen(true) },
                { key: 'out', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: logout },
              ],
            }}
          >
            <Button type="text" icon={<UserOutlined />}>
              {user?.displayName}
            </Button>
          </Dropdown>
          <Tooltip title={liveOpen ? '收起实时面板' : '展开实时面板'}>
            <Badge count={liveOpen ? 0 : live.unreadChats + live.unhandledIssues} size="small">
              <Button icon={liveOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setLiveOpen((v) => !v)} />
            </Badge>
          </Tooltip>
        </Layout.Header>
        <Layout.Content className="a-content">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="exams/:examId" element={<ExamDetail />} />
            <Route path="issues" element={<Issues />} />
            <Route path="users" element={<Users />} />
          </Routes>
        </Layout.Content>
      </Layout>
      {liveOpen && (
        <Layout.Sider width={380} theme="light" style={{ height: '100vh' }}>
          <LiveSidebar />
        </Layout.Sider>
      )}
      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}

export default function AdminApp() {
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  );
}
