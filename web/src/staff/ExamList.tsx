import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Empty, Form, Input, Modal, Progress, Spin, Tag } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, LogoutOutlined, MoreOutlined, KeyOutlined, RightOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { Exam } from '../lib/types';

export function ExamList() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);

  const load = useCallback(() => api<Exam[]>('/exams').then(setExams).catch(() => setExams((e) => e ?? [])), []);
  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent('exams:changed', load);
  useSocketEvent('assignments:changed', load);
  useLiveRefresh(load, 15000);

  // A single assigned exam: skip the picker.
  useEffect(() => {
    if (exams?.length === 1 && !sessionStorage.getItem('picked')) {
      sessionStorage.setItem('picked', '1');
      navigate(`exam/${exams[0].id}`, { replace: false });
    }
  }, [exams, navigate]);

  return (
    <div className="m-page">
      <div className="m-header">
        <div className="m-header-row">
          <div className="m-header-title">选择考试</div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => setPwdOpen(true) },
                { key: 'out', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: logout },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </div>
        <div style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>
          {user?.displayName}（{user?.username}）
        </div>
      </div>

      {exams === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : exams.length === 0 ? (
        <Empty style={{ marginTop: 80 }} description="暂未分配考试，请联系管理员" />
      ) : (
        exams.map((e) => {
          const checked = e.stats.normal + e.stats.issue;
          return (
            <div key={e.id} className="m-card" onClick={() => navigate(`exam/${e.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{e.name}</div>
                <RightOutlined style={{ color: '#bfbfbf' }} />
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 13, margin: '6px 0 10px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {e.date && (
                  <span>
                    <CalendarOutlined /> {e.date}
                  </span>
                )}
                {e.location && (
                  <span>
                    <EnvironmentOutlined /> {e.location}
                  </span>
                )}
              </div>
              {!!e.myRows?.length && <div className="my-rows">我负责：{describeRows(e.myRows)}</div>}
              <Progress percent={e.stats.total ? Math.round((checked / e.stats.total) * 100) : 0} size="small" />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Tag>共 {e.stats.total}</Tag>
                <Tag color="success">正常 {e.stats.normal}</Tag>
                <Tag color="error">异常 {e.stats.issue}</Tag>
                <Tag color="processing">待核查 {e.stats.pending}</Tag>
              </div>
            </div>
          );
        })
      )}
      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
  );
}

/** "10B-405 第 1、2 排；10B-407 第 3 排" */
function describeRows(rows: { room: string; row: number }[]) {
  const byRoom = new Map<string, number[]>();
  rows.forEach((r) => byRoom.set(r.room, [...(byRoom.get(r.room) ?? []), r.row]));
  return [...byRoom].map(([room, nums]) => `${room ? `${room} ` : ''}第 ${nums.join('、')} 排`).join('；');
}

export function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { setToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      const res = await api<{ token: string }>('/auth/password', { method: 'POST', json: v });
      setToken(res.token);
      message.success('密码已修改');
      form.resetFields();
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal open={open} title="修改密码" onCancel={onClose} onOk={submit} confirmLoading={loading} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="oldPassword" label="原密码" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '至少 6 位' }]}>
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  );
}
