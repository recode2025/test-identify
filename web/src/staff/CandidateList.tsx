import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Input, Segmented, Tag } from 'antd';
import { CheckCircleFilled, DownOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Photo } from '../components/Photo';
import type { RowGroup } from '../lib/rows';
import { Candidate, ISSUE_LABEL, STATUS_META } from '../lib/types';
import { useStaffChat } from './StaffApp';
import { Filter, View, useWorkspace } from './ExamWorkspace';

const CHUNK = 60;

export function CandidateList() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const chat = useStaffChat();
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(64);

  useEffect(() => {
    chat.setCandidateRef(null);
    chat.setRaised(false);
  }, [chat]);

  useLayoutEffect(() => {
    if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
    window.scrollTo(0, ws.scrollY.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First visit: open the first row that still has work in it.
  useEffect(() => {
    if (ws.expanded.size) return;
    const first = ws.myGroups.find((g) => g.pending > 0);
    if (first) ws.revealGroup(first.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.myGroups.length]);

  const open = (id: number) => {
    ws.scrollY.current = window.scrollY;
    navigate(`c/${id}`);
  };

  const switchView = (v: View) => {
    ws.setView(v);
    ws.scrollY.current = 0;
    window.scrollTo(0, 0);
  };

  const mineView = ws.view === 'mine';
  const counts = mineView ? ws.myCounts : ws.counts;
  const checked = counts.normal + counts.issue;
  const myChecked = ws.myCounts.normal + ws.myCounts.issue;

  return (
    <div className="m-page" style={{ paddingBottom: 90 }}>
      <div className="m-header" ref={headerRef}>
        <div className="m-header-row">
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/m')} style={{ marginLeft: -8 }} />
          <div className="m-header-title">{ws.exam?.name ?? '考生名单'}</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, display: 'flex', gap: 12, marginTop: 4 }}>
          <span>{mineView ? `我的 ${ws.myGroups.length} 排` : ws.room || '全部考场'}</span>
          <span>
            已核查 {checked}/{counts.all}
          </span>
          <span>异常 {counts.issue}</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,.3)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${counts.all ? (checked / counts.all) * 100 : 0}%`, background: '#fff', transition: 'width .3s' }} />
        </div>
      </div>

      <div className="m-toolbar" style={{ top: headerH }}>
        <Segmented<View>
          block
          size="large"
          value={ws.view}
          onChange={switchView}
          options={[
            { value: 'mine', label: `我的任务 ${myChecked}/${ws.myCounts.all}` },
            { value: 'all', label: `全部考生 ${ws.candidates.length}` },
          ]}
        />
        {!mineView && <AllToolbar />}
      </div>

      {mineView ? <MyRows open={open} /> : <AllList open={open} />}
    </div>
  );
}

function AllToolbar() {
  const ws = useWorkspace();
  const { counts } = ws;
  return (
    <>
      {ws.rooms.length > 1 && (
        <div className="room-tabs">
          {['', ...ws.rooms].map((r) => (
            <span key={r} className={`room-tab${ws.room === r ? ' active' : ''}`} onClick={() => ws.setRoom(r)}>
              {r || '全部考场'}
            </span>
          ))}
        </div>
      )}
      <Input
        allowClear
        size="large"
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索 学号 / 姓名 / 座位号 / 考场"
        value={ws.search}
        onChange={(e) => ws.setSearch(e.target.value)}
        inputMode="search"
        style={{ fontSize: 16, marginTop: 8 }}
      />
      <Segmented<Filter>
        block
        style={{ marginTop: 8 }}
        value={ws.filter}
        onChange={ws.setFilter}
        options={(
          [
            ['pending', '待核查', counts.pending],
            ['all', '全部', counts.all],
            ['normal', '正常', counts.normal],
            ['issue', '异常', counts.issue],
          ] as const
        ).map(([value, text, n]) => ({
          value,
          label: (
            <div style={{ lineHeight: 1.25, padding: '3px 0' }}>
              <div style={{ fontSize: 13 }}>{text}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: value === 'issue' && n ? '#cf1322' : undefined }}>{n}</div>
            </div>
          ),
        }))}
      />
    </>
  );
}

/** The staff member's to-do: one card per assigned row, in seat order. */
function MyRows({ open }: { open: (id: number) => void }) {
  const ws = useWorkspace();

  if (!ws.myGroups.length) {
    return (
      <Empty style={{ marginTop: 60 }} description={ws.groups.some((g) => g.owner) ? '管理员还没有给你分配座位排' : '本场考试尚未按排分配任务'}>
        <Button type="primary" onClick={() => ws.setView('all')}>
          查看全部考生
        </Button>
      </Empty>
    );
  }

  const next = ws.mine.find((c) => c.status === 'pending');
  const nextGroup = next && ws.groupOf.get(next.id);

  return (
    <div>
      {next ? (
        <div className="m-next" onClick={() => open(next.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, opacity: 0.85 }}>继续核查 · 还剩 {ws.myCounts.pending} 人</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              {nextGroup?.label}
              {next.seatNo ? ` · ${next.seatNo} 号` : ''} {next.name}
            </div>
          </div>
          <RightOutlined style={{ fontSize: 18 }} />
        </div>
      ) : (
        <div className="m-next done">
          <CheckCircleFilled style={{ fontSize: 22 }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>你负责的 {ws.myGroups.length} 排已全部核查完成</div>
        </div>
      )}
      {ws.mySections.map((s) => (
        <div key={s.room}>
          {s.room && (
            <div className="room-head">
              <span className="room-head-name">{s.room}</span>
              <span>
                {s.groups.length} 排 · 已核查 {s.normal + s.issue}/{s.total}
                {s.issue > 0 && <span style={{ color: '#cf1322' }}> · 异常 {s.issue}</span>}
              </span>
            </div>
          )}
          {s.groups.map((g) => (
            <RowCard key={g.key} group={g} expanded={ws.expanded.has(g.key)} onToggle={() => ws.toggleGroup(g.key)} open={open} short={!!s.room} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RowCard({
  group: g,
  expanded,
  onToggle,
  open,
  short,
}: {
  group: RowGroup;
  expanded: boolean;
  onToggle: () => void;
  open: (id: number) => void;
  /** Under a room heading: drop the room from the title. */
  short: boolean;
}) {
  const done = g.pending === 0;
  return (
    <div className={`row-card${done ? ' done' : ''}`}>
      <div className="row-card-head" onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-card-title">{short ? g.shortLabel : g.label}</div>
          <div className="m-item-sub">
            {g.seats} · {g.candidates.length} 人
          </div>
        </div>
        {g.issue > 0 && (
          <Tag color="error" style={{ marginRight: 0 }}>
            异常 {g.issue}
          </Tag>
        )}
        {done ? (
          <span style={{ color: '#389e0d', fontWeight: 600 }}>
            <CheckCircleFilled /> 完成
          </span>
        ) : (
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {g.normal + g.issue}/{g.candidates.length}
          </span>
        )}
        <DownOutlined style={{ color: '#bfbfbf', fontSize: 12, transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
      </div>
      <div className="seat-strip">
        {g.candidates.map((c) => (
          <span key={c.id} className={`seat ${c.status}`} onClick={() => open(c.id)}>
            {c.seatNo ?? '—'}
          </span>
        ))}
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          {g.candidates.map((c) => (
            <CandidateItem key={c.id} c={c} onClick={() => open(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The whole roster, searchable, with a header line wherever a new row starts. */
function AllList({ open }: { open: (id: number) => void }) {
  const ws = useWorkspace();
  const [limit, setLimit] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setLimit(CHUNK), [ws.filter, ws.search]);

  // Render the list incrementally; long lists stay smooth on low-end phones.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + CHUNK), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ws.filtered.length]);

  if (ws.filtered.length === 0) {
    return <Empty style={{ marginTop: 60 }} description={ws.search ? '没有匹配的考生' : ws.filter === 'pending' ? '全部核查完成 🎉' : '暂无考生'} />;
  }

  const showHeads = ws.groups.length > 1;
  return (
    <div>
      {ws.filtered.slice(0, limit).map((c, i, list) => {
        const g = ws.groupOf.get(c.id);
        const head = showHeads && g && (i === 0 || ws.groupOf.get(list[i - 1].id) !== g);
        return (
          <div key={c.id}>
            {head && (
              <div className="m-group-head">
                <span style={{ fontWeight: 600, color: '#262626' }}>{ws.room ? g.shortLabel : g.label}</span>
                <span>{g.seats}</span>
                <span style={{ marginLeft: 'auto' }}>{g.row ? (g.owner ? `${g.owner.userName} 负责` : '未分配') : ''}</span>
              </div>
            )}
            <CandidateItem c={c} onClick={() => open(c.id)} />
          </div>
        );
      })}
      <div ref={sentinel} style={{ height: 1 }} />
    </div>
  );
}

function CandidateItem({ c, onClick }: { c: Candidate; onClick: () => void }) {
  return (
    <div className="m-item" onClick={onClick}>
      <Photo studentNo={c.studentNo} version={c.photoVersion} size="thumb" width={48} height={64} />
      <div className="m-item-main">
        <div className="m-item-name">
          {c.name}
          {c.seatNo && (
            <Tag color="blue" style={{ marginLeft: 8, fontWeight: 400 }}>
              座 {c.seatNo}
            </Tag>
          )}
        </div>
        <div className="m-item-sub" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {c.studentNo}
          {c.checkedByName && c.status !== 'pending' ? ` · ${c.checkedByName}` : ''}
        </div>
      </div>
      <Tag color={STATUS_META[c.status].color} style={{ marginRight: 0 }}>
        {c.status === 'issue' && c.issueType ? ISSUE_LABEL[c.issueType] : STATUS_META[c.status].label}
      </Tag>
    </div>
  );
}
