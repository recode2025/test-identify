/**
 * Which row a seat is in. "3-5" / "3排5号" name the row explicitly; otherwise the
 * last number in the seat is counted off `perRow` seats at a time (01-12 → 1, 13-24 → 2).
 */
export function seatRow(seatNo: string | null, perRow: number): number | null {
  if (!seatNo) return null;
  const explicit = seatNo.match(/^\D*?(\d+)\s*(?:排|-|_|—|\/)\s*(\d+)/);
  if (explicit) return Number(explicit[1]) || null;
  if (!perRow) return null;
  const nums = seatNo.match(/\d+/g);
  const n = nums ? Number(nums[nums.length - 1]) : 0;
  return n > 0 ? Math.ceil(n / perRow) : null;
}

/** Map key for one row of one room; the row number never contains '|', so keys can't collide. */
export const rowKey = (room: string | null, row: number) => `${room ?? ''}|${row}`;
