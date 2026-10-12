// Usage: node tests/sim.test.js   (index.html의 <script>를 가짜 DOM에서 실행해 로직을 검증)
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// 로그 전송 검증을 위해 테스트에서만 LOG_URL을 채우고 fetch를 가로챔
const js = html.match(/<script>([\s\S]*)<\/script>/)[1].replace("const LOG_URL = '';", "const LOG_URL = 'http://test.invalid/log';");

const stub = `
const els = {};
const sent = [];
const fetch = (url, opt) => { sent.push(JSON.parse(opt.body)); return Promise.resolve(); };
const mk = () => ({hidden:false, style:{}, innerHTML:'', textContent:'', value:'', focus(){}, setAttribute(){}, querySelectorAll:()=>[], addEventListener(){}});
const document = {getElementById:id=>els[id]||(els[id]=mk()), querySelector:()=>mk(), addEventListener(){}};
const window = {scrollTo(){}};
const innerWidth = 1000;
`;

const checks = `
const failures = [];
const fail = m => { if (failures.length < 15) failures.push(m); };
const resultShown = () => els['screen-result'].hidden === false;

function play(decide){
  start();
  let guard = 0;
  while (!els['screen-quiz'].hidden && guard++ < 40) answer(decide());
  return resultShown();
}
const top3 = () => [...D].sort((a,b)=>score[b.id]-score[a.id]).slice(0,3).map(d=>d.id);

// 0. 이름 입력: 비어 있으면 시작 불가, 입력하면 시작 + 로그 기록
els['player-name'] = mk();
els['screen-quiz'] = mk();
els['screen-quiz'].hidden = true;
els['player-name'].value = '   ';
start();
if (!els['screen-quiz'].hidden || sent.length) fail('이름이 비었는데 게임이 시작됨');
els['player-name'].value = '=HYPERLINK("x")' + 'ㄱ'.repeat(30);
sent.length = 0;
play(() => Math.random() < .5);
if (sent.length !== 2 || sent[0].type !== 'start' || sent[1].type !== 'complete') fail('start/complete 로그가 정확히 1쌍이 아님: ' + sent.map(s => s.type));
else {
  if (sent[1].name.length !== 20) fail('이름 길이 제한(20자) 미적용: ' + sent[1].name.length);
  if (sent[1].session !== sent[0].session || !sent[1].session) fail('세션 ID 불일치');
  if (sent[1].answers.length !== asked.length || !sent[1].answers.every(a => a.q && (a.a === 'YES' || a.a === 'NO'))) fail('answers 로그가 응답과 다름');
  if (!sent[1].top3 || !sent[1].region) fail('결과 요약 누락');
}
els['player-name'].value = '테스터';
sent.length = 0;

// 1~3. 무작위 1000회: 결과 도달, 질문 중복 없음, 상한, 일치도 범위, NaN 없음
for (let i = 0; i < 1000; i++) {
  if (!play(() => Math.random() < .5)) { fail('결과 화면에 도달하지 못함 (run ' + i + ')'); continue; }
  const qs = asked.map(a => a.q);
  if (new Set(qs).size !== qs.length) fail('질문 중복 (run ' + i + ')');
  if (asked.length > Math.min(MAX_Q, Q.length)) fail('질문 수 초과: ' + asked.length);
  for (const d of D) { const a = affinity(d); if (!(a >= 0 && a <= 1)) fail('일치도 범위 오류: ' + d.id + '=' + a); }
  for (const r of regionScores()) if (!(r.aff >= 0 && r.aff <= 1)) fail('지역 일치도 오류: ' + r.key);
  if (/NaN/.test(els['map'].innerHTML) || /NaN/.test(els['radar'].innerHTML) || /NaN/.test(els['bars'].innerHTML)) fail('시각화에 NaN 포함 (run ' + i + ')');
}

// 4. 같은 시드 + 같은 답변 -> 같은 질문/결과 (재현 가능)
const seeded = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const seq = [true,false,true,true,false,false,true,false,true,true,false,true,false,true,false,true,true,false,false,true];
const runSeq = seed => { rng = seeded(seed); let i = 0; play(() => seq[i++ % seq.length]); return top3().join(',') + '|' + asked.map(a => Q.indexOf(a.q)).join(','); };
if (runSeq(42) !== runSeq(42)) fail('같은 시드/답변인데 결과가 다름');
rng = Math.random;

// 5. 속성 일관 답변: 목표 디저트 기준으로 답하면, 질문 순서가 매번 달라도 목표가 Top 3 안에 포함
const missed = [];
for (const target of D) {
  for (let k = 0; k < 30; k++) {
    play(() => current.test(target));
    if (!top3().includes(target.id)) { missed.push(target.name); break; }
  }
}
if (missed.length) fail('목표 디저트가 Top 3에 없음: ' + missed.join(', '));

// 6. 다양성: 매 게임 질문 순서/문구가 달라지는지 (같은 답변을 반복해도)
const orders = new Set(), firsts = new Set(), texts = new Set();
for (let i = 0; i < 200; i++) {
  let n = 0;
  start();
  firsts.add(Q.indexOf(current.q));
  while (!els['screen-quiz'].hidden && n++ < 40) { texts.add(els['q-text'].textContent); answer(n % 2 === 0); }
  orders.add(asked.map(a => Q.indexOf(a.q)).join(','));
}
if (firsts.size < 5) fail('첫 질문 종류가 너무 적음: ' + firsts.size);
if (orders.size < 100) fail('질문 순서 조합이 너무 적음: ' + orders.size + '/200');
if (texts.size < Q.length * 2) fail('문구 변형이 충분히 노출되지 않음: ' + texts.size);
console.log('다양성: 첫 질문 ' + firsts.size + '종, 순서 ' + orders.size + '/200가지, 노출 문구 ' + texts.size + '/' + Q.reduce((s,q)=>s+q.v.length,0));

if (failures.length) { console.error('FAIL\\n- ' + failures.join('\\n- ')); process.exit(1); }
console.log('PASS: 무작위 1000회, 중복/상한/범위/NaN, 결정성, 목표 디저트 회수(' + D.length + '개) 모두 통과');
`;

new Function(stub + js + checks)();
