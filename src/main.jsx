import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  RULES,
  normalizeSegments,
  computeGaps,
  coveredPages,
  validatePlan,
  validateSegment,
  closureConflicts,
  loopStatus,
  currentSegments,
  scanPaper,
} from './reading.js';

const STORE_KEY = 'research-library';

const pad = n => String(n).padStart(2, '0');
const now = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const today = () => now().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const fmtAt = s => (s || '').replace('T', ' ').slice(0, 16);
const segLabel = s => `P.${s.start}–${s.end}`;

const seed = [
  {
    id: 1,
    title: 'The Extended Mind',
    authors: 'Clark, A. & Chalmers, D.',
    year: 1998,
    venue: 'Analysis',
    tags: ['具身认知', '经典'],
    abstract: '本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',
    cite: 'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.',
    notes: '',
    reading: {
      totalPages: 18,
      range: [1, 18],
      draft: [
        { id: 'p1a', start: 1, end: 6, date: '2026-08-28', note: '主动外在主义的直觉泵：Otto 的笔记本与 Inga 的记忆在功能上等价。' },
        { id: 'p1b', start: 7, end: 12, date: '2026-08-30', note: '耦合即认知：可靠信任、随时可及、自动调用三条件。' },
        { id: 'p1c', start: 13, end: 18, date: '2026-09-01', note: '反驳与回应：认知膨胀之忧，以及因果与构成的混淆。' },
      ],
      versions: [
        {
          v: 1, kind: '完成', reason: '首次闭环', at: '2026-09-02T09:30',
          segments: [
            { id: 'p1a', start: 1, end: 6, date: '2026-08-28', note: '主动外在主义的直觉泵：Otto 的笔记本与 Inga 的记忆在功能上等价。' },
            { id: 'p1b', start: 7, end: 12, date: '2026-08-30', note: '耦合即认知：可靠信任、随时可及、自动调用三条件。' },
            { id: 'p1c', start: 13, end: 18, date: '2026-09-01', note: '反驳与回应：认知膨胀之忧，以及因果与构成的混淆。' },
          ],
        },
        {
          v: 2, kind: '更正', reason: '补记第 9 页对「常识外在主义」的限定', at: '2026-09-10T15:20',
          segments: [
            { id: 'p1a', start: 1, end: 6, date: '2026-08-28', note: '主动外在主义的直觉泵：Otto 的笔记本与 Inga 的记忆在功能上等价。' },
            { id: 'p1b2', start: 7, end: 12, date: '2026-08-30', note: '耦合即认知三条件；补：第 9 页强调「常识外在主义」仅限日常信任情境。' },
            { id: 'p1c', start: 13, end: 18, date: '2026-09-01', note: '反驳与回应：认知膨胀之忧，以及因果与构成的混淆。' },
          ],
        },
        {
          v: 3, kind: '撤销', reason: '更正依据不足，回退至 v1 的摘记', from: 2, at: '2026-09-15T11:05',
          segments: [
            { id: 'p1a', start: 1, end: 6, date: '2026-08-28', note: '主动外在主义的直觉泵：Otto 的笔记本与 Inga 的记忆在功能上等价。' },
            { id: 'p1b', start: 7, end: 12, date: '2026-08-30', note: '耦合即认知：可靠信任、随时可及、自动调用三条件。' },
            { id: 'p1c', start: 13, end: 18, date: '2026-09-01', note: '反驳与回应：认知膨胀之忧，以及因果与构成的混淆。' },
          ],
        },
      ],
    },
  },
  {
    id: 2,
    title: 'Situated Learning',
    authors: 'Lave, J. & Wenger, E.',
    year: 1991,
    venue: 'Cambridge University Press',
    tags: ['学习科学', '社会'],
    abstract: '学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',
    cite: 'Lave, J. & Wenger, E. (1991). Situated Learning.',
    notes: '',
    reading: {
      totalPages: 208,
      range: [20, 168],
      draft: [
        { id: 'p2a', start: 20, end: 54, date: '2026-09-05', note: '正当性边缘参与：学习是共同体参与方式的转变，而非单纯的知识传递。' },
        { id: 'p2b', start: 55, end: 96, date: '2026-09-12', note: '实践共同体中的身份生成：从边缘参与到充分参与。' },
      ],
      versions: [],
    },
  },
  {
    id: 3,
    title: 'Designing with Data',
    authors: 'Miller, S.',
    year: 2022,
    venue: 'MIT Press',
    tags: ['设计研究', '方法'],
    abstract: '一套面向设计师的数据研究方法，讨论如何把定性洞察转化为可行动的设计决策。',
    cite: 'Miller, S. (2022). Designing with Data.',
    notes: '',
  },
];

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(data) && data.length) return data;
  } catch {}
  return seed;
}

