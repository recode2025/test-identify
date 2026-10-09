import type { Candidate, RowAssignment } from './types';

export const rowKey = (room: string | null, row: number | null) => `${room ?? ''}|${row ?? ''}`;

export interface RowGroup {
  key: string;
  room: string;
  /** null: candidates without a seat number in this room. */
  row: number | null;
  label: string;
  seats: string;
  candidates: Candidate[];
  pending: number;
  normal: number;
  issue: number;
  owner: RowAssignment | null;
}

export function rowLabel(room: string | null, row: number | null) {
  const r = row ? `第 ${row} 排` : '未排座位';
  return room ? `${room} · ${r}` : r;
}

/** Splits a seat-ordered candidate list into consecutive room/row groups. */
export function groupByRow(candidates: Candidate[], assignments: RowAssignment[]): RowGroup[] {
  const owners = new Map(assignments.map((a) => [rowKey(a.room, a.row), a]));
  const groups: RowGroup[] = [];
  const byKey = new Map<string, RowGroup>();
  for (const c of candidates) {
    const key = rowKey(c.room, c.row);
    let g = byKey.get(key);
    if (!g) {
      g = { key, room: c.room ?? '', row: c.row, label: rowLabel(c.room, c.row), seats: '', candidates: [], pending: 0, normal: 0, issue: 0, owner: c.row ? owners.get(key) ?? null : null };
      byKey.set(key, g);
      groups.push(g);
    }
    g.candidates.push(c);
    g[c.status]++;
  }
  for (const g of groups) {
    const first = g.candidates[0].seatNo;
    const last = g.candidates[g.candidates.length - 1].seatNo;
    g.seats = !first ? '' : first === last ? `座位 ${first}` : `座位 ${first}–${last}`;
  }
  return groups;
}
