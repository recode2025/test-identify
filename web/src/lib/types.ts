export type Role = 'admin' | 'staff';
export type CheckStatus = 'pending' | 'normal' | 'issue';
export type IssueType = 'cheat' | 'substitute' | 'other';

export interface Me {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface ExamStats {
  total: number;
  normal: number;
  issue: number;
  pending: number;
  unhandled: number;
  withPhoto: number;
}

export interface Exam {
  id: number;
  name: string;
  date: string;
  location: string;
  active: boolean;
  seatsPerRow: number;
  createdAt: string;
  stats: ExamStats;
  /** Staff only: the rows of this exam assigned to the viewer. */
  myRows?: { room: string; row: number }[];
}

export interface RowAssignment {
  room: string;
  row: number;
  userId: number;
  userName: string;
}

export interface Candidate {
  id: number;
  examId: number;
  seq: number | null;
  studentNo: string;
  name: string;
  room: string | null;
  seatNo: string | null;
  /** Derived by the server from seatNo and the exam's seatsPerRow; null when the seat is blank. */
  row: number | null;
  status: CheckStatus;
  issueType: IssueType | null;
  issueNote: string | null;
  checkedById: number | null;
  checkedByName: string | null;
  checkedAt: string | null;
  handled: boolean;
  handleNote: string | null;
  handledByName: string | null;
  handledAt: string | null;
  photoVersion: string | null;
  examName?: string;
}

export interface ChatMessage {
  id: number;
  staffId: number;
  senderId: number | null;
  senderName: string;
  senderRole: 'admin' | 'staff' | 'system';
  content: string;
  candidateId: number | null;
  candidateLabel: string | null;
  readByAdmin: boolean;
  readByStaff: boolean;
  createdAt: string;
}

export interface Conversation {
  staffId: number;
  username: string;
  displayName: string;
  enabled: boolean;
  online: boolean;
  unread: number;
  last: ChatMessage | null;
}

export interface FeedItem {
  id: number;
  examId: number;
  examName: string;
  candidateId: number;
  action: 'normal' | 'issue' | 'reset' | 'handle';
  issueType: IssueType | null;
  issueLabel: string | null;
  note: string | null;
  userId: number;
  userName: string;
  handled: boolean;
  createdAt: string;
  candidate: { id: number; name: string; studentNo: string; seatNo: string | null };
  candidateLabel: string;
}

export interface UserRow {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  enabled: boolean;
  createdAt: string;
  examIds: number[];
  online: boolean;
}

export interface PhotoJob {
  id: string;
  status: 'running' | 'done' | 'error';
  fileName: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: { name: string; reason: string }[];
  error?: string;
}

export const ISSUE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: 'cheat', label: '作弊' },
  { value: 'substitute', label: '替考' },
  { value: 'other', label: '其他' },
];
export const ISSUE_LABEL: Record<IssueType, string> = { cheat: '作弊', substitute: '替考', other: '其他' };
export const STATUS_META: Record<CheckStatus, { label: string; color: string }> = {
  pending: { label: '未核查', color: 'default' },
  normal: { label: '正常', color: 'success' },
  issue: { label: '异常', color: 'error' },
};
