import {elections,getResult,STATES} from "@/lib/tse";
import {assessApuraData} from "@/lib/apura-model.mjs";
import {resultTrust} from "@/lib/election.mjs";

export async function GET(request:Request){
  const headers={"Cache-Control":"no-store"},turn=Number(new URL(request.url).searchParams.get("turn")||"2");
  const empty={nation:null,units:[],checkedAt:Date.now(),status:"unavailable",reason:"",generation:""};
  if(![1,2].includes(turn))return Response.json({...empty,reason:"Turno inválido."},{headers,status:400});
  try{
    const election=(await elections()).find(e=>e.turn===turn);
    if(!election)return Response.json({...empty,reason:"O TSE ainda não disponibilizou este turno."},{headers});
    const nation=await getResult(election),checkedAt=Date.now(),trust=resultTrust(nation,checkedAt);
    const base={...empty,nation,checkedAt,generation:nation.generation};
    if(!trust.trustworthy)return Response.json({...base,reason:trust.reason},{headers});
    // The source model only runs during an early-count window. No invented
    // preview data or regional collection is needed before/after that window.
    if(nation.finalized||nation.percent>60||nation.percent<5||!nation.validVotes)
      return Response.json({...base,status:"ready",reason:"Leitura nacional recebida; a janela do modelo é de 5% a 60%."},{headers});
    const scopes=Object.keys(STATES),units: {scope:string;name:string;current:Awaited<ReturnType<typeof getResult>>}[]=[];
    for(let i=0;i<scopes.length;i+=4){
      const batch=await Promise.allSettled(scopes.slice(i,i+4).map(async scope=>({scope,name:STATES[scope],current:await getResult(election,scope)})));
      for(const r of batch)if(r.status==="fulfilled")units.push(r.value);
    }
    const data={...base,units,checkedAt:Date.now()},diagnostics=assessApuraData(data);
    return Response.json({...data,status:diagnostics.reconciled?"ready":"unavailable",reason:diagnostics.issues[0]||"Brasil, UFs e exterior conciliados.",diagnostics},{headers});
  }catch(error){console.error("prediction",String(error));return Response.json({...empty,reason:"Não foi possível atualizar os dados oficiais. A projeção está suspensa."},{headers,status:503});}
}
