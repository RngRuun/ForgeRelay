import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const hash = text => createHash('sha256').update(text).digest('hex');
const denied = /^(?:\.|node_modules$|__pycache__$|target$)|(?:^|[_.-])(?:credentials|secrets?|auth|tokens?)(?:[_.-]|$)|\.(?:pem|key|pfx|p12)$/i;
export function safePath(workspace, relative, writable = false) {
  if (typeof relative !== 'string' || !relative || relative.length > 1000 || path.isAbsolute(relative) || /[:\0]/.test(relative)) throw new Error('请使用工作目录内的相对路径');
  const segments = relative.replaceAll('\\', '/').split('/');
  if (segments.some(x => !x || x === '..' || denied.test(x))) throw new Error('该路径不在允许共享的文件范围内');
  const root = fs.realpathSync(workspace), target = path.resolve(root, ...segments), rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('路径超出工作目录');
  let check = root;
  for (const segment of segments) {
    check = path.join(check, segment);
    if (fs.existsSync(check) && fs.lstatSync(check).isSymbolicLink()) throw new Error('不允许通过链接访问文件');
  }
  if (!writable && !fs.existsSync(target)) throw new Error('文件不存在');
  return target;
}
export function listFiles(workspace) {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 8 || files.length >= 300) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (denied.test(item.name) || item.isSymbolicLink() || files.length >= 300) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, depth + 1);
      else if (item.isFile()) files.push({ path: path.relative(workspace, full).split(path.sep).join('/'), bytes: fs.statSync(full).size });
    }
  };
  walk(workspace, 0); return files;
}
export function readFile(workspace, relative, start = 1, count = 160) {
  const full = safePath(workspace, relative);
  if (!fs.statSync(full).isFile() || fs.statSync(full).size > 512000) throw new Error('只能读取小于 500 KB 的文本文件');
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes('\0')) throw new Error('此文件不是文本');
  const lines = text.split('\n'), from = Math.max(1, Number(start) || 1), amount = Math.min(200, Math.max(1, Number(count) || 160));
  return { path: relative, base_hash: hash(text), totalLines: lines.length, content: lines.slice(from - 1, from - 1 + amount).map((x, i) => `${from + i}: ${x}`).join('\n').slice(0, 30000) };
}
export function proposeChange(task, input) {
  const full = safePath(task.workspace, input.path, true);
  if (fs.existsSync(full) && (!fs.statSync(full).isFile() || fs.statSync(full).size > 200000)) throw new Error('提案目标必须是小于 200 KB 的文本文件');
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (before.includes('\0')) throw new Error('不能为二进制文件提交文本提案');
  if (before.length > 200000 || typeof input.content !== 'string' || input.content.length > 200000) throw new Error('单个提案限制为 200,000 字符');
  if (input.base_hash !== hash(before)) throw new Error('文件已变更或哈希不匹配，请先重新读取文件；新文件使用空内容的 SHA-256');
  const proposal = { id: randomUUID(), path: input.path, before, after: input.content, baseHash: hash(before), rationale: String(input.rationale || ''), status: 'pending', author: 'DeepSeek', at: new Date().toISOString() };
  task.proposals.push(proposal); return { proposalId: proposal.id, path: proposal.path, status: 'pending', message: '已进入提案区，尚未写入项目，等待负责人审查。' };
}
export function applyProposal(task, id) {
  const proposal = task.proposals.find(x => x.id === id);
  if (!proposal || proposal.status !== 'pending') throw new Error('待审提案不存在');
  const full = safePath(task.workspace, proposal.path, true);
  if (fs.existsSync(full) && (!fs.statSync(full).isFile() || fs.statSync(full).size > 200000)) { proposal.status = 'conflict'; throw new Error('合并冲突：目标文件类型或大小已经改变'); }
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (hash(before) !== proposal.baseHash) { proposal.status = 'conflict'; throw new Error('合并冲突：文件已经改变，请让 DeepSeek 重新读取并提交'); }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full + '.relay-tmp', proposal.after); fs.renameSync(full + '.relay-tmp', full);
  proposal.status = 'applied'; proposal.appliedAt = new Date().toISOString(); return proposal;
}
const tool = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });
const str = description => ({ type: 'string', description });
export const WORKSPACE_TOOLS = [
  tool('list_files', '列出当前共享工作目录的可读取文件。', {}, []),
  tool('read_file', '读取共享文本文件，返回行号与 base_hash。', { path: str('相对路径'), start_line: { type: 'integer' }, line_count: { type: 'integer' } }, ['path']),
  tool('search_files', '在共享文本文件中按字面文本检索，返回匹配行。', { query: str('搜索文字') }, ['query']),
  tool('propose_change', '提交完整文件内容作为修改提案，不直接写入项目。必须用 read_file 返回的 base_hash；新文件先 list_files 确认不存在，base_hash 填空字符串内容的 SHA256。', { path: str('相对路径'), content: str('完整新内容'), base_hash: str('原内容 SHA256'), rationale: str('改动理由和验证建议') }, ['path', 'content', 'base_hash', 'rationale']),
  tool('register_issue', '记录发现的问题，最终验收前必须由负责人逐项处理。', { title: str('问题标题'), severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, detail: str('具体证据和修复建议') }, ['title', 'severity', 'detail']),
  tool('request_context', '向负责人请求补充缺失的资料或澄清，不能凭空假设。', { question: str('具体需要什么资料') }, ['question']),
  tool('publish_note', '把有依据的发现写入共享记忆区，双方后续都能读取。', { title: str('发现标题'), content: str('发现、依据与不确定性') }, ['title', 'content'])
];
export function runWorkspaceTool(task, name, args) {
  if (name === 'list_files') return { files: listFiles(task.workspace), new_file_base_hash: hash('') };
  if (name === 'read_file') return readFile(task.workspace, args.path, args.start_line, args.line_count);
  if (name === 'search_files') {
    if (typeof args.query !== 'string' || !args.query || args.query.length > 300) throw new Error('搜索内容需为 1–300 字符');
    const matches = [];
    for (const file of listFiles(task.workspace).filter(x => x.bytes < 100000)) {
      let text; try { text = fs.readFileSync(safePath(task.workspace, file.path), 'utf8'); } catch { continue; }
      if (text.includes('\0')) continue;
      text.split('\n').forEach((line, i) => { if (line.includes(args.query) && matches.length < 80) matches.push({ path: file.path, line: i + 1, text: line.slice(0, 350) }); });
      if (matches.length >= 80) break;
    }
    return { matches };
  }
  if (name === 'propose_change') return proposeChange(task, args);
  if (name === 'register_issue') {
    if (!['critical', 'major', 'minor'].includes(args.severity) || !args.title || !args.detail) throw new Error('问题格式不完整');
    const issue = { id: randomUUID(), title: String(args.title).slice(0, 200), severity: args.severity, detail: String(args.detail).slice(0, 10000), status: 'open', author: 'DeepSeek', at: new Date().toISOString() };
    task.issues.push(issue); return { issueId: issue.id, status: 'open' };
  }
  if (name === 'request_context') {
    if (!args.question) throw new Error('请填写问题');
    const request = { id: randomUUID(), question: String(args.question).slice(0, 5000), at: new Date().toISOString() };
    task.contextRequests.push(request); return { requestId: request.id, status: 'waiting_for_codex' };
  }
  if (name === 'publish_note') {
    if (!args.title || !args.content) throw new Error('共享发现不能为空');
    const note = { id: randomUUID(), title: String(args.title).slice(0, 200), content: String(args.content).slice(0, 10000), author: 'DeepSeek', at: new Date().toISOString() };
    task.notes.push(note); return { noteId: note.id, saved: true };
  }
  throw new Error('未知工具');
}
