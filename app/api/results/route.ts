import {elections,getResult,getHistory} from "@/lib/tse";
import {analyzeElection,resultTrust} from "@/lib/election.mjs";
export async function GET(request:Request){
  try{
    const choices=await elections(),turn=new URL(request.url).searchParams.get("turn")||"2";
    if(!["1","2"].includes(turn))return Response.json({error:"Turno inválido."},{status:400});
    const election=choices.find(e=>e.turn===Number(turn));
    if(!election)return Response.json({error:"O TSE ainda não disponibilizou este turno."},{status:404});
    const result=await getResult(election),history=await getHistory(election.id);
    const trust=resultTrust(result);
    const analysis=analyzeElection({candidates:result.candidates,validVotes:result.validVotes,remaining:result.remaining,turn:election.turn,trustworthy:trust.trustworthy});
    return Response.json({result,analysis,choices,history},{headers:{"Cache-Control":"no-store"}});
  }catch(e){console.error("results",String(e));return Response.json({error:"Não foi possível consultar os dados oficiais do TSE. Tente novamente em instantes."},{status:503});}
}
