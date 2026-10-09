import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { Result, Spin, Button } from 'antd';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { groupByRow, RowGroup } from '../lib/rows';
import { getSocket, useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { Candidate, CheckStatus, Exam, RowAssignment } from '../lib/types';

export type Filter = 'pending' | 'all' | 'normal' | 'issue';
/** mine: the rows the admin handed to this staff member; all: the whole roster with search. */
export type View = 'mine' | 'all';

export interface Workspace {
  exam: Exam | null;
  candidates: Candidate[];
  byId: Map<number, Candidate>;
  filtered: Candidate[];
  counts: Record<CheckStatus | 'all', number>;
  filter: Filter;
  setFilter: (f: Filter) => void;
  search: string;
  setSearch: (s: string) => void;
  groups: RowGroup[];
  groupOf: Map<number, RowGroup>;
  myGroups: RowGroup[];
  mine: Candidate[];
  myCounts: Record<CheckStatus | 'all', number>;
  view: View;
  setView: (v: View) => void;
  /** The list the detail page pages through for the current view. */
  navList: Candidate[];
  expanded: Set<string>;
  toggleGroup: (key: string) => void;
  revealGroup: (key: string) => void;
  upsert: (c: Candidate) => void;
  scrollY: React.MutableRefObject<number>;
  reload: () => Promise<void>;
}

export const useWorkspace = () => useOutletContext<Workspace>();

export function matches(c: Candidate, q: string) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return (
    c.name.toLowerCase().includes(s) ||
    c.studentNo.includes(s) ||
    (c.seatNo ?? '').toLowerCase().includes(s) ||
    (c.room ?? '').toLowerCase().includes(s)
  );
}

function countOf(list: Candidate[]) {
  const counts = { all: list.length, pending: 0, normal: 0, issue: 0 };
  list.forEach((c) => counts[c.status]++);
  return counts;
}

/** Holds the candidate list for list + detail routes, kept live via the exam's socket room. */
export function ExamWorkspace() {
  const examId = Number(useParams().examId);
  const { user } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [assignments, setAssignments] = useState<RowAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const scrollY = useRef(0);

  const reload = useCallback(async () => {
    try {
      const [exams, list, rows] = await Promise.all([
        api<Exam[]>('/exams'),
        api<Candidate[]>(`/exams/${examId}/candidates`),
        api<RowAssignment[]>(`/exams/${examId}/assignments`),
      ]);
      setExam(exams.find((e) => e.id === examId) ?? null);
      setCandidates(list);
      setAssignments(rows);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [examId]);

  const reloadAssignments = useCallback(() => {
    api<RowAssignment[]>(`/exams/${examId}/assignments`).then(setAssignments).catch(() => undefined);
  }, [examId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Rooms are per connection, so re-join after every reconnect.
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit('exam:join', examId);
    if (s.connected) join();
    s.on('connect', join);
    return () => {
      s.off('connect', join);
    };
  }, [examId]);

  useLiveRefresh(reload);

  const upsert = useCallback((c: Candidate) => {
    setCandidates((prev) => (prev ? prev.map((x) => (x.id === c.id ? c : x)) : prev));
  }, []);

  useSocketEvent<Candidate>('candidate:updated', (c) => c.examId === examId && upsert(c));
  useSocketEvent<{ examId: number }>('candidates:reload', (p) => p.examId === examId && reload());
  useSocketEvent<{ examId: number }>('assignments:changed', (p) => p.examId === examId && reloadAssignments());
  useSocketEvent('exams:changed', reload);

  const toggleGroup = useCallback(
    (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );
  const revealGroup = useCallback((key: string) => setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key))), []);

  const rowData = useMemo(() => {
    const list = candidates ?? [];
    const groups = groupByRow(list, assignments);
    const groupOf = new Map<number, RowGroup>();
    groups.forEach((g) => g.candidates.forEach((c) => groupOf.set(c.id, g)));
    const myGroups = groups.filter((g) => g.owner?.userId === user?.id);
    const mine = myGroups.flatMap((g) => g.candidates);
    return { groups, groupOf, myGroups, mine, myCounts: countOf(mine) };
  }, [candidates, assignments, user?.id]);

  // Until the staff member picks a tab, land on their own rows when they have any.
  const effectiveView: View = view ?? (rowData.myGroups.length ? 'mine' : 'all');

  const value = useMemo<Workspace>(() => {
    const list = candidates ?? [];
    const filtered = list.filter((c) => (filter === 'all' || c.status === filter) && matches(c, search));
    return {
      exam,
      candidates: list,
      byId: new Map(list.map((c) => [c.id, c])),
      filtered,
      counts: countOf(list),
      filter,
      setFilter,
      search,
      setSearch,
      ...rowData,
      view: effectiveView,
      setView,
      navList: effectiveView === 'mine' ? rowData.mine : filtered,
      expanded,
      toggleGroup,
      revealGroup,
      upsert,
      scrollY,
      reload,
    };
  }, [exam, candidates, filter, search, rowData, effectiveView, expanded, toggleGroup, revealGroup, upsert, reload]);

  if (error && !candidates) {
    return <Result status="warning" title={error} extra={<Button onClick={() => history.back()}>返回</Button>} />;
  }
  if (!candidates) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }
  return <Outlet context={value} />;
}
