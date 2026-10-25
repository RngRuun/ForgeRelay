'use strict';
const path = require('node:path');
const PAGES = new Set(['/','/discussion','/workbench','/models']);
const LIVE = new Set(['running','queued','paused','pausing','waiting_user','starting','debating','reviewing','planning','executing']);
function desktopConfig(input = {}, fallback) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('桌面配置必须是 JSON 对象');
  const port = input.port ?? 4317;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('本地端口必须在 1024–65535 之间');
  const dataDir = input.dataDir ?? fallback;
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir) || /[\x00-\x1f]/.test(dataDir)) throw new Error('数据目录必须是本机绝对路径');
  return {port, dataDir: path.resolve(dataDir)};
}
function localURL(value, origin) {
  try { const u = new URL(value); return u.origin === origin && !u.username && !u.password ? u : null; } catch { return null; }
}
function navigationAllowed(value, origin) { const u = localURL(value, origin); return !!u && PAGES.has(u.pathname); }
function downloadAllowed(value, origin) {
  const u = localURL(value, origin);
  return !!u && /^\/api\/(?:discussions\/[a-f0-9-]+\/(?:attachments\/[a-f0-9-]+\/file|report)|tasks\/[a-f0-9-]+\/(?:file|report))$/.test(u.pathname);
}
function externalURL(value) {
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password && !['localhost','127.0.0.1','[::1]'].includes(u.hostname) ? u.href : null; } catch { return null; }
}
function activeItems(state = {}) {
  return [...(state.tasks || []), ...(state.rooms || [])].filter(x => !x.deletedAt && LIVE.has(x.status));
}
function windowBounds(input, area) {
  const width = Math.min(area.width, Math.max(960, Number(input?.width) || 1440));
  const height = Math.min(area.height, Math.max(680, Number(input?.height) || 940));
  const x = Number(input?.x), y = Number(input?.y);
  return {width, height, ...(Number.isFinite(x) && Number.isFinite(y) && x >= area.x && x + 100 <= area.x + area.width && y >= area.y && y + 100 <= area.y + area.height ? {x,y} : {})};
}
module.exports = {desktopConfig, localURL, navigationAllowed, downloadAllowed, externalURL, activeItems, windowBounds};
