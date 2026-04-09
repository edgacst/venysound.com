const path = require("path");

module.exports = {
  apps: [
    {
      name: "venysound",
      script: "./dist/index.cjs",
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: "fork",
      // pm2 restart / start 시 --env production 없이도 적용되도록 기본 env 필수.
      // NODE_ENV 미설정 시 dist 번들이 setupVite(./vite) 분기로 들어가 즉시 종료 → 502.
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      // 메모리 500MB 초과 시 자동 재시작
      max_memory_restart: "500M",
      // out_file 미지정 → ~/.pm2/logs/ ( /var/log/venysound 없는 VPS에서 로그 경로 오류 방지 )
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // 예기치 않은 종료 시 자동 재시작
      autorestart: true,
      restart_delay: 3000,
      // 서버 재부팅 시 자동 시작
      watch: false,
    },
  ],
};
