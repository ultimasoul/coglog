// coglog-version: 5
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJ_ROOT = process.cwd();
const COGNITIVE_DIR = path.join(PROJ_ROOT, '.cognitive');
const RAW_DIR = path.join(COGNITIVE_DIR, 'raw');
const STATE_FILE = path.join(COGNITIVE_DIR, 'state.json');
const CONFIG_FILE = path.join(COGNITIVE_DIR, 'config.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function loadJSON(file, fallback) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) {}
  }
  return fallback;
}
function encodeProjectPath(p) {
  return p.toLowerCase().replace(/:/g, '-').replace(/[/\\]/g, '-').replace(/^-+/, '');
}
function findProjectCacheDir(config) {
  if (process.env.COGLOG_CACHE_DIR) { console.log(`Using COGLOG_CACHE_DIR override: ${process.env.COGLOG_CACHE_DIR}`); return process.env.COGLOG_CACHE_DIR; }
  if (config.cacheDir) { console.log(`Using configured cacheDir: ${config.cacheDir}`); return config.cacheDir; }
  const claudeProjectsBase = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeProjectsBase)) { console.error(`CogLog Error: Claude projects directory not found at: ${claudeProjectsBase}`); console.error(`If you're using a different LLM tool, set the COGLOG_CACHE_DIR env var to the session log directory.`); process.exit(1); }
  const expectedFolderName = encodeProjectPath(PROJ_ROOT);
  const expectedPath = path.join(claudeProjectsBase, expectedFolderName);
  if (fs.existsSync(expectedPath)) return expectedPath;
  const projectLastSegment = path.basename(PROJ_ROOT).toLowerCase();
  const entries = fs.readdirSync(claudeProjectsBase);
  const candidates = entries.filter(e => e.toLowerCase().endsWith(projectLastSegment));
  if (candidates.length === 1) { console.warn(`CogLog Warning: Exact path match not found. Using fuzzy match: ${candidates[0]}`); return path.join(claudeProjectsBase, candidates[0]); }
  console.error(`CogLog Error: Could not auto-locate the Claude project cache for: ${PROJ_ROOT}`);
  console.error(`Expected encoded folder name: ${expectedFolderName}`);
  if (candidates.length > 1) console.error(`Multiple fuzzy matches found: ${candidates.join(', ')}`);
  console.error(`Available projects in ${claudeProjectsBase}:`);
  entries.slice(0, 15).forEach(e => console.error(`  - ${e}`));
  console.error(`\nTo fix: add "cacheDir": "<path>" to .cognitive/config.json, or set the COGLOG_CACHE_DIR env var.`);
  process.exit(1);
}
function parseSession(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const exchanges = [];
  let currentExchange = null;
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = (entry.message && typeof entry.message === 'object') ? entry.message : entry;
    const role = msg.role || entry.type;
    const timestamp = entry.timestamp || entry.ts || null;
    const msgContent = msg.content;
    if (role === 'human' || role === 'user') {
      let userText = '';
      if (typeof msgContent === 'string') { userText = msgContent; }
      else if (Array.isArray(msgContent)) { userText = msgContent.filter(c => c.type === 'text').map(c => c.text).join('\n'); }
      if (userText.trim()) { currentExchange = { timestamp, userMessage: userText.trim(), thinkingBlocks: [], assistantText: '' }; exchanges.push(currentExchange); }
    }
    if (role === 'assistant' && Array.isArray(msgContent)) {
      for (const block of msgContent) {
        if (block.type === 'thinking' && block.thinking) {
          if (!currentExchange) { currentExchange = { timestamp, userMessage: null, thinkingBlocks: [], assistantText: '' }; exchanges.push(currentExchange); }
          currentExchange.thinkingBlocks.push(block.thinking);
          if (timestamp && !currentExchange.timestamp) currentExchange.timestamp = timestamp;
        }
        if (block.type === 'text' && block.text && currentExchange) currentExchange.assistantText += block.text;
      }
    }
    if (entry.thinking && typeof entry.thinking === 'string') {
      if (!currentExchange) { currentExchange = { timestamp, userMessage: null, thinkingBlocks: [], assistantText: '' }; exchanges.push(currentExchange); }
      currentExchange.thinkingBlocks.push(entry.thinking);
    }
  }
  return exchanges.filter(e => e.thinkingBlocks.length > 0);
}
function findJsonlFiles(dir, fileList = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return fileList; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) findJsonlFiles(full, fileList);
    else if (entry.endsWith('.jsonl') || entry.endsWith('.json')) fileList.push(full);
  }
  return fileList;
}
function formatSession(filePath, exchanges) {
  const sessionId = path.basename(filePath, path.extname(filePath));
  let output = `# Raw Cognitive Log\n\n**Source:** \`${filePath}\`  \n**Session ID:** ${sessionId}  \n**Ingested:** ${new Date().toISOString()}\n\n---\n\n`;
  for (const exchange of exchanges) {
    if (exchange.timestamp) { try { output += `### ${new Date(exchange.timestamp).toLocaleString()}\n\n`; } catch { output += `### ${exchange.timestamp}\n\n`; } }
    if (exchange.userMessage) output += `**User:** ${exchange.userMessage}\n\n`;
    for (const block of exchange.thinkingBlocks) { output += `> **[Thinking]**\n`; block.split('\n').forEach(l => { output += `> ${l}\n`; }); output += `\n`; }
    if (exchange.assistantText && exchange.assistantText.trim()) { const s = exchange.assistantText.trim(); output += `**Assistant Output:**\n\n${s.length > 500 ? s.slice(0, 500) + '...' : s}\n\n`; }
    output += `---\n\n`;
  }
  return output;
}

