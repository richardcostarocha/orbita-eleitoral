/** Regional progress is weighted by sections, never an average of UF percentages. */
export const ELECTORAL_REGIONS=Object.freeze([
  {id:"norte",name:"Norte",scopes:["ac","ap","am","pa","ro","rr","to"]},
  {id:"nordeste",name:"Nordeste",scopes:["al","ba","ce","ma","pb","pe","pi","rn","se"]},
  {id:"centro-oeste",name:"Centro-Oeste",scopes:["df","go","mt","ms"]},
  {id:"sudeste",name:"Sudeste",scopes:["es","mg","rj","sp"]},
  {id:"sul",name:"Sul",scopes:["pr","rs","sc"]},
  {id:"exterior",name:"Exterior",scopes:["zz"]},
]);
export function summarizeRegions(rows,now=Date.now()){
  const source=Array.isArray(rows)?rows:[];
  return ELECTORAL_REGIONS.map(region=>{
    const available=region.scopes.map(scope=>source.filter(r=>r.scope===scope)).filter(found=>found.length===1).map(found=>found[0]);
    const valid=available.filter(r=>!r.unavailable&&[r.sections,r.counted,r.validVotes].every(n=>Number.isSafeInteger(n)&&n>=0)&&r.sections>0&&r.counted<=r.sections&&Array.isArray(r.candidates)&&r.candidates.length>=2&&r.candidates.every(c=>c&&typeof c.number==="string"&&Number.isSafeInteger(c.votes)&&c.votes>=0)&&new Set(r.candidates.map(c=>c.number)).size===r.candidates.length&&r.candidates.reduce((s,c)=>s+c.votes,0)===r.validVotes);
    const complete=valid.length===region.scopes.length;
    const sections=valid.reduce((n,r)=>n+r.sections,0),counted=valid.reduce((n,r)=>n+r.counted,0),validVotes=valid.reduce((n,r)=>n+r.validVotes,0);
    const merged=new Map();
    for(const row of valid)for(const c of row.candidates){const previous=merged.get(c.number);merged.set(c.number,{...c,votes:(previous?.votes||0)+c.votes});}
    const candidates=[...merged.values()].sort((a,b)=>b.votes-a.votes||a.number.localeCompare(b.number));
    const leader=complete&&validVotes>0&&candidates[0]?.votes>candidates[1]?.votes?candidates[0]:null;
    return {...region,complete,received:valid.length,sections,counted,validVotes,percent:complete?counted/sections*100:null,candidates:complete?candidates:[],leader,leaderShare:leader?leader.votes/validVotes*100:null,stale:valid.some(r=>r.stale||!Number.isFinite(r.checkedAt)||now-r.checkedAt>=120000||r.checkedAt>now+120000),missingScopes:region.scopes.filter(s=>!valid.some(r=>r.scope===s))};
  });
}
