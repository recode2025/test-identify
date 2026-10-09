/**
 * Resets a password from the command line (e.g. forgotten admin password).
 *   node server/scripts/reset-password.js <username> <newPassword>
 * Run on the server; existing logins of that account are signed out. Safe while the app is running.
 */
const { join, resolve } = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6) {
  console.error('用法：node server/scripts/reset-password.js <账号> <新密码（至少 6 位）>');
  process.exit(1);
}
const dataDir = resolve(process.env.DATA_DIR || join(__dirname, '..', 'data'));
const db = new Database(join(dataDir, 'identify.db'), { fileMustExist: true });
const res = db
  .prepare('UPDATE users SET passwordHash = ?, tokenVersion = tokenVersion + 1, enabled = 1 WHERE username = ?')
  .run(bcrypt.hashSync(password, 10), username);
db.close();
if (!res.changes) {
  console.error(`账号不存在：${username}`);
  process.exit(1);
}
console.log(`已重置 ${username} 的密码，并确保账号为启用状态`);
