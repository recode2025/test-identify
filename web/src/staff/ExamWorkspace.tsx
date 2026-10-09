import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { Result, Spin, Button } from 'antd';
import { api } from '../lib/api';
import { getSocket, useLiveRefresh, useSocketEvent } from '../lib/socket';
import type { Candidate, CheckStatus, Exam } from '../lib/types';

export type Filter = 'pending' | 'all' | 'normal' | 'issue';

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
  upsert: (c: Candidate) => void;
  scrollY: React.MutableRefObject<number>;
  reload: () => Promise<void>;
}

export const useWorkspace = () => useOutletContext<Workspace>();

export function matches(c: Candidate, q: string) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return c.name.toLowerCase().includes(s) || c.studentNo.includes(s) || (c.seatNo ?? '').toLowerCase() === s || (c.seatNo ?? '').toLowerCase().includes(s);
}

/** Holds the candidate list for list + detail routes, kept live via the exam's socket room. */
export function ExamWorkspace() {
  const examId = Number(useParams().examId);
  const [exam, setExam] = useState<Exam | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const scrollY = useRef(0);

  const reload = useCallback(async () => {
    try {
      const [exams, list] = await Promise.all([api<Exam[]>('/exams'), api<Candidate[]>(`/exams/${examId}/candidates`)]);
      setExam(exams.find((e) => e.id === examId) ?? null);
      setCandidates(list);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
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
  useSocketEvent('exams:changed', reload);

  const value = useMemo<Workspace>(() => {
    const list = candidates ?? [];
    const counts = { all: list.length, pending: 0, normal: 0, issue: 0 };
    list.forEach((c) => counts[c.status]++);
    const filtered = list.filter((c) => (filter === 'all' || c.status === filter) && matches(c, search));
    return {
      exam,
      candidates: list,
      byId: new Map(list.map((c) => [c.id, c])),
      filtered,
      counts,
      filter,
      setFilter,
      search,
      setSearch,
      upsert,
      scrollY,
      reload,
    };
  }, [exam, candidates, filter, search, upsert, reload]);

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
