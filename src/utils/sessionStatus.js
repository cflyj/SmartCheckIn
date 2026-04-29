/** 活动 computed status → 列表/详情共用的状态标签（与 style.css 中 .pill-* 一致） */
export function sessionStatusPill(session) {
  const s = session?.status
  const cls = {
    scheduled: 'pill-scheduled',
    active: 'pill-active',
    ended: 'pill-ended',
    cancelled: 'pill-cancelled',
  }
  const text = {
    scheduled: '未开始',
    active: '进行中',
    ended: '已结束',
    cancelled: '已取消',
  }
  return {
    cls: cls[s] || '',
    text: text[s] || (s ? String(s) : ''),
  }
}
