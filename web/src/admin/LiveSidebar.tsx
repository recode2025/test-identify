import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, Empty, Switch, Tabs, Tag, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, BellOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { ChatThread } from '../components/ChatThread';
import type { Candidate, FeedItem } from '../lib/types';
import { useLive } from './live';
import { HandleModal } from './HandleModal';

const ACTION_META: Record<FeedItem['action'], { label: string; color: string }> = {
  normal: { label: '正常', color: 'success' },
  issue: { label: '异常', color: 'error' },
  reset: { label: '重置', color: 'default' },
  handle: { label: '已处理', color: 'processing' },
};

function ConversationList() {
  const live = useLive();
  if (!live.conversations.length) return <Empty style={{ marginTop: 60 }} description="暂无员工账号" />;
  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {live.conversations.map((c) => (
        <div key={c.staffId} className="a-conv" onClick={() => live.openChat(c.staffId)}>
          <Badge dot={c.online} color="#52c41a" offset={[-4, 30]}>
            <Avatar style={{ background: c.online ? '#1677ff' : '#bfbfbf' }} icon={<UserOutlined />} />
          </Badge>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>
                {c.displayName}
                <span style={{ color: '#bfbfbf', fontWeight: 400, fontSize: 12, marginLeft: 4 }}>{c.username}</span>
              </span>
              <span style={{ color: '#bfbfbf', fontSize: 12 }}>{c.last ? dayjs(c.last.createdAt).format('HH:mm') : ''}</span>
            </div>
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 13, width: '100%', display: 'block' }}>
              {c.last ? `${c.last.senderRole === 'admin' ? '我：' : c.last.senderRole === 'system' ? '[系统] ' : ''}${c.last.content}` : c.online ? '在线' : '离线'}
            </Typography.Text>
          </div>
          <Badge count={c.unread} />
        </div>
      ))}
    </div>
  );
}

function ChatPane() {
  const live = useLive();
  const conv = live.conversations.find((c) => c.staffId === live.openStaffId);
  if (!conv) return <ConversationList />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => live.openChat(null)} />
        <span className={`dot ${conv.online ? 'on' : ''}`} />
        <b>{conv.displayName}</b>
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>
          {conv.username} · {conv.online ? '在线' : '离线'}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatThread key={conv.staffId} viewer="admin" staffId={conv.staffId} quickReplies={['收到', '马上到', '请稍等，正在核实', '按正常处理', '请让考生出示证件']} />
      </div>
    </div>
  );
}

function FeedPane() {
  const live = useLive();
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [handling, setHandling] = useState<Candidate | null>(null);
  const items = useMemo(() => (issuesOnly ? live.feed.filter((f) => f.action === 'issue') : live.feed), [live.feed, issuesOnly]);

  // A feed row only knows the candidate id; fetch the current record before handling.
  const openHandle = async (f: FeedItem) => {
    const list = await api<Candidate[]>(`/issues?examId=${f.examId}`);
    const c = list.find((x) => x.id === f.candidateId);
    if (c) setHandling(c);
  };
  const handledIds = useMemo(() => new Set(live.feed.filter((f) => f.action === 'handle').map((f) => f.candidateId)), [live.feed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>核查动态实时推送</span>
        <span style={{ fontSize: 12 }}>
          仅看异常 <Switch size="small" checked={issuesOnly} onChange={setIssuesOnly} />
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!items.length && <Empty style={{ marginTop: 60 }} description="暂无动态" />}
        {items.map((f) => {
          const isIssue = f.action === 'issue';
          const done = isIssue && (f.handled || handledIds.has(f.candidateId));
          return (
            <div key={f.id} className={`a-feed-item ${isIssue ? 'issue' : ''} ${done ? 'handled' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <Tag color={ACTION_META[f.action].color}>{isIssue ? f.issueLabel : ACTION_META[f.action].label}</Tag>
                  <b>{f.candidateLabel}</b>
                </span>
                <span style={{ color: '#bfbfbf', fontSize: 12 }}>{dayjs(f.createdAt).format('HH:mm:ss')}</span>
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
                {f.examName} · {f.userName}
              </div>
              {f.note && <div style={{ marginTop: 4 }}>{f.action === 'handle' ? '处理意见：' : '说明：'}{f.note}</div>}
              {isIssue && !done && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  <Button size="small" type="primary" danger onClick={() => openHandle(f)}>
                    处理
                  </Button>
                  <FeedChatButton userId={f.userId} userName={f.userName} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <HandleModal candidate={handling} onClose={() => setHandling(null)} />
    </div>
  );
}

/** Jumps to the reporting staff member's conversation. */
function FeedChatButton({ userId, userName }: { userId: number; userName: string }) {
  const live = useLive();
  const conv = live.conversations.find((c) => c.staffId === userId);
  if (!conv) return null;
  return (
    <Button size="small" icon={<MessageOutlined />} onClick={() => live.openChat(conv.staffId)}>
      联系 {userName}
    </Button>
  );
}

export function LiveSidebar() {
  const live = useLive();
  return (
    <div className="a-live">
      <Tabs
        activeKey={live.tab}
        onChange={(k) => live.setTab(k as 'chat' | 'feed')}
        centered
        tabBarStyle={{ margin: 0 }}
        items={[
          {
            key: 'feed',
            label: (
              <Badge count={live.tab === 'feed' ? 0 : live.newFeed} size="small" offset={[8, 0]}>
                <span>
                  <BellOutlined /> 实时动态
                  {live.unhandledIssues > 0 && (
                    <Tooltip title="未处理的异常">
                      <Tag color="error" style={{ marginLeft: 6, marginRight: 0 }}>
                        {live.unhandledIssues}
                      </Tag>
                    </Tooltip>
                  )}
                </span>
              </Badge>
            ),
            children: <FeedPane />,
          },
          {
            key: 'chat',
            label: (
              <Badge count={live.unreadChats} size="small" offset={[8, 0]}>
                <span>
                  <MessageOutlined /> 员工消息
                </span>
              </Badge>
            ),
            children: <ChatPane />,
          },
        ]}
      />
    </div>
  );
}
