import { CATEGORIES, PARTS } from './palette.js';
import { BUSES } from './buses.js';
import { getLang, trd } from './i18n.js';
import { badgeHTML } from './ui/badge.js';
import { icon, actionCards } from './ui/assistant-chrome.js';
import { FLAG_META } from './render.js';
import { escAttr as esc } from './ui/press.js';
import { GUIDE_ICONS } from './guide-icons.js';
import { PART_HELP } from './guide-parts.js';
import { TOOLBAR_HELP, PALETTE_HELP, PANEL_HELP, ASSISTANT_HELP, STARTER_HELP } from './guide-controls.js';

const text = (en, zh) => getLang() === 'zh' ? zh : en;
const svg = (body, box = 18) => `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true">${body}</svg>`;
const symbol = key => {
  if (key === 'btn-rec') return '<span class="guide-record-dot"></span>Rec';
  if (key === 'btn-lang') return getLang() === 'zh' ? 'EN' : '中文';
  if (key === 'btn-examples') return esc(trd('Examples')) + ' ▾';
  const markup = GUIDE_ICONS[key];
  return markup?.startsWith('<svg') ? markup : esc(trd(markup || key));
};
function entry(row, markup = symbol(row[0]), shortcut = '') {
  const [id, en, zh, detail, detailZh] = row;
  return `<article class="guide-control" data-guide-control="${esc(id)}"><span class="guide-symbol" aria-hidden="true">${markup}</span><div><h4>${esc(text(en, zh))}${shortcut ? ` <kbd>${esc(shortcut)}</kbd>` : ''}</h4><p>${esc(text(detail, detailZh))}</p></div></article>`;
}
const list = rows => `<div class="guide-control-list">${rows.map(row => entry(row)).join('')}</div>`;
const heading = (en, zh) => `<h3>${esc(text(en, zh))}</h3>`;
const paragraph = (en, zh) => `<p>${esc(text(en, zh))}</p>`;

