const path = require("path");

module.exports = {
  apps: [
    {
      name: "venysound",
      script: "./dist/index.cjs",
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      // 메모리 500MB 초과 시 자동 재시작
      max_memory_restart: "500M",
      // 로그 파일 경로
      out_file: "/var/log/venysound/out.log",
      error_file: "/var/log/venysound/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // 예기치 않은 종료 시 자동 재시작
      autorestart: true,
      restart_delay: 3000,
      // 서버 재부팅 시 자동 시작
      watch: false,
    },
  ],
};
