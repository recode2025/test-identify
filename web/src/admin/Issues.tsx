import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Image, Segmented, Space, Table, Tag, Typography } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, photoUrl } from '../lib/api';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import { Photo } from '../components/Photo';
import { Candidate, ISSUE_LABEL } from '../lib/types';
import { HandleModal } from './HandleModal';
import { useLive } from './live';

export function Issues() {
  const live = useLive();
  const [handled, setHandled] = useState<'false' | 'true' | 'all'>('false');
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [handling, setHandling] = useState<Candidate | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return api<Candidate[]>(`/issues${handled === 'all' ? '' : `?handled=${handled}`}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [handled]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load);
  useSocketEvent('feed', (f: { action: string }) => f.action !== 'normal' && load());

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          异常处理
        </Typography.Title>
        <Segmented
          value={handled}
          onChange={(v) => setHandled(v as typeof handled)}
          options={[
            { value: 'false', label: `待处理${live.unhandledIssues ? ` (${live.unhandledIssues})` : ''}` },
            { value: 'true', label: '已处理' },
            { value: 'all', label: '全部' },
          ]}
        />
      </div>
      <Card styles={{ body: { padding: 0 } }}>
        <Image.PreviewGroup>
          <Table<Candidate>
            rowKey="id"
            loading={loading}
            dataSource={rows}
            pagination={{ pageSize: 50 }}
            columns={[
              {
                title: '照片',
                width: 70,
                render: (_, r) =>
                  r.photoVersion ? (
                    <Image width={44} height={58} style={{ objectFit: 'cover', borderRadius: 4 }} src={photoUrl('thumb', r.studentNo, r.photoVersion)!} preview={{ src: photoUrl('medium', r.studentNo, r.photoVersion)! }} />
                  ) : (
                    <Photo studentNo={r.studentNo} version={null} size="thumb" width={44} height={58} radius={4} />
                  ),
              },
              { title: '考试', dataIndex: 'examName', width: 160, ellipsis: true },
              {
                title: '考生',
                render: (_, r) => (
                  <div>
                    <b>{r.name}</b> {r.studentNo}
                    {r.seatNo && <Tag style={{ marginLeft: 6 }}>座 {r.seatNo}</Tag>}
                  </div>
                ),
              },
              { title: '类型', width: 80, render: (_, r) => <Tag color="error">{r.issueType ? ISSUE_LABEL[r.issueType] : '-'}</Tag> },
              { title: '情况说明', dataIndex: 'issueNote', ellipsis: true },
              {
                title: '上报',
                width: 150,
                render: (_, r) => (
                  <div style={{ fontSize: 12 }}>
                    <div>{r.checkedByName}</div>
                    <Typography.Text type="secondary">{r.checkedAt ? dayjs(r.checkedAt).format('MM-DD HH:mm:ss') : ''}</Typography.Text>
                  </div>
                ),
              },
              {
                title: '处理',
                width: 200,
                render: (_, r) =>
                  r.handled ? (
                    <div style={{ fontSize: 12 }}>
                      <Tag color="processing">已处理</Tag> {r.handledByName}
                      {r.handleNote && <div style={{ color: '#8c8c8c' }}>{r.handleNote}</div>}
                    </div>
                  ) : (
                    <Space>
                      <Button size="small" type="primary" danger onClick={() => setHandling(r)}>
                        处理
                      </Button>
                      {r.checkedById && (
                        <Button size="small" icon={<MessageOutlined />} onClick={() => live.openChat(r.checkedById!)}>
                          联系
                        </Button>
                      )}
                    </Space>
                  ),
              },
            ]}
          />
        </Image.PreviewGroup>
      </Card>
      <HandleModal candidate={handling} onClose={() => setHandling(null)} onDone={() => load()} />
    </div>
  );
}
