/** Conservative arithmetic: no turnout or geographic assumptions. */
export function analyzeElection({ candidates, remaining, turn = 2, validVotes, trustworthy = true }) {
  if(!Array.isArray(candidates)||candidates.some(c=>!c||typeof c.number!=="string")||new Set(candidates.map(c=>c.number)).size!==candidates.length)
    return {status:"unavailable",reason:"As candidaturas disponíveis não estão conciliadas."};
  const sorted = [...candidates].sort((a,b)=>b.votes-a.votes || Number(a.number)-Number(b.number));
  const total = sorted.reduce((sum,c)=>sum+c.votes,0);
  const values = [remaining,total,validVotes,...sorted.map(c=>c.votes)];
  if (!trustworthy || !values.every(v=>Number.isSafeInteger(v)&&v>=0) || total!==validVotes || sorted.length<2 || ![1,2].includes(turn) || (turn===2&&sorted.length!==2))
    return {status:"unavailable",reason:"Os dados disponíveis ainda não permitem um limite matemático seguro."};
  const leader=sorted[0], runner=sorted[1];
  if(total===0) return {status:"waiting",remaining,lead:0};
  const opposition=total-leader.votes;
  const margin=leader.votes-(turn===1?opposition:runner.votes);
  const votesToPass=Math.floor((remaining+(leader.votes-runner.votes))/2)+1;
  const secondRoundCertain=turn===1&&!sorted.some(c=>c.votes+remaining>total-c.votes);
  return {status:margin>remaining?"irreversible":secondRoundCertain?"second-round":remaining===0?"finished":"open",
    leader,runner,lead:leader.votes-runner.votes,opposition,remaining,margin,safetyMargin:margin-remaining,
    votesToPass,shareToPass:remaining>0?Math.max(0,votesToPass)/remaining*100:null,
    leaderMinimum:leader.votes/(total+remaining)*100,runnerMaximum:runner.votes+remaining};
}
const numeric=(value,name)=>{
  if(!/^[0-9]+$/.test(String(value))) throw new Error(`Campo inválido: ${name}`);
  const n=Number(value); if(!Number.isSafeInteger(n)) throw new Error(`Campo fora do limite: ${name}`); return n;
};
const FUTURE_TOLERANCE=120000, SOURCE_MAX_AGE=180000, CHECK_MAX_AGE=120000;

