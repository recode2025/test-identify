// PM2 配置：pm2 start deploy/ecosystem.config.cjs
// 必须单实例（fork 模式）：在线状态、照片处理任务和 WebSocket 房间都保存在进程内存中，不能用 cluster 多进程。
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'identify',
      cwd: path.join(__dirname, '..'),
      script: 'server/dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // 导出 Excel 中的时间按服务器时区格式化，云服务器默认是 UTC
        TZ: 'Asia/Shanghai',
        PORT: 3000,
        // 局域网直连用 0.0.0.0；放在 Nginx 后面时改成 127.0.0.1
        HOST: '0.0.0.0',
      },
    },
  ],
};
