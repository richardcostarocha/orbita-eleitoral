import test from "node:test";
import assert from "node:assert/strict";
import {APURA_SCOPES,APURA_METHOD,assessApuraData,computeApura} from "../lib/apura-model.mjs";

const clock=Date.parse("2026-10-25T18:00:00-03:00");
const fields=["electorate","remaining","turnout","abstention","validVotes","sections","counted","blank","nullVotes"];
function reconcile(data){
  const national=structuredClone(data.units[0].current);national.scope="br";
  for(const f of fields)national[f]=data.units.reduce((s,u)=>s+u.current[f],0);
  for(const c of national.candidates)c.votes=data.units.reduce((s,u)=>s+(u.current.candidates.find(x=>x.number===c.number)?.votes||0),0);
  national.percent=national.counted/national.sections*100;data.nation=national;return data;
}
function fixture(progress=10,{candidateCount=2}={}){
  const numbers=["13","22",...Array.from({length:Math.max(0,candidateCount-2)},(_,i)=>String(30+i))];
  const units=APURA_SCOPES.map((scope,index)=>{
    const turnout=progress*80,validVotes=turnout;
    const extra=candidateCount>2?Math.floor(validVotes*.1):0;
    const first=Math.floor((validVotes-extra)*(index%2?.6:.5));
    const votes=[first,validVotes-extra-first,...numbers.slice(2).map((_,i)=>Math.floor(extra/(candidateCount-2))+(i<extra%(candidateCount-2)?1:0))];
    return {scope,name:scope.toUpperCase(),current:{scope,election:{id:"test",cycle:"ele2026",turn:candidateCount>2?1:2},generation:"test",generated:"25/10/2026 18:00:00",totalized:progress?"25/10/2026 18:00:00":null,checkedAt:clock,stale:false,disputed:false,finalized:progress===100,elected:null,electorate:10000,remaining:10000-progress*100,turnout,abstention:progress*20,validVotes,sections:100,counted:progress,blank:0,nullVotes:0,candidates:numbers.map((number,i)=>({number,name:`Candidato ${number}`,party:"TEST",votes:votes[i]}))}};
  });
  return reconcile({units,checkedAt:clock,status:"ready"});
}
const opts={iterations:1000};

