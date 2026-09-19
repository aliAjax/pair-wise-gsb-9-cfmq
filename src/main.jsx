import React,{useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import'./styles.css';

/* ================= 触发规则 ================= */
const R={
  R0:'R0 · 登记缺项',
  R1:'R1 · 页段越界',
  R2:'R2 · 页段重叠',
  R3:'R3 · 首尾相接覆盖',
  R4:'R4 · 锁定记录更正',
  R5:'R5 · 版本链断裂',
};

/* ================= 种子数据 ================= */
const seed=[
  {id:1,title:'The Extended Mind',authors:'Clark, A. & Chalmers, D.',year:1998,venue:'Analysis',tags:['具身认知','经典'],abstract:'本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',status:'阅读中',cite:'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.',totalPages:12,rangeStart:1,rangeEnd:12,locked:false,segments:[
    {id:'s1',versions:[{v:1,start:1,end:5,note:'心智延展的论证结构：耦合系统与互补性论证。',date:'2026-09-08',reason:'初始登记',at:'2026-09-08T21:10:00'}]},
    {id:'s2',versions:[{v:1,start:6,end:9,note:'Otto 的笔记本案例：外部载体承担记忆功能的条件。',date:'2026-09-12',reason:'初始登记',at:'2026-09-12T22:40:00'}]},
  ]},
  {id:2,title:'Situated Learning',authors:'Lave, J. & Wenger, E.',year:1991,venue:'Cambridge University Press',tags:['学习科学','社会'],abstract:'学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',status:'待读',cite:'Lave, J. & Wenger, E. (1991). Situated Learning.',segments:[]},
  {id:3,title:'Designing with Data',authors:'Miller, S.',year:2022,venue:'MIT Press',tags:['设计研究','方法'],abstract:'一套面向设计师的数据研究方法，讨论如何把定性洞察转化为可行动的设计决策。',status:'已读',cite:'Miller, S. (2022). Designing with Data.',totalPages:96,rangeStart:1,rangeEnd:48,locked:true,lockedAt:'2026-09-01T18:02:00',segments:[
    {id:'s1',versions:[{v:1,start:1,end:16,note:'数据思维导论：设计师为什么需要实证方法。',date:'2026-08-20',reason:'初始登记',at:'2026-08-20T20:00:00'}]},
    {id:'s2',versions:[
      {v:1,start:17,end:30,note:'定性洞察方法：访谈、观察与主题归纳。',date:'2026-08-25',reason:'初始登记',at:'2026-08-25T21:30:00'},
      {v:2,start:17,end:32,note:'定性洞察方法：访谈、观察与主题归纳（补第31–32页卡片分类法）。',date:'2026-08-25',reason:'更正：原登记漏掉第31–32页',at:'2026-08-26T09:12:00'},
    ]},
    {id:'s3',versions:[{v:1,start:33,end:48,note:'从洞察到设计决策：优先级矩阵与落地路径。',date:'2026-08-30',reason:'初始登记',at:'2026-08-30T20:45:00'}]},
  ]},
];

/* ================= 精读闭环核心逻辑 ================= */
const today=()=>new Date().toISOString().slice(0,10);
const nowIso=()=>new Date().toISOString();
const curVer=s=>s.versions[s.versions.length-1];
/* 只取当前版本：页段按起页排序，保证刷新后顺序一致 */
const currentSegments=p=>(p.segments||[]).map(s=>({id:s.id,...curVer(s)})).sort((a,b)=>a.start-b.start||a.end-b.end);
const hasPlan=p=>p.totalPages>0&&p.rangeStart!=null&&p.rangeEnd!=null;
const fmtRange=g=>g[0]===g[1]?`P${g[0]}`:`P${g[0]}–${g[1]}`;
/* 缺口 = 精读范围内未被当前版本页段首尾相接覆盖的区间 */
function computeGaps(p){
  if(!hasPlan(p))return[];
  const gaps=[];let cur=p.rangeStart;
  for(const s of currentSegments(p)){
    if(s.start>cur)gaps.push([cur,Math.min(s.start-1,p.rangeEnd)]);
    cur=Math.max(cur,s.end+1);
  }
  if(cur<=p.rangeEnd)gaps.push([cur,p.rangeEnd]);
  return gaps.filter(g=>g[0]<=g[1]);
}
function coveredPages(p){
  if(!hasPlan(p))return 0;
  const span=p.rangeEnd-p.rangeStart+1;
  return span-computeGaps(p).reduce((n,g)=>n+g[1]-g[0]+1,0);
}
/* 状态由阅读数据推导，刷新后必然一致 */
const readStatus=p=>p.locked?'已读':currentSegments(p).length?'阅读中':'待读';
const displayStatus=p=>hasPlan(p)?readStatus(p):(p.status||'待读');
/* 登记/更正校验：越界(R1)、重叠(R2) */
function validateSegment(p,start,end,excludeId){
  const seg=`P${start||'?'}–${end||'?'}`;const errs=[];
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<1)
    errs.push({paper:p.title,seg,rule:R.R1,detail:'页码必须为正整数'});
  else if(start>end)
    errs.push({paper:p.title,seg,rule:R.R1,detail:'起始页大于结束页'});
  else{
    if(start<p.rangeStart||end>p.rangeEnd)
      errs.push({paper:p.title,seg,rule:R.R1,detail:`超出精读范围 P${p.rangeStart}–${p.rangeEnd}（总页数 ${p.totalPages}）`});
    const ov=currentSegments(p).find(s=>s.id!==excludeId&&start<=s.end&&end>=s.start);
    if(ov)errs.push({paper:p.title,seg,rule:R.R2,detail:`与已登记段 P${ov.start}–${ov.end} 重叠（重叠区 P${Math.max(start,ov.start)}–${Math.min(end,ov.end)}）`});
  }
  return errs;
}
/* 全库一致性审计：越界 / 重叠 / 锁定后仍有缺口 / 版本断链 */
function auditLibrary(items){
  const out=[];
  for(const p of items){
    if(!hasPlan(p))continue;
    if(p.rangeStart<1||p.rangeEnd>p.totalPages||p.rangeStart>p.rangeEnd)
      out.push({paper:p.title,seg:`范围 P${p.rangeStart}–${p.rangeEnd}`,rule:R.R1,detail:`精读范围超出总页数 1–${p.totalPages}`});
    const segs=currentSegments(p);
    segs.forEach((s,i)=>{
      if(s.start>s.end)out.push({paper:p.title,seg:`P${s.start}–${s.end}`,rule:R.R1,detail:'起始页大于结束页'});
      if(s.start<p.rangeStart||s.end>p.rangeEnd)
        out.push({paper:p.title,seg:`P${s.start}–${s.end}`,rule:R.R1,detail:`超出精读范围 P${p.rangeStart}–${p.rangeEnd}`});
      if(i&&s.start<=segs[i-1].end)
        out.push({paper:p.title,seg:`P${segs[i-1].start}–${segs[i-1].end} 与 P${s.start}–${s.end}`,rule:R.R2,detail:`重叠区 P${s.start}–${Math.min(s.end,segs[i-1].end)}`});
      const rec=(p.segments||[]).find(x=>x.id===s.id);
      (rec?rec.versions:[]).forEach((v,vi)=>{if(v.v!==vi+1)out.push({paper:p.title,seg:`P${s.start}–${s.end}`,rule:R.R5,detail:`版本号应为 v${vi+1}，实际为 v${v.v}`})});
    });
    if(p.locked)computeGaps(p).forEach(g=>out.push({paper:p.title,seg:segs.map(s=>`P${s.start}–${s.end}`).join('、')||'（无）',gap:fmtRange(g),rule:R.R3,detail:'记录已锁定但精读范围未被完整覆盖'}));
  }
  return out;
}
/* 读取与归一化：版本按 v 排序，保证刷新后版本顺序一致 */
const normalize=p=>({...p,segments:(p.segments||[]).map(s=>({...s,versions:(s.versions||[]).slice().sort((a,b)=>a.v-b.v)}))});
const load=()=>{try{const raw=JSON.parse(localStorage.getItem('research-library'));const arr=Array.isArray(raw)&&raw.length?raw:seed;return arr.map(normalize)}catch{return seed}};