export function toolbarReference(mac) {
  const groups = [
    [0, 6, 'Drawing tools', '绘图工具'], [6, 14, 'History and view', '历史与视图'],
    [14, 25, 'Display and panels', '显示与面板'], [25, TOOLBAR_HELP.length, 'Files, review and sharing', '文件、评审与分享'],
  ];
  return groups.map(([from, to, en, zh]) => heading(en, zh) + '<div class="guide-control-list">' + TOOLBAR_HELP.slice(from, to).map(row => entry(row, row[0] === 'appearance' ? ['light','dark','system'].map(mode => symbol(`theme-${mode}`)).join('') : symbol(row[0]), row[5].replace('MOD', mac ? '⌘' : 'Ctrl'))).join('') + '</div>').join('');
}
export function paletteReference(query = '') {
  const needle = query.trim().toLocaleLowerCase();
  return CATEGORIES.map(category => {
    const parts = Object.values(PARTS).filter(part => part.category === category.id).filter(part =>
      !needle || [part.name, trd(part.name), category.name, trd(category.name), ...PART_HELP[part.kind], ...part.ports.map(port => port.name)].join(' ').toLocaleLowerCase().includes(needle));
    if (!parts.length) return '';
    return `<details class="guide-category" id="guide-category-${category.id}"${needle || category.id === 'compute' ? ' open' : ''}><summary><span aria-hidden="true">${badgeHTML(parts[0])}</span><span>${esc(trd(category.name))}</span><span class="guide-count">${parts.length}</span></summary><div class="guide-part-list">${parts.map(part => {
      const ports = part.ports.map(port => `${port.name} · ${trd(BUSES[port.bus]?.name || port.bus)}`).join('; ');
      const fields = (part.fields || []).map(field => trd(field.label)).join(', ');
      return `<article class="guide-part" data-guide-part="${esc(part.kind)}"><div class="guide-part-heading"><span aria-hidden="true">${badgeHTML(part)}</span><h4>${esc(trd(part.name))}</h4></div><p>${esc(PART_HELP[part.kind][getLang() === 'zh' ? 1 : 0])}</p><p class="guide-port-list"><strong>${text('Default ports:', '默认端口：')}</strong> ${esc(ports || text('No predefined ports.', '无预定义端口。'))}</p>${fields ? `<p class="guide-port-list"><strong>${text('Additional fields:', '附加字段：')}</strong> ${esc(fields)}</p>` : ''}</article>`;
    }).join('')}</div></details>`;
  }).join('') || paragraph('No matching parts. Try a part name, category or port name.', '没有匹配部件。请尝试部件名称、类别或端口名称。');
}
export function paletteControls() { return list(PALETTE_HELP); }
export function panelReference() {
  const align = [
    ['left','Align left','左对齐','Match the left edges of selected items.','对齐所选项目的左边缘。'],
    ['hcenter','Align horizontal centers','水平居中对齐','Place item centers on the same vertical line.','将项目中心放在同一垂直线上。'],
    ['right','Align right','右对齐','Match the right edges of selected items.','对齐所选项目的右边缘。'],
    ['top','Align top','顶部对齐','Match the top edges of selected items.','对齐所选项目的上边缘。'],
    ['vmiddle','Align vertical middles','垂直居中对齐','Place item centers on the same horizontal line.','将项目中心放在同一水平线上。'],
    ['bottom','Align bottom','底部对齐','Match the bottom edges of selected items.','对齐所选项目的下边缘。'],
    ['x','Distribute horizontally','水平分布','Space three or more selected items with equal horizontal gaps.','使三个或更多所选项目之间的水平间距相等。'],
    ['y','Distribute vertically','垂直分布','Space three or more selected items with equal vertical gaps.','使三个或更多所选项目之间的垂直间距相等。'],
  ];
  const flags = {
    bug: ['Marks a known defect or issue to track.', '标记需要跟踪的已知缺陷或问题。'],
    thermal: ['Marks a heat or thermal-management concern.', '标记发热或热管理问题。'],
    power: ['Marks a part requiring attention to power consumption.', '标记需要关注功耗的部件。'],
    lead: ['Marks a procurement or availability delay.', '标记采购或供货延迟。'],
    safety: ['Marks a component important to a safety function.', '标记对安全功能重要的组件。'],
    eol: ['Marks an end-of-life or obsolescence concern.', '标记停产或过时风险。'],
  };
  const engineering = [
    ['Revisions','修订','Save named snapshots, compare a baseline or restore an earlier board. Export important snapshots; local retention is limited.','保存命名快照、比较基线或恢复早期板图。重要快照应导出，本地保留数量有限。'],
    ['Interfaces','接口','Select a wire, complete endpoint and connection declarations, save them, then inspect Checked, Failed or Unassessed results.','选择连线，填写端点与连接声明，保存后查看已检查、失败或未评估结果。'],
    ['Requirements','需求','Record requirements, allocate them to items and capture verification methods and evidence.','记录需求，分配到项目，并填写验证方法与证据。'],
    ['Decisions','决策','Record design choices and their rationale so later reviewers can understand why the architecture changed.','记录设计选择与理由，便于评审者理解架构变化。'],
    ['Change impact','变更影响','Preview a part-number or rail change before applying it. Replacing a part clears its previous ratings and endpoint declarations.','应用型号或电压变更前先预览影响。替换部件会清除原额定值及端点声明。'],
    ['Budget assumptions','预算假设','Declare operating and peak assumptions for power estimates. Missing inputs remain unknown; estimates do not cover all physical effects.','声明电源估算的工作与峰值假设。缺少输入时保持未知；估算不涵盖全部物理效应。'],
    ['Subsystems','子系统','Group selected parts into a reusable subsystem with boundary ports. Open it for internal editing and Return to commit the expanded view.','将所选部件组合为带边界端口的可复用子系统。打开进行内部编辑，返回时提交展开视图。'],
    ['Review package','评审包','Download an HTML handoff with diagram, findings and engineering data; choose a revision baseline to include a comparison.','下载包含图纸、检查结果和工程数据的 HTML 交接包；选择修订基线可包含比较。'],
    ['Interchange','交换格式','Import or export supported engineering formats. Preview imports and review identity matching before applying external data.','导入或导出支持的工程格式。应用外部数据前预览导入，并核对标识匹配。'],
    ['Saved views','保存的视图','Save useful viewpoints and exploration settings for returning to a particular part of a large board.','保存常用视野与探索设置，方便返回大型板图的特定区域。'],
    ['Review comments','评审评论','Keep review notes associated with the board. Use Team reviews for discussion through a configured shared review service.','保留与板图关联的评审备注。通过共享评审服务讨论时使用团队评审。'],
    ['Verification matrix','验证矩阵','Inspect how requirements, allocations and recorded verification evidence relate. A recorded status does not independently validate evidence.','检查需求、分配与验证证据之间的关系。记录的状态不会独立验证证据真实性。'],
  ];
  return list(PANEL_HELP)
    + heading('Alignment symbols in Properties', '属性中的对齐图标')
    + paragraph('Select at least two eligible items for alignment, or three for distribution. A single locked item can anchor the alignment; disabled buttons mean the current selection cannot use that action.', '对齐至少需要两个适用项目，分布至少需要三个。单个锁定项目可作为对齐基准；按钮禁用表示当前选择无法使用该操作。')
    + '<div class="guide-control-list">' + align.map(row => entry(row, symbol(`align-${row[0]}`))).join('') + '</div>'
    + heading('Card status and warning badges', '卡片状态与警告标记')
    + paragraph('Set flags and lifecycle status in Properties. These are annotations supplied by the author, not automatic measurements or certifications. PLANNED means Planned, PROTO means Prototype, TESTED means Tested, PROD means Production, and DEPRECATED marks an obsolete design choice.', '在属性中设置标记和生命周期状态。这些是作者填写的注释，不是自动测量或认证。PLANNED 表示计划中，PROTO 表示原型，TESTED 表示已测试，PROD 表示生产，DEPRECATED 表示已弃用的设计选择。')
    + '<div class="guide-control-list">' + Object.entries(FLAG_META).map(([id, flag]) => entry([id, flag.label, trd(flag.label), ...flags[id]], svg(flag.icon, 24).replace('<svg ', `<svg style="color:${flag.color}" `))).join('') + '</div>'
    + heading('Assistant icons and options', '助手图标与选项')
    + '<div class="guide-control-list">' + ASSISTANT_HELP.map(row => entry(row, icon(row[0]) + (row[0] === 'eye' ? icon('eyeOff') : ''))).join('') + '</div>'
    + paragraph('Options & sources expands the preview checkbox, file and folder attachments, skill selector and Blueprint editor. Review selected sources before sending. A provider dot describes connection setup: Set up, Untested, Ready or Single-shot; Ready is not a guarantee that every later request will succeed.', '选项与来源可展开预览复选框、文件与文件夹附件、技能选择器及蓝图编辑器。发送前检查所选来源。提供商圆点表示连接配置：待设置、未测试、就绪或单次模式；就绪并不保证之后每次请求都成功。')
    + heading('Empty-conversation starter actions', '空对话快捷操作')
    + '<div class="guide-control-list">' + actionCards().map(action => entry([action.act, action.title, action.title, ...STARTER_HELP[action.act]], icon(action.icon))).join('') + '</div>'
    + paragraph('The starter grid is shown only while both the conversation and message draft are empty. During a conversation, type a request or expand Options & sources to choose a skill. Preview changes before applying lets you Apply changes or Discard draft after review.', '只有对话和消息草稿都为空时，才显示快捷操作。对话过程中可输入请求，或展开选项与来源选择技能。启用应用前预览更改后，可在评审后应用更改或丢弃草稿。')
    + heading('Inside Engineering', '工程工作区内部')
    + '<dl class="guide-engineering">' + engineering.map(([en, zh, detail, detailZh]) => `<div><dt>${esc(text(en, zh))}</dt><dd>${esc(text(detail, detailZh))}</dd></div>`).join('') + '</dl>';
}
