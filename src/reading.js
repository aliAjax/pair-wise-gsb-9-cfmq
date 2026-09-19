// 精读闭环核心规则：页段校验、缺口计算、闭环判定、版本与状态工具。
// 本模块不依赖 React，所有函数均为纯函数，便于测试与复用。

export const RULES = {
  R1: 'R1 · 页码无效：起止页须为正整数，且起始页 ≤ 结束页',
  R2: 'R2 · 越界：阅读段不得超出精读范围',
  R3: 'R3 · 重叠：阅读段不得与已有页段重叠',
  R4: 'R4 · 断档：各段未首尾相接，存在缺口',
  R5: 'R5 · 未覆盖：各段未覆盖精读范围的全部页码',
  R6: 'R6 · 缺理由：更正或撤销必须填写理由',
};

// 段按起始页排序，保证渲染与持久化顺序一致（刷新后页段顺序不变）。
export function normalizeSegments(segments) {
  return [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
}

// 计算精读范围 [rs, re] 内未被覆盖的缺口，返回 [[a, b], ...]。
export function computeGaps(range, segments) {
  const [rs, re] = range;
  const gaps = [];
  let cursor = rs;
  for (const seg of normalizeSegments(segments)) {
    const s = Math.max(seg.start, rs);
    const e = Math.min(seg.end, re);
    if (s > cursor) gaps.push([cursor, s - 1]);
    if (e >= cursor) cursor = e + 1;
  }
  if (cursor <= re) gaps.push([cursor, re]);
  return gaps;
}

// 范围内已覆盖的页数（越界部分裁剪后计算）。
export function coveredPages(range, segments) {
  const [rs, re] = range;
  return normalizeSegments(segments).reduce(
    (n, s) => n + Math.max(0, Math.min(s.end, re) - Math.max(s.start, rs) + 1),
    0,
  );
}

// 校验精读范围设置：总页数与起止页。
export function validatePlan(totalPages, s, e) {
  const errs = [];
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    errs.push({ code: 'R1', text: 'R1 · 总页数须为正整数' });
  }
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) {
    errs.push({ code: 'R1', text: RULES.R1 });
  } else if (Number.isInteger(totalPages) && totalPages >= 1 && e > totalPages) {
    errs.push({ code: 'R2', text: `R2 · 精读范围 P.${s}–${e} 超出全书 ${totalPages} 页` });
  }
  return errs;
}

// 校验单个新段（相对已有段与精读范围），返回触发规则列表。
export function validateSegment(seg, existing, range) {
  const errs = [];
  if (!Number.isInteger(seg.start) || !Number.isInteger(seg.end) || seg.start < 1 || seg.end < seg.start) {
    errs.push({ code: 'R1', text: RULES.R1 });
    return errs; // 页码无效时不再判越界与重叠
  }
  if (seg.start < range[0] || seg.end > range[1]) {
    errs.push({ code: 'R2', text: `${RULES.R2}（范围 P.${range[0]}–${range[1]}）` });
  }
  for (const x of existing) {
    if (x.start <= seg.end && seg.start <= x.end) {
      errs.push({ code: 'R3', text: `${RULES.R3}：与 P.${x.start}–${x.end} 冲突` });
    }
  }
  return errs;
}

// 闭环判定：各段须在范围内、互不重叠、首尾相接并覆盖全部范围。
export function closureConflicts(range, segments) {
  const sorted = normalizeSegments(segments);
  if (!sorted.length) return [{ code: 'R5', text: RULES.R5 }];
  const errs = [];
  for (const s of sorted) {
    if (s.start < range[0] || s.end > range[1]) {
      errs.push({ code: 'R2', text: `${RULES.R2}：P.${s.start}–${s.end}` });
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) {
      errs.push({
        code: 'R3',
        text: `${RULES.R3}：P.${sorted[i - 1].start}–${sorted[i - 1].end} 与 P.${sorted[i].start}–${sorted[i].end}`,
      });
    }
  }
  for (const g of computeGaps(range, sorted)) {
    // 缺口触及范围首尾 → 未覆盖全部范围（R5）；位于中间 → 未首尾相接（R4）
    const code = g[0] === range[0] || g[1] === range[1] ? 'R5' : 'R4';
    errs.push({ code, text: `${RULES[code]}：缺口 P.${g[0]}–${g[1]}` });
  }
  return errs;
}

// 当前生效的页段：锁定后取最新版本，否则取草稿（筛选与导出只取当前版本）。
export function currentSegments(paper) {
  const r = paper.reading;
  if (!r) return [];
  if (r.versions && r.versions.length) return r.versions[r.versions.length - 1].segments;
  return r.draft || [];
}

// 闭环状态：未设置 → 未开始 → 进行中 → 已完成（锁定）。
export function loopStatus(paper) {
  const r = paper.reading;
  if (!r || !r.range) return '未设置';
  if (r.versions && r.versions.length) return '已完成';
  if (r.draft && r.draft.length) return '进行中';
  return '未开始';
}

// 全局闭环校验：扫描单篇当前版本，返回冲突信息（无问题返回 null）。
export function scanPaper(paper) {
  const r = paper.reading;
  if (!r || !r.range) return null;
  const segs = currentSegments(paper);
  if (!segs.length) return null;
  const sorted = normalizeSegments(segs);
  const rules = new Set();
  const bad = [];
  for (const s of sorted) {
    if (s.start < r.range[0] || s.end > r.range[1]) {
      rules.add('R2');
      bad.push(s);
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) {
      rules.add('R3');
      bad.push(sorted[i - 1], sorted[i]);
    }
  }
  const gaps = computeGaps(r.range, sorted);
  for (const g of gaps) rules.add(g[0] === r.range[0] || g[1] === r.range[1] ? 'R5' : 'R4');
  if (!rules.size) return null;
  const uniq = [...new Map(bad.map(s => [s.id, s])).values()];
  return { rules: [...rules], gaps, segments: uniq };
}
