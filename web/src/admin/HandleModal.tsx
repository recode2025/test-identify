import { useState } from 'react';
import { App, Descriptions, Input, Modal, Tag } from 'antd';
import dayjs from 'dayjs';
import { api } from '../lib/api';
import { Photo } from '../components/Photo';
import { Candidate, ISSUE_LABEL } from '../lib/types';

const PRESETS = ['已核实，系本人', '已安排巡考到场处理', '已取消考试资格', '已登记，考后处理'];

export function HandleModal({ candidate, onClose, onDone }: { candidate: Candidate | null; onClose: () => void; onDone?: (c: Candidate) => void }) {
  const { message } = App.useApp();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const c = candidate;

  const submit = async () => {
    if (!c) return;
    setLoading(true);
    try {
      const updated = await api<Candidate>(`/candidates/${c.id}/handle`, { method: 'POST', json: { note } });
      message.success('已标记处理，并通知上报员工');
      setNote('');
      onDone?.(updated);
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={!!c} title="处理异常" onCancel={onClose} onOk={submit} okText="确认已处理" confirmLoading={loading} width={560} destroyOnClose>
      {c && (
        <div style={{ display: 'flex', gap: 16 }}>
          <Photo studentNo={c.studentNo} version={c.photoVersion} size="medium" width={130} height={173} eager />
          <div style={{ flex: 1 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="考生">
                {c.name}（{c.studentNo}）
              </Descriptions.Item>
              <Descriptions.Item label="座位号">{c.seatNo || '—'}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color="error">{c.issueType ? ISSUE_LABEL[c.issueType] : '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="说明">{c.issueNote || '—'}</Descriptions.Item>
              <Descriptions.Item label="上报">
                {c.checkedByName} · {c.checkedAt ? dayjs(c.checkedAt).format('MM-DD HH:mm:ss') : ''}
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      )}
      <div style={{ margin: '12px 0 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <Tag key={p} style={{ cursor: 'pointer' }} onClick={() => setNote(p)}>
            {p}
          </Tag>
        ))}
      </div>
      <Input.TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="处理意见（会同步发送给上报员工）" autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} />
    </Modal>
  );
}
