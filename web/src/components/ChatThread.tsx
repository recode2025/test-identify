import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { App, Button, Checkbox, Input, Spin, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { ChatMessage } from '../lib/types';

interface Props {
  viewer: 'admin' | 'staff';
  /** Required for admins: which staff conversation to show. */
  staffId?: number;
  /** Staff: candidate currently on screen, offered as an attachment. */
  candidateRef?: { id: number; label: string } | null;
  quickReplies?: string[];
  active?: boolean;
}

const PAGE = 50;

function fmtTime(t: string) {
  const d = dayjs(t);
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('MM-DD HH:mm');
}

export function ChatThread({ viewer, staffId, candidateRef, quickReplies, active = true }: Props) {
  const { message } = App.useApp();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const query = viewer === 'admin' ? `staffId=${staffId}` : '';

  const markRead = useCallback(() => {
    api('/chat/read', { method: 'POST', json: viewer === 'admin' ? { staffId } : {} }).catch(() => undefined);
  }, [viewer, staffId]);

  const load = useCallback(async () => {
    const rows = await api<ChatMessage[]>(`/chat/messages?${query}`);
    setItems(rows);
    setHasMore(rows.length >= PAGE);
    setLoading(false);
    stickBottom.current = true;
  }, [query]);

  useEffect(() => {
    setLoading(true);
    load().catch(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (active && items.length) markRead();
  }, [active, items.length, markRead]);

  useLiveRefresh(() => load().catch(() => undefined));

  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    if (viewer === 'admin' && msg.staffId !== staffId) return;
    stickBottom.current = true;
    setItems((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, active]);

  const loadOlder = async () => {
    if (!items.length) return;
    const el = listRef.current!;
    const prevHeight = el.scrollHeight;
    const rows = await api<ChatMessage[]>(`/chat/messages?${query}&before=${items[0].id}`);
    stickBottom.current = false;
    setHasMore(rows.length >= PAGE);
    setItems((prev) => [...rows, ...prev]);
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - prevHeight));
  };

  const send = async (content = text) => {
    content = content.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await api<ChatMessage>('/chat/messages', {
        method: 'POST',
        json: { content, staffId, candidateId: viewer === 'staff' && attach && candidateRef ? candidateRef.id : undefined },
      });
      stickBottom.current = true;
      setItems((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (content === text.trim()) setText('');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const mine = (m: ChatMessage) => m.senderRole === viewer;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        className="chat-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <>
            {hasMore && (
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <Button size="small" type="link" onClick={loadOlder}>
                  加载更早的消息
                </Button>
              </div>
            )}
            {!items.length && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: 13 }}>
                {viewer === 'staff' ? '有任何问题可在此直接询问管理员' : '暂无消息'}
              </div>
            )}
            {items.map((m) =>
              m.senderRole === 'system' ? (
                <div className="chat-system" key={m.id}>
                  <div>
                    {m.candidateLabel && <div style={{ fontWeight: 600 }}>{m.candidateLabel}</div>}
                    {m.content}
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className={`chat-row ${mine(m) ? 'mine' : ''}`}>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: mine(m) ? 'flex-end' : 'flex-start', flex: 1 }}>
                    <div className="chat-meta">
                      {mine(m) && viewer === 'staff' ? '我' : m.senderName} · {fmtTime(m.createdAt)}
                    </div>
                    <div className="chat-bubble">
                      {m.candidateLabel && <div className="chat-ref">考生：{m.candidateLabel}</div>}
                      {m.content}
                    </div>
                  </div>
                </div>
              ),
            )}
          </>
        )}
      </div>

      {quickReplies?.length ? (
        <div style={{ display: 'flex', gap: 6, padding: '6px 8px 0', overflowX: 'auto', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
          {quickReplies.map((q) => (
            <Tag key={q} style={{ cursor: 'pointer', padding: '2px 10px', fontSize: 13, flexShrink: 0 }} onClick={() => send(q)}>
              {q}
            </Tag>
          ))}
        </div>
      ) : null}
      {viewer === 'staff' && candidateRef && (
        <div style={{ background: '#fff', padding: '6px 10px 0' }}>
          <Checkbox checked={attach} onChange={(e) => setAttach(e.target.checked)}>
            <span style={{ fontSize: 13 }}>附带当前考生：{candidateRef.label}</span>
          </Checkbox>
        </div>
      )}
      <div className="chat-input">
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder={viewer === 'admin' ? '回复员工（Enter 发送，Shift+Enter 换行）' : '输入问题…'}
          maxLength={1000}
          onKeyDown={(e) => {
            if (viewer === 'admin' && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          style={{ fontSize: viewer === 'staff' ? 16 : 14 }}
        />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => send()} disabled={!text.trim()}>
          发送
        </Button>
      </div>
    </div>
  );
}
