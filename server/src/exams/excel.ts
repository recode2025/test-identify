import * as ExcelJS from 'exceljs';

export type ColumnKey = 'seq' | 'studentNo' | 'name' | 'room' | 'seatNo';

const SYNONYMS: Record<ColumnKey, string[]> = {
  studentNo: ['学号', '考号', '准考证号', '学生编号', 'studentno', 'studentid'],
  name: ['姓名', '名称', '名字', '学生姓名', 'name'],
  room: ['考场', '考场号', '考场名称', '考室', '教室', 'room'],
  seatNo: ['座位号', '座位', '座号', '考场座位号', 'seat', 'seatno'],
  seq: ['序号', 'no', 'no.'],
};

export interface SheetRow {
  seq: number | null;
  studentNo: string;
  name: string;
  room: string | null;
  seatNo: string | null;
}

export interface SheetInfo {
  name: string;
  ok: boolean;
  reason?: string;
  headerRow?: number;
  columns?: Partial<Record<ColumnKey, string>>;
  rowCount: number;
  preview: SheetRow[];
}

/** Flattens every exceljs cell value shape (formula, rich text, hyperlink...) to plain text. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('result' in value) return cellText((value as any).result);
    if ('text' in value) return cellText((value as any).text);
    if ('error' in value) return '';
  }
  return String(value).trim();
}

const normalizeHeader = (s: string) => s.replace(/[\s*＊:：]/g, '').replace(/[（(].*$/, '').toLowerCase();

function matchHeader(row: ExcelJS.Row): Partial<Record<ColumnKey, number>> {
  const found: Partial<Record<ColumnKey, number>> = {};
  row.eachCell((cell, col) => {
    const text = normalizeHeader(cellText(cell.value));
    if (!text) return;
    for (const key of Object.keys(SYNONYMS) as ColumnKey[]) {
      if (found[key] == null && SYNONYMS[key].includes(text)) found[key] = col;
    }
  });
  return found;
}

function parseSheet(ws: ExcelJS.Worksheet): { info: SheetInfo; rows: SheetRow[] } {
  const info: SheetInfo = { name: ws.name, ok: false, rowCount: 0, preview: [] };
  let headerRow = 0;
  let cols: Partial<Record<ColumnKey, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = matchHeader(ws.getRow(r));
    if (m.studentNo && m.name) {
      headerRow = r;
      cols = m;
      break;
    }
  }
  if (!headerRow) {
    info.reason = '未找到「学号」和「姓名/名称」表头';
    return { info, rows: [] };
  }

  const header = ws.getRow(headerRow);
  info.headerRow = headerRow;
  info.columns = Object.fromEntries(
    Object.entries(cols).map(([k, c]) => [k, cellText(header.getCell(c as number).value)]),
  ) as SheetInfo['columns'];

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const studentNo = cellText(row.getCell(cols.studentNo!).value).replace(/\s/g, '');
    const name = cellText(row.getCell(cols.name!).value);
    if (!studentNo && !name) continue;
    const room = cols.room ? cellText(row.getCell(cols.room).value) : '';
    const seat = cols.seatNo ? cellText(row.getCell(cols.seatNo).value) : '';
    const seqText = cols.seq ? cellText(row.getCell(cols.seq).value) : '';
    const seq = /^\d+$/.test(seqText) ? Number(seqText) : null;
    rows.push({ seq, studentNo, name, room: room || null, seatNo: seat || null });
  }
  info.ok = rows.length > 0;
  if (!info.ok) info.reason = '表头下方没有数据';
  info.rowCount = rows.length;
  info.preview = rows.slice(0, 5);
  return { info, rows };
}

export async function readWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    throw new Error('无法读取文件，请上传 .xlsx 格式的 Excel 表格');
  }
  const parsed = wb.worksheets.map(parseSheet);
  // The 「最终」 sheet is the canonical one in the reference workbook; otherwise the first usable sheet.
  const recommended =
    parsed.find((p) => p.info.ok && p.info.name.trim() === '最终') ?? parsed.find((p) => p.info.ok);
  return { sheets: parsed, recommended: recommended?.info.name ?? null };
}

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('最终');
  ws.columns = [
    { header: '序号', key: 'seq', width: 8 },
    { header: '名称', key: 'name', width: 14 },
    { header: '学号', key: 'studentNo', width: 16 },
    { header: '考场', key: 'room', width: 12 },
    { header: '座位号', key: 'seatNo', width: 10 },
  ];
  ws.addRows([
    { seq: 1, name: '张三', studentNo: '260450101', room: '10B-405', seatNo: '01' },
    { seq: 2, name: '李四', studentNo: '260450102', room: '10B-405', seatNo: '02' },
    { seq: 3, name: '王五', studentNo: '260450103', room: '', seatNo: '' },
  ]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FF' } };
  ws.getColumn('studentNo').numFmt = '@';
  ws.getColumn('seatNo').numFmt = '@';
  ws.getCell('G1').value =
    '说明：学号、名称必填；考场、座位号可为空。座位号按「每排座位数」自动换算成第几排（如每排 12 座：01-12 为第 1 排），也可直接写成「3-5」表示第 3 排 5 号。表头需保留在第一行；其他列（如分数）导入时自动忽略。';
  ws.getCell('G1').font = { color: { argb: 'FF8C8C8C' } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