/** Parse the TSE's Brasília clock without accepting JavaScript's date rollover. */
export function parseSourceTime(value) {
  if(typeof value!=="string")return null;
  const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if(!m)return null;
  const [day,month,year,hour,minute,second]=m.slice(1).map(Number);
  if(year<2000||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
  const local=Date.UTC(year,month-1,day,hour,minute,second),date=new Date(local);
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return local+3*3600000;
}

function consistencyReason(result) {
  const fields=[result.validVotes,result.remaining,result.electorate,result.turnout,result.abstention,result.blank,result.nullVotes,result.sections,result.counted];
  if(!fields.every(v=>Number.isSafeInteger(v)&&v>=0)||!Array.isArray(result.candidates)||result.candidates.length<2)
    return "Os totais disponíveis não permitem uma conclusão segura.";
  const candidates=result.candidates;
  if(candidates.some(c=>!c||typeof c.number!=="string"||!c.number||!Number.isSafeInteger(c.votes)||c.votes<0)
    ||new Set(candidates.map(c=>c.number)).size!==candidates.length
    ||new Set(candidates.filter(c=>c.id).map(c=>c.id)).size!==candidates.filter(c=>c.id).length)
    return "As candidaturas disponíveis não estão conciliadas.";
  if(candidates.reduce((sum,c)=>sum+c.votes,0)!==result.validVotes)
    return "A soma das candidaturas não corresponde aos votos válidos.";
  if(result.counted>result.sections||result.turnout+result.abstention>result.electorate
    ||result.remaining>result.electorate-result.turnout-result.abstention
    ||result.validVotes+result.blank+result.nullVotes>result.turnout
    ||(!result.counted&&(result.turnout>0||result.abstention>0)))
    return "Há totais incompatíveis com o eleitorado ou com o comparecimento.";
  if(![1,2].includes(result.election?.turn)||(result.election.turn===2&&candidates.length!==2))return "As candidaturas e o turno não estão conciliados.";
  if(result.finalized&&(result.remaining!==0||result.counted!==result.sections))
    return "A totalização está marcada como final, mas os totais ainda não estão conciliados.";
  if(result.elected){
    const winner=candidates.find(c=>c.number===result.elected.number);
    if(result.scope!=="br"||!result.finalized||!winner||winner.votes!==result.elected.votes
      ||winner.votes<=result.validVotes-winner.votes||!/^eleito(?:\s|$)/i.test(winner.officialStatus||""))
      return "A situação de eleito não está conciliada com a totalização nacional.";
  }
  return null;
}

/** Shared by the API and browser so both suspend conclusions on the same facts. */
export function resultTrust(result,now=Date.now()) {
  const fail=(reason,aged=false)=>({trustworthy:false,reason,aged});
  if(!result||!Number.isFinite(now))return fail("Aguardando uma leitura oficial válida.");
  const issue=consistencyReason(result);if(issue)return fail(issue);
  if(result.stale)return fail("A última consulta ao TSE falhou. Aguardamos uma leitura atualizada.");
  if(result.disputed)return fail("Há votos com destinação pendente ou diferenciada.");
  if(!Number.isFinite(result.checkedAt)||result.checkedAt>now+FUTURE_TOLERANCE||now-result.checkedAt>=CHECK_MAX_AGE)
    return fail("A última consulta está fora do intervalo seguro de atualização.");
  const generated=parseSourceTime(result.generated),origin=parseSourceTime(result.totalized);
  if(generated===null||(result.totalized&&origin===null))return fail("O horário de origem não é válido.");
  if(generated>now+FUTURE_TOLERANCE||(origin!==null&&origin>now+FUTURE_TOLERANCE))
    return fail("O horário de origem está adiantado em relação ao relógio atual.");
  if(origin!==null&&origin>generated+FUTURE_TOLERANCE)return fail("Os horários de geração e totalização não estão conciliados.");
  const aged=!result.finalized&&result.validVotes>0&&(origin===null||now-origin>SOURCE_MAX_AGE);
  if(aged)return fail("A parcial de origem está há mais de 3 minutos sem atualização.",true);
  if(result.validVotes>0&&origin===null)return fail("A parcial com votos não informa um horário de totalização válido.");
  return {trustworthy:true,reason:null,aged:false};
}

export function normalizeResult(raw,election,scope="br",checkedAt=Date.now()) {
  if(raw.f!=="o"||String(raw.ele)!==election.id||String(raw.t)!==String(election.turn)||raw.cdabr!==scope) throw new Error("Arquivo não corresponde à eleição oficial solicitada.");
  const office=raw.carg?.find(c=>c.cd==="1"); if(!office) throw new Error("Cargo presidencial ausente.");
  const candidates=(office.agr||[]).flatMap(g=>(g.par||[]).flatMap(p=>(p.cand||[]).map(c=>({
    number:c.n,name:c.nmu||c.nm,party:p.sg,id:c.sqcand,votes:numeric(c.vap,"votos do candidato"),
    destination:c.dvt||"",officialStatus:c.st||"",officialFlag:c.e,
    photo:`https://resultados.tse.jus.br/oficial/${election.cycle}/${election.id}/fotos/br/${c.sqcand}.jpeg`,
  })))).sort((a,b)=>b.votes-a.votes||Number(a.number)-Number(b.number));
  if(candidates.some(c=>!/^\d+$/.test(c.number)||!/^\d+$/.test(c.id||""))
    ||new Set(candidates.map(c=>c.number)).size!==candidates.length||new Set(candidates.map(c=>c.id)).size!==candidates.length)
    throw new Error("Candidaturas inválidas ou duplicadas na origem.");
  const electorate=numeric(raw.e?.te,"eleitorado"),turnout=numeric(raw.e?.c,"comparecimento"),abstention=numeric(raw.e?.a,"abstenção");
  const validVotes=numeric(raw.v?.vv,"votos válidos"),sections=numeric(raw.s?.ts,"seções"),counted=numeric(raw.s?.st,"seções totalizadas");
  if(counted>sections||turnout+abstention>electorate) throw new Error("Totais inconsistentes na origem.");
  // Uninstalled sections cannot contribute votes in the current official total.
  // Every other unaccounted elector is conservatively treated as a valid vote.
  const uninstalled=numeric(raw.e?.esni??"0","eleitores em seções não instaladas");
  if(turnout+abstention+uninstalled>electorate)throw new Error("Eleitorado não conciliado na origem.");
  const remaining=electorate-turnout-abstention-uninstalled;
  const disputed=["van","vansj","vsan","vscv"].some(k=>numeric(raw.v?.[k]??"0",k)>0)
    ||candidates.some(c=>c.votes>0&&c.destination.toLocaleLowerCase("pt-BR")!=="válido");
  const finalized=raw.tf==="s"&&raw.and==="f";
  if((raw.tf==="s")!==(raw.and==="f")||(finalized&&counted!==sections))throw new Error("Finalização contraditória na origem.");
  const generated=`${raw.dg} ${raw.hg}`,totalized=raw.dt&&raw.ht?`${raw.dt} ${raw.ht}`:null;
  const generatedTime=parseSourceTime(generated),totalizedTime=parseSourceTime(totalized);
  if(!Number.isFinite(checkedAt)||generatedTime===null||!!raw.dt!==!!raw.ht||(totalized&&totalizedTime===null)
    ||generatedTime>checkedAt+FUTURE_TOLERANCE||(totalizedTime!==null&&totalizedTime>checkedAt+FUTURE_TOLERANCE)
    ||(totalizedTime!==null&&totalizedTime>generatedTime+FUTURE_TOLERANCE))throw new Error("Horários inválidos ou futuros na origem.");
  const blank=numeric(raw.v?.vb,"brancos"),nullVotes=numeric(raw.v?.tvn,"nulos");
  if(candidates.length<2||(election.turn===2&&candidates.length!==2)
    ||candidates.reduce((sum,c)=>sum+c.votes,0)!==validVotes
    ||validVotes+blank+nullVotes>turnout||(!counted&&(turnout>0||abstention>0)))throw new Error("Votos ou candidaturas não conciliados na origem.");
  if(raw.v?.tv!==undefined&&numeric(raw.v.tv,"total de votos")!==turnout)throw new Error("Votos e comparecimento não conciliados na origem.");
  if(validVotes>0&&totalizedTime===null)throw new Error("Parcial com votos sem horário de totalização.");
  // e=s can mean qualified for the runoff; status must explicitly say elected.
  const winners=candidates.filter(c=>c.officialFlag==="s"&&/^eleito(?:\s|$)/i.test(c.officialStatus));
  if(scope==="br"&&finalized&&(winners.length>1||(winners[0]&&winners[0].votes<=validVotes-winners[0].votes)))throw new Error("Situação de eleito incompatível com os votos válidos.");
  const elected=scope==="br"&&finalized&&remaining===0?winners[0]||null:null;
  return {election,scope,generation:String(raw.idg),generated,
    totalized,checkedAt,candidates,electorate,turnout,abstention,validVotes,sections,counted,
    percent:sections?counted/sections*100:0,blank,nullVotes,
    remaining,disputed,finalized,elected,phase:raw.and,
    sourceUrl:`https://resultados.tse.jus.br/oficial/${election.cycle}/${election.id}/dados/${scope}/${scope}-c0001-e${election.id.padStart(6,"0")}-u.json`};
}
