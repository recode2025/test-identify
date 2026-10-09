import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined, KeyOutlined, PlusOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Exam, UserRow } from '../lib/types';
import { useLive } from './live';

interface Credential {
  username: string;
  displayName?: string;
  password: string;
}

function credentialsText(list: Credential[]) {
  const origin = window.location.origin;
  return list.map((c) => `${c.displayName ? c.displayName + '  ' : ''}账号：${c.username}  密码：${c.password}  登录地址：${origin}`).join('\n');
}

function downloadCsv(list: Credential[]) {
  const rows = [['姓名', '账号', '密码', '登录地址'], ...list.map((c) => [c.displayName ?? '', c.username, c.password, window.location.origin])];
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: '员工账号.csv' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Users() {
  const { user: me } = useAuth();
  const live = useLive();
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [creds, setCreds] = useState<Credential[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([api<UserRow[]>('/users'), api<Exam[]>('/exams')])
      .then(([u, e]) => {
        setUsers(u);
        setExams(e);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const examName = new Map(exams.map((e) => [e.id, e.name]));
  const examOptions = exams.map((e) => ({ value: e.id, label: e.name + (e.active ? '' : '（已停用）') }));

  const patch = async (u: UserRow, body: Partial<UserRow>) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', json: body });
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const resetPassword = (u: UserRow) =>
    modal.confirm({
      title: `重置 ${u.displayName} 的密码？`,
      content: '将生成新的随机密码，该账号已登录的设备会被强制下线。',
      onOk: async () => {
        const r = await api<{ username: string; password: string }>(`/users/${u.id}/password`, { method: 'POST', json: {} });
        setCreds([{ ...r, displayName: u.displayName }]);
      },
    });

  const remove = (u: UserRow) =>
    modal.confirm({
      title: `删除账号 ${u.username}？`,
      okType: 'danger',
      onOk: () => api(`/users/${u.id}`, { method: 'DELETE' }).then(load),
    });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          账号管理
        </Typography.Title>
        <Space>
          <Button icon={<UsergroupAddOutlined />} onClick={() => setBatchOpen(true)}>
            批量生成员工账号
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            新建账号
          </Button>
        </Space>
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Table<UserRow>
          rowKey="id"
          loading={loading}
          dataSource={users}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          columns={[
            {
              title: '账号',
              render: (_, u) => (
                <Space>
                  <span className={`dot ${live.online.has(u.id) ? 'on' : ''}`} />
                  <b>{u.username}</b>
                  {u.id === me?.id && <Tag>当前</Tag>}
                </Space>
              ),
            },
            { title: '姓名', dataIndex: 'displayName' },
            { title: '角色', width: 90, render: (_, u) => (u.role === 'admin' ? <Tag color="gold">管理员</Tag> : <Tag color="blue">员工</Tag>) },
            {
              title: '负责考试',
              render: (_, u) =>
                u.role === 'admin' ? (
                  <Typography.Text type="secondary">全部</Typography.Text>
                ) : u.examIds.length ? (
                  u.examIds.map((id) => <Tag key={id}>{examName.get(id) ?? id}</Tag>)
                ) : (
                  <Typography.Text type="warning">未分配</Typography.Text>
                ),
            },
            {
              title: '启用',
              width: 80,
              render: (_, u) => <Switch size="small" checked={u.enabled} disabled={u.id === me?.id} onChange={(v) => patch(u, { enabled: v })} />,
            },
            {
              title: '操作',
              width: 220,
              render: (_, u) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setEditing(u)}>
                    编辑
                  </Button>
                  <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => resetPassword(u)}>
                    重置密码
                  </Button>
                  <Button type="link" size="small" danger disabled={u.id === me?.id} onClick={() => remove(u)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <UserForm target={editing} examOptions={examOptions} onClose={() => setEditing(null)} onSaved={(c) => (load(), c && setCreds([c]))} />
      <BatchForm open={batchOpen} examOptions={examOptions} onClose={() => setBatchOpen(false)} onSaved={(list) => (load(), setCreds(list))} />
      <CredentialsModal list={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

function UserForm({
  target,
  examOptions,
  onClose,
  onSaved,
}: {
  target: UserRow | 'new' | null;
  examOptions: { value: number; label: string }[];
  onClose: () => void;
  onSaved: (cred?: Credential) => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isNew = target === 'new';
  const role = Form.useWatch('role', form);

  useEffect(() => {
    if (target) form.setFieldsValue(isNew ? { username: '', displayName: '', password: '', role: 'staff', examIds: [] } : { displayName: target.displayName, role: target.role, examIds: target.examIds });
  }, [target, isNew, form]);

  const submit = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      if (isNew) {
        const r = await api<UserRow & { password: string }>('/users', { method: 'POST', json: v });
        onSaved({ username: r.username, displayName: r.displayName, password: r.password });
      } else {
        await api(`/users/${(target as UserRow).id}`, { method: 'PATCH', json: v });
        message.success('已保存');
        onSaved();
      }
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={!!target} title={isNew ? '新建账号' : `编辑账号 · ${(target as UserRow)?.username ?? ''}`} onCancel={onClose} onOk={submit} confirmLoading={loading} forceRender>
      <Form form={form} layout="vertical">
        {isNew && (
          <Form.Item name="username" label="登录账号" rules={[{ required: true, pattern: /^[A-Za-z0-9_.-]{2,32}$/, message: '字母、数字、下划线，2-32 位' }]}>
            <Input placeholder="如 zhangsan" />
          </Form.Item>
        )}
        <Form.Item name="displayName" label="姓名（显示名）">
          <Input placeholder="如 张老师" maxLength={30} />
        </Form.Item>
        {isNew && (
          <Form.Item name="password" label="密码" extra="留空则自动生成随机密码">
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        )}
        <Form.Item name="role" label="角色">
          <Radio.Group
            options={[
              { value: 'staff', label: '员工（手机核查）' },
              { value: 'admin', label: '管理员' },
            ]}
          />
        </Form.Item>
        {role !== 'admin' && (
          <Form.Item name="examIds" label="负责考试" extra="员工只能看到分配给自己的、已启用的考试">
            <Select mode="multiple" options={examOptions} placeholder="选择考试" allowClear />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function BatchForm({
  open,
  examOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  examOptions: { value: number; label: string }[];
  onClose: () => void;
  onSaved: (list: Credential[]) => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const v = Form.useWatch([], form) ?? {};
  const width = Math.max(2, String((v.start ?? 1) + (v.count ?? 1) - 1).length);
  const sample = v.prefix ? `${v.prefix}${String(v.start ?? 1).padStart(width, '0')}` : '';

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const list = await api<Credential[]>('/users/batch', { method: 'POST', json: values });
      onSaved(list);
      onClose();
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="批量生成员工账号" onCancel={onClose} onOk={submit} confirmLoading={loading} forceRender>
      <Form form={form} layout="vertical" initialValues={{ prefix: 'jk', start: 1, count: 10, displayPrefix: '监考员', examIds: [] }}>
        <Space style={{ width: '100%' }} align="start">
          <Form.Item name="prefix" label="账号前缀" rules={[{ required: true, pattern: /^[A-Za-z0-9_]+$/, message: '字母数字' }]}>
            <Input style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="start" label="起始编号">
            <InputNumber min={0} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="count" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={200} style={{ width: 100 }} />
          </Form.Item>
        </Space>
        <Form.Item name="displayPrefix" label="显示名前缀" extra={sample ? `示例：账号 ${sample}，显示名 ${v.displayPrefix ?? ''}${String(v.start ?? 1).padStart(width, '0')}` : undefined}>
          <Input />
        </Form.Item>
        <Form.Item name="examIds" label="负责考试">
          <Select mode="multiple" options={examOptions} placeholder="选择考试（可稍后再分配）" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Passwords are only shown once; offer copy and CSV so they can be handed out. */
function CredentialsModal({ list, onClose }: { list: Credential[] | null; onClose: () => void }) {
  const { message } = App.useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentialsText(list ?? []));
      message.success('已复制');
    } catch {
      message.error('复制失败，请手动选择文本');
    }
  };
  return (
    <Modal
      open={!!list}
      title="账号密码（仅显示一次，请妥善下发）"
      onCancel={onClose}
      width={620}
      footer={
        <Space>
          <Button icon={<CopyOutlined />} onClick={copy}>
            复制全部
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => list && downloadCsv(list)}>
            下载 CSV
          </Button>
          <Button type="primary" onClick={onClose}>
            完成
          </Button>
        </Space>
      }
    >
      <Table
        size="small"
        rowKey="username"
        pagination={false}
        scroll={{ y: 360 }}
        dataSource={list ?? []}
        columns={[
          { title: '显示名', dataIndex: 'displayName' },
          { title: '账号', dataIndex: 'username', render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
          { title: '密码', dataIndex: 'password', render: (v) => <Typography.Text copyable code>{v}</Typography.Text> },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        员工用手机浏览器打开 {window.location.origin} 登录即可开始核查。
      </Typography.Paragraph>
    </Modal>
  );
}