const NAV = [
  { key: '全部', icon: '▤' },
  { key: '未设置', icon: '◌' },
  { key: '未开始', icon: '○' },
  { key: '进行中', icon: '◐' },
  { key: '已完成', icon: '●' },
];
const STATUS_CLASS = { 未设置: 'st-none', 未开始: 'st-todo', 进行中: 'st-doing', 已完成: 'st-done' };
const KIND_CLASS = { 完成: 'k-done', 更正: 'k-fix', 撤销: 'k-undo' };

function App() {
  const [items, setItems] = useState(load);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('全部');
  const [nav, setNav] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(null); // {title, attempted, rules:[{code,text}], gaps}
  const [report, setReport] = useState(null); // 全局闭环校验结果
  const [form, setForm] = useState({ title: '', authors: '', year: '2026', venue: '', abstract: '', tags: '' });
  const [planForm, setPlanForm] = useState(null); // {total, s, e}
  const [segForm, setSegForm] = useState({ start: '', end: '', date: today(), note: '' });
  const [correction, setCorrection] = useState(null); // {draft, reason}
  const [revoke, setRevoke] = useState(null); // {v, reason}

  // 持久化：刷新后页段、状态与版本顺序保持一致
  useEffect(() => localStorage.setItem(STORE_KEY, JSON.stringify(items)), [items]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const cur = items.find(x => x.id === selected) || items[0];
  const curId = cur && cur.id;
  // 切换文献时重置交互状态，避免冲突面板/更正草稿串到另一篇
  useEffect(() => {
    setConflict(null);
    setCorrection(null);
    setPlanForm(null);
    setRevoke(null);
    setSegForm({ start: '', end: '', date: today(), note: '' });
  }, [curId]);

  const r = cur && cur.reading;
  const locked = !!(r && r.versions && r.versions.length);
  const curVersion = locked ? r.versions[r.versions.length - 1] : null;
  const workingSegs = correction ? correction.draft : cur ? currentSegments(cur) : [];
  const gaps = r ? computeGaps(r.range, workingSegs) : [];
  const covered = r ? coveredPages(r.range, workingSegs) : 0;
  const span = r ? r.range[1] - r.range[0] + 1 : 0;
  const editable = !!r && (!locked || !!correction);
  const st = cur ? loopStatus(cur) : '未设置';

  const tags = ['全部', ...new Set(items.flatMap(x => x.tags))];
  const counts = useMemo(() => {
    const c = { 未设置: 0, 未开始: 0, 进行中: 0, 已完成: 0 };
    items.forEach(x => c[loopStatus(x)]++);
    return c;
  }, [items]);

  // 筛选只取当前版本：状态由当前版本推导，检索语料含当前版本摘记
  const filtered = useMemo(
    () =>
      items.filter(x => {
        if (nav !== '全部' && loopStatus(x) !== nav) return false;
        if (tag !== '全部' && !x.tags.includes(tag)) return false;
        const corpus = [x.title, x.authors, x.abstract, x.venue, x.tags.join(' '), ...currentSegments(x).map(s => s.note || '')]
          .join(' ')
          .toLowerCase();
        return corpus.includes(query.toLowerCase());
      }),
    [items, nav, tag, query],
  );

  const notify = m => setNotice(m);
  const updateCur = patch => setItems(items.map(x => (x.id === cur.id ? { ...x, ...patch } : x)));
  const updateReading = patch => updateCur({ reading: { ...r, ...patch } });

  // ---- 精读范围 ----
  const savePlan = () => {
    const total = Number(planForm.total);
    const s = Number(planForm.s);
    const e = Number(planForm.e);
    const errs = validatePlan(total, s, e);
    if (errs.length) return setConflict({ title: cur.title, attempted: [s, e], rules: errs, gaps: [] });
    const draft = (r && r.draft) || [];
    const out = draft.filter(x => x.start < s || x.end > e);
    if (out.length) {
      return setConflict({
        title: cur.title,
        attempted: [s, e],
        rules: out.map(x => ({ code: 'R2', text: `${RULES.R2}：已有段 ${segLabel(x)} 超出新范围` })),
        gaps: [],
      });
    }
    updateCur({ reading: { totalPages: total, range: [s, e], draft, versions: (r && r.versions) || [] } });
    setPlanForm(null);
    setConflict(null);
    notify('精读范围已保存');
  };

  // ---- 阅读段登记 ----
  const addSegment = () => {
    if (!segForm.date) return notify('请填写阅读日期');
    const seg = { id: uid(), start: Number(segForm.start), end: Number(segForm.end), date: segForm.date, note: segForm.note.trim() };
    const base = correction ? correction.draft : (r && r.draft) || [];
    const errs = validateSegment(seg, base, r.range);
    if (errs.length) return setConflict({ title: cur.title, attempted: [seg.start, seg.end], rules: errs, gaps: computeGaps(r.range, base) });
    const next = normalizeSegments([...base, seg]);
    if (correction) setCorrection({ ...correction, draft: next });
    else updateReading({ draft: next });
    setSegForm({ start: '', end: '', date: today(), note: '' });
    setConflict(null);
  };

  const removeSegment = id => {
    if (correction) setCorrection({ ...correction, draft: correction.draft.filter(x => x.id !== id) });
    else updateReading({ draft: ((r && r.draft) || []).filter(x => x.id !== id) });
    setConflict(null);
  };

  const fillGap = () => {
    const base = correction ? correction.draft : (r && r.draft) || [];
    const g = computeGaps(r.range, base)[0];
    if (g) setSegForm({ ...segForm, start: g[0], end: g[1] });
  };

  // ---- 闭环：完成锁定 ----
  const complete = () => {
    const draft = (r && r.draft) || [];
    const errs = closureConflicts(r.range, draft);
    if (errs.length) return setConflict({ title: cur.title, attempted: null, rules: errs, gaps: computeGaps(r.range, draft) });
    const segments = normalizeSegments(draft);
    updateReading({ versions: [{ v: 1, kind: '完成', reason: '首次闭环', at: now(), segments }], draft: segments });
    setConflict(null);
    notify('精读闭环完成，记录已锁定为 v1');
  };

  // ---- 更正：只留新版本和理由 ----
  const startCorrection = () => {
    setCorrection({ draft: curVersion.segments.map(x => ({ ...x })), reason: '' });
    setConflict(null);
  };

  const saveCorrection = () => {
    const errs = closureConflicts(r.range, correction.draft);
    if (!correction.reason.trim()) errs.push({ code: 'R6', text: RULES.R6 });
    if (errs.length) return setConflict({ title: cur.title, attempted: null, rules: errs, gaps: computeGaps(r.range, correction.draft) });
    const segments = normalizeSegments(correction.draft);
    const v = { v: r.versions.length + 1, kind: '更正', reason: correction.reason.trim(), at: now(), segments };
    updateReading({ versions: [...r.versions, v], draft: segments });
    setCorrection(null);
    setConflict(null);
    notify(`更正已保存为 v${v.v}，原版本保留`);
  };

  // ---- 撤销：恢复旧版本为新版本，旧值保留 ----
  const confirmRevoke = () => {
    const ver = r.versions.find(x => x.v === revoke.v);
    if (!revoke.reason.trim()) {
      return setConflict({ title: cur.title, attempted: null, rules: [{ code: 'R6', text: RULES.R6 }], gaps: [] });
    }
    const v = { v: r.versions.length + 1, kind: '撤销', reason: revoke.reason.trim(), from: ver.v, at: now(), segments: ver.segments };
    updateReading({ versions: [...r.versions, v], draft: ver.segments });
    setRevoke(null);
    setConflict(null);
    notify(`已生成 v${v.v}（撤销），恢复自 v${ver.v}，旧值保留`);
  };

  // ---- 全局闭环校验：冲突时列出篇名、页段、缺口和触发规则 ----
  const runCheck = () => setReport(items.map(p => ({ p, scan: scanPaper(p) })).filter(x => x.scan));

  const download = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    a.click();
  };

  // 导出只取当前版本
  const exportReport = () => {
    const lines = [`精读报告 · 导出于 ${fmtAt(now())}`, `筛选：状态=${nav} · 标签=${tag} · 搜索=${query || '无'}`, '='.repeat(48)];
    filtered.forEach(p => {
      lines.push('', `【${loopStatus(p)}】${p.title} — ${p.authors} (${p.year})`);
      const pr = p.reading;
      if (pr && pr.range) {
        const segs = currentSegments(p);
        const last = pr.versions && pr.versions.length ? pr.versions[pr.versions.length - 1] : null;
        lines.push(`  范围：全书 ${pr.totalPages} 页 · 精读 P.${pr.range[0]}–${pr.range[1]} · 当前版本 ${last ? `v${last.v}（${last.kind}）` : '草稿（未锁定）'}`);
        segs.forEach(s => lines.push(`    ${segLabel(s)} · ${s.date}${s.note ? ` · ${s.note}` : ''}`));
        const g = computeGaps(pr.range, segs);
        if (g.length) lines.push(`  缺口：${g.map(x => `P.${x[0]}–${x[1]}`).join('、')}`);
      } else {
        lines.push('  尚未设置精读范围');
      }
    });
    download('reading-report.txt', lines.join('\n'));
    notify('精读报告已导出（仅含当前版本）');
  };

  const downloadCites = () => {
    download('references.txt', items.map(x => x.cite).join('\n'));
    notify('引用列表已导出');
  };

  const bib = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(cur.cite);
    notify('引用文本已复制');
  };

  const add = () => {
    if (!form.title) return;
    const p = {
      ...form,
      id: Date.now(),
      year: +form.year,
      tags: form.tags.split(',').map(x => x.trim()).filter(Boolean),
      cite: `${form.authors} (${form.year}). ${form.title}. ${form.venue}.`,
    };
    setItems([...items, p]);
    setSelected(p.id);
    setForm({ title: '', authors: '', year: '2026', venue: '', abstract: '', tags: '' });
    setShowAdd(false);
    notify('文献已加入研究库，请设置精读范围');
  };

  const loopLine = p => {
    const pr = p.reading;
    if (!pr || !pr.range) return '未设置精读范围';
    const segs = currentSegments(p);
    const sp = pr.range[1] - pr.range[0] + 1;
    const ver = pr.versions && pr.versions.length ? ` · v${pr.versions[pr.versions.length - 1].v}` : '';
    return `精读 P.${pr.range[0]}–${pr.range[1]} · 覆盖 ${coveredPages(pr.range, segs)}/${sp} 页${ver}`;
  };

  return (
    <div className="app">
      <aside>
        <div className="logo"><span>∴</span> LITERATURE</div>
        <div className="library-head">
          <span>我的研究库</span>
          <strong>{items.length}<small> 篇文献</small></strong>
        </div>
        <nav>
          {NAV.map(n => (
            <button key={n.key} className={nav === n.key ? 'active' : ''} onClick={() => setNav(n.key)}>
              {n.icon} <span>{n.key === '全部' ? '所有文献' : n.key}</span>
              <b>{n.key === '全部' ? items.length : counts[n.key]}</b>
            </button>
          ))}
        </nav>
        <div className="side-tags">
          <small>标签</small>
          {tags.slice(1, 5).map(t => (
            <button onClick={() => setTag(t)} key={t}># {t}</button>
          ))}
        </div>
        <div className="side-foot">
          <small>本地数据库 · 刷新后状态一致</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">RESEARCH / LIBRARY</span>
            <h1>{nav === '全部' ? '所有文献' : nav}</h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={runCheck}>✓ 校验闭环</button>
            <button className="outline" onClick={exportReport}>↓ 精读报告</button>
            <button className="outline" onClick={downloadCites}>↓ 导出引用</button>
            <button className="primary" onClick={() => setShowAdd(true)}>＋ 添加文献</button>
          </div>
        </header>

        <div className="toolbar">
          <div className="search">
            ⌕<input placeholder="搜索标题、作者、摘要或当前版本摘记…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')}>×</button>}
          </div>
          <div className="tag-filter">
            {tags.map(t => (
              <button className={tag === t ? 'on' : ''} onClick={() => setTag(t)} key={t}>{t}</button>
            ))}
          </div>
        </div>

        <div className="body">
          <section className="paper-list">
            {filtered.map(p => (
              <button className={'paper ' + (cur && cur.id === p.id ? 'selected' : '')} onClick={() => setSelected(p.id)} key={p.id}>
                <div className="paper-year">{p.year}</div>
                <div className="paper-copy">
                  <h3>{p.title}</h3>
                  <p>{p.authors}</p>
                  <div>{p.tags.map(t => <span key={t}>#{t}</span>)}</div>
                  <div className="loop-line">{loopLine(p)}</div>
                </div>
                <small className={'status ' + STATUS_CLASS[loopStatus(p)]}>{loopStatus(p)}</small>
              </button>
            ))}
            {!filtered.length && <div className="no-result">没有找到匹配的文献</div>}
          </section>

          <section className="detail">
            {cur && (
              <>
                <div className="detail-top">
                  <span className={'status ' + STATUS_CLASS[st]}>{st}{locked ? ` · 锁定 v${curVersion.v}` : ''}</span>
                  <small className="dim">{r ? `${workingSegs.length} 个阅读段` : ''}</small>
                </div>
                <h2>{cur.title}</h2>
                <p className="authors">{cur.authors}</p>
                <div className="cite-actions">
                  <button onClick={bib}>▣ 复制引用</button>
                </div>

                <div className="detail-section loop">
                  <h4>精读闭环 <span>INTENSIVE READING LOOP</span></h4>

                  {!r && !planForm && (
                    <div className="plan-empty">
                      <p>尚未设置精读范围。先登记总页数与起止页，再逐段登记阅读进度。</p>
                      <button className="outline" onClick={() => setPlanForm({ total: '', s: '', e: '' })}>设置精读范围</button>
                    </div>
                  )}

                  {planForm && (
                    <div className="plan-form">
                      <div className="plan-grid">
                        <label>总页数<input type="number" min="1" value={planForm.total} onChange={e => setPlanForm({ ...planForm, total: e.target.value })} /></label>
                        <label>精读起始页<input type="number" min="1" value={planForm.s} onChange={e => setPlanForm({ ...planForm, s: e.target.value })} /></label>
                        <label>精读结束页<input type="number" min="1" value={planForm.e} onChange={e => setPlanForm({ ...planForm, e: e.target.value })} /></label>
                      </div>
                      <div className="loop-actions">
                        <span className="hint">范围确定后即可逐段登记</span>
                        <span className="btn-row">
                          {!!r && <button className="outline" onClick={() => setPlanForm(null)}>取消</button>}
                          <button className="primary" onClick={savePlan}>保存范围</button>
                        </span>
                      </div>
                    </div>
                  )}

                  {conflict && (
                    <div className="conflict">
                      <h6>⚠ 冲突 · 《{conflict.title}》</h6>
                      {conflict.attempted && (
                        <div className="row">尝试页段：<span className="chip">P.{conflict.attempted[0]}–{conflict.attempted[1]}</span></div>
                      )}
                      <div className="row">触发规则：</div>
                      <ul>{conflict.rules.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
                      {!!(conflict.gaps && conflict.gaps.length) && (
                        <div className="row">当前缺口：{conflict.gaps.map((g, i) => <span className="chip gap" key={i}>P.{g[0]}–{g[1]}</span>)}</div>
                      )}
                      <button onClick={() => setConflict(null)}>知道了</button>
                    </div>
                  )}

                  {r && !planForm && (
                    <>
                      <div className="plan-line">
                        <span>全书 <b>{r.totalPages}</b> 页 · 精读范围 <b>P.{r.range[0]}–{r.range[1]}</b>（{span} 页）</span>
                        {!locked && <button className="link" onClick={() => setPlanForm({ total: r.totalPages, s: r.range[0], e: r.range[1] })}>调整范围</button>}
                      </div>
                      <div className="progress">
                        {workingSegs.map(s => (
                          <i
                            key={s.id}
                            style={{ left: `${((s.start - r.range[0]) / span) * 100}%`, width: `${((s.end - s.start + 1) / span) * 100}%` }}
                            title={`${segLabel(s)} · ${s.date}`}
                          />
                        ))}
                      </div>
                      <div className="plan-stats">
                        已覆盖 {covered}/{span} 页（{Math.round((covered / span) * 100)}%）
                        {gaps.length > 0 && <> · 缺口 {gaps.map(g => `P.${g[0]}–${g[1]}`).join('、')}</>}
                      </div>

                      {correction && <div className="banner">正在更正 v{curVersion.v} —— 保存后生成 v{curVersion.v + 1}，原版本保留</div>}

                      <div className="segs">
                        <h5>
                          阅读段
                          <span>{locked && !correction ? `当前版本 v${curVersion.v} · 已锁定` : correction ? '更正草稿（未保存）' : '草稿'}</span>
                        </h5>
                        {workingSegs.map(s => (
                          <div className="seg-row" key={s.id}>
                            <b>{segLabel(s)}</b>
                            <time>{s.date}</time>
                            {editable && <button className="seg-del" title="删除此段" onClick={() => removeSegment(s.id)}>×</button>}
                            <p>{s.note || '（无摘记）'}</p>
                          </div>
                        ))}
                        {!workingSegs.length && <p className="dim">还没有阅读段，从第一个缺口开始登记。</p>}
                      </div>

                      {editable && (
                        <div className="seg-form">
                          <div className="seg-form-grid">
                            <label>起始页<input type="number" value={segForm.start} onChange={e => setSegForm({ ...segForm, start: e.target.value })} placeholder={r.range[0]} /></label>
                            <label>结束页<input type="number" value={segForm.end} onChange={e => setSegForm({ ...segForm, end: e.target.value })} placeholder={r.range[1]} /></label>
                            <label>日期<input type="date" value={segForm.date} onChange={e => setSegForm({ ...segForm, date: e.target.value })} /></label>
                          </div>
                          <textarea rows="2" placeholder="摘记：这一段的核心观点、页码线索…" value={segForm.note} onChange={e => setSegForm({ ...segForm, note: e.target.value })} />
                          <div className="seg-form-actions">
                            {gaps.length ? <button className="link" onClick={fillGap}>⇢ 续填缺口 P.{gaps[0][0]}–{gaps[0][1]}</button> : <span />}
                            <button className="primary" onClick={addSegment}>登记阅读段</button>
                          </div>
                        </div>
                      )}

                      {!locked && (
                        <div className="loop-actions">
                          <span className="hint">
                            {gaps.length ? `未闭合 · 还差 ${gaps.length} 个缺口` : workingSegs.length ? '各段已首尾相接，可以闭环' : '先登记阅读段'}
                          </span>
                          <button className="primary" onClick={complete}>完成精读闭环</button>
                        </div>
                      )}

                      {locked && !correction && (
                        <div className="loop-actions">
                          <span className="hint">记录已锁定 · 更正与撤销都会生成新版本</span>
                          <button className="outline" onClick={startCorrection}>✎ 更正记录</button>
                        </div>
                      )}

                      {correction && (
                        <>
                          <div className="reason-row">
                            <label>更正理由（必填，随版本保存）</label>
                            <input value={correction.reason} onChange={e => setCorrection({ ...correction, reason: e.target.value })} placeholder="例如：补录第 3 章摘记，调整分段" />
                          </div>
                          <div className="loop-actions">
                            <button className="outline" onClick={() => { setCorrection(null); setConflict(null); }}>取消</button>
                            <button className="primary" onClick={saveCorrection}>保存为新版本</button>
                          </div>
                        </>
                      )}

                      {locked && (
                        <div className="versions">
                          <h5>版本历史 <span>筛选与导出只取当前版本</span></h5>
                          {[...r.versions].sort((a, b) => b.v - a.v).map(ver => (
                            <div className={'ver-row' + (ver.v === curVersion.v ? ' current' : '')} key={ver.v}>
                              <div className="ver-head">
                                <b>v{ver.v}</b>
                                <span className={`badge ${KIND_CLASS[ver.kind]}`}>{ver.kind}{ver.from ? ` · 恢复自 v${ver.from}` : ''}</span>
                                <time>{fmtAt(ver.at)}</time>
                                {ver.v === curVersion.v
                                  ? <em>当前版本</em>
                                  : !correction && <button onClick={() => setRevoke({ v: ver.v, reason: '' })}>恢复此版本</button>}
                              </div>
                              <p>理由：{ver.reason} · {ver.segments.length} 段</p>
                              {revoke && revoke.v === ver.v && (
                                <div className="revoke-box">
                                  <input placeholder="撤销理由（必填）" value={revoke.reason} onChange={e => setRevoke({ ...revoke, reason: e.target.value })} />
                                  <button className="go" onClick={confirmRevoke}>确认撤销</button>
                                  <button onClick={() => setRevoke(null)}>取消</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="detail-section">
                  <h4>摘要 <span>ABSTRACT</span></h4>
                  <p>{cur.abstract}</p>
                </div>
                <div className="detail-section">
                  <h4>出版信息 <span>PUBLICATION</span></h4>
                  <div className="pub-grid">
                    <div><small>出版物</small><strong>{cur.venue}</strong></div>
                    <div><small>年份</small><strong>{cur.year}</strong></div>
                  </div>
                </div>
                <div className="detail-section">
                  <h4>引用文本 <span>BIBTEX / TEXT</span></h4>
                  <div className="cite-box">{cur.cite}<button onClick={bib}>复制</button></div>
                </div>
                <div className="detail-section">
                  <h4>我的笔记 <span>PRIVATE</span></h4>
                  <textarea className="notes" placeholder="记录你的阅读想法…" value={cur.notes || ''} onChange={e => updateCur({ notes: e.target.value })} />
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {showAdd && (
        <div className="modal-bg">
          <div className="modal">
            <button className="close" onClick={() => setShowAdd(false)}>×</button>
            <span className="crumb">NEW REFERENCE</span>
            <h2>添加一篇文献</h2>
            <label>标题<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="论文或书籍标题" /></label>
            <label>作者<input value={form.authors} onChange={e => setForm({ ...form, authors: e.target.value })} /></label>
            <div className="two">
              <label>年份<input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></label>
              <label>出版物<input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} /></label>
            </div>
            <label>关键词<input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="用逗号分隔" /></label>
            <label>摘要<textarea rows="3" value={form.abstract} onChange={e => setForm({ ...form, abstract: e.target.value })} /></label>
            <button className="primary full" onClick={add}>保存文献</button>
          </div>
        </div>
      )}

      {report && (
        <div className="modal-bg" onClick={() => setReport(null)}>
          <div className="modal check" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setReport(null)}>×</button>
            <span className="crumb">CLOSURE CHECK</span>
            <h2>闭环校验</h2>
            {!report.length && <p className="ok">✓ 全部通过：没有越界、重叠或未闭合的缺口。</p>}
            {report.map(({ p, scan }) => {
              const hard = scan.rules.some(c => c === 'R2' || c === 'R3');
              return (
                <div className="check-item" key={p.id}>
                  <b>《{p.title}》</b>{' '}
                  <span className={'status ' + STATUS_CLASS[loopStatus(p)]}>{loopStatus(p)}</span>{' '}
                  <span className="dim">{hard ? '冲突' : '待闭合'}</span>
                  <div className="row">触发规则：{scan.rules.map(c => <span className="chip" key={c} title={RULES[c]}>{c}</span>)}</div>
                  {!!scan.segments.length && (
                    <div className="row">相关页段：{scan.segments.map(s => <span className="chip" key={s.id}>{segLabel(s)}</span>)}</div>
                  )}
                  {!!scan.gaps.length && (
                    <div className="row">缺口：{scan.gaps.map((g, i) => <span className="chip gap" key={i}>P.{g[0]}–{g[1]}</span>)}</div>
                  )}
                </div>
              );
            })}
            <div className="legend">{Object.values(RULES).join('　')}</div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
