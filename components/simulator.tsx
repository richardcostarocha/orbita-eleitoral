"use client";
import {useState} from "react";
import {SlidersHorizontal,CheckCheck,Activity} from "lucide-react";
const fmt=(n:number)=>new Intl.NumberFormat("pt-BR").format(n);
const pct=(n:number,d=2)=>new Intl.NumberFormat("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
export default function Simulator(){
  const [turn,setTurn]=useState(2),[first,setFirst]=useState(50000000),[second,setSecond]=useState(30000000),[other,setOther]=useState(0),[remaining,setRemaining]=useState(15000000);
  const [nameA,setNameA]=useState("Candidato A"),[nameB,setNameB]=useState("Candidato B");
  const candidates=[{number:"A",name:nameA||"Candidato A",votes:first},{number:"B",name:nameB||"Candidato B",votes:second},...(turn===1?[{number:"O",name:"Outros candidatos",votes:other}]:[])];
  // In first-round simulations the aggregate of others cannot be treated as one candidate.
  const valid=first+second+(turn===1?other:0);
  const sorted=[...candidates.slice(0,2)].sort((a,b)=>b.votes-a.votes);
  const leader=sorted[0],opposition=valid-leader.votes,margin=leader.votes-opposition;
  const certain=valid>0&&margin>remaining;
  const tie=first===second;
  const threshold=Math.floor((remaining+(leader.votes-sorted[1].votes))/2)+1;
  const input=(label:string,value:number,set:(n:number)=>void)=><label className="sim-field"><span>{label}</span><input type="number" min="0" max="1000000000" step="1" value={value} onChange={e=>{const n=Number(e.target.value);set(Number.isFinite(n)?Math.min(1000000000,Math.max(0,Math.floor(n))):0);}}/><small>{fmt(value)} votos</small></label>;
  return <div className="simulator"><div className="sim-warning"><SlidersHorizontal size={18}/><div><strong>Você está no simulador</strong><span>Todos os valores abaixo são hipotéticos e não alteram a apuração oficial.</span></div></div>
    <div className="sim-layout"><section className="panel sim-inputs"><div className="panel-heading"><div><span className="eyebrow">EXPLORE AS POSSIBILIDADES</span><h2>Monte seu cenário</h2></div><SlidersHorizontal size={21}/></div><div className="segmented"><button className={turn===1?"active":""} onClick={()=>setTurn(1)}>1º turno</button><button className={turn===2?"active":""} onClick={()=>setTurn(2)}>2º turno</button></div>
      <div className="sim-name-grid"><label className="sim-field"><span>Nome do candidato A</span><input maxLength={50} value={nameA} onChange={e=>setNameA(e.target.value)}/></label><label className="sim-field"><span>Nome do candidato B</span><input maxLength={50} value={nameB} onChange={e=>setNameB(e.target.value)}/></label></div>
      {input(`Votos de ${nameA||"A"}`,first,setFirst)}{input(`Votos de ${nameB||"B"}`,second,setSecond)}{turn===1&&input("Soma dos votos dos demais candidatos",other,setOther)}{input("Máximo de votos que ainda podem entrar",remaining,setRemaining)}
      <div className="preset-row"><span>Experimentar:</span><button onClick={()=>{setFirst(50000000);setSecond(30000000);setOther(0);setRemaining(15000000);}}>Vantagem irreversível</button><button onClick={()=>{setFirst(45000000);setSecond(42000000);setOther(0);setRemaining(25000000);}}>Disputa aberta</button></div>
    </section><section className={`sim-answer ${certain?"certain":""}`}><span className="eyebrow">RESULTADO DA SIMULAÇÃO</span><div className="analysis-icon">{certain?<CheckCheck size={30}/>:<Activity size={30}/>}</div><h2>{valid===0?"Insira os votos do cenário":certain?`A vantagem de ${leader.name} é irreversível`:tie?"Empate no cenário atual":"A vitória ainda não está garantida"}</h2><p>{certain?"Mesmo sem receber mais nenhum voto, o líder permanece com mais votos que toda a oposição no pior cenário.":"Os votos que ainda podem entrar impedem afirmar uma vitória por maioria absoluta. Este simulador não atribui vitória em empate."}</p>
      <div className="sim-equation"><div><span>Votos do candidato analisado</span><strong>{fmt(leader.votes)}</strong></div><b>{certain?">":"≤"}</b><div><span>Oposição + máximo restante</span><strong>{fmt(opposition+remaining)}</strong></div></div>
      <div className="sim-result-stat"><span>{certain?"Margem de segurança":"Votos adicionais necessários ao líder, se todos os restantes forem válidos"}</span><strong>{certain?fmt(margin-remaining):fmt(Math.max(0,Math.floor((remaining-margin)/2)+1))}</strong></div>
      {turn===2&&remaining>0&&!tie&&<p className="scenario-note">Para ultrapassar, {sorted[1].name} precisaria de {fmt(Math.max(0,threshold))} dos {fmt(remaining)} votos restantes ({pct(Math.max(0,threshold)/remaining*100)}%), supondo todos válidos.</p>}
      <p className="footnote">No 1º turno, os demais candidatos entram somados na oposição. Nenhuma probabilidade estatística é usada.</p>
    </section></div>
  </div>;
}


