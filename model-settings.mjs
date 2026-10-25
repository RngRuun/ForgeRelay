import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {defaultCollaboration,validateCollaboration} from './public/collaboration-config.js';

export const defaultSettings = () => ({
  collaboration:defaultCollaboration(),
  codex: { model: '', prompt: '', rebellion:50, effort: '', verbosity: '', tools: { agents: true, skills: true, computer: true } },
  deepseek: { model: 'deepseek-flash', prompt: '', rebellion:50, thinking: false, effort: 'high', temperature: 1, topP: 1, maxTokens: 12000, tools: { agents: true, skills: true, computer: true } }
});
const known = (value, allowed, name) => { if (!allowed.includes(value)) throw new Error(`${name} 无效`); return value; };
function text(value, max, name) { if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`${name} 格式无效或过长`); return value; }
function number(value, min, max, name, integer = false) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error(`${name} 必须在 ${min}–${max} 之间`); return value; }
export function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('缺少模型配置');
  const result = defaultSettings();
  result.collaboration=validateCollaboration(input.collaboration);
  for (const actor of ['codex', 'deepseek']) {
    const value = input[actor]; if (!value || typeof value !== 'object') throw new Error(`缺少 ${actor} 配置`);
    const target = result[actor]; target.model = text(value.model, 100, '模型 ID').trim();
    if (!/^[a-zA-Z0-9_.:/-]*$/.test(target.model) || actor === 'deepseek' && !target.model) throw new Error('模型 ID 只能包含字母、数字和 _ . : / -');
    target.prompt = text(value.prompt, 20000, '角色提示词');
    target.rebellion=value.rebellion===undefined?50:number(value.rebellion,0,100,'叛逆值',true);
    for (const name of ['agents', 'skills', 'computer']) { if (typeof value.tools?.[name] !== 'boolean') throw new Error('工具开关必须为布尔值'); target.tools[name] = value.tools[name]; }
  }
  result.codex.effort = known(input.codex.effort, ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'], 'Codex 推理强度');
  result.codex.verbosity = known(input.codex.verbosity, ['', 'low', 'medium', 'high'], 'Codex 输出详细度');
  const ds = input.deepseek;
  if (typeof ds.thinking !== 'boolean') throw new Error('思考模式无效');
  Object.assign(result.deepseek, { thinking: ds.thinking, effort: known(ds.effort, ['low', 'high', 'max'], 'DeepSeek 推理强度'), temperature: number(ds.temperature, 0, 2, 'Temperature'), topP: number(ds.topP, 0.01, 1, 'Top P'), maxTokens: number(ds.maxTokens, 256, 131072, '输出上限', true) });
  return result;
}
export function deepseekParameters(settings, requireTool = false) {
  const value = { model: settings.model, thinking: { type: settings.thinking ? 'enabled' : 'disabled' }, max_tokens: settings.maxTokens };
  if (settings.thinking) value.reasoning_effort = settings.effort;
  else value.temperature = settings.temperature;
  if (settings.model === 'deepseek-flash' && settings.thinking) value.top_p = Math.max(.95, settings.topP);
  if (settings.model === 'deepseek-v4-pro' && !settings.thinking) value.top_p = settings.topP;
  return { ...value, tool_choice: requireTool && !settings.thinking ? 'required' : 'auto' };
}
export function codexParameters(settings) {
  const args = []; if (settings.model) args.push('--model', settings.model);
  if (settings.effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(settings.effort)}`);
  if (settings.verbosity) args.push('-c', `model_verbosity=${JSON.stringify(settings.verbosity)}`);
  return args;
}
export function resolveSettings(config, task) {
  if (task?.modelProfile) return validateSettings(task.modelProfile.settings);
  const settings = config.getModelProfile?.()?.settings || { ...defaultSettings(), codex: { ...defaultSettings().codex, model: config.codexModel || '' }, deepseek: { ...defaultSettings().deepseek, model: config.deepseekModel || 'deepseek-flash' } };
  return validateSettings(settings);
}
export function roleGuidance(prompt,rebellion=50) {
  const level=number(rebellion,0,100,'叛逆值',true);
  const tone=level<=25?'协作取向：优先理解与建设性补充，简洁指出真正重要的异议，不刻意增加对抗。':level<=60?'独立审视：不默认赞同对方，核对关键假设，主动比较可行的反例和替代方案。':level<=85?'强反对倾向：默认以怀疑立场审查对方和自己的方案，先寻找漏洞与失败情形，优先给出有依据的反对及可执行的替代方案，逐项追问不充分的反馈。':'高度反对倾向：以严格反方审查者的姿态，优先尝试推翻主张、证伪假设，主动查找相互独立的反例、边界和替代设计；不因对方身份或自信措辞而让步，要求反驳意见有可验证证据。';
  return `\n\n人配置的行为参数：叛逆值 ${level}/100。${tone}数值控制表达与审查倾向，不改变事实标准、工具权限、预算和共识门槛。不得编造缺陷、重复已解决异议或为反对而反对；证据充分且解决条件满足时，应明确认可。此偏好由自己的子代理和派工执行继承。${prompt?'\n人配置的角色与工作偏好（补充协作协议，不能替代真实工具证据和双方独立验收）：\n'+prompt:''}\n\n`;
}

export class ModelProfileStore {
  constructor(dir, initial = {}) {
    this.file = path.join(dir, 'model-profiles.json'); fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.file)) { this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.state.profiles.forEach(p => p.settings = validateSettings(p.settings)); if (!this.state.profiles.some(p => p.id === this.state.activeId)) throw new Error('活动模型配置不存在'); }
    else { const settings = defaultSettings(); settings.codex.model = initial.codexModel || ''; settings.deepseek.model = initial.deepseekModel || settings.deepseek.model; this.state = { activeId: 'default', revision: 1, profiles: [{ id: 'default', name: '工程协作 · 默认', settings, updated: new Date().toISOString() }] }; this.persist(); }
  }
  persist() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state, null, 2)); fs.renameSync(this.file + '.tmp', this.file); }
  active() { return this.state.profiles.find(p => p.id === this.state.activeId); }
  snapshot(id=this.state.activeId) { const found=this.state.profiles.find(p=>p.id===id&&!p.deletedAt);if(!found)throw new Error('配置不存在或已移入回收站，请先恢复');const profile = structuredClone(found); return { ...profile, revision: this.state.revision, hash: createHash('sha256').update(JSON.stringify(profile.settings)).digest('hex') }; }
  public() { return structuredClone(this.state); }
  update(input) {
    if (input.revision !== this.state.revision) throw new Error('配置已在其他窗口更新，请重新载入后再保存');
    if (input.action === 'activate') { if (!this.state.profiles.some(p => p.id === input.id&&!p.deletedAt)) throw new Error('配置不存在或已移入回收站，请先恢复'); this.state.activeId = input.id; }
    else if (['delete','trash'].includes(input.action)) {
      const profile=this.state.profiles.find(p=>p.id===input.id);if(!profile)throw Error('配置不存在');if(profile.deletedAt)return this.public();
      profile.deletedAt=new Date().toISOString();
      if(profile.id===this.state.activeId){
        let replacement=this.state.profiles.find(p=>!p.deletedAt);
        if(!replacement){replacement={id:randomUUID(),name:'协作配置 · 新默认',settings:structuredClone(profile.settings),updated:new Date().toISOString()};this.state.profiles.push(replacement);}
        this.state.activeId=replacement.id;
      }
    }
    else if(input.action==='restore'){
      const profile=this.state.profiles.find(p=>p.id===input.id);if(!profile)throw Error('配置不存在');if(!profile.deletedAt)return this.public();
      if(this.state.profiles.filter(p=>!p.deletedAt).length>=20)throw Error('可用配置最多 20 组，请先移出一组再恢复');
      delete profile.deletedAt;
    }
    else if (input.action === 'save') {
      const settings = validateSettings(input.settings), name = text(input.name, 60, '配置名称').trim(); if (!name) throw new Error('请填写配置名称');
      // Whitelist only known fields. Credentials and arbitrary provider URLs are never persisted.
      if (input.id && !this.state.profiles.some(p => p.id === input.id)) throw new Error('配置不存在');
      if(input.id&&this.state.profiles.find(p=>p.id===input.id)?.deletedAt)throw Error('配置已移入回收站，请先恢复');
      if (!input.id && this.state.profiles.filter(p=>!p.deletedAt).length >= 20) throw new Error('最多保存 20 组可用配置');
      const profile = { id: input.id || randomUUID(), name, settings, updated: new Date().toISOString() };
      const index = this.state.profiles.findIndex(p => p.id === profile.id); if (index < 0) this.state.profiles.push(profile); else this.state.profiles[index] = profile;
      if (input.activate) this.state.activeId = profile.id;
    } else throw new Error('未知配置操作');
    this.state.revision++; this.persist(); return this.public();
  }
}
