/**
 * Online backup: safe while the server is running (uses SQLite's backup API, WAL-aware).
 *   node server/scripts/backup.js [targetDir]
 * Writes <targetDir>/identify-YYYYMMDD-HHmmss.db (default: <DATA_DIR>/backups) and keeps the newest 30.
 */
const { join, resolve } = require('path');
const { mkdirSync, readdirSync, rmSync, existsSync } = require('fs');
const Database = require('better-sqlite3');

const dataDir = resolve(process.env.DATA_DIR || join(__dirname, '..', 'data'));
const source = join(dataDir, 'identify.db');
const targetDir = resolve(process.argv[2] || join(dataDir, 'backups'));
const KEEP = Number(process.env.BACKUP_KEEP || 30);

if (!existsSync(source)) {
  console.error(`找不到数据库：${source}`);
  process.exit(1);
}
mkdirSync(targetDir, { recursive: true });
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const target = join(targetDir, `identify-${stamp}.db`);

const db = new Database(source, { readonly: true, fileMustExist: true });
db.backup(target)
  .then(() => {
    db.close();
    const old = readdirSync(targetDir).filter((f) => /^identify-\d{8}-\d{6}\.db$/.test(f)).sort().reverse().slice(KEEP);
    old.forEach((f) => rmSync(join(targetDir, f)));
    console.log(`备份完成：${target}${old.length ? `（清理旧备份 ${old.length} 个）` : ''}`);
  })
  .catch((e) => {
    console.error('备份失败：', e.message);
    process.exit(1);
  });
