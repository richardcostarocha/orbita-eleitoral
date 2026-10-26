import { database as DB } from "./database";
import { normalizeResult } from "./election.mjs";
const BASE="https://resultados.tse.jus.br/oficial";
export const STATES:Record<string,string>={ac:"Acre",al:"Alagoas",ap:"Amapá",am:"Amazonas",ba:"Bahia",ce:"Ceará",df:"Distrito Federal",es:"Espírito Santo",go:"Goiás",ma:"Maranhão",mt:"Mato Grosso",ms:"Mato Grosso do Sul",mg:"Minas Gerais",pa:"Pará",pb:"Paraíba",pr:"Paraná",pe:"Pernambuco",pi:"Piauí",rj:"Rio de Janeiro",rn:"Rio Grande do Norte",rs:"Rio Grande do Sul",ro:"Rondônia",rr:"Roraima",sc:"Santa Catarina",sp:"São Paulo",se:"Sergipe",to:"Tocantins",zz:"Exterior"};
type Election={id:string;turn:number;cycle:string;date:string};
const memory=new Map<string,{body:any;checkedAt:number}>(),inflight=new Map<string,Promise<any>>(),retries=new Map<string,number>();
let configuration:{choices:Election[];at:number}|null=null;
async function sourceJson(url:string) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {const r=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});if(!r.ok)throw new Error(`TSE respondeu ${r.status}`);return await r.json() as any;}
  finally {clearTimeout(timer);}
}
export async function elections():Promise<Election[]> {
  if(configuration&&Date.now()-configuration.at<3600000)return configuration.choices;
  const raw=await sourceJson(`${BASE}/comum/config/ele-c.json`);
  const choices:Election[]=(raw.pl||[]).filter((p:any)=>p.c==="ele2026").flatMap((p:any)=>(p.e||[])
    .filter((e:any)=>(e.abr||[]).some((a:any)=>a.cd==="br"&&(a.cp||[]).some((c:any)=>c.cd==="1")))
    .map((e:any)=>({id:String(e.cd),turn:Number(e.t),cycle:p.c,date:p.dt})));
  if(!choices.length)throw new Error("Configuração presidencial indisponível.");
  configuration={choices,at:Date.now()};return choices;
}
export async function getResult(election:Election,scope="br") {
  if(scope!=="br"&&!STATES[scope])throw new Error("Abrangência inválida.");
  const key=`${election.id}:${scope}`;
  let cached=memory.get(key);
  if(cached&&Date.now()-cached.checkedAt<30000)return {...cached.body,cached:true,stale:false};
  if(inflight.has(key))return inflight.get(key);
  const pending=(async()=>{
    if(!cached&&DB)try{
      const row=await DB.prepare("SELECT body,checked_at FROM result_cache WHERE key=?").bind(key).first<{body:string;checked_at:number}>();
      if(row){cached={body:JSON.parse(row.body),checkedAt:row.checked_at};memory.set(key,cached);}
    }catch(e){console.error("cache_read",String(e));}
    if(cached&&Date.now()-cached.checkedAt<30000)return {...cached.body,cached:true,stale:false};
    if((retries.get(key)||0)>Date.now()){if(cached)return {...cached.body,stale:true};throw new Error("Aguardando nova consulta ao TSE.");}
    try{
      const raw=await sourceJson(`${BASE}/${election.cycle}/${election.id}/dados/${scope}/${scope}-c0001-e${election.id.padStart(6,"0")}-u.json`);
      const body=normalizeResult(raw,election,scope,Date.now());memory.set(key,{body,checkedAt:body.checkedAt});
      let historyAvailable=!!DB;
      if(DB){
        const statements=[DB.prepare("INSERT INTO result_cache(key,body,checked_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,checked_at=excluded.checked_at").bind(key,JSON.stringify(body),body.checkedAt)];
        if(scope==="br"&&body.validVotes>0)statements.push(DB.prepare("INSERT OR IGNORE INTO snapshots(key,election,observed_at,body) VALUES(?,?,?,?)").bind(`${key}:${body.generation}`,election.id,body.checkedAt,JSON.stringify({at:body.totalized||body.generated,percent:body.percent,candidates:body.candidates.map((c:any)=>({number:c.number,votes:c.votes})),validVotes:body.validVotes})));
        try{await DB.batch(statements);}catch(e){historyAvailable=false;console.error("snapshot_write",String(e));}
      }
      return {...body,stale:false,historyAvailable};
    }catch(e){retries.set(key,Date.now()+60000);if(cached)return {...cached.body,stale:true,error:"Falha na consulta ao TSE. Exibindo a última leitura recebida."};throw e;}
  })();inflight.set(key,pending);try{return await pending;}finally{inflight.delete(key);}
}
export async function getHistory(election:string){
  if(!DB)return {available:false,points:[]};
  try{const rows=await DB.prepare("SELECT body FROM snapshots WHERE election=? ORDER BY observed_at DESC LIMIT 240").bind(election).all<{body:string}>();return {available:true,points:rows.results.reverse().map(r=>JSON.parse(r.body))};}
  catch(e){console.error("history_read",String(e));return {available:false,points:[]};}
}
