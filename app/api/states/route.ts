import {elections,getResult,STATES} from "@/lib/tse";
export async function GET(request:Request){
  try{
    const turn=Number(new URL(request.url).searchParams.get("turn")||"2");
    if(![1,2].includes(turn))return Response.json({error:"Turno inválido."},{status:400});
    const election=(await elections()).find(e=>e.turn===turn);
    if(!election)return Response.json({error:"Turno indisponível."},{status:404});
    const keys=Object.keys(STATES),rows:any[]=[];
    for(let i=0;i<keys.length;i+=4){
      rows.push(...await Promise.all(keys.slice(i,i+4).map(async scope=>{
        try{const r=await getResult(election,scope);return {scope,name:STATES[scope],percent:r.percent,sections:r.sections,counted:r.counted,candidates:r.candidates,validVotes:r.validVotes,remaining:r.remaining,stale:r.stale,totalized:r.totalized,checkedAt:r.checkedAt};}
        catch{return {scope,name:STATES[scope],unavailable:true};}
      })));
    }
    return Response.json({states:rows},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Dados por estado temporariamente indisponíveis."},{status:503});}
}

