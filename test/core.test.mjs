import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Workbench, validateGraph, completionProblems } from '../core.mjs';
import { safePath, readFile, hash, proposeChange, applyProposal, runWorkspaceTool } from '../workspace.mjs';
import { createDeepseekAdapter } from '../adapters.mjs';

const tasks = [{ id: 'analysis', title: '辅助分析', owner: 'DeepSeek', dependsOn: [] }, { id: 'build', title: '实际实施', owner: 'Codex', dependsOn: ['analysis'] }, { id: 'review', title: '独立复查', owner: 'DeepSeek', dependsOn: ['build'] }];
const acceptance = [{ id: 'a1', title: '完成并检查成果', evidence: '' }];
const action = (type, extra = {}) => ({ action: type, summary: type + ' 的具体决策依据', taskId: '', instruction: '', tasks: [], acceptance: [], proposalId: '', issueId: '', resolution: '', final: '', ...extra });
const flow = () => [action('plan', { tasks, acceptance }), action('delegate', { taskId: 'analysis', instruction: '先读取文件并分析' }), action('accept_task', { taskId: 'analysis', resolution: '已审查辅助分析及其文件依据' }), action('execute', { taskId: 'build', instruction: '实际完成任务并给出检查结果' }), action('review', { taskId: 'review', instruction: '读取最终文件，独立复查' }), action('accept_task', { taskId: 'review', resolution: '复查范围与验收标准一致' }), action('complete', { acceptance: [{ ...acceptance[0], evidence: '已对照实际执行日志和最终文件核查' }], final: '交付实际成果' })];
async function until(fn) { for (let i = 0; i < 400; i++) { if (fn()) return; await delay(5); } throw new Error('状态等待超时'); }
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-v02-test-'));
  t.after(() => { const resolved = fs.realpathSync(dir); assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep + 'relay-v02-test-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  return dir;
}
function fixture(t, actions = flow(), overrides = {}) {
  const prompts = [], queue = [...actions];
  const w = new Workbench({ dir: temp(t), codex: async arg => {
    prompts.push(arg.prompt); arg.onTrace('test-only-cli-session'); arg.onUsage({ input_tokens: 10, output_tokens: 5 });
    if (arg.purpose === 'execute') fs.writeFileSync(path.join(arg.task.workspace, 'result.txt'), '测试执行器的实际文件成果');
    return arg.purpose === 'direct' ? JSON.stringify(queue.shift() || action('ask_user', { instruction: '需要更多信息' })) : '已实际实施，检查结果在日志中';
  }, deepseek: async arg => {
    const call = await arg.beforeRequest(); arg.onUsage(call, { prompt_tokens: 8, completion_tokens: 4 }); arg.onResponse(call, 'test-only-api-id'); if (arg.purpose === 'review') await arg.runTool('read_file', {path:'result.txt'}); return { text: '读取结果与辅助结论' };
  }, ...overrides });
  return { w, prompts };
}
test('动态调度包含验收动作，真实尝试记录与用量来自适配器回调', async t => {
  const { w, prompts } = fixture(t); const task = w.create({ prompt: '完成一个开发任务' }); w.start(task.id);
  await until(() => task.status === 'completed');
  assert.equal(task.calls.length, 10); assert.equal(task.calls.filter(x => x.actor === 'DeepSeek').length, 2);
  assert.ok(task.calls.every(x => x.status === 'succeeded' && x.providerId.startsWith('test-only')));
  assert.ok(task.board.every(x => x.status === 'done')); assert.equal(task.result, '交付实际成果');
  assert.equal(task.usage.codexInput, 80); assert.equal(task.usage.deepseekInput, 16);
  assert.ok(prompts.some(x => x.includes('读取结果与辅助结论'))); assert.equal(completionProblems(task).length, 0);
});
test('DeepSeek 问题未处理时拒绝完成，再由 Codex 返回修复证据', async t => {
  const actions = flow(); actions.splice(7, 0, action('resolve_issue', { issueId: 'issue-test', resolution: '已修复边界场景，并在实际执行记录中给出检查证据。' }), actions[6]);
  const { w } = fixture(t, actions, { deepseek: async arg => {
    const call = await arg.beforeRequest(); arg.onResponse(call, 'test-only-api-id');
    if (arg.purpose === 'review') await arg.runTool('read_file', {path:'result.txt'});
    if (arg.purpose === 'review') arg.task.issues.push({ id: 'issue-test', title: '遗漏边界', status: 'open', severity: 'major', detail: '具体问题' });
    return { text: '发现了需要处理的问题' };
  } });
  const task = w.create({ prompt: '需要修订的任务' }); w.start(task.id); await until(() => task.status === 'completed');
  assert.ok(task.messages.some(m => m.type === 'gate' && m.text.includes('未处理'))); assert.equal(task.issues[0].status, 'resolved');
});
test('修改后必须重新复查，不接受过期验收', async t => {
  const { w } = fixture(t); const task = w.create({ prompt: '复查版本约束测试' });
  Object.assign(task, { board: tasks.map(x => ({ ...x, status: 'done' })), acceptance: [{ ...acceptance[0], evidence: '检查证据' }], calls: [{ actor: 'DeepSeek', status: 'succeeded' }, { actor: 'Codex', purpose: 'execute', status: 'succeeded' }], workspaceVersion: 2, lastReviewVersion: 1, reviews: [{ version: 1 }] });
  assert.ok(completionProblems(task).some(x => x.includes('尚未经过')));
  await assert.rejects(w.act(task, action('complete', { final: '不能通过' }), new AbortController().signal), /尚未经过/);
  assert.equal(task.result, '');
});
test('依赖不能越过，循环依赖与未参与模型被拒绝，允许单方计划', async t => {
  assert.throws(() => validateGraph([{ ...tasks[0], dependsOn: ['build'] }, tasks[1]]), /循环/);
  assert.equal(validateGraph([tasks[0], { ...tasks[0], id: 'other' }]).length,2);
  assert.throws(()=>validateGraph(tasks,['Codex']),/未参与团队/);
  const { w } = fixture(t), task = w.create({ prompt: '依赖调度测试任务' }); w.setPlan(task, action('plan', { tasks, acceptance }));
  assert.throws(() => w.readyNode(task, 'build', 'Codex'), /依赖任务/);
});
test('暂停保留当前调用，继续从下一个调度动作执行', async t => {
  let release; const actions = flow();
  const { w } = fixture(t, [], { codex: async arg => {
    if (arg.purpose === 'execute') { fs.writeFileSync(path.join(arg.task.workspace, 'result.txt'), '实际的测试文件'); return '执行结果'; }
    const a = actions.shift(); if (a.action === 'plan') await new Promise(r => release = r); return JSON.stringify(a);
  } });
  const task = w.create({ prompt: '暂停继续测试任务' }); w.start(task.id); await until(() => !!release); w.pause(task.id); release();
  await until(() => task.status === 'paused'); assert.equal(task.board.length, 0);
  w.resume(task.id); await until(() => task.status === 'completed'); assert.equal(task.board.length, 3);
});
test('人工回复进入下一次调度上下文', async t => {
  const actions = flow(); actions.splice(1, 0, action('ask_user', { instruction: '请补充交付格式' }));
  const { w, prompts } = fixture(t, actions); const task = w.create({ prompt: '人工介入测试任务' }); w.start(task.id);
  await until(() => task.status === 'waiting_user'); w.steer(task.id, '交付为 Markdown 文档');
  await until(() => task.status === 'completed'); assert.ok(prompts.some(x => x.includes('交付为 Markdown 文档')));
});
test('达到 token 预算保留待处理状态，不伪造成功', async t => {
  const { w } = fixture(t, [], { codex: async arg => { arg.onUsage({ input_tokens: 10001, output_tokens: 1 }); return JSON.stringify(action('plan', { tasks, acceptance })); } });
  const task = w.create({ prompt: '预算约束测试任务', tokenBudget: 10000 }); w.start(task.id);
  await until(() => task.status === 'needs_attention'); assert.equal(task.result, ''); assert.equal(task.calls.length, 1);
});
test('停止会中止调用，队列任务不并发执行', async t => {
  const { w } = fixture(t, [], { codex: async ({ signal }) => { await delay(10000, null, { signal }); return ''; } });
  const first = w.create({ prompt: '第一个运行任务' }), second = w.create({ prompt: '第二个运行任务' });
  w.start(first.id); w.start(second.id); await until(() => first.calls.length === 1); assert.equal(second.status, 'queued'); w.cancel(second.id); w.cancel(first.id);
  await until(() => !w.active); assert.equal(first.calls[0].status, 'cancelled'); assert.equal(second.calls.length, 0);
});
test('无效辅助服务不会产生模型回复或成果', async t => {
  const { w } = fixture(t, flow(), { deepseek: async arg => { const c = await arg.beforeRequest(); const e = new Error('真实服务连接失败'); arg.onFailure(c, e); throw e; } });
  const task = w.create({ prompt: '网络故障测试任务' }); w.start(task.id); await until(() => task.status === 'failed');
  assert.equal(task.messages.filter(m => m.actor === 'DeepSeek' && m.type === 'reply').length, 0); assert.equal(task.artifacts.length, 0);
});
test('旧演示保留为旧记录，不允许启动或创建新演示', t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 'old', mode: 'demo', status: 'completed', messages: [], artifacts: [] }]));
  const w = new Workbench({ dir }); assert.equal(w.tasks[0].legacy, true); assert.equal(w.tasks[0].calls.length, 0);
  assert.throws(() => w.start('old'), /旧版预设演示/); assert.throws(() => w.create({ prompt: '不能再生成演示', mode: 'demo' }), /移除/);
});
test('读取、检索与修改提案是实际文件操作，审查前不写入', t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'main.js'), 'old\nvalue');
  const task = { workspace: dir, proposals: [], issues: [], contextRequests: [], notes: [] };
  const read = readFile(dir, 'main.js'); assert.equal(read.base_hash, hash('old\nvalue'));
  assert.equal(runWorkspaceTool(task, 'search_files', { query: 'value' }).matches[0].line, 2);
  const result = proposeChange(task, { path: 'main.js', content: 'new\nvalue', base_hash: read.base_hash, rationale: '修改首行' });
  assert.equal(fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), 'old\nvalue');
  applyProposal(task, result.proposalId); assert.equal(fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), 'new\nvalue');
});
test('文件已变化时拦截合并冲突，不覆盖新内容', t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'a.txt'), 'base'); const task = { workspace: dir, proposals: [] };
  const p = proposeChange(task, { path: 'a.txt', content: 'proposed', base_hash: hash('base') }); fs.writeFileSync(path.join(dir, 'a.txt'), 'changed');
  assert.throws(() => applyProposal(task, p.proposalId), /合并冲突/); assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'changed');
});
test('文件工具拒绝目录穿越、隐藏凭证与绝对路径', t => {
  const dir = temp(t);
  for (const input of ['../secret.txt', '.env', 'sub/.git/config', 'credentials.json', 'C:\\Windows\\a.txt', 'file.txt:stream']) assert.throws(() => safePath(dir, input, true));
});
test('DeepSeek 工具回路传回实际工具结果，保留请求 ID 与用量', async t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'doc.txt'), '真实工具读取内容'); let count = 0; const requests = [], calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    requests.push(JSON.parse(opts.body)); count++;
    return new Response(JSON.stringify({ id: `test-only-response-${count}`, usage: { prompt_tokens: 5, completion_tokens: 3 }, choices: [{ finish_reason: count === 1 ? 'tool_calls' : 'stop', message: count === 1 ? { content: null, tool_calls: [{ id: 'call-test', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'doc.txt' }) } }] } : { content: '基于实际读取内容返回结论' } }] }), { status: 200 });
  });
  const task = { workspace: dir, proposals: [], issues: [], contextRequests: [], notes: [], deepseekThreads: {} };
  const result = await createDeepseekAdapter({ deepseekKey: 'test-only-key', deepseekModel: 'test-only-model' })({ task, instruction: '阅读资料', context: '{}', signal: new AbortController().signal, unitId: 'a',
    beforeRequest: async () => { const c = {}; calls.push(c); return c; }, onUsage: (c, u) => c.usage = u, onResponse: (c, id) => c.id = id, onFailure: () => assert.fail('不应失败'), runTool: async (name, args) => runWorkspaceTool(task, name, args) });
  assert.equal(count, 2); assert.match(requests[1].messages.find(x => x.role === 'tool').content, /真实工具读取内容/);
  assert.equal(calls[1].id, 'test-only-response-2'); assert.equal(result.text, '基于实际读取内容返回结论');
});
test('DeepSeek 没有密钥时不会发起请求或产生调用记录', async t => {
  let attempted = false; t.mock.method(globalThis, 'fetch', async () => { attempted = true; throw new Error('不应请求'); });
  await assert.rejects(createDeepseekAdapter({})({ task: {}, signal: new AbortController().signal }), /没有 DeepSeek/); assert.equal(attempted, false);
});
test('上游返工会重开已完成的下游任务，不能沿用旧结果', t => {
  const { w } = fixture(t), task = w.create({ prompt: '任务依赖返工测试' });
  task.board = tasks.map(x => ({ ...x, status: 'done', result: '旧结果' }));
  w.invalidateDependents(task, 'analysis');
  assert.equal(task.board[1].status, 'pending'); assert.equal(task.board[2].status, 'pending'); assert.equal(task.board[1].result, '');
});
test('计划修改必须整体有效，不能降低既有验收标准', t => {
  const { w } = fixture(t), task = w.create({ prompt: '验收计划约束测试' });
  assert.throws(() => w.setPlan(task, action('plan', { tasks })), /验收标准/); assert.equal(task.board.length, 0);
  w.setPlan(task, action('plan', { tasks, acceptance }));
  assert.throws(() => w.setPlan(task, action('plan', { acceptance: [{ ...acceptance[0], title: '降低后的标准' }] })), /不能改写/);
  assert.equal(task.acceptance[0].title, acceptance[0].title);
});
test('DeepSeek 没有实际读取文件时，口头复查不能通过最终门槛', async t => {
  const { w } = fixture(t, flow(), { deepseek: async arg => { const call = await arg.beforeRequest(); arg.onResponse(call, 'test-only-id'); return {text:'只作口头评价，没有读取文件'}; } });
  const task = w.create({prompt:'复查读取证据测试', maxSteps:8}); w.start(task.id);
  await until(() => task.status === 'waiting_user');
  assert.equal(task.reviews.length, 0); assert.equal(task.result, ''); assert.ok(task.messages.some(m => m.type === 'gate' && m.text.includes('读取文件')));
  w.cancel(task.id); await until(() => !w.active);
});
test('人工在复查后修改文件也会让文件证据失效', async t => {
  const { w } = fixture(t); const task = w.create({prompt:'复查后内容变更测试'}); w.start(task.id); await until(() => task.status === 'completed');
  fs.writeFileSync(path.join(task.workspace, 'result.txt'), '复查之后的人工改动');
  assert.ok(completionProblems(task).some(x => x.includes('文件已变更')));
});
test('重启中断执行但保留文件与已知用量，未知用量不伪装成零',t=>{
 const {w}=fixture(t),task=w.create({prompt:'进程中断恢复回归测试'});fs.mkdirSync(task.workspace,{recursive:true});fs.writeFileSync(path.join(task.workspace,'keep.txt'),'existing result');task.status='running';task.calls=[{id:'incomplete-call',actor:'Codex',status:'running',partialOutput:'already received'},{id:'completed-call',actor:'DeepSeek',status:'succeeded',usage:{prompt_tokens:100,completion_tokens:10}}];w.persist();
 const restarted=new Workbench({dir:w.dir,codex:()=>assert.fail('Must not restart automatically'),deepseek:()=>assert.fail('Must not restart automatically')});const recovered=restarted.get(task.id);
 assert.equal(recovered.status,'interrupted');assert.equal(recovered.recovery.previousStatus,'running');assert.equal(recovered.recovery.acknowledged,false);assert.equal(recovered.calls[0].status,'interrupted');assert.equal(recovered.calls[0].usageKnown,false);assert.equal(recovered.usageIncomplete,true);assert.equal(recovered.calls[0].partialOutput,'already received');assert.deepEqual(recovered.calls[1].usage,{prompt_tokens:100,completion_tokens:10});assert.equal(fs.readFileSync(path.join(recovered.workspace,'keep.txt'),'utf8'),'existing result');assert.equal(restarted.queue.length,0);
});
