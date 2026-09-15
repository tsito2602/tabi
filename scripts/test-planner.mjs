import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';

const cache = new Map();
function load(file, extra = '') {
  file = resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = name => {
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === 'jose') return { createRemoteJWKSet: () => () => {}, jwtVerify: () => { throw new Error('not used'); } };
    // The worker's unrelated booking helpers are not invoked in these tests.
    if (name.endsWith('/flight-connections')) return {};
    if (name.endsWith('/places') && !existsSync(resolve(dirname(file), name + '.ts'))) return {};
    if (name.startsWith('.')) return load(resolve(dirname(file), name + '.ts'));
    throw new Error(`Unexpected import ${name}`);
  };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
const { itineraryTimeline } = load('src/data/itinerary-timeline.ts');
const { emptyItineraryDetails } = load('src/data/itinerary.ts');
const { parseItineraryPlacement, nextPlacementSequence, orderKeyBetween } = load('src/data/itinerary-placement.ts');
const { preparePlacement, createPlannerCommitter } = load('src/data/planner.ts');
const { parsePlanSource, edgeScrollSpeed } = load('src/utils/planner-pointer.web.ts');
const { parseItineraryDetails, itineraryDetailsStatement, createItem: serverCreate, updateItem: serverUpdate } = load('worker/index.ts', '\nexport { parseItineraryDetails, itineraryDetailsStatement, createItem, updateItem };');
const day = '2026-11-23';
const item = (id, time = '', patch = {}) => ({ id, day, time, title: id, note: '', kind: '予定', details: emptyItineraryDetails('sightseeing'), ...patch });
const place = (id = 'place') => ({ id, title: 'カフェ', note: '元のメモ', location: '地図', openingHours: '10–18', status: 'want', reservationStatus: 'not_needed', referenceLinks: [{ label: '公式', url: 'https://example.test/' }] });
const booking = (id, time, endTime, endDay = day) => ({ id, kind: 'flight', title: id, day, time, endDay, endTime, origin: '成田', originCode: 'NRT', destination: 'ドバイ', destinationCode: 'DXB', detail: '', confirmationCode: '', note: '' });
const snapshot = () => ({ selectedTrip: { id: 'trip', role: 'owner', startsOn: day, endsOn: '2026-11-25', name: '旅', destination: '', memberCount: 2 }, canEdit: true, items: [item('a', '10:00'), item('b', '15:00')], places: [place()], bookings: [] });
const slot = (beforeKey = 'item-b', afterKey = 'item-a', target = day) => ({ day: target, beforeKey, afterKey });
const placement = (options = {}) => ({ ...slot(), time: '', sequence: 1, ...options });
const order = s => itineraryTimeline(s.items, s.bookings, s.places).map(e => e.key);
function fixture() {
  const s = snapshot(), commands = []; let id = 0, failLink = false;
  const actions = {
    createItem(input) { const next = `new-${++id}`; commands.push(['create', next]); s.items = [...s.items, { id: next, ...structuredClone(input) }]; return next; },
    updateItem(id, input) { commands.push(['update', id]); s.items = s.items.map(i => i.id === id ? { ...i, ...structuredClone(input) } : i); },
    deleteItem(id) { commands.push(['delete', id]); s.items = s.items.filter(i => i.id !== id); },
    updatePlace(id, input) { if (failLink) throw new Error('link failed'); commands.push(['link', id]); s.places = s.places.map(p => p.id === id ? { ...p, ...structuredClone(input) } : p); },
  };
  return { s, actions, commands, committer: createPlannerCommitter(), setFailLink: value => { failLink = value; } };
}

