import {elections,getResult,STATES} from "@/lib/tse";
import {assessModelData} from "@/lib/projection.mjs";
import {resultTrust} from "@/lib/election.mjs";

export async function GET(request:Request) {
  const headers={"Cache-Control":"no-store"};
  const turn=new URL(request.url).searchParams.get("turn")||"2";
  const empty={status:"unavailable",reason:"",kind:null,nation:null,baselineNation:null,units:[],generation:"",checkedAt:Date.now(),diagnostics:{missingScopes:Object.keys(STATES),issues:[],reconciled:false,stale:false,disputed:false}};
  if(turn!=="2")return Response.json({...empty,reason:"Este laboratório compara os dois finalistas do 2º turno. Para o 1º turno, acompanhe a contagem oficial e o limite matemático."},{headers,status:turn==="1"?200:400});
  try {
    const choices=await elections(),currentElection=choices.find(e=>e.turn===2),baselineElection=choices.find(e=>e.turn===1);
    if(!currentElection)return Response.json({...empty,reason:"O TSE ainda não disponibilizou o segundo turno presidencial de 2026."},{headers});
    const nation=await getResult(currentElection),checkedAt=Date.now(),trust=resultTrust(nation,checkedAt);
    if(!trust.trustworthy)return Response.json({...empty,nation,checkedAt,reason:trust.reason,diagnostics:{...empty.diagnostics,issues:[trust.reason],stale:!!nation.stale||trust.aged,disputed:!!nation.disputed}},{headers});
    // An official final national result needs no first-round model baseline or
    // state collection. Reconciliation below is exclusively a scenario gate.
    if(nation.finalized)return Response.json({...empty,status:"ready",kind:"official",nation,checkedAt,generation:String(nation.generation),reason:"Apuração encerrada pelo TSE. A projeção foi substituída pelo resultado oficial.",diagnostics:{...empty.diagnostics,missingScopes:[],officialOnly:true}},{headers});
    if(!baselineElection)return Response.json({...empty,nation,reason:"O TSE ainda não disponibilizou o primeiro turno presidencial de 2026 necessário à referência do cenário."},{headers});
    const baseline=await Promise.allSettled([getResult(baselineElection)]);
    const baselineNation=baseline[0].status==="fulfilled"?baseline[0].value:null;
    if(!baselineNation)return Response.json({...empty,nation,reason:"A referência nacional oficial do primeiro turno está indisponível. Aguarde a próxima consulta."},{headers});
    // At most four simultaneous source reads, including baseline reads.
    const jobs=Object.keys(STATES).flatMap(scope=>[{scope,kind:"current" as const,election:currentElection},{scope,kind:"baseline" as const,election:baselineElection}]);
    const collected:Record<string,{current?:any;baseline?:any}>={};
    const missing=new Set<string>();
    for(let offset=0;offset<jobs.length;offset+=4) {
      const batch=jobs.slice(offset,offset+4);
      const results=await Promise.allSettled(batch.map(job=>getResult(job.election,job.scope)));
      results.forEach((result,index)=>{
        const job=batch[index];
        if(result.status==="fulfilled") {collected[job.scope]??={};collected[job.scope][job.kind]=result.value;}
        else missing.add(job.scope);
      });
    }
    const units=Object.entries(STATES).filter(([scope])=>collected[scope]?.current&&collected[scope]?.baseline).map(([scope,name])=>({scope,name,current:collected[scope].current,baseline:collected[scope].baseline}));
    const data={nation,baselineNation,units,checkedAt:Date.now()};
    const diagnostics={...assessModelData(data),missingScopes:[...missing]};
    if(missing.size) {diagnostics.reconciled=false;diagnostics.issues.unshift("Não foi possível consultar todas as UFs e o exterior. O cenário fica suspenso até a coleta completar.");}
    const status=diagnostics.issues.length?"unavailable":nation.validVotes===0?"waiting":"ready";
    const kind=nation.finalized?"official":nation.validVotes===0?"scenario":"experimental";
    const reason=diagnostics.issues[0]||(nation.finalized?"Apuração encerrada: consulte o resultado oficial do TSE.":status==="waiting"?"Aguardando a contagem do 2º turno. Os modelos disponíveis são cenários de hipóteses.":"Dados conciliados entre Brasil, UFs e exterior. Modelo condicional sem calibração histórica.");
    return Response.json({...data,status,reason,kind,generation:`${nation.generation}:${baselineNation.generation}:${units.map(u=>`${u.scope}-${u.current.generation}-${u.baseline.generation}`).join("|")}`,diagnostics},{headers});
  } catch(error) {
    console.error("model_data",String(error));
    return Response.json({...empty,reason:"A consulta aos arquivos oficiais do TSE falhou. Nenhuma estimativa foi gerada."},{headers,status:503});
  }
}
