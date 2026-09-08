/**
 * npm run dev — port eýýäm ulanylýarsa köne prosesi togtat (täze API ýollary işlesin).
 */
const { execSync } = require('child_process');

const port = String(process.argv[2] || '8000').trim();
if (!/^\d+$/.test(port)) process.exit(0);

if (process.platform === 'win32') {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const pids = [...new Set(
      out.split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => /^\d+$/.test(pid) && pid !== '0'),
    )];
    pids.forEach((pid) => {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Port ${port}: köne proses togtadyldy (PID ${pid})`);
      } catch { /* ignore */ }
    });
  } catch { /* port boş */ }
}
