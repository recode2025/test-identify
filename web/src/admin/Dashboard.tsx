import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Col, Empty, Progress, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { Exam } from '../lib/types';
import { ExamFormModal } from './ExamForm';

export function Dashboard() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => api<Exam[]>('/exams').then(setExams).catch(() => setExams((e) => e ?? [])), []);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load);

  // Stats change on every check; coalesce bursts into one refetch.
  const [tick, setTick] = useState(0);
  useSocketEvent('candidate:updated', () => setTick((t) => t + 1));
  useSocketEvent('candidates:reload', () => setTick((t) => t + 1));
  useSocketEvent('photos:changed', () => setTick((t) => t + 1));
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(load, 800);
    return () => clearTimeout(t);
  }, [tick, load]);

  const totals = (exams ?? []).reduce(
    (a, e) => ({ total: a.total + e.stats.total, checked: a.checked + e.stats.normal + e.stats.issue, issue: a.issue + e.stats.issue, unhandled: a.unhandled + e.stats.unhandled }),
    { total: 0, checked: 0, issue: 0, unhandled: 0 },
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          考试管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          新建考试
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="考生总数" value={totals.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="已核查" value={totals.checked} suffix={totals.total ? `/ ${totals.total}` : ''} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="异常" value={totals.issue} valueStyle={{ color: totals.issue ? '#cf1322' : undefined }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="待处理异常" value={totals.unhandled} valueStyle={{ color: totals.unhandled ? '#cf1322' : undefined }} />
          </Card>
        </Col>
      </Row>

      {exams === null ? (
        <Spin />
      ) : exams.length === 0 ? (
        <Card>
          <Empty description="还没有考试，先新建一场考试，再导入考生名单和照片">
            <Button type="primary" onClick={() => setCreating(true)}>
              新建考试
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {exams.map((e) => {
            const checked = e.stats.normal + e.stats.issue;
            return (
              <Col key={e.id} xs={24} xl={12} xxl={8}>
                <Card hoverable onClick={() => navigate(`exams/${e.id}`)} title={<span>{e.name}</span>} extra={e.active ? <Tag color="green">启用</Tag> : <Tag>已停用</Tag>}>
                  <Space size={16} style={{ color: '#8c8c8c', marginBottom: 12, flexWrap: 'wrap' }}>
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
                    <span>
                      <PictureOutlined /> 照片 {e.stats.withPhoto}/{e.stats.total}
                    </span>
                  </Space>
                  <Progress
                    percent={e.stats.total ? Math.round((checked / e.stats.total) * 100) : 0}
                    success={{ percent: e.stats.total ? Math.round((e.stats.normal / e.stats.total) * 100) : 0 }}
                    strokeColor="#ff4d4f"
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Tag>共 {e.stats.total}</Tag>
                    <Tag color="success">正常 {e.stats.normal}</Tag>
                    <Tag color="error">异常 {e.stats.issue}</Tag>
                    <Tag color="processing">待核查 {e.stats.pending}</Tag>
                    {e.stats.unhandled > 0 && <Tag color="red">待处理 {e.stats.unhandled}</Tag>}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <ExamFormModal open={creating} onClose={() => setCreating(false)} onSaved={(e) => (load(), navigate(`exams/${e.id}`))} />
    </div>
  );
}
