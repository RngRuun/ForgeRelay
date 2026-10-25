// Only direct human imperatives are control actions. Quoted examples and negations
// remain ordinary content; model/tool output never enters this parser.
export function conversationIntent(value){
 const text=String(value||'').trim().replace(/[。！!；;]+$/g,'');
 if(/[“”「」『』"'\x60]|不要停止|别停止|不用停止/.test(text)||/^(如何|怎么|什么意思|解释|例如|比如)/.test(text))return 'message';
 const body=text.replace(/^(?:(?:请|麻烦|你们俩|你们|双方|两边|大家|先|现在|暂时|都|立即|马上|帮我)\s*)+/,'');
 if(/^(?:停止|结束|停下|停)(?:一下|来|掉)?(?:讨论|辩论|互审|对话|工作|执行)?(?:吧|了)?$/.test(body))return 'stop';
 if(/^暂停(?:一下)?(?:讨论|辩论|互审|对话|工作|执行)?(?:吧)?$/.test(body))return 'pause';
 if(/^(?:不用|不要|别|停止)讨论[，,\s]*(?:了|吧)?(?:你|请|由)?(?:直接|自己|先)(?:回答|处理|做|说)[\s\S]*$/.test(body)||/^(?:不用讨论|不要讨论|别讨论了|直接处理|直接回答|你直接处理|你直接回答)$/.test(body))return 'direct';
 if(/^(?:开始|进行|发起|开启|继续)?(?:团队|多方|共同|一起|先)?(?:讨论|辩论|互审)(?!区|组|功能|模式|的意思)/.test(body)||/^(?:让|请让)(?:双方|两边|你们|团队|所有角色)[\s\S]{0,12}(?:讨论|互审)/.test(text)||/^(?:我想|我希望|我需要)(?:让|请)?(?:你们|双方|团队|两个模型)[\s\S]{0,12}(?:讨论|互审)/.test(text))return 'discuss';
 return 'message';
}
export const leadRole=room=>room.governance?.team?.find(a=>a.lead)||room.governance?.team?.[0];