ensureDir(RAW_DIR);
const state = loadJSON(STATE_FILE, { ingestedFiles: {}, prunedFiles: [] });
if (!state.prunedFiles) state.prunedFiles = [];
if (Array.isArray(state.ingestedFiles)) {
  const migrated = {};
  for (const filePath of state.ingestedFiles) { let size = 0; try { size = fs.statSync(filePath).size; } catch {} migrated[filePath] = { size, rawFile: null }; }
  state.ingestedFiles = migrated;
  console.log(`Migrated ${Object.keys(migrated).length} entries from legacy state format.`);
}
const config = loadJSON(CONFIG_FILE, {});
const cacheDir = findProjectCacheDir(config);
const filterPatterns = (config.filterPatterns || []).map(p => p.toLowerCase());
function matchesFilter(text) { if (!text || filterPatterns.length === 0) return false; const lower = text.toLowerCase(); return filterPatterns.some(p => lower.includes(p)); }

console.log(`Project root:  ${PROJ_ROOT}`);
console.log(`Cache dir:     ${cacheDir}`);
console.log(`Output dir:    ${RAW_DIR}`);
console.log('');

const logFiles = findJsonlFiles(cacheDir);
let newSessions = 0, reIngested = 0, skipped = 0, empty = 0, filteredOut = 0;

for (const filePath of logFiles) {
  if (state.prunedFiles.includes(filePath)) continue;
  let currentSize = 0;
  try { currentSize = fs.statSync(filePath).size; } catch { continue; }
  const existing = state.ingestedFiles[filePath];
  if (existing && existing.size === currentSize) { skipped++; continue; }
  const isReIngest = !!(existing && existing.size !== currentSize);
  if (isReIngest && existing.rawFile) { try { fs.unlinkSync(path.join(RAW_DIR, existing.rawFile)); } catch {} }
  try {
    const exchanges = parseSession(filePath);
    const visibleExchanges = filterPatterns.length > 0 ? exchanges.filter(e => !matchesFilter(e.userMessage)) : exchanges;
    if (visibleExchanges.length === 0) {
      const allFiltered = exchanges.length > 0 && visibleExchanges.length === 0;
      state.ingestedFiles[filePath] = { size: currentSize, rawFile: null, filtered: allFiltered };
      if (allFiltered) filteredOut++; else empty++;
      continue;
    }
    const sessionId = path.basename(filePath, path.extname(filePath));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFileName = `think_session_${ts}_${sessionId.slice(0, 8)}.md`;
    fs.writeFileSync(path.join(RAW_DIR, rawFileName), formatSession(filePath, visibleExchanges));
    state.ingestedFiles[filePath] = { size: currentSize, rawFile: rawFileName };
    if (isReIngest) reIngested++; else newSessions++;
  } catch (e) { console.error(`Failed to parse ${filePath}: ${e.message}`); }
}

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`Ingestion complete.`);
console.log(`  New sessions:               ${newSessions}`);
console.log(`  Re-ingested (grown files):  ${reIngested}`);
console.log(`  Filtered by filterPatterns: ${filteredOut}`);
console.log(`  Without thinking:           ${empty}`);
console.log(`  Already up to date:         ${skipped}`);
