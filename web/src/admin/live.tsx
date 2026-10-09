import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button } from 'antd';
import { api } from '../lib/api';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { ChatMessage, Conversation, FeedItem } from '../lib/types';

interface LiveState {
  conversations: Conversation[];
  feed: FeedItem[];
  unreadChats: number;
  unhandledIssues: number;
  newFeed: number;
  tab: 'chat' | 'feed';
  setTab: (t: 'chat' | 'feed') => void;
  openStaffId: number | null;
  openChat: (staffId: number | null) => void;
  clearNewFeed: () => void;
  online: Set<number>;
  refreshIssues: () => void;
}

const LiveContext = createContext<LiveState>(null!);
export const useLive = () => useContext(LiveContext);

/** Short two-tone alert through WebAudio; no asset needed. */
let audioCtx: AudioContext | null = null;
function beep(kind: 'issue' | 'chat') {
  try {
    audioCtx ??= new AudioContext();
    const tones = kind === 'issue' ? [880, 660, 880] : [660, 880];
    tones.forEach((f, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.15, audioCtx!.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + i * 0.16 + 0.15);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(audioCtx!.currentTime + i * 0.16);
      osc.stop(audioCtx!.currentTime + i * 0.16 + 0.16);
    });
  } catch {
    /* audio blocked until first user gesture */
  }
}

function desktopNotify(title: string, body: string) {
  if (document.hasFocus() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: title });
  } catch {
    /* ignore */
  }
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { notification } = App.useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [unhandledIssues, setUnhandled] = useState(0);
  const [newFeed, setNewFeed] = useState(0);
  const [tab, setTab] = useState<'chat' | 'feed'>('feed');
  const [openStaffId, setOpenStaffId] = useState<number | null>(null);
  const [online, setOnline] = useState<Set<number>>(new Set());
  const openRef = useRef<number | null>(null);
  openRef.current = openStaffId;

  const loadConversations = useCallback(() => api<Conversation[]>('/chat/conversations').then(setConversations).catch(() => undefined), []);
  const loadFeed = useCallback(() => api<FeedItem[]>('/feed').then(setFeed).catch(() => undefined), []);
  const refreshIssues = useCallback(
    () => api<unknown[]>('/issues?handled=false').then((r) => setUnhandled(r.length)).catch(() => undefined),
    [],
  );
  const loadAll = useCallback(() => {
    loadConversations();
    loadFeed();
    refreshIssues();
  }, [loadConversations, loadFeed, refreshIssues]);

  useEffect(() => {
    loadAll();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const ask = () => Notification.requestPermission().catch(() => undefined);
      window.addEventListener('click', ask, { once: true });
    }
  }, [loadAll]);
  useLiveRefresh(loadAll);

  const openChat = useCallback((staffId: number | null) => {
    setOpenStaffId(staffId);
    if (staffId != null) {
      setTab('chat');
      setConversations((prev) => prev.map((c) => (c.staffId === staffId ? { ...c, unread: 0 } : c)));
    }
  }, []);

  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.staffId === msg.staffId);
      if (!exists) {
        loadConversations();
        return prev;
      }
      const isOpen = openRef.current === msg.staffId;
      const updated = prev.map((c) =>
        c.staffId === msg.staffId ? { ...c, last: msg, unread: c.unread + (msg.senderRole === 'staff' && !isOpen ? 1 : 0) } : c,
      );
      return updated.sort((a, b) => (b.last?.id ?? 0) - (a.last?.id ?? 0));
    });
    if (msg.senderRole === 'staff' && openRef.current !== msg.staffId) {
      beep('chat');
      desktopNotify(`${msg.senderName} 发来消息`, msg.content);
      notification.info({
        key: `chat-${msg.staffId}`,
        message: `${msg.senderName} 发来消息`,
        description: (
          <div>
            {msg.candidateLabel && <div style={{ color: '#8c8c8c', fontSize: 12 }}>考生：{msg.candidateLabel}</div>}
            {msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content}
          </div>
        ),
        placement: 'bottomLeft',
        btn: (
          <Button type="primary" size="small" onClick={() => (openChat(msg.staffId), notification.destroy(`chat-${msg.staffId}`))}>
            回复
          </Button>
        ),
      });
    }
  });

  useSocketEvent<{ staffId: number }>('chat:read', ({ staffId }) =>
    setConversations((prev) => prev.map((c) => (c.staffId === staffId ? { ...c, unread: 0 } : c))),
  );

  useSocketEvent<number[]>('presence:list', (ids) => setOnline(new Set(ids)));
  useSocketEvent<{ userId: number; online: boolean }>('presence', ({ userId, online: on }) => {
    setOnline((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  });

  useSocketEvent<FeedItem>('feed', (item) => {
    setFeed((prev) => [item, ...prev.filter((f) => f.id !== item.id)].slice(0, 300));
    if (tab !== 'feed') setNewFeed((n) => n + 1);
    if (item.action === 'issue' || item.action === 'handle' || item.action === 'reset') refreshIssues();
    if (item.action !== 'issue') notification.destroy(`issue-${item.candidateId}`);
    if (item.action === 'issue') {
      beep('issue');
      desktopNotify(`异常上报：${item.issueLabel}`, `${item.candidateLabel} · ${item.userName}`);
      notification.error({
        key: `issue-${item.candidateId}`,
        message: `异常上报：${item.issueLabel}`,
        description: (
          <div>
            <div style={{ fontWeight: 600 }}>{item.candidateLabel}</div>
            <div style={{ color: '#8c8c8c', fontSize: 12 }}>
              {item.examName} · 上报人 {item.userName}
            </div>
            {item.note && <div style={{ marginTop: 4 }}>{item.note}</div>}
          </div>
        ),
        duration: 0,
        placement: 'bottomLeft',
        btn: (
          <Button size="small" type="primary" danger onClick={() => (setTab('feed'), notification.destroy(`issue-${item.candidateId}`))}>
            查看
          </Button>
        ),
      });
    }
  });

  const unreadChats = conversations.reduce((n, c) => n + c.unread, 0);

  useEffect(() => {
    const total = unreadChats + unhandledIssues;
    document.title = total ? `(${total}) 考试身份核查 · 管理后台` : '考试身份核查 · 管理后台';
  }, [unreadChats, unhandledIssues]);

  const value = useMemo<LiveState>(
    () => ({
      conversations: conversations.map((c) => ({ ...c, online: online.has(c.staffId) })),
      feed,
      unreadChats,
      unhandledIssues,
      newFeed,
      tab,
      setTab: (t) => {
        setTab(t);
        if (t === 'feed') setNewFeed(0);
      },
      openStaffId,
      openChat,
      clearNewFeed: () => setNewFeed(0),
      online,
      refreshIssues,
    }),
    [conversations, feed, unreadChats, unhandledIssues, newFeed, tab, openStaffId, openChat, online, refreshIssues],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
