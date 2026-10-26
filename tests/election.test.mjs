import test from "node:test";
import assert from "node:assert/strict";
import {analyzeElection,normalizeResult,parseSourceTime,resultTrust} from "../lib/election.mjs";
const cs=(a,b,c)=>[{number:"22",name:"A",votes:a},{number:"13",name:"B",votes:b},...(c===undefined?[]:[{number:"1",name:"C",votes:c}])];
const run=(a,b,r,turn=2,c)=>analyzeElection({candidates:cs(a,b,c),validVotes:a+b+(c||0),remaining:r,turn});
test("second round only calls a strict insurmountable margin",()=>{assert.equal(run(50,30,15).status,"irreversible");assert.equal(run(50,30,20).status,"open");assert.equal(run(50,40,15).status,"open");});
test("first round includes ALL opposition",()=>{assert.equal(run(50,30,15,1,10).status,"open");assert.equal(run(60,25,10,1,5).status,"irreversible");});
test("zero, ties, malformed or stale inputs cannot trigger a call",()=>{assert.equal(run(0,0,100).status,"waiting");assert.equal(run(10,10,0).status,"finished");assert.equal(run(-1,10,5).status,"unavailable");assert.equal(run(1.5,10,5).status,"unavailable");assert.equal(analyzeElection({candidates:cs(50,20),validVotes:70,remaining:1,trustworthy:false}).status,"unavailable");});
test("threshold includes votes still going to the leader and the vote needed to pass",()=>{assert.equal(run(45,42,25).votesToPass,15);assert.equal(run(45,42,25).shareToPass,60);assert.ok(run(50,30,15).shareToPass>100);});
test("exhaustive allocations verify the exact minimum needed for a comeback",()=>{for(let a=1;a<25;a++)for(let b=0;b<=a;b++)for(let r=1;r<25;r++){const x=run(a,b,r);const need=x.votesToPass;if(need<=r)assert.ok(b+need>a+r-need);if(need>0&&need-1<=r)assert.ok(b+need-1<=a+r-(need-1));}});
test("no possible first-round absolute majority implies runoff",()=>{assert.equal(run(40,35,2,1,25).status,"second-round");});
test("exhaustive small second-round counts: every claimed win survives every allocation",()=>{for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let r=0;r<8;r++){const x=run(a,b,r);if(x.status==="irreversible")for(let v=0;v<=r;v++)assert.ok(x.leader.votes+v>x.runner.votes+r-v);}});
test("exhaustive first-round guarantee survives all remaining votes going to opposition",()=>{for(let a=0;a<12;a++)for(let b=0;b<8;b++)for(let c=0;c<8;c++)for(let r=0;r<5;r++){const x=run(a,b,r,1,c);if(x.status==="irreversible")assert.ok(x.leader.votes>x.opposition+r);}});
const raw={f:"o",ele:"6257",t:"1",cdabr:"br",idg:"1",dg:"04/10/2026",hg:"20:00:00",dt:"04/10/2026",ht:"20:00:00",tf:"s",and:"f",carg:[{cd:"1",agr:[{par:[{sg:"A",cand:[{n:"22",nmu:"A",sqcand:"123",vap:"50",dvt:"Válido",st:"2º turno",e:"s"},{n:"13",nmu:"B",sqcand:"124",vap:"40",dvt:"Válido",st:"2º turno",e:"s"}]}]}]}],e:{te:"120",c:"95",a:"20",esni:"5"},s:{ts:"10",st:"10"},v:{vv:"90",vb:"2",tvn:"3"}};
const election={id:"6257",turn:1,cycle:"ele2026"},NOW=parseSourceTime("04/10/2026 20:00:30");
const norm=(r=raw,at=NOW)=>normalizeResult(r,election,"br",at);
test("runoff qualification flag never means elected",()=>{const x=norm();assert.equal(x.elected,null);assert.equal(x.remaining,0);});
test("officially uninstalled sections are excluded from remaining possible votes",()=>{assert.equal(norm().remaining,0);assert.equal(norm({...raw,e:{...raw.e,esni:"0"}}).remaining,5);});
test("official winner requires explicit status and finalization",()=>{const f=structuredClone(raw);f.carg[0].agr[0].par[0].cand[0].st="Eleito";assert.ok(norm(f).elected);f.tf="n";f.and="p";assert.equal(norm(f).elected,null);});
test("wrong election, simulated source and inconsistent totals rejected",()=>{assert.throws(()=>normalizeResult({...raw,f:"s"},{id:"6257",turn:1}));assert.throws(()=>normalizeResult({...raw,e:{te:"10",c:"11",a:"0"}},{id:"6257",turn:1}));assert.throws(()=>normalizeResult(raw,{id:"6258",turn:2}));});

