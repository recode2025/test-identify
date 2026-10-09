import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Form,
  Image,
  Input,
  Modal,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
  Upload,
} from 'antd';
import {
  CameraOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  HistoryOutlined,
  MoreOutlined,
  PictureOutlined,
  PlusOutlined,
  RollbackOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, download, photoUrl } from '../lib/api';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import { Photo } from '../components/Photo';
import { Candidate, CheckStatus, Exam, ISSUE_LABEL, STATUS_META } from '../lib/types';
import { matches } from '../staff/ExamWorkspace';
import { ExamFormModal } from './ExamForm';
import { ImportModal } from './ImportModal';
import { PhotoUploadModal } from './PhotoUploadModal';
import { HandleModal } from './HandleModal';

type Filter = 'all' | CheckStatus | 'unhandled' | 'nophoto';

export function ExamDetail() {
  const examId = Number(useParams().examId);
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [exam, setExam] = useState<Exam | null>(null);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editExam, setEditExam] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [handling, setHandling] = useState<Candidate | null>(null);
  const [editing, setEditing] = useState<Candidate | 'new' | null>(null);
  const [historyOf, setHistoryOf] = useState<Candidate | null>(null);

  const load = useCallback(async () => {
    try {
      const [exams, list] = await Promise.all([api<Exam[]>('/exams'), api<Candidate[]>(`/exams/${examId}/candidates`)]);
      setExam(exams.find((e) => e.id === examId) ?? null);
      setRows(list);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [examId, message]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load);

  useSocketEvent<Candidate>('candidate:updated', (c) => c.examId === examId && setRows((prev) => prev.map((r) => (r.id === c.id ? c : r))));
  useSocketEvent<{ examId: number }>('candidates:reload', (p) => p.examId === examId && load());
  useSocketEvent('photos:changed', load);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, normal: 0, issue: 0, unhandled: 0, nophoto: 0 };
    rows.forEach((r) => {
      c[r.status]++;
      if (r.status === 'issue' && !r.handled) c.unhandled++;
      if (!r.photoVersion) c.nophoto++;
    });
    return c;
  }, [rows]);

  const data = useMemo(
    () =>
      rows.filter((r) => {
        if (!matches(r, search)) return false;
        if (filter === 'all') return true;
        if (filter === 'unhandled') return r.status === 'issue' && !r.handled;
        if (filter === 'nophoto') return !r.photoVersion;
        return r.status === filter;
      }),
    [rows, search, filter],
  );

  const reset = (c: Candidate) =>
    modal.confirm({
      title: `重置 ${c.name} 的核查状态？`,
      content: '将恢复为「未核查」，核查记录会保留在历史中。',
      onOk: () => api(`/candidates/${c.id}/reset`, { method: 'POST' }).then(() => message.success('已重置')),
    });

  const remove = (c: Candidate) =>
    modal.confirm({
      title: `从本场考试中删除 ${c.name}？`,
      okType: 'danger',
      onOk: () => api(`/candidates/${c.id}`, { method: 'DELETE' }).then(() => message.success('已删除')),
    });

  const uploadOne = async (c: Candidate, file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await api(`/photos/single/${encodeURIComponent(c.studentNo)}`, { method: 'POST', body: form });
      message.success('照片已更新');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const removeExam = () =>
    modal.confirm({
      title: `删除考试「${exam?.name}」？`,
      content: '考生名单和核查记录将一并删除（照片保留，可供其他考试使用）。此操作不可恢复。',
      okType: 'danger',
      okText: '删除',
      onOk: async () => {
        await api(`/exams/${examId}`, { method: 'DELETE' });
        message.success('已删除');
        navigate('/admin');
      },
    });

  if (!loading && !exam) {
    return <Card>考试不存在</Card>;
  }

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <a onClick={() => navigate('/admin')}>考试管理</a> }, { title: exam?.name ?? '…' }]} />
      <Card style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 12 } }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {exam?.name} {exam && !exam.active && <Tag>已停用</Tag>}
            </Typography.Title>
            <Typography.Text type="secondary">
              {[exam?.date, exam?.location].filter(Boolean).join(' · ') || '未设置时间地点'}
            </Typography.Text>
          </div>
          <Space wrap>
            <Button type="primary" icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>
              导入名单
            </Button>
            <Button icon={<PictureOutlined />} onClick={() => setPhotoOpen(true)}>
              上传照片
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => download(`/exams/${examId}/export.xlsx`, '核查结果.xlsx').catch((e) => message.error(e.message))}>
              导出结果
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'edit', icon: <EditOutlined />, label: '编辑考试信息', onClick: () => setEditExam(true) },
                  { key: 'add', icon: <PlusOutlined />, label: '手动添加考生', onClick: () => setEditing('new') },
                  { type: 'divider' },
                  { key: 'del', icon: <DeleteOutlined />, label: '删除考试', danger: true, onClick: removeExam },
                ],
              }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        </div>
        <Row gutter={16} style={{ marginTop: 16 }}>
          {[
            ['考生', counts.all, undefined],
            ['已核查', counts.normal + counts.issue, undefined],
            ['正常', counts.normal, '#389e0d'],
            ['异常', counts.issue, '#cf1322'],
            ['待处理', counts.unhandled, counts.unhandled ? '#cf1322' : undefined],
            ['缺照片', counts.nophoto, counts.nophoto ? '#d48806' : undefined],
          ].map(([t, v, color]) => (
            <Col key={t as string} flex={1}>
              <Statistic title={t as string} value={v as number} valueStyle={{ color: color as string | undefined, fontSize: 22 }} />
            </Col>
          ))}
        </Row>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="学号 / 姓名 / 座位号" style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `全部 ${counts.all}` },
              { value: 'pending', label: `未核查 ${counts.pending}` },
              { value: 'normal', label: `正常 ${counts.normal}` },
              { value: 'issue', label: `异常 ${counts.issue}` },
              { value: 'unhandled', label: `待处理 ${counts.unhandled}` },
              { value: 'nophoto', label: `缺照片 ${counts.nophoto}` },
            ]}
          />
        </div>
        <Image.PreviewGroup>
          <Table<Candidate>
            rowKey="id"
            size="middle"
            scroll={{ x: 1150 }}
            loading={loading}
            dataSource={data}
            pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (t) => `共 ${t} 人` }}
            rowClassName={(r) => (r.status === 'issue' && !r.handled ? 'row-issue' : '')}
            columns={[
              {
                title: '照片',
                width: 70,
                render: (_, r) =>
                  r.photoVersion ? (
                    <Image
                      width={44}
                      height={58}
                      style={{ objectFit: 'cover', borderRadius: 4 }}
                      src={photoUrl('thumb', r.studentNo, r.photoVersion)!}
                      preview={{ src: photoUrl('medium', r.studentNo, r.photoVersion)! }}
                      loading="lazy"
                    />
                  ) : (
                    <Photo studentNo={r.studentNo} version={null} size="thumb" width={44} height={58} radius={4} />
                  ),
              },
              { title: '序号', dataIndex: 'seq', width: 70, sorter: (a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) },
              { title: '姓名', dataIndex: 'name', width: 100 },
              { title: '学号', dataIndex: 'studentNo', width: 120, sorter: (a, b) => a.studentNo.localeCompare(b.studentNo) },
              {
                title: '座位号',
                dataIndex: 'seatNo',
                width: 90,
                render: (v) => v || <Typography.Text type="secondary">—</Typography.Text>,
                sorter: (a, b) => (a.seatNo ?? '').localeCompare(b.seatNo ?? '', 'zh-CN', { numeric: true }),
              },
              {
                title: '状态',
                width: 110,
                render: (_, r) => (
                  <Space size={4}>
                    <Tag color={STATUS_META[r.status].color}>{r.status === 'issue' && r.issueType ? ISSUE_LABEL[r.issueType] : STATUS_META[r.status].label}</Tag>
                    {r.status === 'issue' && (r.handled ? <Tag color="processing">已处理</Tag> : <Tag color="red">待处理</Tag>)}
                  </Space>
                ),
              },
              {
                title: '说明 / 处理',
                width: 220,
                render: (_, r) =>
                  r.status === 'issue' ? (
                    <div style={{ fontSize: 12 }}>
                      {r.issueNote && <div>说明：{r.issueNote}</div>}
                      {r.handled && <div style={{ color: '#8c8c8c' }}>处理：{r.handleNote || '已处理'}（{r.handledByName}）</div>}
                    </div>
                  ) : null,
              },
              {
                title: '核查人 / 时间',
                width: 150,
                render: (_, r) =>
                  r.checkedAt ? (
                    <div style={{ fontSize: 12 }}>
                      <div>{r.checkedByName}</div>
                      <Typography.Text type="secondary">{dayjs(r.checkedAt).format('MM-DD HH:mm:ss')}</Typography.Text>
                    </div>
                  ) : null,
              },
              {
                title: '操作',
                width: 150,
                fixed: 'right',
                render: (_, r) => (
                  <Space size={0}>
                    {r.status === 'issue' && !r.handled && (
                      <Button size="small" type="link" danger onClick={() => setHandling(r)}>
                        处理
                      </Button>
                    )}
                    <Button size="small" type="link" onClick={() => setEditing(r)}>
                      编辑
                    </Button>
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: 'photo',
                            icon: <CameraOutlined />,
                            label: (
                              <Upload accept="image/*,.bmp,.heic" showUploadList={false} beforeUpload={(f) => (uploadOne(r, f), false)}>
                                {r.photoVersion ? '更换照片' : '上传照片'}
                              </Upload>
                            ),
                          },
                          { key: 'history', icon: <HistoryOutlined />, label: '核查记录', onClick: () => setHistoryOf(r) },
                          { key: 'reset', icon: <RollbackOutlined />, label: '重置状态', disabled: r.status === 'pending', onClick: () => reset(r) },
                          { type: 'divider' },
                          { key: 'del', icon: <DeleteOutlined />, label: '删除考生', danger: true, onClick: () => remove(r) },
                        ],
                      }}
                    >
                      <Button size="small" type="text" icon={<MoreOutlined />} />
                    </Dropdown>
                  </Space>
                ),
              },
            ]}
          />
        </Image.PreviewGroup>
      </Card>

      <ExamFormModal open={editExam} exam={exam} onClose={() => setEditExam(false)} onSaved={load} />
      <ImportModal examId={examId} open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <PhotoUploadModal open={photoOpen} onClose={() => setPhotoOpen(false)} onDone={load} />
      <HandleModal candidate={handling} onClose={() => setHandling(null)} />
      <CandidateForm examId={examId} target={editing} onClose={() => setEditing(null)} />
      <HistoryDrawer candidate={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

function CandidateForm({ examId, target, onClose }: { examId: number; target: Candidate | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isNew = target === 'new';

  useEffect(() => {
    if (target) form.setFieldsValue(isNew ? { name: '', studentNo: '', seatNo: '', seq: '' } : { name: target.name, studentNo: target.studentNo, seatNo: target.seatNo ?? '' });
  }, [target, isNew, form]);

  const submit = async () => {
    const v = await form.validateFields();
    setLoading(true);
    try {
      if (isNew) await api(`/exams/${examId}/candidates`, { method: 'POST', json: v });
      else await api(`/candidates/${(target as Candidate).id}`, { method: 'PATCH', json: v });
      message.success('已保存');
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={!!target} title={isNew ? '添加考生' : '编辑考生'} onCancel={onClose} onOk={submit} confirmLoading={loading} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item name="studentNo" label="学号" rules={[{ required: true }]}>
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item name="seatNo" label="座位号（可为空）">
          <Input maxLength={20} />
        </Form.Item>
        {isNew && (
          <Form.Item name="seq" label="序号（可为空）">
            <Input maxLength={6} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

const ACTION_TEXT: Record<string, string> = { normal: '核查正常', issue: '上报异常', reset: '重置状态', handle: '处理异常' };

function HistoryDrawer({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    if (candidate) api<any[]>(`/candidates/${candidate.id}/history`).then(setLogs).catch(() => setLogs([]));
  }, [candidate]);
  return (
    <Drawer open={!!candidate} onClose={onClose} title={candidate ? `核查记录 · ${candidate.name}` : ''} width={420}>
      {logs.length === 0 ? (
        <Typography.Text type="secondary">暂无记录</Typography.Text>
      ) : (
        <Timeline
          items={logs.map((l) => ({
            color: l.action === 'issue' ? 'red' : l.action === 'normal' ? 'green' : l.action === 'handle' ? 'blue' : 'gray',
            children: (
              <div>
                <b>{ACTION_TEXT[l.action] ?? l.action}</b>
                {l.issueType && <Tag style={{ marginLeft: 6 }}>{ISSUE_LABEL[l.issueType as keyof typeof ISSUE_LABEL]}</Tag>}
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {l.userName} · {dayjs(l.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                </div>
                {l.note && <div style={{ marginTop: 2 }}>{l.note}</div>}
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}
