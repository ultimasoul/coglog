// coglog-schedule-version: 1
const { execSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const PROJ_ROOT = process.cwd();
const CONFIG = path.join(PROJ_ROOT, '.cognitive', 'config.json');
const INGEST = path.join(PROJ_ROOT, '.cognitive', 'scripts', 'ingest.js');
const LOGS = path.join(PROJ_ROOT, '.cognitive', 'logs');

function encodeProjectPath(p) { return p.toLowerCase().replace(/[/\\:]/g, '-').replace(/^-+/, ''); }
const encoded = encodeProjectPath(PROJ_ROOT);
const taskName = `CogLog-${encoded}`;
function getOS() {
  if (process.platform === 'win32') return 'windows';
  return spawnSync('uname', ['-s'], { encoding: 'utf8' }).stdout.trim() === 'Darwin' ? 'macos' : 'linux';
}
function getNodePath() { try { return execSync('node -e "process.stdout.write(process.execPath)"').toString().trim(); } catch { return process.execPath; } }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } }
function writeConfig(cfg) { fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2)); }

const os = getOS();
const nodePath = getNodePath();
const [,, cmd = 'create', ...rest] = process.argv;
const hours = parseInt(rest[0]) || 4;

function createWindows() {
  try { execSync(`schtasks /create /tn "${taskName}" /tr ("${nodePath}" "${INGEST}") /sc HOURLY /mo ${hours} /f`, { stdio: 'pipe' }); return true; }
  catch (e) { console.error(e.message); return false; }
}
function createMacos() {
  if (!fs.existsSync(LOGS)) fs.mkdirSync(LOGS, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.coglog.${encoded}</string>
  <key>ProgramArguments</key><array><string>${nodePath}</string><string>${INGEST}</string></array>
  <key>StartInterval</key><integer>${hours * 3600}</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${LOGS}/ingest.log</string>
  <key>StandardErrorPath</key><string>${LOGS}/ingest-error.log</string>
</dict></plist>`;
  const plistPath = path.join(process.env.HOME, 'Library', 'LaunchAgents', `com.coglog.${encoded}.plist`);
  try { fs.writeFileSync(plistPath, plist); execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' }); return true; }
  catch (e) { console.error(e.message); return false; }
}
function createLinux() {
  const cronExpr = `0 */${hours} * * *`;
  const line = `${cronExpr} ${nodePath} ${INGEST} # ${taskName}`;
  try {
    const current = spawnSync('crontab', ['-l'], { encoding: 'utf8' }).stdout || '';
    const filtered = current.split('\n').filter(l => !l.includes(taskName)).join('\n');
    const newCron = (filtered.trim() ? filtered + '\n' : '') + line + '\n';
    const tmp = '/tmp/coglog-cron.txt';
    fs.writeFileSync(tmp, newCron);
    execSync(`crontab ${tmp}`, { stdio: 'pipe' });
    return true;
  } catch (e) { console.error(e.message); return false; }
}
function statusWindows() { try { return execSync(`schtasks /query /tn "${taskName}" /fo LIST`, { encoding: 'utf8', stdio: 'pipe' }); } catch { return null; } }
function statusMacos() { try { return execSync(`launchctl list com.coglog.${encoded}`, { encoding: 'utf8', stdio: 'pipe' }); } catch { return null; } }
function statusLinux() { try { return (spawnSync('crontab', ['-l'], { encoding: 'utf8' }).stdout || '').split('\n').find(l => l.includes(taskName)) || null; } catch { return null; } }
function removeWindows() { try { execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'pipe' }); return true; } catch { return false; } }
function removeMacos() {
  const plistPath = path.join(process.env.HOME, 'Library', 'LaunchAgents', `com.coglog.${encoded}.plist`);
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' }); if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath); return true; } catch { return false; }
}
function removeLinux() {
  try {
    const current = spawnSync('crontab', ['-l'], { encoding: 'utf8' }).stdout || '';
    const filtered = current.split('\n').filter(l => !l.includes(taskName)).filter(Boolean).join('\n');
    const tmp = '/tmp/coglog-cron.txt';
    fs.writeFileSync(tmp, filtered + '\n');
    execSync(`crontab ${tmp}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

if (cmd === 'create' || cmd === 'update') {
  const cfg = readConfig();
  if (cfg.schedule && cmd !== 'update') {
    console.log(`ℹ️  Existing schedule found (every ${cfg.schedule.hours}h). Run: node schedule.js update ${hours} to replace.`);
    process.exit(0);
  }
  let ok = false;
  if (os === 'windows') ok = createWindows();
  else if (os === 'macos') ok = createMacos();
  else ok = createLinux();
  if (ok) {
    cfg.schedule = { hours, taskName, createdAt: new Date().toISOString() };
    writeConfig(cfg);
    console.log(`✅ Scheduled: node ingest.js every ${hours}h\nTask: ${taskName}\nPlatform: ${os}`);
  } else {
    console.error('❌ Failed to create schedule. Check error above.');
    process.exit(1);
  }
} else if (cmd === 'status') {
  const cfg = readConfig();
  if (!cfg.schedule) { console.log('ℹ️  No schedule configured. Run: node schedule.js create [N]'); process.exit(0); }
  let out = null;
  if (os === 'windows') out = statusWindows();
  else if (os === 'macos') out = statusMacos();
  else out = statusLinux();
  if (out) console.log(`🕐 Schedule active (every ${cfg.schedule.hours}h)\nTask: ${taskName}\n${out}`);
  else console.log(`⚠️  Schedule in config but not found in OS. Run: node schedule.js create`);
} else if (cmd === 'off') {
  const cfg = readConfig();
  if (!cfg.schedule) { console.log('ℹ️  No schedule to remove.'); process.exit(0); }
  let ok = false;
  if (os === 'windows') ok = removeWindows();
  else if (os === 'macos') ok = removeMacos();
  else ok = removeLinux();
  if (ok) { delete cfg.schedule; writeConfig(cfg); console.log(`✅ Schedule removed: ${taskName}`); }
  else console.error('❌ Failed to remove. Remove manually from OS task scheduler.');
} else {
  console.log('Usage: node schedule.js [create [N] | update N | status | off]\n  N = hours between runs (default: 4)');
}