test("TSE dates are parsed strictly in Brasília, including leap years",()=>{
  assert.equal(parseSourceTime("04/10/2026 20:00:00"),Date.UTC(2026,9,4,23));
  assert.notEqual(parseSourceTime("29/02/2024 00:00:00"),null);
  for(const s of [null,"31/02/2026 20:00:00","29/02/2026 00:00:00","04/13/2026 20:00:00","04/10/2026 24:00:00","04/10/2026 20:60:00","prefix 04/10/2026 20:00:00"])
    assert.equal(parseSourceTime(s),null);
});

test("inconsistent candidate totals are rejected before reading an elected flag",()=>{
  const r=structuredClone(raw);r.carg[0].agr[0].par[0].cand[0].st="Eleito";r.v.vv="89";
  assert.throws(()=>norm(r),/conciliados/);
  const duplicate=structuredClone(raw);duplicate.carg[0].agr[0].par[0].cand[1].n="22";
  assert.throws(()=>norm(duplicate),/duplicadas/);
  const duplicateId=structuredClone(raw);duplicateId.carg[0].agr[0].par[0].cand[1].sqcand="123";
  assert.throws(()=>norm(duplicateId),/duplicadas/);
});

test("valid, blank and null votes cannot exceed turnout",()=>{
  assert.throws(()=>norm({...raw,e:{...raw.e,c:"89"}}),/conciliados/);
  assert.throws(()=>norm({...raw,v:{...raw.v,vb:"10"}}),/conciliados/);
  assert.throws(()=>norm({...raw,v:{...raw.v,tv:"96"}}),/comparecimento/);
});

test("future timestamps allow at most two minutes of clock skew",()=>{
  assert.doesNotThrow(()=>norm({...raw,hg:"20:02:30"}));
  assert.throws(()=>norm({...raw,hg:"20:02:31"}),/futuros/);
  assert.throws(()=>norm({...raw,ht:"20:02:31"}),/futuros/);
  assert.throws(()=>norm({...raw,dg:"31/02/2026"}),/Horários/);
});

test("contradictory finalization is rejected and unreconciled finals cannot announce a winner",()=>{
  assert.throws(()=>norm({...raw,tf:"n"}),/Finalização/);
  assert.throws(()=>norm({...raw,and:"p"}),/Finalização/);
  assert.throws(()=>norm({...raw,s:{ts:"10",st:"9"}}),/Finalização/);
  const r=structuredClone(raw);r.e.esni="0";r.carg[0].agr[0].par[0].cand[0].st="Eleito";
  const result=norm(r),trust=resultTrust(result,NOW);
  assert.equal(result.remaining,5);assert.equal(result.elected,null);assert.equal(trust.trustworthy,false);
  assert.equal(analyzeElection({...result,turn:1,trustworthy:trust.trustworthy}).status,"unavailable");
});

test("an elected national candidate must hold a strict valid-vote majority",()=>{
  const r=structuredClone(raw);r.carg[0].agr[0].par[0].cand[1].st="Eleito";
  assert.throws(()=>norm(r),/incompatível/);
  r.carg[0].agr[0].par[0].cand[0].st="Eleito";
  assert.throws(()=>norm(r),/incompatível/);
});

test("result trust suspends stale reads, disputed votes and old partials",()=>{
  const valid=norm();assert.deepEqual(resultTrust(valid,NOW),{trustworthy:true,reason:null,aged:false});
  assert.equal(resultTrust({...valid,stale:true},NOW).trustworthy,false);
  assert.equal(resultTrust({...valid,disputed:true},NOW).trustworthy,false);
  assert.equal(resultTrust({...valid,checkedAt:NOW-120000},NOW).trustworthy,false);
  const partial={...valid,finalized:false,checkedAt:NOW+180001};
  assert.equal(resultTrust(partial,NOW+180001).aged,true);
  assert.equal(resultTrust({...valid,checkedAt:NOW+180001},NOW+180001).trustworthy,true,"historical finals remain usable when freshly checked");
  assert.equal(resultTrust({...valid,generated:"04/10/2026 20:02:31"},NOW).trustworthy,false);
});

test("pre-count files with zero turnout need no totalization timestamp",()=>{
  const r=structuredClone(raw);r.tf="n";r.and="n";r.dt="";r.ht="";
  r.e={te:"120",c:"0",a:"0",esni:"0"};r.s={ts:"10",st:"0"};r.v={vv:"0",vb:"0",tvn:"0"};
  for(const c of r.carg[0].agr[0].par[0].cand)c.vap="0";
  const result=norm(r);assert.equal(result.remaining,120);assert.equal(resultTrust(result,NOW).trustworthy,true);
  assert.equal(analyzeElection({...result,turn:1}).status,"waiting");
});

test("a legacy cached elected flag cannot bypass current vote reconciliation",()=>{
  const result=norm(),runner=result.candidates[1];
  assert.equal(resultTrust({...result,elected:{...runner,officialStatus:"Eleito"}},NOW).trustworthy,false);
  const tampered=structuredClone(result);tampered.candidates[1].votes--;
  assert.equal(resultTrust(tampered,NOW).trustworthy,false);
  assert.equal(resultTrust({...result,remaining:5},NOW).trustworthy,false);
});
