/**
 * Original implementation of the geographic Monte Carlo methodology described
 * by pedrodavidcet-hub/apura-brasil-2026 (assets/projection.js).
 * Mathematical parameters follow that reference; source code is not vendored.
 * Adaptations: all presidential candidates, seeded draws, strict source checks,
 * no aggregate fallback, explicit ties and finite-sample tail limits in the UI.
 * This is not an affiliated product or a historically calibrated forecast.
 */
import {resultTrust} from "./election.mjs";

export const APURA_SCOPES = Object.freeze("ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to zz".split(" "));
export const APURA_METHOD = "apura-geographic-v1";
const cap = (x,a,b) => Math.max(a,Math.min(b,x));
const sum = values => values.reduce((a,b)=>a+b,0);
const shares = values => {const total=sum(values);return values.map(x=>x/total);};
const votesOf = (r,n) => r.candidates.find(c=>c.number===n)?.votes||0;
const accounted = r => r.electorate-r.remaining;
const progressOf = r => r?.sections>0?r.counted/r.sections*100:0;

/** Complete source reconciliation, shared by server and browser. */
export function assessApuraData(data,now=Number(data?.checkedAt)) {
  const issues=[],nation=data?.nation,units=Array.isArray(data?.units)?data.units:[];
  const trust=resultTrust(nation,now);
  if(!trust.trustworthy)issues.push(trust.reason);
  if(!nation||nation.scope!=="br"||!nation.sections||!nation.electorate)issues.push("A referência nacional está incompleta.");
  const scopes=units.map(u=>u.scope);
  if(scopes.length!==APURA_SCOPES.length||new Set(scopes).size!==scopes.length||APURA_SCOPES.some(s=>!scopes.includes(s)))
    issues.push("A projeção exige as 27 UFs e o exterior, sem abrangências duplicadas.");
  for(const unit of units){
    const r=unit.current,check=resultTrust(r,now);
    if(!check.trustworthy)issues.push(`${unit.name||unit.scope}: ${check.reason}`);
    if(!r||r.scope!==unit.scope||!r.sections||!r.electorate||r.election?.id!==nation?.election?.id||r.election?.turn!==nation?.election?.turn||r.election?.cycle!==nation?.election?.cycle)
      issues.push("As abrangências não correspondem à mesma eleição presidencial.");
    if(r?.candidates?.some(c=>!nation?.candidates?.some(n=>n.number===c.number)))issues.push("As candidaturas regionais não correspondem ao resultado nacional.");
  }
  if(!issues.length){
    for(const field of ["electorate","remaining","turnout","abstention","validVotes","sections","counted","blank","nullVotes"])
      if(sum(units.map(u=>u.current[field]))!==nation[field])issues.push(`Brasil e UFs não coincidem em ${field}. Aguarde uma coleta conciliada.`);
    for(const c of nation.candidates)
      if(sum(units.map(u=>votesOf(u.current,c.number)))!==c.votes)issues.push(`Os votos do candidato ${c.number} ainda não coincidem entre Brasil e UFs.`);
  }
  return {issues:[...new Set(issues)],reconciled:issues.length===0,units:units.length};
}

/** Stable random stream: an unchanged official reading has unchanged output. */
function generator(seed){
  let state=seed>>>0;
  const uniform=()=>{state+=0x6d2b79f5;let x=state;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return Math.max(Number.EPSILON,((x^x>>>14)>>>0)/4294967296);};
  const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
  const gamma=shape=>{
    if(shape<1)return gamma(shape+1)*uniform()**(1/shape);
    const d=shape-1/3,c=1/Math.sqrt(9*d);
    for(;;){const z=normal(),base=1+c*z;if(base<=0)continue;const v=base**3,u=uniform();if(u<1-.0331*z**4||Math.log(u)<.5*z*z+d*(1-v+Math.log(v)))return d*v;}
  };
  return {normal,dirichlet:alpha=>shares(alpha.map(a=>gamma(Math.max(.03,a))))};
}
function percentile(sorted,p){const x=(sorted.length-1)*p,lo=Math.floor(x),hi=Math.ceil(x);return sorted[lo]+(sorted[hi]-sorted[lo])*(x-lo);}

