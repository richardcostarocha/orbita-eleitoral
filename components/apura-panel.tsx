"use client";
import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowUpRight,BarChart3,ChevronDown,ExternalLink,Info,RefreshCw} from "lucide-react";
import {computeApura} from "@/lib/apura-model.mjs";
import ForecastPanel from "./forecast-panel";
import "./apura-panel.css";

type Candidate={number:string;name:string;party:string;votes:number;expectedShare:number;interval90:[number,number];winProbability:number;winCount:number;qualificationProbability:number|null};
type Reading={nation:{election:{turn:number};percent:number;checkedAt:number;totalized:string|null;generated:string}|null;units:unknown[];checkedAt:number;status:string;reason:string};
type Projection={status:string;reason:string;progress:number;threshold:number;results:Candidate[];simulations:number;runoffProbability:number|null;unitsUsed:number;expectedRemainingValid:number|null;diagnostics:{issues:string[];reconciled:boolean}};
const pct=(v:number,d=1)=>new Intl.NumberFormat("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const num=(v:number)=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0}).format(v);
const name=(s:string)=>s.toLocaleLowerCase("pt-BR").replace(/(^|[\s'-])\p{L}/gu,c=>c.toLocaleUpperCase("pt-BR"));
const chance=(v:number)=>v===0?"<0,1%":v===100?">99,9%":`${pct(v)}%`;
const candidateColor=(n:string)=>n==="22"?"#5571f5":n==="13"?"#57d894":"#b6a383";

export function ApuraProjection({turn,autoRefresh=true,compact=false,onExpand}:{turn:number;autoRefresh?:boolean;compact?:boolean;onExpand?:()=>void}){
  const [data,setData]=useState<Reading|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[threshold,setThreshold]=useState(5),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{let active=true;const controller=new AbortController();setLoading(true);
    (async()=>{try{const r=await fetch(`/api/prediction?turn=${turn}`,{signal:controller.signal,cache:"no-store"}),body=await r.json() as Reading;
      if(!active)return;if(!r.ok)throw new Error(body.reason||"Não foi possível consultar a projeção.");
      if(!Array.isArray(body.units)||!Number.isFinite(body.checkedAt))throw new Error("A coleta está incompleta.");
      setData(body);setError("");setNow(Date.now());
    }catch(e){if(active&&!(e instanceof Error&&e.name==="AbortError"))setError(e instanceof Error?e.message:"Falha na consulta.");}finally{if(active)setLoading(false);}})();
    return()=>{active=false;controller.abort();};
  },[turn,refresh]);
  useEffect(()=>{if(!autoRefresh)return;const timer=setInterval(()=>{if(!document.hidden)setRefresh(n=>n+1);},30000);return()=>clearInterval(timer);},[autoRefresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[]);
  const projection=useMemo(()=>{
    if(!data||error||data.nation?.election.turn!==turn)return null;
    return computeApura(data,{threshold,iterations:3000},now) as unknown as Projection;
  },[data,error,turn,threshold,now]);
  const ready=projection?.status==="ready",leader=ready?projection.results[0]:null;
  const reason=error||projection?.reason||(loading?"Consultando a leitura oficial do TSE…":"Aguardando os dados deste turno.");
  const ended=projection?.status==="official"||projection?.status==="closed";
  const waiting=projection?.status==="waiting";
  return <section className={`apura-panel ${compact?"apura-compact panel":""}`} aria-label="Projeção pelo método Apura Brasil">
    <div className="apura-heading"><div><span className="apura-kicker"><Activity size={13}/> MONTE CARLO GEOGRÁFICO</span><h2>{compact?"Projeção da disputa":"O que os votos que faltam podem mudar"}</h2></div>{!compact&&<button className="outline-button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={13} className={loading?"spinning":""}/>{loading?"Consultando…":"Atualizar base"}</button>}</div>
    <div className="apura-tags"><span>Adaptação · Apura Brasil 2026</span><span>Experimental · não calibrado</span></div>
    {!compact&&<div className="apura-toolbar"><label>Iniciar a projeção com <select aria-label="Percentual mínimo para iniciar a projeção" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}><option value={5}>5% apurado</option><option value={10}>10% apurado</option><option value={20}>20% apurado</option></select><ChevronDown size={12}/></label><span>Janela de {threshold}% a 60% <i/> {turn}º turno presidencial</span></div>}
    {ready&&leader?<>
      <div className="apura-summary"><div><span>{turn===1?"Maior votação final estimada":"Favorito nas simulações"}</span><h3>{name(leader.name)}</h3><strong>{pct(leader.expectedShare)}<small>%</small></strong><p>dos votos válidos ao final</p><span className="apura-interval">Faixa de 90% dos cenários: <b>{pct(leader.interval90[0])}% a {pct(leader.interval90[1])}%</b></span></div><div className="apura-probability"><span>{turn===1?"Vitória no 1º turno":"Vitória no cenário"}</span><strong>{chance(leader.winProbability)}</strong><p>Frequência nas {num(projection.simulations)} simulações</p><small>{num(leader.winCount)} cenários de vitória. Os extremos são exibidos sem afirmar certeza.</small></div></div>
      {turn===1&&<div className="apura-runoff"><span>Chance de haver segundo turno</span><strong>{chance(projection.runoffProbability||0)}</strong></div>}
      {!compact&&<div className="apura-table-wrap"><table><caption>Projeção por candidato · estimativa do site</caption><thead><tr><th>Candidato</th><th>Votação final</th><th>Faixa de 90%</th><th>{turn===1?"Vencer no 1º turno":"Vencer"}</th>{turn===1&&<th>Disputar 2º turno</th>}</tr></thead><tbody>{projection.results.map(c=><tr key={c.number}><td><i style={{background:candidateColor(c.number)}}/>{name(c.name)} <small>{c.party} · {c.number}</small></td><td>{pct(c.expectedShare)}%</td><td>{pct(c.interval90[0])}% – {pct(c.interval90[1])}%</td><td>{chance(c.winProbability)}</td>{turn===1&&<td>{chance(c.qualificationProbability||0)}</td>}</tr>)}</tbody></table></div>}
      <div className="apura-reading"><span className="live-dot"/>{pct(projection.progress,2)}% apurado · {projection.unitsUsed} abrangências com votos pendentes</div>
    </>:<div className={`apura-paused ${waiting?"waiting":""}`}><div className="apura-paused-icon">{loading&&!data?<RefreshCw size={24} className="spinning"/>:ended?<BarChart3 size={25}/>:<Activity size={25}/>}</div><h3>{ended?projection?.status==="official"?"A totalização foi encerrada":"Acompanhe o resultado observado":waiting?`A previsão começa em ${threshold}%`:(error||projection?.status==="unavailable")?"Projeção temporariamente suspensa":"Aguardando a leitura oficial"}</h3><p>{reason}</p>{waiting&&<div className="apura-window"><div><span style={{width:`${Math.min(100,(projection?.progress||0)/threshold*100)}%`}}/></div><span>{pct(projection?.progress||0,2)}% / {threshold}%</span></div>}<span className="apura-no-prediction">Nenhuma probabilidade de vitória publicada nesta leitura.</span></div>}
    <p className="apura-disclaimer"><Info size={13}/>{ready?"Projeção estatística do site. Não é resultado oficial nem garantia de vitória.":"O placar oficial e a análise matemática continuam disponíveis no painel."}</p>
    {compact?<button className="text-button apura-expand" onClick={onExpand}>Método e projeções <ArrowUpRight size={13}/></button>:<>
      <details className="apura-method"><summary>Como calculamos a projeção <ChevronDown size={14}/></summary><div className="apura-method-grid"><div><b>01</b><h3>O que já foi contado fica fixo</h3><p>Usamos os votos oficiais do turno selecionado. Para cada UF e o exterior, estimamos a taxa de votos válidos entre os eleitores ainda não contabilizados.</p></div><div><b>02</b><h3>Cada lugar tem seu peso</h3><p>Combinamos a participação local de cada candidato com a parcial nacional. A influência local cresce com a apuração; regiões com poucos votos recebem menos peso.</p></div><div><b>03</b><h3>3.000 possíveis desfechos</h3><p>Uma distribuição Dirichlet varia a divisão dos votos pendentes. O volume válido também varia. A faixa contém os percentis 5 e 95 das simulações.</p></div></div><p>No 1º turno, vencer exige mais de 50% dos votos válidos. A chance de disputar o 2º turno conta as simulações sem vencedor em primeiro turno nas quais o candidato está entre os dois primeiros.</p><p>Esta implementação segue as fórmulas publicadas no projeto Apura Brasil 2026, com todos os candidatos presidenciais, sorteios reproduzíveis e validação de frescor e conciliação entre Brasil e as 28 abrangências. Não usamos a extrapolação nacional de contingência do original.</p><p>Os erros regionais são simulados independentemente, conforme essa referência. Um desvio nacional compartilhado pode não estar representado; as chances podem ser excessivamente confiantes. Não atribuímos confiança “alta” só porque mais urnas foram apuradas. Não há calibração histórica comprovada neste painel.</p><p>Antes do limite escolhido ou após 60%, o modelo não publica chances. Falha na fonte, votos pendentes de destinação, divergências nos totais, consulta acima de 2 minutos ou parcial em andamento com origem acima de 3 minutos suspendem a projeção.</p><a href="https://github.com/pedrodavidcet-hub/apura-brasil-2026/blob/main/assets/projection.js" target="_blank" rel="noreferrer">Referência pública do algoritmo <ExternalLink size={13}/></a></details>
      <div className="apura-foot"><span>Fonte: TSE · adaptação independente, sem vínculo com o projeto de referência.</span><span>{data?.nation?`Origem: ${data.nation.totalized||data.nation.generated} · Brasília`:""}</span></div>
    </>}
  </section>;
}

export default function PredictionWorkspace({turn,autoRefresh}:{turn:number;autoRefresh:boolean}){
  const [mode,setMode]=useState("apura");
  return <div className="prediction-workspace"><div className="prediction-mode"><span>Laboratório da apuração</span><div className="segmented"><button className={mode==="apura"?"active":""} onClick={()=>setMode("apura")}>Apura Brasil · principal</button><button className={mode==="manual"?"active":""} onClick={()=>setMode("manual")}>Cenários manuais</button></div></div>{mode==="apura"?<ApuraProjection turn={turn} autoRefresh={autoRefresh}/>:<ForecastPanel turn={turn} autoRefresh={autoRefresh}/>}</div>;
}
