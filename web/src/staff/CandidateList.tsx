import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Input, Segmented, Tag } from 'antd';
import { LeftOutlined, SearchOutlined } from '@ant-design/icons';
import { Photo } from '../components/Photo';
import { ISSUE_LABEL, STATUS_META } from '../lib/types';
import { useStaffChat } from './StaffApp';
import { Filter, useWorkspace } from './ExamWorkspace';

const CHUNK = 60;

export function CandidateList() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const chat = useStaffChat();
  const [limit, setLimit] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
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

  useEffect(() => setLimit(CHUNK), [ws.filter, ws.search]);

  // Render the list incrementally; long lists stay smooth on low-end phones.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + CHUNK), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ws.filtered.length]);

  const open = (id: number) => {
    ws.scrollY.current = window.scrollY;
    navigate(`c/${id}`);
  };

  const { counts } = ws;
  const checked = counts.normal + counts.issue;

  return (
    <div className="m-page" style={{ paddingBottom: 90 }}>
      <div className="m-header" ref={headerRef}>
        <div className="m-header-row">
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/m')} style={{ marginLeft: -8 }} />
          <div className="m-header-title">{ws.exam?.name ?? '考生名单'}</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, display: 'flex', gap: 12, marginTop: 4 }}>
          <span>
            已核查 {checked}/{counts.all}
          </span>
          <span>正常 {counts.normal}</span>
          <span>异常 {counts.issue}</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,.3)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${counts.all ? (checked / counts.all) * 100 : 0}%`, background: '#fff', transition: 'width .3s' }} />
        </div>
      </div>

      <div className="m-toolbar" style={{ top: headerH }}>
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="搜索 学号 / 姓名 / 座位号"
          value={ws.search}
          onChange={(e) => ws.setSearch(e.target.value)}
          inputMode="search"
          style={{ fontSize: 16 }}
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
      </div>

      {ws.filtered.length === 0 ? (
        <Empty style={{ marginTop: 60 }} description={ws.search ? '没有匹配的考生' : ws.filter === 'pending' ? '全部核查完成 🎉' : '暂无考生'} />
      ) : (
        <div>
          {ws.filtered.slice(0, limit).map((c) => (
            <div key={c.id} className="m-item" onClick={() => open(c.id)}>
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
          ))}
          <div ref={sentinel} style={{ height: 1 }} />
        </div>
      )}
    </div>
  );
}
