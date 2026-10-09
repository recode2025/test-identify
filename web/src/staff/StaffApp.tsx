import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { App, Badge, Drawer, FloatButton } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket, useSocketEvent } from '../lib/socket';
import { ChatThread } from '../components/ChatThread';
import type { ChatMessage } from '../lib/types';
import { ExamList } from './ExamList';
import { ExamWorkspace } from './ExamWorkspace';
import { CandidateList } from './CandidateList';
import { CandidateDetail } from './CandidateDetail';

interface ChatCtx {
  setCandidateRef: (ref: { id: number; label: string } | null) => void;
  setRaised: (raised: boolean) => void;
  open: () => void;
}
const ChatContext = createContext<ChatCtx>(null!);
export const useStaffChat = () => useContext(ChatContext);

const QUICK_REPLIES = ['请求支援', '考生身份存疑，请确认', '考生无照片', '名单中查无此人', '已处理完毕'];

export default function StaffApp() {
  const { user } = useAuth();
  const { notification } = App.useApp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [adminOnline, setAdminOnline] = useState(false);
  const [candidateRef, setCandidateRef] = useState<{ id: number; label: string } | null>(null);
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    getSocket();
    api<{ count: number }>('/chat/unread').then((r) => setUnread(r.count)).catch(() => undefined);
  }, []);

  useSocketEvent<boolean>('admin:online', setAdminOnline);
  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    if (msg.senderId === user?.id) return;
    if (open) return;
    setUnread((n) => n + 1);
    navigator.vibrate?.(200);
    notification.info({
      key: 'chat',
      message: msg.senderRole === 'system' ? '系统通知' : `管理员 ${msg.senderName}`,
      description: msg.content.length > 60 ? msg.content.slice(0, 60) + '…' : msg.content,
      placement: 'top',
      duration: 5,
      onClick: () => {
        notification.destroy('chat');
        setOpen(true);
      },
    });
  });

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const ctx = useMemo<ChatCtx>(() => ({ setCandidateRef, setRaised, open: () => setOpen(true) }), []);

  return (
    <ChatContext.Provider value={ctx}>
      <Routes>
        <Route index element={<ExamList />} />
        <Route path="exam/:examId" element={<ExamWorkspace />}>
          <Route index element={<CandidateList />} />
          <Route path="c/:candidateId" element={<CandidateDetail />} />
        </Route>
      </Routes>

      <FloatButton
        type="primary"
        icon={<Badge count={unread} size="small" offset={[6, -6]}><CustomerServiceOutlined style={{ color: '#fff', fontSize: 20 }} /></Badge>}
        onClick={() => setOpen(true)}
        style={{ right: 16, bottom: raised ? 96 : 24, width: 52, height: 52, transition: 'bottom .2s' }}
        tooltip={undefined}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        height="82%"
        destroyOnClose={false}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' }, header: { padding: '12px 16px' } }}
        title={
          <span>
            联系管理员 <span className={`dot ${adminOnline ? 'on' : ''}`} style={{ marginLeft: 6 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 4 }}>{adminOnline ? '管理员在线' : '管理员离线，上线后可见'}</span>
          </span>
        }
      >
        <ChatThread viewer="staff" candidateRef={candidateRef} quickReplies={QUICK_REPLIES} active={open} />
      </Drawer>
    </ChatContext.Provider>
  );
}
