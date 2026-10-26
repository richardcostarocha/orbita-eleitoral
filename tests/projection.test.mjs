import test from "node:test";
import assert from "node:assert/strict";
import {assessModelData,projectScenario} from "../lib/projection.mjs";

const time=Date.parse("2026-10-25T18:00:00-03:00");
function result(scope,turn,votes,{electorate=10000,remaining=electorate,turnout=0,abstention=0,sections=100,counted=0,finalized=false}={}) {
  return {scope,election:{turn,cycle:"ele2026",id:turn===1?"1":"2"},generation:"fixture",generated:"25/10/2026 18:00:00",totalized:"25/10/2026 18:00:00",checkedAt:time,candidates:Object.entries(votes).map(([number,votes])=>({number,name:`Candidato ${number}`,party:"TESTE",votes})),electorate,remaining,turnout,abstention,validVotes:Object.values(votes).reduce((a,b)=>a+b,0),sections,counted,finalized,blank:0,nullVotes:0,stale:false,disputed:false,elected:null};
}
function sum(results,scope) {
  const base=structuredClone(results[0]);
  base.scope=scope;
  for(const k of ["electorate","remaining","turnout","abstention","validVotes","sections","counted","blank","nullVotes"])base[k]=results.reduce((a,r)=>a+r[k],0);
  for(const candidate of base.candidates)candidate.votes=results.reduce((a,r)=>a+(r.candidates.find(c=>c.number===candidate.number)?.votes||0),0);
  return base;
}
function fixture(partial=false) {
  const baseline1=result("sp",1,{22:3200,13:2400,12:2400},{remaining:0,turnout:8000,abstention:2000,counted:100,finalized:true});
  const baseline2=result("ba",1,{22:1600,13:4000,12:2400},{remaining:0,turnout:8000,abstention:2000,counted:100,finalized:true});
  const current1=result("sp",2,partial?{22:2000,13:1200}:{22:0,13:0},partial?{remaining:6000,turnout:3200,abstention:800,counted:40}:{});
  const current2=result("ba",2,partial?{22:800,13:800}:{22:0,13:0},partial?{remaining:8000,turnout:1600,abstention:400,counted:20}:{});
  const units=[{scope:"sp",name:"São Paulo",current:current1,baseline:baseline1},{scope:"ba",name:"Bahia",current:current2,baseline:baseline2}];
  return {status:partial?"ready":"waiting",nation:sum([current1,current2],"br"),baselineNation:sum([baseline1,baseline2],"br"),units,checkedAt:time,diagnostics:{reconciled:true,missingScopes:[]}};
}
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test("zero counted votes are explicitly scenarios with a same-election official baseline",()=>{
  const data=fixture(),projection=projectScenario(data);
  assert.deepEqual(assessModelData(data).issues,[]);
  assert.equal(projection.status,"ready");assert.equal(projection.kind,"scenario");assert.equal(projection.calibrated,false);
  assert.equal(projection.simulations,4000);assert.equal(projection.candidate.number,"22");
  close(projection.expectedShare,45); // (4800 + half of 4800)/16000
  assert.equal(projection.projectedVotes.total,16000);
  assert.ok(projection.assumptions.some(a=>a.includes("hipótese editável")));
});
test("partial count is experimental and reproducible",()=>{
  const data=fixture(true),first=projectScenario(data),second=projectScenario(data);
  assert.equal(first.kind,"experimental");assert.deepEqual(first,second);
  assert.ok(first.interval95[0]<first.interval95[1]);
  assert.ok(first.diagnostics.countedWeight>0&&first.diagnostics.countedWeight<1);
});
test("candidate relabeling complements expectation, interval and probability",()=>{
  for(const method of ["regional","uniform","proportional"]) {
    const a=projectScenario(fixture(true),{method,candidateNumber:"22",transferPercent:60,nationalSwing:1});
    const b=projectScenario(fixture(true),{method,candidateNumber:"13",transferPercent:40,nationalSwing:-1});
    close(a.expectedShare+b.expectedShare,100,.01);
    close(a.winProbability+b.winProbability,100,.0001);
    close(a.interval95[0]+b.interval95[1],100,.001);
    close(a.interval95[1]+b.interval95[0],100,.001);
  }
});
test("transfers and swing improve the selected candidate monotonically",()=>{
  for(const method of ["regional","uniform","proportional"]) {
    const a=projectScenario(fixture(true),{method,transferPercent:10,nationalSwing:-2});
    const b=projectScenario(fixture(true),{method,transferPercent:50,nationalSwing:0});
    const c=projectScenario(fixture(true),{method,transferPercent:90,nationalSwing:2});
    assert.ok(a.expectedShare<b.expectedShare&&b.expectedShare<c.expectedShare);
    assert.ok(a.winProbability<=b.winProbability&&b.winProbability<=c.winProbability);
  }
});
test("valid-vote volume is bounded by remaining electors and preserves counted votes",()=>{
  for(const factor of [.85,1,1.1])for(const transferPercent of [0,50,100]) {
    const data=fixture(true),p=projectScenario(data,{turnoutFactor:factor,transferPercent});
    assert.ok(p.projectedVotes.remainingValid<=data.nation.remaining);
    assert.ok(p.projectedVotes.candidate>=data.nation.candidates.find(c=>c.number==="22").votes);
    assert.ok(p.projectedVotes.opponent>=data.nation.candidates.find(c=>c.number==="13").votes);
    assert.equal(p.projectedVotes.candidate+p.projectedVotes.opponent,p.projectedVotes.total);
    assert.ok(p.projectedVotes.total<=data.nation.validVotes+data.nation.remaining);
  }
});
test("participation above the first-round reference cannot erase pending votes or their uncertainty",()=>{
  const data=fixture(true);
  for(const unit of data.units) {
    unit.baseline=result(unit.scope,1,{22:800,13:800,12:400},{remaining:0,turnout:2000,abstention:8000,counted:100,finalized:true});
    unit.current=result(unit.scope,2,{22:4070,13:4030},{remaining:1000,turnout:8100,abstention:900,counted:90});
  }
  data.nation=sum(data.units.map(u=>u.current),"br");
  data.baselineNation=sum(data.units.map(u=>u.baseline),"br");
  assert.deepEqual(assessModelData(data).issues,[]);
  for(const method of ["regional","uniform","proportional"]) {
    const p=projectScenario(data,{method,uncertaintyPoints:5});
    assert.equal(p.status,"ready");
    assert.equal(p.projectedVotes.remainingValid,1326);
    assert.ok(p.projectedVotes.total>data.nation.validVotes);
    assert.ok(p.winProbability<99,`conditional chance should retain pending-vote uncertainty: ${p.winProbability}`);
    assert.ok(p.interval95[0]<50&&p.interval95[1]>50);
  }
});
test("finite simulation never reports 0% or 100%",()=>{
  for(const transferPercent of [0,100]) {
    const p=projectScenario(fixture(),{transferPercent,uncertaintyPoints:.5,nationalSwing:transferPercent===0?-10:10});
    assert.ok(p.winProbability>0&&p.winProbability<100);
  }
});
test("probability uses only strict wins, with explicit smoothing and ties reported separately",()=>{
  const p=projectScenario(fixture(true));
  close(p.winProbability,(p.diagnostics.winSimulations+.5)/(p.simulations+1)*100);
  close(p.tieProbability,p.diagnostics.tieSimulations/p.simulations*100);
  assert.ok(p.assumptions.some(a=>a.includes("Empates não contam como vitória")));
});
test("rounding the pending valid-vote volume to zero suspends probability even in a tied count",()=>{
  const data=fixture(true);
  for(const unit of data.units) {
    unit.baseline=result(unit.scope,1,{22:800,13:800,12:400},{remaining:0,turnout:2000,abstention:8000,counted:100,finalized:true});
    unit.current=result(unit.scope,2,{22:500,13:500},{remaining:1,turnout:1000,abstention:8999,counted:99});
  }
  data.nation=sum(data.units.map(u=>u.current),"br");
  data.baselineNation=sum(data.units.map(u=>u.baseline),"br");
  const p=projectScenario(data);
  assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);assert.equal(p.tieProbability,null);
  assert.match(p.reason,/arredondado a zero/);
});
test("an explicit live clock rejects an old snapshot even when the response timestamp is frozen",()=>{
  const data=fixture(true);
  assert.equal(projectScenario(data).status,"ready");
  assert.equal(projectScenario(data,{},time+120000).winProbability,null);
  assert.ok(assessModelData(data,time+120000).issues.length>0);
});
test("unknown model, candidate or invalid parameter never produces an estimate",()=>{
  for(const options of [{method:"magic"},{candidateNumber:"99"},{transferPercent:-1},{transferPercent:101},{turnoutFactor:.5},{turnoutFactor:1.2},{nationalSwing:11},{uncertaintyPoints:0},{uncertaintyPoints:NaN},{uncertaintyPoints:"2"}]) {
    const p=projectScenario(fixture(),options);
    assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);
  }
});
test("missing/invalid baseline, duplicate scopes and malformed totals suspend estimates",()=>{
  const variants=[data=>{data.baselineNation=null;},data=>{data.baselineNation.election.cycle="ele2022";},data=>{data.units[0].baseline.finalized=false;},data=>{data.units.push(data.units[0]);},data=>{data.nation.validVotes=1;},data=>{data.units[0].current.remaining=-1;},data=>{data.units=[];},data=>{data.diagnostics.missingScopes=["zz"];},data=>{data.nation.candidates.push({...data.nation.candidates[0],number:"12"});}];
  for(const mutate of variants) {
    const data=fixture();mutate(data);const p=projectScenario(data);
    assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);
  }
  assert.equal(projectScenario(null).status,"unavailable");
});
test("a one-vote or one-elector discrepancy prevents unreconciled projections",()=>{
  for(const alter of [data=>{data.nation.candidates[0].votes++;data.nation.validVotes++;data.nation.turnout++;data.nation.remaining--;},data=>{data.nation.electorate++;data.nation.remaining++;}]) {
    const data=fixture(true);alter(data);
    const p=projectScenario(data);assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);
    assert.equal(p.diagnostics.reconciled,false);
  }
});
test("old live data, transport failures and disputed votes suspend probability",()=>{
  for(const alter of [data=>{data.checkedAt+=180001;},data=>{data.units[0].current.stale=true;},data=>{data.nation.disputed=true;},data=>{data.units[1].baseline.disputed=true;}]) {
    const data=fixture(true);alter(data);const p=projectScenario(data);
    assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);
  }
});
test("final official results replace the model, even without state baseline",()=>{
  const data=fixture(true);data.nation.finalized=true;data.nation.remaining=0;data.nation.counted=data.nation.sections;data.nation.elected=data.nation.candidates.find(c=>c.number==="22");data.nation.elected.officialStatus="Eleito";data.units=[];data.baselineNation=null;
  const p=projectScenario(data);
  assert.equal(p.status,"official");assert.equal(p.kind,"official");assert.equal(p.winProbability,null);assert.equal(p.interval95,null);assert.equal(p.simulations,0);
  assert.equal(p.officialResult.elected.number,data.nation.elected.number);
});
test("higher uncertainty expands the conditional interval",()=>{
  const low=projectScenario(fixture(true),{uncertaintyPoints:.5});
  const high=projectScenario(fixture(true),{uncertaintyPoints:5});
  assert.ok(high.interval95[1]-high.interval95[0]>low.interval95[1]-low.interval95[0]);
});
test("zero remaining electors without official closure do not receive a probability",()=>{
  const data=fixture(true);data.nation.remaining=0;
  const p=projectScenario(data);
  assert.equal(p.status,"unavailable");assert.equal(p.winProbability,null);
  assert.match(p.reason,/encerramento oficial/);
});
test("partial territorial composition produces different regional and swing scenarios",()=>{
  const data=fixture(true);
  const estimates=["regional","uniform","proportional"].map(method=>projectScenario(data,{method}).expectedShare);
  assert.equal(new Set(estimates).size,3);
});
