import { useState } from 'react';
import { App, Button, Form, Input } from 'antd';
import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';

export function Login() {
  const { login } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const submit = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      const user = await login(v.username.trim(), v.password);
      navigate(user.role === 'admin' ? '/admin' : '/m', { replace: true });
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'linear-gradient(160deg, #1677ff 0%, #69b1ff 45%, #f5f6f8 45%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '32px 24px 16px', boxShadow: '0 8px 32px rgba(0,0,0,.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <SafetyCertificateOutlined style={{ fontSize: 44, color: '#1677ff' }} />
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>考试身份核查</div>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>请使用管理员分配的账号登录</div>
        </div>
        <Form size="large" onFinish={submit} autoComplete="on">
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" autoCapitalize="off" autoCorrect="off" style={{ fontSize: 16 }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" style={{ fontSize: 16 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 48, fontSize: 17 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