/** All shares and probabilities are percentages. No forecasts outside 5..60%. */
export function computeApura(data,{threshold=5,iterations=3000,seed=20261025}={},now=Number(data?.checkedAt)){
  const nation=data?.nation,progress=progressOf(nation);
  const empty={status:"unavailable",reason:"Aguardando uma leitura oficial consistente.",method:APURA_METHOD,calibrated:false,progress,threshold,maxProgress:60,simulations:0,results:[],runoffProbability:null,tieProbability:null,unitsUsed:0,expectedRemainingValid:null,diagnostics:{issues:[],reconciled:false,units:0}};
  if(![5,10,20].includes(threshold)||!Number.isInteger(iterations)||iterations<1000||iterations>7000||!Number.isInteger(seed))return {...empty,reason:"Parâmetros fora dos limites do modelo."};
  const trust=resultTrust(nation,now);
  if(!trust.trustworthy)return {...empty,reason:trust.reason};
  if(nation.scope!=="br"||!nation.sections||!nation.electorate)return empty;
  if(nation.finalized)return {...empty,status:"official",reason:"Totalização encerrada pelo TSE. Consulte o resultado oficial no painel."};
  if(progress>60)return {...empty,status:"closed",reason:"A apuração ultrapassou 60%. A projeção foi encerrada; acompanhe a contagem e a análise matemática."};
  if(progress<threshold||!nation.validVotes)return {...empty,status:"waiting",reason:`A projeção começa com ${threshold}% das seções totalizadas. Apuração atual: ${progress.toLocaleString("pt-BR",{maximumFractionDigits:2})}%.`};
  if(nation.remaining<=0)return {...empty,reason:"Não há eleitores pendentes para modelar. Aguarde o encerramento oficial."};
  const diagnostics=assessApuraData(data,now);
  if(diagnostics.issues.length||data?.status==="unavailable")return {...empty,diagnostics,reason:diagnostics.issues[0]||data.reason};
  const candidates=[...nation.candidates].sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
  const nationalShares=shares(candidates.map(c=>Math.max(c.votes,.001)));
  const nationalRate=accounted(nation)>0?cap(nation.validVotes/accounted(nation),.25,.95):.72;
  const units=[...data.units].sort((a,b)=>a.scope.localeCompare(b.scope)).filter(u=>u.current.remaining>0).map(u=>{
    const r=u.current,p=cap(progressOf(r)/100,0,1);
    let localWeight=cap(.9*Math.sqrt(p),0,.93);
    if(r.validVotes<400)localWeight*=cap(r.validVotes/400,0,1);
    const localShares=r.validVotes?shares(candidates.map(c=>Math.max(votesOf(r,c.number),.001))):nationalShares;
    const mean=shares(localShares.map((v,i)=>localWeight*v+(1-localWeight)*nationalShares[i]));
    const localRate=accounted(r)>0&&r.validVotes>0?cap(r.validVotes/accounted(r),.25,.95):nationalRate;
    const rateWeight=cap(p*1.25,0,.9);
    return {remaining:r.remaining,mean,concentration:18+230*p**.72,rate:rateWeight*localRate+(1-rateWeight)*nationalRate,rateSd:.015+.055*(1-p)};
  });
  if(!units.length)return {...empty,reason:"Não há abrangências pendentes para simular.",diagnostics};
  const rng=generator(seed),samples=candidates.map(()=>[]),wins=candidates.map(()=>0),firstRound=candidates.map(()=>0),qualified=candidates.map(()=>0);
  let runoff=0,ties=0;
  for(let trial=0;trial<iterations;trial++){
    const totals=candidates.map(c=>c.votes);
    for(const unit of units){
      const pending=unit.remaining*cap(unit.rate+rng.normal()*unit.rateSd,.25,.95);
      const distribution=rng.dirichlet(unit.mean.map(p=>p*unit.concentration));
      for(let i=0;i<totals.length;i++)totals[i]+=pending*distribution[i];
    }
    const total=sum(totals),order=totals.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    if(order[0].v>order[1].v)wins[order[0].i]++;else ties++;
    if(nation.election.turn===1){
      if(order[0].v/total>.5)firstRound[order[0].i]++;
      else{runoff++;qualified[order[0].i]++;qualified[order[1].i]++;}
    }
    for(let i=0;i<totals.length;i++)samples[i].push(100*totals[i]/total);
  }
  const results=candidates.map((c,i)=>{
    const sample=samples[i].sort((a,b)=>a-b);
    return {...c,expectedShare:sum(sample)/iterations,interval90:[percentile(sample,.05),percentile(sample,.95)],winCount:nation.election.turn===1?firstRound[i]:wins[i],winProbability:100*(nation.election.turn===1?firstRound[i]:wins[i])/iterations,leadProbability:100*wins[i]/iterations,qualificationProbability:nation.election.turn===1?100*qualified[i]/iterations:null};
  }).sort((a,b)=>b.expectedShare-a.expectedShare||a.number.localeCompare(b.number));
  return {...empty,status:"ready",reason:"Estimativa estatística baseada na parcial atual, sem calibração histórica.",simulations:iterations,results,runoffProbability:nation.election.turn===1?100*runoff/iterations:null,tieProbability:100*ties/iterations,unitsUsed:units.length,expectedRemainingValid:sum(units.map(u=>u.remaining*u.rate)),diagnostics};
}