test("default Apura configuration is 3000 simulations and the geographic method",()=>{
  const data=fixture(),p=computeApura(data);
  assert.equal(p.status,"ready");assert.equal(p.method,APURA_METHOD);assert.equal(p.simulations,3000);assert.equal(p.threshold,5);assert.equal(p.calibrated,false);
  assert.equal(p.unitsUsed,28);assert.equal(p.diagnostics.reconciled,true);
});
test("the exact 5 to 60 percent window is enforced with configurable start",()=>{
  assert.equal(computeApura(fixture(4)).status,"waiting");
  assert.equal(computeApura(fixture(5),opts).status,"ready");
  assert.equal(computeApura(fixture(9),{...opts,threshold:10}).status,"waiting");
  assert.equal(computeApura(fixture(19),{...opts,threshold:20}).status,"waiting");
  assert.equal(computeApura(fixture(60),opts).status,"ready");
  assert.equal(computeApura(fixture(61)).status,"closed");
});
test("before the gate and after official closure no regional fallback or forecast is used",()=>{
  for(const progress of [0,3,61,100]){const d=fixture(progress);d.units=[];const p=computeApura(d);assert.notEqual(p.status,"ready");assert.equal(p.simulations,0);assert.deepEqual(p.results,[]);}
  const d=fixture(100);d.units=[];assert.equal(computeApura(d).status,"official");
});
test("same data produces same estimates and candidate order does not change outcomes",()=>{
  const d=fixture(),a=computeApura(d,opts);assert.deepEqual(a,computeApura(d,opts));
  d.nation.candidates.reverse();for(const u of d.units)u.current.candidates.reverse();d.units.reverse();
  assert.deepEqual(a,computeApura(d,opts));
});
test("simulation means sum to 100 and pending votes stay within the official ceiling",()=>{
  for(const candidateCount of [2,3,12]){
    const d=fixture(10,{candidateCount}),p=computeApura(d,opts);
    assert.equal(p.status,"ready");assert.equal(p.results.length,candidateCount);
    assert.ok(Math.abs(p.results.reduce((s,r)=>s+r.expectedShare,0)-100)<1e-8);
    assert.ok(p.expectedRemainingValid>0&&p.expectedRemainingValid<=d.nation.remaining);
    for(const r of p.results){assert.ok(r.interval90[0]>=0&&r.interval90[1]<=100);assert.ok(r.interval90[0]<=r.interval90[1]);assert.ok(r.winProbability>=0&&r.winProbability<=100);}
  }
});
test("all first-round candidates including the small ones remain in the valid vote denominator",()=>{
  const d=fixture(20,{candidateCount:12}),p=computeApura(d,opts);
  assert.equal(p.results.length,12);assert.ok(p.runoffProbability>0);
  assert.ok(p.results.filter(r=>!['13','22'].includes(r.number)).reduce((s,r)=>s+r.expectedShare,0)>5);
  assert.ok(Math.abs(p.results.reduce((s,r)=>s+r.qualificationProbability,0)-2*p.runoffProbability)<1e-8);
});
test("first-round majority and runoff are complementary events, not leader probabilities",()=>{
  const d=fixture(30,{candidateCount:3}),p=computeApura(d,opts);
  assert.ok(Math.abs(p.runoffProbability+p.results.reduce((s,r)=>s+r.winProbability,0)-100)<1e-8);
  assert.ok(Math.abs(p.results.reduce((s,r)=>s+r.qualificationProbability,0)-2*p.runoffProbability)<1e-8);
  assert.ok(p.results.some(r=>r.leadProbability>r.winProbability));
});
test("second-round strict wins plus ties exhaust simulations",()=>{
  const p=computeApura(fixture(),opts);
  assert.ok(Math.abs(p.results.reduce((s,r)=>s+r.winProbability,0)+p.tieProbability-100)<1e-8);
  assert.equal(p.runoffProbability,null);
  for(const r of p.results)assert.equal(r.winProbability,r.winCount/p.simulations*100);
});
test("missing exterior, duplicate scopes and mismatched elections suspend output",()=>{
  const a=fixture();a.units.pop();assert.equal(computeApura(a,opts).status,"unavailable");
  const b=fixture();b.units[0]=structuredClone(b.units[1]);assert.equal(computeApura(b,opts).status,"unavailable");
  const c=fixture();c.units[0].current.election.id="different";assert.equal(computeApura(c,opts).status,"unavailable");
});
test("even a one-vote mismatch blocks the probability instead of extrapolating Brazil",()=>{
  const d=fixture();d.units[0].current.candidates[0].votes++;d.units[0].current.candidates[1].votes--;
  assert.equal(assessApuraData(d).reconciled,false);assert.equal(computeApura(d,opts).status,"unavailable");
});
test("stale disputed future or old-origin data never generates a probability",()=>{
  const a=fixture();a.nation.stale=true;
  const b=fixture();b.units[0].current.disputed=true;
  const c=fixture();c.nation.generated="25/10/2026 19:00:00";
  const d=fixture();for(const u of d.units)u.current.totalized="25/10/2026 17:55:00";reconcile(d);
  for(const data of [a,b,c,d]){const p=computeApura(data,opts);assert.equal(p.status,"unavailable");assert.equal(p.simulations,0);}
  const e=fixture();assert.equal(computeApura(e,opts,clock+120001).status,"unavailable");
});
test("UFs with no observed votes borrow the national mix rather than fabricate local preferences",()=>{
  const d=fixture(20);const r=d.units[0].current;
  Object.assign(r,{turnout:0,abstention:0,validVotes:0,counted:0,remaining:10000});for(const c of r.candidates)c.votes=0;reconcile(d);
  const p=computeApura(d,opts);assert.equal(p.status,"ready");assert.equal(p.unitsUsed,28);assert.ok(p.results.every(r=>Number.isFinite(r.expectedShare)));
});
test("parameters outside the public operating range cannot run",()=>{
  for(const option of [{threshold:1},{threshold:NaN},{iterations:999},{iterations:7001},{iterations:1500.2},{seed:Infinity}])assert.equal(computeApura(fixture(),option).status,"unavailable");
});

