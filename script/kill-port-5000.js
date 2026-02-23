// 포트 5000 사용 중인 프로세스 종료 (서버 재실행 전용)
const { execSync } = require("child_process");
const port = 5000;

try {
  if (process.platform === "win32") {
    let out = "";
    try {
      out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (_) {
      console.log("포트 5000에서 실행 중인 프로세스 없음");
      process.exit(0);
    }
    const lines = out.trim().split("\n").filter((l) => l.includes("LISTENING"));
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log("포트 5000 해제됨 (PID " + pid + ")");
      } catch (_) {}
    }
    if (pids.size === 0) console.log("포트 5000에서 실행 중인 프로세스 없음");
  } else {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: "inherit" });
      console.log("포트 5000 해제됨");
    } catch (_) {
      console.log("포트 5000에서 실행 중인 프로세스 없음");
    }
  }
} catch (e) {
  console.log("포트 정리 완료");
}
process.exit(0);