test('legacy records retain chronological, endpoint and transport ordering', () => {
  const s = snapshot(); s.items.push(item('transfer', '', { details: { ...emptyItineraryDetails('transport'), transport: { mode: 'walk', origin: '', destination: '', afterKey: 'item-a' } } }));
  s.bookings = [booking('flight', '09:00', '17:00', '2026-11-24')];
  assert.deepEqual(order(s), ['booking-flight-start', 'item-a', 'item-transfer', 'item-b', 'booking-flight-end']);
  assert.deepEqual(s.items.map(i => i.id), ['a', 'b', 'transfer']);
});
test('untimed candidate stays between timed records after JSON reload, with original place retained', () => {
  const f = fixture(), original = structuredClone(f.s.places[0]);
  const prepared = preparePlacement(f.s, 'trip', { kind: 'place', id: 'place' }, slot());
  assert.equal(prepared.input.time, ''); assert.equal(prepared.conflict, '');
  const id = f.committer.save(f.s, prepared, f.actions);
  assert.deepEqual(order(f.s), ['item-a', `item-${id}`, 'item-b']);
  assert.deepEqual(order(JSON.parse(JSON.stringify(f.s))), order(f.s));
  assert.deepEqual(f.s.places[0], { ...original, itineraryItemId: id, status: 'planned' });
});
test('untimed candidate can be inserted between overnight booking endpoints', () => {
  const s = snapshot(); s.items = []; s.bookings = [booking('flight', '09:00', '12:00')];
  const p = preparePlacement(s, 'trip', { kind: 'place', id: 'place' }, slot('booking-flight-end','booking-flight-start'));
  s.items.push(item('c', '', p.input));
  assert.deepEqual(order(s), ['booking-flight-start','item-c','booking-flight-end']);
});
test('logical placements are deterministic across incoming array order and same-sequence edits', () => {
  const s = snapshot(); s.items.push(item('x','',{ details: { ...emptyItineraryDetails(), placement: placement() } }), item('y','',{ details: { ...emptyItineraryDetails(), placement: placement() } }));
  const expected = order(s); s.items.reverse(); assert.deepEqual(order(s), expected);
  assert.equal(nextPlacementSequence(s.items), 2);
});
test('cycles, missing anchors and bad metadata terminate without losing a record', () => {
  const s = snapshot(); s.items.push(item('c','',{ details:{ ...emptyItineraryDetails(), placement:placement({ beforeKey:'item-c' }) } }));
  s.items[0].details.placement = placement({ time:'10:00', beforeKey:'item-b', afterKey:null, sequence:2 });
  s.items[1].details.placement = placement({ time:'15:00', beforeKey:'item-a', afterKey:null, sequence:3 });
  assert.equal(new Set(order(s)).size, 3);
  for (const bad of [undefined,null,[],{},placement({day:'2026-02-30'}),placement({time:'25:00'}),placement({sequence:Infinity}),placement({sequence:-1}),placement({beforeKey:'<script>'}),placement({afterKey:'item-b'})]) assert.equal(parseItineraryPlacement(bad),null);
});
test('changed time, day or deleted anchors invalidate only stale placement', () => {
  const s = snapshot(); const c = item('c','',{ details: { ...emptyItineraryDetails(), placement: placement() } }); s.items.push(c);
  assert.equal(order(s)[1], 'item-c'); c.time='18:00'; assert.equal(order(s).at(-1),'item-c');
  c.time=''; c.details.placement.beforeKey='item-removed'; c.details.placement.afterKey=null; assert.equal(order(s).at(-1),'item-c');
});
test('existing timed item requests adjustment rather than changing its time silently', () => {
  const s = snapshot(); const p = preparePlacement(s,'trip',{kind:'item',id:'b'},slot('item-a',null));
  assert.equal(p.input.time,'15:00'); assert.match(p.conflict,/10:00/);
  const adjusted = preparePlacement(s,'trip',{kind:'item',id:'b'},slot('item-a',null),'09:00'); assert.equal(adjusted.conflict,'');
  const untimed = preparePlacement(s,'trip',{kind:'item',id:'b'},slot('item-a',null),''); assert.equal(untimed.conflict,'');
});
test('cross-day movement preserves duration, while explicit untiming clears both endpoints', () => {
  const s = snapshot(); s.items[0]=item('a','23:30',{details:{...emptyItineraryDetails(),endDay:'2026-11-24',endTime:'01:00'}});
  const p=preparePlacement(s,'trip',{kind:'item',id:'a'},slot(null,null,'2026-11-24'));
  assert.equal(p.input.details.endDay,'2026-11-25'); assert.equal(p.input.details.endTime,'01:00');
  const clear=preparePlacement(s,'trip',{kind:'item',id:'a'},slot(null,null,'2026-11-24'),''); assert.equal(clear.input.details.endTime,''); assert.equal(clear.input.details.endDay,'');
});
test('reservations, transfers, viewer access, wrong trip and deleted sources are not draggable', () => {
  const s=snapshot(); s.items.push(item('transfer','',{details:{...emptyItineraryDetails('transport'),transport:{mode:'walk',origin:'',destination:''}}}));
  assert.throws(()=>preparePlacement(s,'trip',{kind:'item',id:'transfer'},slot()));
  assert.throws(()=>preparePlacement(s,'other',{kind:'place',id:'place'},slot()));
  assert.throws(()=>preparePlacement({...s,canEdit:false},'trip',{kind:'place',id:'place'},slot()));
  assert.throws(()=>preparePlacement({...s,selectedTrip:{...s.selectedTrip,role:'viewer'}},'trip',{kind:'place',id:'place'},slot()));
  assert.throws(()=>preparePlacement(s,'trip',{kind:'item',id:'booking-id'},slot()));
  assert.throws(()=>preparePlacement(s,'trip',{kind:'place',id:'deleted'},slot()));
});
test('self-target and removed destination are rejected without writes', () => {
  const f=fixture(); assert.throws(()=>preparePlacement(f.s,'trip',{kind:'item',id:'a'},slot()));
  assert.throws(()=>preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot('item-deleted',null)));
  assert.throws(()=>preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot(null,null)));
  assert.deepEqual(f.commands,[]);
});
test('link failure retries the already-created item, not a duplicate', () => {
  const f=fixture(); f.setFailLink(true); const p=preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot());
  assert.throws(()=>f.committer.save(f.s,p,f.actions),/link failed/); assert(f.committer.hasPendingLink);
  f.setFailLink(false); const id=f.committer.retry(f.s,f.actions); assert.equal(id,'new-1'); assert.equal(f.commands.filter(c=>c[0]==='create').length,1);
  assert(!f.committer.hasPendingLink); assert(f.committer.canUndo);
});
test('retry stops when created item was deleted or another link appeared', () => {
  const f=fixture(); f.setFailLink(true); assert.throws(()=>f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot()),f.actions));
  f.s.items=f.s.items.filter(i=>i.id!=='new-1'); f.setFailLink(false); assert.throws(()=>f.committer.retry(f.s,f.actions),/見つかりません/);
});
test('undo movement merges only schedule fields, retaining later title and notes', () => {
  const f=fixture(); const p=preparePlacement(f.s,'trip',{kind:'item',id:'b'},slot('item-a',null),'09:00');
  f.committer.save(f.s,p,f.actions); f.s.items=f.s.items.map(i=>i.id==='b'?{...i,title:'改題',note:'別の編集'}:i);
  f.committer.undo(f.s,f.actions); const b=f.s.items.find(i=>i.id==='b'); assert.equal(b.time,'15:00'); assert.equal(b.title,'改題'); assert.equal(b.note,'別の編集'); assert.equal(b.details.placement,null);
});
test('undo refuses a moved schedule changed by another edit', () => {
  const f=fixture(); f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'item',id:'b'},slot('item-a',null),'09:00'),f.actions);
  f.s.items=f.s.items.map(i=>i.id==='b'?{...i,time:'08:00'}:i); const count=f.commands.length;
  assert.throws(()=>f.committer.undo(f.s,f.actions),/取り消せません/); assert.equal(f.commands.length,count);
});
test('undo added place retains source metadata and restores its original status', () => {
  const f=fixture(); f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot()),f.actions);
  f.s.places[0]={...f.s.places[0],note:'後から追加したメモ'};
  f.committer.undo(f.s,f.actions); assert.equal(f.s.items.length,2); assert.equal(f.s.places[0].note,'後から追加したメモ'); assert.equal(f.s.places[0].status,'want'); assert.equal(f.s.places[0].itineraryItemId,null);
});
test('undo addition never deletes a plan whose contents were edited', () => {
  const f=fixture(); f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot()),f.actions); f.s.items.at(-1).note='changed';
  assert.throws(()=>f.committer.undo(f.s,f.actions),/取り消せません/); assert.equal(f.s.items.length,3);
});
test('API parser accepts valid metadata, explicit clear and old bodies, rejecting malformed input', () => {
  const d=emptyItineraryDetails(); assert.equal(parseItineraryDetails(d,day,'').placement,undefined);
  assert.deepEqual(parseItineraryDetails({...d,placement:placement()},day,'').placement,placement());
  assert.equal(parseItineraryDetails({...d,placement:null},day,'').placement,null);
  assert.equal(parseItineraryDetails({...d,placement:placement({sequence:'1'})},day,''),null);
  assert.equal(parseItineraryDetails({...d,placement:placement({day:'2026-02-30'})},day,''),null);
});
test('actual SQLite statement preserves placement for old clients, supports clear and isolates trips', () => {
  let sql; const env={DB:{prepare(value){sql=value;return {bind(){return null;}};}}};
  itineraryDetailsStatement(env,'i','t',{});
  // node:sqlite is used in the project Node 24 check; Node 22.16 may lack it.
  // This is a real SQLite engine, not a mock that copies the expected result.
  const script=`import {DatabaseSync} from 'node:sqlite';\nconst db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE itinerary_items(id TEXT PRIMARY KEY,trip_id TEXT); CREATE TABLE itinerary_details(item_id TEXT PRIMARY KEY,details TEXT); INSERT INTO itinerary_items VALUES('i','t')");
  const q=db.prepare(${JSON.stringify(sql)}), r=()=>JSON.parse(db.prepare('SELECT details FROM itinerary_details WHERE item_id=?').get('i').details);
  q.run('i',JSON.stringify({category:'other',placement:{sequence:1}}),'i','t');
  q.run('i',JSON.stringify({category:'meal'}),'i','t'); if(r().placement.sequence!==1||r().category!=='meal')throw Error('old client cleared position');
  q.run('i',null,'i','t'); if(r().placement.sequence!==1)throw Error('omitted details');
  q.run('i',JSON.stringify({category:'other',placement:{sequence:9}}),'i','other'); if(r().placement.sequence!==1)throw Error('wrong trip write');
  q.run('i',JSON.stringify({category:'other',placement:null}),'i','t'); if(r().placement!==null)throw Error('clear failed');
  console.log('SQLite placement compatibility PASS');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/PASS/);
});
test('item API retains the existing authorization and batch write behavior', async () => {
  for (const route of [serverCreate,serverUpdate]) {
    let writes=0;
    const env={DB:{prepare(){return {bind(){return this;},async first(){return null;}}},batch(){writes++;throw Error('must not write');}}};
    const response=await route(new Request('https://example.test/v1/trips/t/items',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})}),env,{id:'outsider'},'t','i');
    assert.equal(response.status,403); assert.equal(writes,0);
  }
});
test('pointer sources reject foreign data and edge scroll speed is bounded', () => {
  assert.equal(parsePlanSource('not json'),null); assert.equal(parsePlanSource('{"kind":"booking","id":"a"}'),null);
  assert.deepEqual(parsePlanSource('{"kind":"item","id":"a"}'),{kind:'item',id:'a'});
  assert.equal(edgeScrollSpeed(200,0,400),0); assert.equal(edgeScrollSpeed(-1,0,400),0);
  assert(edgeScrollSpeed(1,0,400)<0); assert(edgeScrollSpeed(399,0,400)>0);
  for(let x=0;x<500;x++)assert(Math.abs(edgeScrollSpeed(x,10,410))<=12);
});


test('repeated moves keep every untouched card in place after reload', () => {
  const f = fixture(); f.s.items = ['a','b','c'].map(id => item(id));
  for (const [id, before, after, expected] of [
    ['b','item-a',null,['b','a','c']],
    ['c','item-b',null,['c','b','a']],
    ['b',null,'item-a',['c','a','b']],
    ['a','item-c',null,['a','c','b']],
  ]) {
    const prepared = preparePlacement(f.s,'trip',{kind:'item',id},slot(before,after));
    f.committer.save(f.s,prepared,f.actions);
    assert.deepEqual(order(f.s),expected.map(id=>'item-'+id));
    assert.deepEqual(order(JSON.parse(JSON.stringify(f.s))),order(f.s));
  }
});
test('fractional insertion retains list order through 200 deterministic moves', () => {
  const f=fixture(); f.s.items=['a','b','c','d','e','f'].map(id=>item(id)); let expected=f.s.items.map(i=>i.id);
  for(let n=0;n<200;n++){
    const from=(n*7+2)%expected.length, id=expected[from];
    const rest=expected.filter(x=>x!==id), to=(n*11+3)%(rest.length+1);
    const target=slot(rest[to]?'item-'+rest[to]:null,to?'item-'+rest[to-1]:null);
    f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'item',id},target),f.actions);
    expected=[...rest.slice(0,to),id,...rest.slice(to)];
    assert.deepEqual(order(f.s),expected.map(id=>'item-'+id),`move ${n}`);
  }
  let lower=null, upper='1V'; for(let n=0;n<100;n++){const key=orderKeyBetween(lower,upper);assert(key<upper);if(lower)assert(key>lower);upper=key;}
  assert.throws(()=>orderKeyBetween('V','V'));
});


test('candidate follows an attached transfer instead of splitting its anchor', () => {
  const f=fixture(); f.s.items.push(item('walk','',{details:{...emptyItineraryDetails('transport'),transport:{mode:'walk',origin:'',destination:'',afterKey:'item-a'}}}));
  assert.throws(()=>preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot('item-walk','item-a')));
  const prepared=preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot('item-b','item-walk'));
  const id=f.committer.save(f.s,prepared,f.actions);
  assert.deepEqual(order(f.s),['item-a','item-walk',`item-${id}`,'item-b']);
});
test('new placements use fallback keys after old anchors have been deleted', () => {
  const f=fixture();const p=preparePlacement(f.s,'trip',{kind:'place',id:'place'},slot());
  const id=f.committer.save(f.s,p,f.actions);f.s.items=f.s.items.filter(i=>i.id===id);f.s.items.push(item('z','16:00'));f.s.places.push(place('second'));
  const added=f.committer.save(f.s,preparePlacement(f.s,'trip',{kind:'place',id:'second'},slot(`item-${id}`,'item-z')),f.actions);
  assert.deepEqual(order(f.s),['item-z',`item-${added}`,`item-${id}`]);
});
