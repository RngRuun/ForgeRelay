// null is an explicit unlimited cap. It is never a large pretend budget or Infinity.
export const budgetReached=(used,cap)=>cap!==null&&used>=cap;
export const budgetExceeded=(used,cap)=>cap!==null&&used>cap;
export const limitText=value=>value===null?'不限':value===undefined?'—':Number(value).toLocaleString('zh-CN');
export const roundRange=(min,max)=>max===null?`至少 ${min} 轮 · 上限不限`:`${min}–${max} 轮`;
export function budgetLimit(value,fallback,min,max,label='预算'){
  if(value===undefined)return fallback;if(value===null)return null;
  if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`${label}应为 ${min}–${max} 的整数，或明确选择不限`);
  return value;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function budgetField(name,label,value,{min=1,max=2000000,fallback=100,step=1,prefix='limit',hint=''}={}){
  const unlimited=value===null,id=prefix+'-'+name;fallback=Math.max(min,Math.min(max,fallback));
  return `<div class="budget-setting"><div class="budget-setting-head"><label for="${id}">${esc(label)}</label><label class="budget-unlimited"><input type="checkbox" name="${name}Unlimited" data-budget-toggle="${name}" aria-label="${esc(label)}不限" ${unlimited?'checked':''}>不限</label></div><input id="${id}" name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value??fallback}" ${unlimited?'disabled':''} required><small>${esc(hint)}</small></div>`;
}
export function readBudgetInputs(form,names){return Object.fromEntries(names.map(name=>[name,form.elements.namedItem(name+'Unlimited')?.checked?null:Number(form.elements.namedItem(name)?.value)]));}
export function setBudgetInputs(form,values){for(const [name,value]of Object.entries(values)){const input=form.elements.namedItem(name),toggle=form.elements.namedItem(name+'Unlimited');if(!input||!toggle)continue;toggle.checked=value===null;input.disabled=value===null;if(value!==null)input.value=value;else if(!input.value)input.value=input.defaultValue;}}
let mounted=false;
export function mountBudgetToggles(){if(mounted)return;mounted=true;document.addEventListener('change',e=>{const toggle=e.target.closest('[data-budget-toggle]');if(!toggle?.form)return;const input=toggle.form.elements.namedItem(toggle.dataset.budgetToggle);if(input)input.disabled=toggle.checked;});}
