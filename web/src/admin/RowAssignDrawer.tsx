import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Drawer, Empty, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { groupByRow, RowGroup, sectionsByRoom } from '../lib/rows';
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
  /** Staff picked for each room's auto-distribution, keyed by room. */
  const [picked, setPicked] = useState<Map<string, number[]>>(new Map());
  const [perRow, setPerRow] = useState<number | null>(12);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => groupByRow(candidates, assignments).filter((g) => g.row), [candidates, assignments]);
  const sections = useMemo(() => sectionsByRoom(groups), [groups]);
  const unseated = useMemo(() => candidates.filter((c) => !c.row).length, [candidates]);

  useEffect(() => {
    if (!open || !exam) return;
    setPerRow(exam.seatsPerRow);
    const owned = groupByRow(candidates, assignments).filter((g) => g.owner);
    setDraft(new Map(owned.map((g) => [g.key, g.owner!.userId])));
    // Pre-pick whoever already works in each room.
    const byRoom = new Map<string, number[]>();
    owned.forEach((g) => byRoom.set(g.room, [...new Set([...(byRoom.get(g.room) ?? []), g.owner!.userId])]));
    setPicked(byRoom);
    api<UserRow[]>('/users')
      .then((users) => setStaff(users.filter((u) => u.role === 'staff' && u.enabled)))
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

  /** Per staff member: which rooms and how many rows/people. */
  const summary = useMemo(() => {
    const per = new Map<number, { rooms: Set<string>; rows: number; people: number }>();
    for (const g of groups) {
      const uid = draft.get(g.key);
      if (!uid) continue;
      const s = per.get(uid) ?? { rooms: new Set<string>(), rows: 0, people: 0 };
      s.rooms.add(g.room);
      s.rows++;
      s.people += g.candidates.length;
      per.set(uid, s);
    }
    return per;
  }, [groups, draft]);
  const unassigned = groups.filter((g) => !draft.has(g.key)).length;

  const setOwner = (keys: string[], uid: number | undefined) =>
    setDraft((prev) => {
      const next = new Map(prev);
      keys.forEach((k) => (uid ? next.set(k, uid) : next.delete(k)));
      return next;
    });

  const applyPerRow = async () => {
    if (!exam || perRow == null || perRow === exam.seatsPerRow) return;
    try {
      await api(`/exams/${exam.id}`, { method: 'PATCH', json: { seatsPerRow: perRow } });
      message.success('已按新的每排座位数重新分排，请检查分配');
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const autoAssign = (room: string, roomGroups: RowGroup[]) => {
    const ids = picked.get(room) ?? [];
    if (!ids.length) return message.warning('请先选择负责这个考场的员工');
    const run = () =>
      setDraft((prev) => {
        const next = new Map(prev);
        distribute(roomGroups, ids).forEach((uid, key) => next.set(key, uid));
        return next;
      });
    if (roomGroups.some((g) => draft.has(g.key))) {
      modal.confirm({ title: `重新分配${room || '本考场'}？`, content: '将覆盖这个考场当前的分配（保存前不会生效）。', onOk: run });
    } else run();
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
      width={800}
      title="按考场 / 排分配任务"
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
              每个考场单独分排：座位号按此数换算成第几排（如 12：01-12 第 1 排，13-24 第 2 排）；写成「3-5」时直接按第 3 排处理；设为 0
              则只识别「3-5」这种写法。
            </Typography.Text>
          </div>
        </div>

        {unseated > 0 && <Alert type="warning" showIcon message={`${unseated} 名考生没有座位号，无法分排；员工可在「全部考生」中搜索核查。`} />}

        {(summary.size > 0 || unassigned > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...summary].map(([uid, s]) => (
              <Tag key={uid} color="blue">
                {staffName.get(uid) ?? `#${uid}`}：{[...s.rooms].filter(Boolean).join('、')} {s.rows} 排 / {s.people} 人
              </Tag>
            ))}
            {unassigned > 0 && <Tag color="warning">未分配 {unassigned} 排</Tag>}
          </div>
        )}

        {sections.length === 0 ? (
          <Empty description="名单中没有座位号，无法按排分配" />
        ) : (
          sections.map((s) => {
            const owners = [...new Set(s.groups.map((g) => draft.get(g.key)).filter((u): u is number => !!u))];
            return (
              <Card
                key={s.room}
                size="small"
                title={
                  <span>
                    {s.room || '未填写考场'}
                    <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                      {s.groups.length} 排 · {s.total} 人 · 已核查 {s.normal + s.issue}
                      {s.issue > 0 && <Typography.Text type="danger"> · 异常 {s.issue}</Typography.Text>}
                    </Typography.Text>
                  </span>
                }
                extra={
                  owners.length > 0 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      负责：{owners.map((u) => staffName.get(u) ?? `#${u}`).join('、')}
                    </Typography.Text>
                  )
                }
              >
                <Space wrap style={{ marginBottom: 10 }}>
                  <Select
                    mode="multiple"
                    style={{ minWidth: 340 }}
                    value={picked.get(s.room) ?? []}
                    onChange={(ids) => setPicked((prev) => new Map(prev).set(s.room, ids))}
                    options={options}
                    optionFilterProp="label"
                    placeholder="选择负责本考场的员工（选 1 人即整个考场交给 TA）"
                    maxTagCount="responsive"
                  />
                  <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={() => autoAssign(s.room, s.groups)}>
                    {(picked.get(s.room)?.length ?? 0) === 1 ? '整个考场交给 TA' : '按人数平均分配本考场'}
                  </Button>
                </Space>
                <Table<RowGroup>
                  rowKey="key"
                  size="small"
                  pagination={false}
                  dataSource={s.groups}
                  columns={[
                    { title: '排', dataIndex: 'shortLabel', width: 90, render: (v) => <b>{v}</b> },
                    { title: '座位', dataIndex: 'seats', width: 130 },
                    { title: '人数', width: 60, render: (_, g) => g.candidates.length },
                    {
                      title: '进度',
                      width: 100,
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
                          onChange={(v) => setOwner([g.key], v)}
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            );
          })
        )}
      </Space>
    </Drawer>
  );
}
