import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Image, Input, Modal, Radio, Result, Switch, Tag } from 'antd';
import { CheckOutlined, ExclamationCircleOutlined, LeftOutlined, RightOutlined, ZoomInOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, photoUrl } from '../lib/api';
import { Photo, preloadPhotos } from '../components/Photo';
import { Candidate, ISSUE_LABEL, ISSUE_OPTIONS, IssueType, STATUS_META } from '../lib/types';
import { useStaffChat } from './StaffApp';
import { useWorkspace } from './ExamWorkspace';

const AUTO_NEXT_KEY = 'identify_auto_next';
const readAutoNext = () => {
  try {
    return localStorage.getItem(AUTO_NEXT_KEY) !== '0';
  } catch {
    return true;
  }
};

export function CandidateDetail() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const chat = useStaffChat();
  const { message, modal } = App.useApp();
  const params = useParams();
  const id = Number(params.candidateId);
  const base = `/m/exam/${params.examId}`;
  const c = ws.byId.get(id);

  const [submitting, setSubmitting] = useState<'normal' | 'issue' | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueType | null>(null);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [autoNext, setAutoNext] = useState(readAutoNext);

  // Navigation order follows what the list showed (my rows, or the filtered roster); fall back
  // to the full list when the current candidate dropped out of it (e.g. just checked).
  const order = useMemo(() => (ws.navList.some((x) => x.id === id) ? ws.navList : ws.candidates), [ws.navList, ws.candidates, id]);
  const group = ws.groupOf.get(id);
  const inMine = ws.view === 'mine' && ws.mine.some((x) => x.id === id);
  const index = order.findIndex((x) => x.id === id);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Back on the list, the row being worked on is the one left open.
  const { revealGroup } = ws;
  useEffect(() => {
    if (group) revealGroup(group.key);
  }, [group?.key, revealGroup]);

  useEffect(() => {
    chat.setRaised(true);
    chat.setCandidateRef(c ? { id: c.id, label: `${c.name} ${c.studentNo}` } : null);
  }, [chat, c?.id, c?.name, c?.studentNo]);

  useEffect(() => {
    if (index < 0) return;
    preloadPhotos(ws.candidates.slice(ws.candidates.findIndex((x) => x.id === id) + 1).filter((x) => x.status === 'pending').slice(0, 3));
    preloadPhotos(order.slice(index + 1, index + 3));
  }, [id, index, order, ws.candidates]);

  if (!c) {
    return (
      <div className="m-page">
        <Result status="404" title="考生不存在或已被移除" extra={<Button onClick={() => navigate(base)}>返回名单</Button>} />
      </div>
    );
  }

  /** Next pending candidate after this one in seat order, wrapping around; stays within my rows when working from them. */
  const nextPending = (current: Candidate) => {
    const all = inMine ? ws.mine : ws.candidates;
    const i = all.findIndex((x) => x.id === current.id);
    for (let k = 1; k < all.length; k++) {
      const cand = all[(i + k) % all.length];
      if (cand.status === 'pending') return cand;
    }
    return null;
  };

  const afterCheck = (updated: Candidate) => {
    ws.upsert(updated);
    if (!autoNext) return;
    const n = nextPending(updated);
    if (n) {
      const g = ws.groupOf.get(n.id);
      if (inMine && g && g !== group) message.info(`${group?.label ?? ''} 已完成，进入 ${g.label}`);
      navigate(`${base}/c/${n.id}`, { replace: true });
    } else {
      message.success(inMine ? '你负责的考生已全部核查完成' : '本场考生已全部核查完成');
      navigate(base);
    }
  };

  const submit = async (body: { result: 'normal' | 'issue'; issueType?: IssueType; note?: string }) => {
    setSubmitting(body.result);
    try {
      const updated = await api<Candidate>(`/candidates/${c.id}/check`, { method: 'POST', json: body });
      navigator.vibrate?.(body.result === 'normal' ? 30 : [60, 40, 60]);
      message.success(body.result === 'normal' ? `${c.name} 核查正常` : '已上报管理员');
      setIssueOpen(false);
      afterCheck(updated);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  const onNormal = () => {
    if (c.status === 'issue') {
      modal.confirm({
        title: '改为正常？',
        content: `该考生已被 ${c.checkedByName ?? ''} 标记为「${c.issueType ? ISSUE_LABEL[c.issueType] : '异常'}」，确认改为正常吗？`,
        okText: '确认改为正常',
        onOk: () => submit({ result: 'normal' }),
      });
    } else submit({ result: 'normal' });
  };

  const openIssue = () => {
    setIssueType(c.status === 'issue' ? c.issueType : null);
    setNote(c.status === 'issue' ? c.issueNote ?? '' : '');
    setIssueOpen(true);
  };

  const submitIssue = () => {
    if (!issueType) return message.warning('请选择问题类型');
    if (issueType === 'other' && !note.trim()) return message.warning('选择「其他」时需要说明情况');
    submit({ result: 'issue', issueType, note: note.trim() });
  };

  const go = (target: Candidate | null) => target && navigate(`${base}/c/${target.id}`, { replace: true });
  const mediumSrc = photoUrl('medium', c.studentNo, c.photoVersion);

  return (
    <div className="m-page" style={{ paddingBottom: 100 }}>
      <div className="m-header">
        <div className="m-header-row">
          <Button type="text" icon={<LeftOutlined />} onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(base))} style={{ marginLeft: -8 }}>
            名单
          </Button>
          <div className="m-header-title" style={{ textAlign: 'center' }}>
            {inMine && group?.row ? `第 ${group.row} 排 · ` : ''}
            {index >= 0 ? `${index + 1} / ${order.length}` : ''}
          </div>
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            自动下一位
            <Switch
              size="small"
              checked={autoNext}
              style={{ background: autoNext ? '#52c41a' : 'rgba(255,255,255,.35)' }}
              onChange={(v) => {
                setAutoNext(v);
                try {
                  localStorage.setItem(AUTO_NEXT_KEY, v ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
            />
          </span>
        </div>
      </div>

      <div className="m-card" style={{ padding: 12 }}>
        <div style={{ position: 'relative' }}>
          <Photo
            key={c.id}
            studentNo={c.studentNo}
            version={c.photoVersion}
            size="medium"
            width="100%"
            height="min(58vh, 120vw)"
            eager
            radius={10}
            onClick={() => mediumSrc && setPreview(true)}
          />
          {mediumSrc && (
            <div style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.45)', color: '#fff', borderRadius: 14, padding: '2px 10px', fontSize: 12 }}>
              <ZoomInOutlined /> 点击放大
            </div>
          )}
          {prev && (
            <Button shape="circle" icon={<LeftOutlined />} onClick={() => go(prev)} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.85 }} />
          )}
          {next && (
            <Button shape="circle" icon={<RightOutlined />} onClick={() => go(next)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.85 }} />
          )}
        </div>
        {mediumSrc && (
          <Image
            style={{ display: 'none' }}
            src={mediumSrc}
            preview={{ visible: preview, src: mediumSrc, onVisibleChange: setPreview }}
          />
        )}

        <div className="m-big-name">{c.name}</div>
        <div className="m-big-sno">{c.studentNo}</div>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          {c.seatNo ? (
            <Tag color="blue" style={{ fontSize: 16, padding: '4px 14px' }}>
              {c.room ? `${c.room} · ` : ''}
              {c.row ? `第 ${c.row} 排 · ` : ''}
              {c.seatNo} 号
            </Tag>
          ) : (
            <Tag style={{ fontSize: 14, padding: '3px 12px' }}>{c.room ? `${c.room} · ` : ''}未分配座位</Tag>
          )}
          {group?.owner && !ws.myGroups.includes(group) && (
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>该排由 {group.owner.userName} 负责</div>
          )}
        </div>
      </div>

      {c.status !== 'pending' && (
        <div style={{ margin: '0 12px' }}>
          <Alert
            type={c.status === 'normal' ? 'success' : c.handled ? 'info' : 'error'}
            showIcon
            message={
              <span>
                已核查：<Tag color={STATUS_META[c.status].color}>{c.status === 'issue' && c.issueType ? ISSUE_LABEL[c.issueType] : STATUS_META[c.status].label}</Tag>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {c.checkedByName} · {c.checkedAt ? dayjs(c.checkedAt).format('HH:mm:ss') : ''}
                </span>
              </span>
            }
            description={
              c.status === 'issue' ? (
                <div style={{ fontSize: 13 }}>
                  {c.issueNote && <div>说明：{c.issueNote}</div>}
                  {c.handled ? (
                    <div style={{ color: '#389e0d' }}>
                      管理员 {c.handledByName} 已处理{c.handleNote ? `：${c.handleNote}` : ''}
                    </div>
                  ) : (
                    <div style={{ color: '#cf1322' }}>等待管理员处理…</div>
                  )}
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      <div className="m-actionbar">
        <Button danger size="large" icon={<ExclamationCircleOutlined />} onClick={openIssue} loading={submitting === 'issue'} disabled={!!submitting} style={{ flex: 1 }}>
          有问题
        </Button>
        <Button type="primary" size="large" icon={<CheckOutlined />} onClick={onNormal} loading={submitting === 'normal'} disabled={!!submitting} style={{ flex: 1.6, background: '#52c41a' }}>
          正常
        </Button>
      </div>

      <Modal
        open={issueOpen}
        title={`上报异常 · ${c.name}`}
        onCancel={() => setIssueOpen(false)}
        centered
        width="calc(100vw - 24px)"
        style={{ maxWidth: 480 }}
        footer={[
          <Button key="c" size="large" onClick={() => setIssueOpen(false)}>
            取消
          </Button>,
          <Button key="ok" size="large" danger type="primary" loading={submitting === 'issue'} onClick={submitIssue}>
            提交并通知管理员
          </Button>,
        ]}
      >
        <div style={{ color: '#8c8c8c', marginBottom: 10, fontSize: 13 }}>
          {c.studentNo}
          {c.room ? ` · ${c.room}` : ''}
          {c.seatNo ? ` · 座位 ${c.seatNo}` : ''}
        </div>
        <Radio.Group
          className="issue-options"
          optionType="button"
          buttonStyle="solid"
          value={issueType}
          onChange={(e) => setIssueType(e.target.value)}
          style={{ display: 'flex', width: '100%', marginBottom: 14 }}
          options={ISSUE_OPTIONS}
        />
        <Input.TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={issueType === 'other' ? '请说明具体情况（必填）' : '补充说明（选填）'}
          autoSize={{ minRows: 3, maxRows: 6 }}
          maxLength={500}
          showCount
          style={{ fontSize: 16, marginBottom: 20 }}
          status={issueType === 'other' && !note.trim() ? 'warning' : undefined}
        />
      </Modal>
    </div>
  );
}
