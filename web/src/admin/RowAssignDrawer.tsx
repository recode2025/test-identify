import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Drawer, Empty, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { groupByRow, RowGroup } from '../lib/rows';
import type { Candidate, Exam, RowAssignment, UserRow } from '../lib/types';

/**
 * Splits the rows into contiguous blocks of roughly equal headcount, one block per staff member,
 * so each person walks adjacent rows. A row goes to whoever's share contains its midpoint.
 */
function distribute(groups: RowGroup[], staffIds: number[]) {
  const total = groups.reduce((n, g) => n + g.candidates.length, 0);
  const result = new Map<string, number>();
  let before = 0;
  for (const g of groups) {
    const mid = before + g.candidates.length / 2;
    result.set(g.key, staffIds[Math.min(staffIds.length - 1, Math.floor((mid / total) * staffIds.length))]);
    before += g.candidates.length;
  }
  return result;
}

export function RowAssignDrawer({
  exam,
  candidates,
  assignments,
  open,
  onClose,
}: {
  exam: Exam | null;
  candidates: Candidate[];
  assignments: RowAssignment[];
  open: boolean;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp();
  const [staff, setStaff] = useState<UserRow[]>([]);
  const [draft, setDraft] = useState<Map<string, number>>(new Map());
  const [picked, setPicked] = useState<number[]>([]);
  const [perRow, setPerRow] = useState<number | null>(12);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => groupByRow(candidates, assignments).filter((g) => g.row), [candidates, assignments]);
  const unseated = useMemo(() => candidates.filter((c) => !c.row).length, [candidates]);

  useEffect(() => {
    if (!open || !exam) return;
    setPerRow(exam.seatsPerRow);
    setDraft(new Map(groupByRow(candidates, assignments).flatMap((g) => (g.owner ? [[g.key, g.owner.userId] as const] : []))));
    api<UserRow[]>('/users')
      .then((users) => {
        const list = users.filter((u) => u.role === 'staff' && u.enabled);
        setStaff(list);
        const onExam = list.filter((u) => u.examIds.includes(exam.id)).map((u) => u.id);
        setPicked(onExam.length ? onExam : list.map((u) => u.id));
      })
      .catch((e) => message.error(e.message));
    // Only reset the draft when the drawer opens, not on every live update behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Rows get renumbered when seatsPerRow changes; keep the existing draft keys that still exist.
  useEffect(() => {
    if (!open) return;
    setDraft((prev) => {
      const keys = new Set(groups.map((g) => g.key));
      return new Map([...prev].filter(([k]) => keys.has(k)));
    });
  }, [groups, open]);

  const staffName = useMemo(() => new Map(staff.map((u) => [u.id, u.displayName || u.username])), [staff]);
  const options = staff.map((u) => ({
    value: u.id,
    label: `${u.displayName || u.username}（${u.username}）${exam && !u.examIds.includes(exam.id) ? ' · 将自动加入本考试' : ''}`,
  }));

  const summary = useMemo(() => {
    const per = new Map<number, { rows: number; people: number }>();
    for (const g of groups) {
      const uid = draft.get(g.key);
      if (!uid) continue;
      const s = per.get(uid) ?? { rows: 0, people: 0 };
      s.rows++;
      s.people += g.candidates.length;
      per.set(uid, s);
    }
    return per;
  }, [groups, draft]);
  const unassigned = groups.filter((g) => !draft.has(g.key)).length;

  const applyPerRow = async () => {
    if (!exam || perRow == null || perRow === exam.seatsPerRow) return;
    try {
      await api(`/exams/${exam.id}`, { method: 'PATCH', json: { seatsPerRow: perRow } });
      message.success('已按新的每排座位数重新分排，请检查分配');
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const autoAssign = () => {
    if (!picked.length) return message.warning('请先选择参与分配的员工');
    const run = () => setDraft(distribute(groups, picked));
    if (draft.size) modal.confirm({ title: '重新平均分配？', content: '将覆盖当前的分配方案（保存前不会生效）。', onOk: run });
    else run();
  };

  const save = async () => {
    if (!exam) return;
    setSaving(true);
    try {
      const items = groups.flatMap((g) => (draft.has(g.key) ? [{ room: g.room, row: g.row, userId: draft.get(g.key) }] : []));
      await api(`/exams/${exam.id}/assignments`, { method: 'PUT', json: { items } });
      message.success('分配已保存，员工端已同步');
      onClose();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      title="按排分配任务"
      extra={
        <Space>
          <Button onClick={() => setDraft(new Map())} disabled={!draft.size}>
            清空
          </Button>
          <Button type="primary" loading={saving} onClick={save}>
            保存分配
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Space wrap>
            <span>每排座位数</span>
            <InputNumber min={0} max={200} value={perRow} onChange={setPerRow} style={{ width: 90 }} />
            <Button onClick={applyPerRow} disabled={perRow == null || perRow === exam?.seatsPerRow}>
              应用
            </Button>
          </Space>
          <div style={{ marginTop: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              座位号按此数换算成第几排（如 12：01-12 第 1 排，13-24 第 2 排）。座位号写成「3-5」时直接按第 3 排处理。设为 0 则只识别「3-5」这种写法。
            </Typography.Text>
          </div>
        </div>

        {unseated > 0 && (
          <Alert type="warning" showIcon message={`${unseated} 名考生没有座位号，无法分排；员工可在「全部考生」中搜索核查。`} />
        )}

        <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
          <Space wrap>
            <span>参与员工</span>
            <Select
              mode="multiple"
              style={{ minWidth: 360 }}
              value={picked}
              onChange={setPicked}
              options={options}
              optionFilterProp="label"
              placeholder="选择员工"
              maxTagCount="responsive"
            />
            <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={autoAssign} disabled={!groups.length}>
              按人数平均分配
            </Button>
          </Space>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...summary].map(([uid, s]) => (
              <Tag key={uid} color="blue">
                {staffName.get(uid) ?? `#${uid}`}：{s.rows} 排 / {s.people} 人
              </Tag>
            ))}
            {unassigned > 0 && <Tag color="warning">未分配 {unassigned} 排</Tag>}
          </div>
        </div>

        {groups.length === 0 ? (
          <Empty description="名单中没有座位号，无法按排分配" />
        ) : (
          <Table<RowGroup>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={groups}
            columns={[
              { title: '排', dataIndex: 'label', width: 160, render: (v) => <b>{v}</b> },
              { title: '座位', dataIndex: 'seats', width: 130 },
              { title: '人数', width: 60, render: (_, g) => g.candidates.length },
              {
                title: '进度',
                width: 90,
                render: (_, g) => (
                  <span>
                    {g.normal + g.issue}/{g.candidates.length}
                    {g.issue > 0 && <Typography.Text type="danger"> · {g.issue} 异常</Typography.Text>}
                  </span>
                ),
              },
              {
                title: '负责人',
                render: (_, g) => (
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="未分配"
                    style={{ width: '100%' }}
                    value={draft.get(g.key)}
                    options={options}
                    onChange={(v) =>
                      setDraft((prev) => {
                        const next = new Map(prev);
                        if (v) next.set(g.key, v);
                        else next.delete(g.key);
                        return next;
                      })
                    }
                  />
                ),
              },
            ]}
          />
        )}
      </Space>
    </Drawer>
  );
}