/* ================= 页段可视化 ================= */
function PageMap({paper}){
  const rs=paper.rangeStart,re=paper.rangeEnd,span=re-rs+1;
  const spans=[];let cur=rs;
  for(const s of currentSegments(paper)){
    if(s.start>cur)spans.push({t:'gap',from:cur,to:s.start-1});
    spans.push({t:'seg',from:Math.max(s.start,cur),to:s.end});
    cur=Math.max(cur,s.end+1);
  }
  if(cur<=re)spans.push({t:'gap',from:cur,to:re});
  return <div>
    <div className="pagemap">{spans.map((sp,i)=>sp.to>=sp.from&&<div key={i} className={'pm-'+sp.t} style={{left:((sp.from-rs)/span*100)+'%',width:((sp.to-sp.from+1)/span*100)+'%'}} title={`${fmtRange([sp.from,sp.to])} ${sp.t==='seg'?'已读':'缺口'}`}/>)}</div>
    <div className="pm-scale"><span>P{rs}</span><span>P{re}</span></div>
  </div>;
}

/* ================= 精读闭环面板 ================= */
function ReadingLoop({paper,onChange,notify,raise}){
  const[plan,setPlan]=useState({totalPages:paper.totalPages||'',rangeStart:paper.rangeStart??'',rangeEnd:paper.rangeEnd??''});
  const[editPlan,setEditPlan]=useState(!hasPlan(paper));
  const[seg,setSeg]=useState({start:'',end:'',date:today(),note:''});
  const[edit,setEdit]=useState(null);
  const[hist,setHist]=useState({});
  const patch=o=>onChange({...paper,...o});
  const gaps=computeGaps(paper);
  const span=hasPlan(paper)?paper.rangeEnd-paper.rangeStart+1:0;

  const savePlan=()=>{
    const tp=+plan.totalPages,rs=+plan.rangeStart,re=+plan.rangeEnd;
    const errs=[];
    if(!Number.isInteger(tp)||tp<1)errs.push({paper:paper.title,seg:'—',rule:R.R1,detail:'总页数必须为正整数'});
    else if(!Number.isInteger(rs)||!Number.isInteger(re)||rs<1||re>tp||rs>re)
      errs.push({paper:paper.title,seg:`P${plan.rangeStart||'?'}–${plan.rangeEnd||'?'}`,rule:R.R1,detail:`精读范围须在 1–${tp} 之内且起页 ≤ 止页`});
    if(errs.length)return raise(errs);
    patch({totalPages:tp,rangeStart:rs,rangeEnd:re});
    setEditPlan(false);
    notify(`精读范围已设定：P${rs}–${re} / 共 ${tp} 页`);
  };

  const addSeg=()=>{
    const start=+seg.start,end=+seg.end;
    const errs=validateSegment(paper,start,end,null);
    if(!seg.date)errs.push({paper:paper.title,seg:`P${start||'?'}–${end||'?'}`,rule:R.R0,detail:'登记阅读段须填写日期'});
    if(!seg.note.trim())errs.push({paper:paper.title,seg:`P${start||'?'}–${end||'?'}`,rule:R.R0,detail:'登记阅读段须填写摘记'});
    if(errs.length)return raise(errs);
    const rec={id:'s'+Date.now(),versions:[{v:1,start,end,note:seg.note.trim(),date:seg.date,reason:'初始登记',at:nowIso()}]};
    patch({segments:[...(paper.segments||[]),rec]});
    setSeg({start:'',end:'',date:today(),note:''});
    notify(`已登记阅读段 P${start}–${end}`);
  };

  const delSeg=id=>{
    if(paper.locked)return raise([{paper:paper.title,seg:'—',rule:R.R4,detail:'记录已锁定，不能删除阅读段，只能以新版本更正'}]);
    patch({segments:paper.segments.filter(s=>s.id!==id)});
    notify('阅读段已删除');
  };

  const openEdit=rec=>{
    const v=curVer(rec);
    setEdit({id:rec.id,start:v.start,end:v.end,date:v.date,note:v.note,reason:''});
  };

  /* 更正：只追加新版本，旧值保留；锁定后理由必填 */
  const saveEdit=rec=>{
    const start=+edit.start,end=+edit.end;
    const errs=validateSegment(paper,start,end,rec.id);
    if(!edit.date)errs.push({paper:paper.title,seg:`P${start||'?'}–${end||'?'}`,rule:R.R0,detail:'更正须保留日期'});
    if(!edit.note.trim())errs.push({paper:paper.title,seg:`P${start||'?'}–${end||'?'}`,rule:R.R0,detail:'更正须填写摘记'});
    if(paper.locked&&!edit.reason.trim())errs.push({paper:paper.title,seg:`P${start||'?'}–${end||'?'}`,rule:R.R4,detail:'锁定记录的更正必须填写理由'});
    if(errs.length)return raise(errs);
    const nv={v:rec.versions.length+1,start,end,note:edit.note.trim(),date:edit.date,reason:edit.reason.trim()||'锁定前调整',at:nowIso()};
    patch({segments:paper.segments.map(s=>s.id===rec.id?{...s,versions:[...s.versions,nv]}:s)});
    setEdit(null);
    notify(`已保存新版本 v${nv.v}，旧值保留于历史`);
  };

  /* 撤销：以恢复旧值的新版本追加，被撤销的值同样保留 */
  const undo=rec=>{
    if(rec.versions.length<2)return;
    const prev=rec.versions[rec.versions.length-2];
    const nv={v:rec.versions.length+1,start:prev.start,end:prev.end,note:prev.note,date:prev.date,reason:`撤销 v${rec.versions.length-1} 的更正（恢复 v${prev.v}，旧值保留于历史）`,at:nowIso()};
    patch({segments:paper.segments.map(s=>s.id===rec.id?{...s,versions:[...s.versions,nv]}:s)});
    notify(`已撤销，当前版本恢复为 v${prev.v} 的值`);
  };

  /* 完成：要求各段首尾相接并覆盖全部精读范围 */
  const finish=()=>{
    const segs=currentSegments(paper);
    const errs=[];
    if(!segs.length)errs.push({paper:paper.title,seg:'（无阅读段）',gap:fmtRange([paper.rangeStart,paper.rangeEnd]),rule:R.R3,detail:'尚未登记任何阅读段'});
    gaps.forEach(g=>errs.push({paper:paper.title,seg:segs.map(s=>`P${s.start}–${s.end}`).join('、'),gap:fmtRange(g),rule:R.R3,detail:'完成精读要求各段首尾相接并覆盖全部精读范围'}));
    if(errs.length)return raise(errs);
    patch({locked:true,lockedAt:nowIso()});
    notify('精读完成，记录已锁定 · 此后更正将生成新版本');
  };

  return <div>
    <div className="loop-head">
      <h4>精读闭环 <span>READING LOOP</span></h4>
      {paper.locked&&<span className="lock-badge">🔒 已锁定 · {(paper.lockedAt||'').slice(0,10)}</span>}
    </div>

    {(!hasPlan(paper)||editPlan)?(
      <div className="plan-form">
        <p className="loop-hint">先设定总页数与精读范围，再逐段登记阅读段；范围在登记首段后不可更改。</p>
        <div className="plan-grid">
          <label>总页数<input type="number" min="1" value={plan.totalPages} onChange={e=>setPlan({...plan,totalPages:e.target.value})}/></label>
          <label>精读起页<input type="number" min="1" value={plan.rangeStart} onChange={e=>setPlan({...plan,rangeStart:e.target.value})}/></label>
          <label>精读止页<input type="number" min="1" value={plan.rangeEnd} onChange={e=>setPlan({...plan,rangeEnd:e.target.value})}/></label>
        </div>
        <div className="edit-actions">
          <button className="primary" onClick={savePlan}>设定范围</button>
          {hasPlan(paper)&&<button className="outline" onClick={()=>setEditPlan(false)}>取消</button>}
        </div>
      </div>
    ):(
      <>
        <div className="plan-summary">
          <span>总页数 <b>{paper.totalPages}</b></span>
          <span>精读范围 <b>P{paper.rangeStart}–{paper.rangeEnd}</b></span>
          <span>已覆盖 <b>{coveredPages(paper)}/{span}</b> 页</span>
          {!paper.locked&&!(paper.segments||[]).length&&<button className="link" onClick={()=>{setPlan({totalPages:paper.totalPages,rangeStart:paper.rangeStart,rangeEnd:paper.rangeEnd});setEditPlan(true);}}>修改范围</button>}
        </div>
        <PageMap paper={paper}/>
        {gaps.length>0&&<div className="gaps">缺口：{gaps.map(fmtRange).join('、')}</div>}

        {(paper.segments||[]).map(rec=>{
          const v=curVer(rec);
          return <div className="seg" key={rec.id}>
            <div className="seg-head">
              <strong>{fmtRange([v.start,v.end])}</strong>
              <span className="seg-date">{v.date}</span>
              <span className="vbadge">v{v.v} · 当前</span>
              <span className="seg-actions">
                <button onClick={()=>openEdit(rec)}>更正</button>
                <button disabled={rec.versions.length<2} onClick={()=>undo(rec)}>撤销</button>
                {!paper.locked&&<button onClick={()=>delSeg(rec.id)}>删除</button>}
                <button onClick={()=>setHist({...hist,[rec.id]:!hist[rec.id]})}>历史 {rec.versions.length}</button>
              </span>
            </div>
            <p className="seg-note">{v.note}</p>
            {hist[rec.id]&&<div className="history">
              {rec.versions.map(ver=><div className={'ver'+(ver.v===v.v?' cur':'')} key={ver.v}>
                <b>v{ver.v}</b><span>{fmtRange([ver.start,ver.end])}</span><span>{ver.date}</span>
                <em>{ver.reason}</em><small>{(ver.at||'').slice(0,16).replace('T',' ')}</small>
                {ver.v===v.v&&<span className="curtag">当前</span>}
              </div>)}
            </div>}
            {edit&&edit.id===rec.id&&<div className="edit-form">
              <div className="row">
                <label>起页<input type="number" value={edit.start} onChange={e=>setEdit({...edit,start:e.target.value})}/></label>
                <label>止页<input type="number" value={edit.end} onChange={e=>setEdit({...edit,end:e.target.value})}/></label>
                <label>日期<input type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/></label>
              </div>
              <label>摘记<textarea rows="2" value={edit.note} onChange={e=>setEdit({...edit,note:e.target.value})}/></label>
              <label>更正理由{paper.locked?'（必填）':'（可选）'}<input value={edit.reason} onChange={e=>setEdit({...edit,reason:e.target.value})} placeholder="例如：页码登记有误"/></label>
              <div className="edit-actions">
                <button className="primary" onClick={()=>saveEdit(rec)}>保存为 v{rec.versions.length+1}</button>
                <button className="outline" onClick={()=>setEdit(null)}>取消</button>
              </div>
            </div>}
          </div>;
        })}

        {!paper.locked?(
          <>
            <div className="seg-form">
              <div className="row">
                <label>起页<input type="number" value={seg.start} onChange={e=>setSeg({...seg,start:e.target.value})} placeholder={String(paper.rangeStart)}/></label>
                <label>止页<input type="number" value={seg.end} onChange={e=>setSeg({...seg,end:e.target.value})} placeholder={String(paper.rangeEnd)}/></label>
                <label>日期<input type="date" value={seg.date} onChange={e=>setSeg({...seg,date:e.target.value})}/></label>
              </div>
              <label>摘记<textarea rows="2" value={seg.note} onChange={e=>setSeg({...seg,note:e.target.value})} placeholder="本段要点、疑问或引文…"/></label>
              <button className="primary" onClick={addSeg}>＋ 登记阅读段</button>
            </div>
            <button className="finish" onClick={finish}>✓ 完成精读并锁定</button>
            <p className="finish-hint">要求各段首尾相接并完整覆盖 P{paper.rangeStart}–{paper.rangeEnd}</p>
          </>
        ):(
          <p className="locked-hint">记录已锁定：更正将生成新版本并须填写理由；撤销同样保留旧值。筛选与导出只取当前版本。</p>
        )}
      </>
    )}
  </div>;
}

