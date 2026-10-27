// These are directions from the human, never new evidence or permission to invent facts.
export const HUMAN_DIRECTIONS = Object.freeze([
  {id:'existing-info',label:'不补充信息，按已有信息继续',instruction:'我不提供更多信息。请基于已知事实推进能够完成的部分，明确保留未知条件、未决异议和结论的适用范围；不得把缺失信息当作已确认事实。'},
  {id:'investigate',label:'不补充信息，由 AI 继续调查',instruction:'我不提供更多信息。请先使用当前获准的工具和已有资料调查缺口，说明证据来源；无法自行核实的部分保留未知，不猜测只有人知道的事实。'},
  {id:'conservative',label:'采用保守假设，标明不确定性',instruction:'请在已有权限和约束内采用保守、可撤回的假设推进，并明确列出假设、风险和适用范围；假设不等于事实，不得因此关闭未核实的异议。'},
  {id:'narrow-scope',label:'缩小范围，先做确定的部分',instruction:'请缩小本轮范围，优先完成已有事实足以支持的部分；明确列出暂缓内容、未知条件和恢复条件，保留尚未解决的异议。'},
  {id:'verify-first',label:'先验证关键假设，再继续实施',instruction:'请先在已有权限内验证最影响结论的关键假设，并根据证据更新方案；证据不足时保留未知，暂缓依赖该假设的实施，不增加权限。'},
  {id:'alternatives',label:'比较备选方案，说明取舍',instruction:'请基于已有信息提出并比较可行备选，列明收益、成本、风险与适用条件；缺失信息明确标为未知，不替人虚构偏好，也不把比较结果当作事实已获证实。'},
].map(Object.freeze));
