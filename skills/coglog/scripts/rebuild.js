// coglog-rebuild-version: 1
const fs = require('fs');
const path = require('path');

const PROJ_ROOT = process.cwd();
const COGNITIVE_DIR = path.join(PROJ_ROOT, '.cognitive');
const RAW_DIR = path.join(COGNITIVE_DIR, 'raw');
const ARCHIVE_DIR = path.join(RAW_DIR, 'archive');
const WIKI_DIR = path.join(COGNITIVE_DIR, 'wiki');
const KNOWLEDGE_MAP = path.join(COGNITIVE_DIR, 'KNOWLEDGE_MAP.md');
const BACKUP_BASE = path.join(COGNITIVE_DIR, '_backup');
const CONFIG_FILE = path.join(COGNITIVE_DIR, 'config.json');

const COGLOG_SKILL_VERSION = 2;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function getBackupDir() {
  const today = new Date().toISOString().slice(0, 10);
  const base = path.join(BACKUP_BASE, today);
  if (!fs.existsSync(base)) return base;
  let i = 2;
  while (fs.existsSync(path.join(BACKUP_BASE, `${today}_${i}`))) i++;
  return path.join(BACKUP_BASE, `${today}_${i}`);
}
function backupKB(backupDir) {
  const wikiBackup = path.join(backupDir, 'wiki');
  ensureDir(wikiBackup);
  let wikiCount = 0;
  if (fs.existsSync(WIKI_DIR)) {
    const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) { fs.copyFileSync(path.join(WIKI_DIR, f), path.join(wikiBackup, f)); wikiCount++; }
  }
  if (fs.existsSync(KNOWLEDGE_MAP)) fs.copyFileSync(KNOWLEDGE_MAP, path.join(backupDir, 'KNOWLEDGE_MAP.md'));
  return wikiCount;
}
function clearKB() {
  if (fs.existsSync(WIKI_DIR)) {
    const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) fs.unlinkSync(path.join(WIKI_DIR, f));
  }
  if (fs.existsSync(KNOWLEDGE_MAP)) fs.unlinkSync(KNOWLEDGE_MAP);
}
function restoreArchive() {
  if (!fs.existsSync(ARCHIVE_DIR)) return 0;
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md'));
  for (const f of files) fs.renameSync(path.join(ARCHIVE_DIR, f), path.join(RAW_DIR, f));
  return files.length;
}
function updateVersion() {
  let config = {};
  if (fs.existsSync(CONFIG_FILE)) { try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch {} }
  config.coglogSkillVersion = COGLOG_SKILL_VERSION;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const backupDir = getBackupDir();
ensureDir(BACKUP_BASE);
const wikiCount = backupKB(backupDir);
clearKB();
const restored = restoreArchive();
updateVersion();

console.log('Rebuild complete.');
console.log(`  Backed up  : ${wikiCount} wiki files + KNOWLEDGE_MAP → ${path.relative(PROJ_ROOT, backupDir)}`);
console.log(`  Restored   : ${restored} raw sessions from archive`);
console.log(`  Version    : coglogSkillVersion set to ${COGLOG_SKILL_VERSION} in config.json`);