/* ================= 冲突面板：篇名 · 页段 · 缺口 · 触发规则 ================= */
function Conflicts({list,onClose}){
  if(!list||!list.length)return null;
  return <div className="conflict-bg"><div className="conflict-panel">
    <div className="conflict-head"><strong>⚠ {list.length} 处冲突</strong><span>篇名 · 页段 · 缺口 · 触发规则</span><button onClick={onClose}>×</button></div>
    {list.map((c,i)=><div className="conflict" key={i}>
      <div className="c-line1"><b>{c.paper}</b>{c.seg&&<span className="c-seg">页段 {c.seg}</span>}</div>
      {c.gap&&<div className="c-gap">缺口 {c.gap}</div>}
      <div className="c-line2"><span className="c-rule">{c.rule}</span><span>{c.detail}</span></div>
    </div>)}
  </div></div>;
}

/* ================= 主应用 ================= */
function App(){
  const[items,setItems]=useState(load);
  const[selected,setSelected]=useState(1);
  const[query,setQuery]=useState('');
  const[tag,setTag]=useState('全部');
  const[nav,setNav]=useState('全部');
  const[show,setShow]=useState(false);
  const[notice,setNotice]=useState('');
  const[conflicts,setConflicts]=useState(null);
  const[form,setForm]=useState({title:'',authors:'',year:'2026',venue:'',abstract:'',tags:''});
  useEffect(()=>localStorage.setItem('research-library',JSON.stringify(items)),[items]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(t)},[notice]);
  const tags=['全部',...new Set(items.flatMap(x=>x.tags))];
  /* 刷新后审计持久化数据，冲突可展开查看 */
  const audit=useMemo(()=>auditLibrary(items),[items]);
  /* 筛选只取当前版本：状态由当前版本推导，搜索含当前版本摘记 */
  const filtered=useMemo(()=>items.filter(x=>{
    if(nav!=='全部'&&displayStatus(x)!==nav)return false;
    if(tag!=='全部'&&!x.tags.includes(tag))return false;
    const hay=`${x.title}${x.authors}${x.abstract}${currentSegments(x).map(s=>s.note).join(' ')}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  }),[items,nav,tag,query]);
  const cur=items.find(x=>x.id===selected)||items[0];
  const updateCur=o=>setItems(items.map(x=>x.id===cur.id?{...x,...o}:x));
  const add=()=>{
    if(!form.title)return;
    const p={...form,id:Date.now(),year:+form.year,tags:form.tags.split(',').map(x=>x.trim()).filter(Boolean),status:'待读',segments:[],cite:`${form.authors} (${form.year}). ${form.title}. ${form.venue}.`};
    setItems([...items,p]);setSelected(p.id);
    setForm({title:'',authors:'',year:'2026',venue:'',abstract:'',tags:''});
    setShow(false);setNotice('文献已加入研究库，请先设定精读范围');
  };
  const bib=()=>{navigator.clipboard?.writeText(cur.cite);setNotice('引用文本已复制')};
  const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([items.map(x=>x.cite).join('\n')],{type:'text/plain'}));a.download='references.txt';a.click();setNotice('引用列表已导出')};
  /* 导出只取当前版本 */
  const exportLog=()=>{
    const lines=[];
    items.forEach(p=>{
      lines.push(`《${p.title}》 ${p.authors} (${p.year}) · ${displayStatus(p)}${p.locked?' · 已锁定':''}`);
      if(hasPlan(p)){
        lines.push(`  总页数 ${p.totalPages} · 精读范围 P${p.rangeStart}–${p.rangeEnd} · 已覆盖 ${coveredPages(p)}/${p.rangeEnd-p.rangeStart+1} 页`);
        const gaps=computeGaps(p);
        if(gaps.length)lines.push(`  缺口：${gaps.map(fmtRange).join('、')}`);
        currentSegments(p).forEach(s=>lines.push(`  ${fmtRange([s.start,s.end])} [${s.date}] v${s.v} · ${s.note}`));
      }else lines.push('  （未设定精读范围）');
      lines.push('');
    });
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));a.download='reading-log.txt';a.click();
    setNotice('精读记录已导出（仅当前版本）');
  };
  const navDef=[['全部','▤','所有文献'],['待读','▥','待读'],['阅读中','◐','阅读中'],['已读','✓','已读']];
  return <div className="app">
    <aside>
      <div className="logo"><span>∴</span> LITERATURE</div>
      <div className="library-head"><span>我的研究库</span><strong>{items.length}<small> 篇文献</small></strong></div>
      <nav>{navDef.map(([k,ic,label])=><button key={k} className={nav===k?'active':''} onClick={()=>setNav(k)}>{ic} <span>{label}</span><b>{k==='全部'?items.length:items.filter(x=>displayStatus(x)===k).length}</b></button>)}</nav>
      <div className="side-tags"><small>标签</small>{tags.slice(1,5).map(t=><button onClick={()=>setTag(t)} key={t}># {t}</button>)}</div>
      <div className="side-foot"><small>本地数据库 · 已同步</small></div>
    </aside>
    <main>
      <header>
        <div><span className="crumb">RESEARCH / LIBRARY</span><h1>{nav==='全部'?'所有文献':nav}</h1></div>
        <div className="actions">
          {audit.length>0&&<button className="outline warn" onClick={()=>setConflicts(audit)}>⚠ {audit.length} 处冲突</button>}
          <button className="outline" onClick={exportLog}>↓ 导出精读记录</button>
          <button className="outline" onClick={download}>↓ 导出引用</button>
          <button className="primary" onClick={()=>setShow(true)}>＋ 添加文献</button>
        </div>
      </header>
      <div className="toolbar">
        <div className="search">⌕<input placeholder="搜索标题、作者、摘要或摘记…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}>×</button>}</div>
        <div className="tag-filter">{tags.map(t=><button className={tag===t?'on':''} onClick={()=>setTag(t)} key={t}>{t}</button>)}</div>
      </div>
      <div className="body">
        <section className="paper-list">
          {filtered.map(p=><button className={'paper '+(selected===p.id?'selected':'')} onClick={()=>setSelected(p.id)} key={p.id}>
            <div className="paper-year">{p.year}</div>
            <div className="paper-copy">
              <h3>{p.title}</h3>
              <p>{p.authors}</p>
              <div>{p.tags.map(t=><span key={t}>#{t}</span>)}</div>
              {hasPlan(p)&&<small className="mini-prog">P{p.rangeStart}–{p.rangeEnd} · {coveredPages(p)}/{p.rangeEnd-p.rangeStart+1}页{p.locked?' · 🔒':''}</small>}
            </div>
            <small className={'status '+displayStatus(p)}>{displayStatus(p)}</small>
          </button>)}
          {!filtered.length&&<div className="no-result">没有找到匹配的文献</div>}
        </section>
        <section className="detail">
          {cur&&<>
            <div className="detail-top">
              <span className={'status '+displayStatus(cur)}>{displayStatus(cur)}</span>
              <button onClick={()=>setNotice('已加入收藏')}>☆ 收藏</button>
            </div>
            <h2>{cur.title}</h2>
            <p className="authors">{cur.authors}</p>
            <div className="cite-actions">
              <button onClick={bib}>▣ 复制引用</button>
              {!hasPlan(cur)&&<button onClick={()=>updateCur({status:cur.status==='已读'?'待读':'已读'})}>{cur.status==='已读'?'标记为待读':'标记为已读'}</button>}
            </div>
            <div className="detail-section"><h4>摘要 <span>ABSTRACT</span></h4><p>{cur.abstract}</p></div>
            <div className="detail-section"><ReadingLoop key={cur.id} paper={cur} onChange={updateCur} notify={setNotice} raise={setConflicts}/></div>
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
              <textarea className="notes" placeholder="记录你的阅读想法…" value={cur.notes||''} onChange={e=>updateCur({notes:e.target.value})}/>
            </div>
          </>}
        </section>
      </div>
    </main>
    {show&&<div className="modal-bg"><div className="modal">
      <button className="close" onClick={()=>setShow(false)}>×</button>
      <span className="crumb">NEW REFERENCE</span>
      <h2>添加一篇文献</h2>
      <label>标题<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="论文或书籍标题"/></label>
      <label>作者<input value={form.authors} onChange={e=>setForm({...form,authors:e.target.value})}/></label>
      <div className="two"><label>年份<input type="number" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/></label><label>出版物<input value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}/></label></div>
      <label>关键词<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="用逗号分隔"/></label>
      <label>摘要<textarea rows="3" value={form.abstract} onChange={e=>setForm({...form,abstract:e.target.value})}/></label>
      <button className="primary full" onClick={add}>保存文献</button>
    </div></div>}
    <Conflicts list={conflicts} onClose={()=>setConflicts(null)}/>
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
