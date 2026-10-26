/**
 * Conditional presidential runoff scenarios. This is a transparent sensitivity
 * model, not a calibrated election forecast. No historic partisan mapping is used:
 * the baseline must be the official first round of the same 2026 election.
 */
import {parseSourceTime,resultTrust} from "./election.mjs";
const METHODS = ["regional", "uniform", "proportional"];
const REGIONS = {ac:"n",ap:"n",am:"n",pa:"n",ro:"n",rr:"n",to:"n",al:"ne",ba:"ne",ce:"ne",ma:"ne",pb:"ne",pe:"ne",pi:"ne",rn:"ne",se:"ne",df:"co",go:"co",mt:"co",ms:"co",es:"se",mg:"se",rj:"se",sp:"se",pr:"s",rs:"s",sc:"s",zz:"zz"};
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const integer = n => Number.isSafeInteger(n) && n >= 0;
const total = (items, fn) => items.reduce((s, x) => s + fn(x), 0);
const logit = p => Math.log(clamp(p, .001, .999) / (1-clamp(p, .001, .999)));
const logistic = x => 1/(1+Math.exp(-x));
const candidateVotes = (result, number) => result.candidates.find(c => String(c.number) === String(number))?.votes ?? 0;
function resultIssue(result, turn) {
  if (!result || result.election?.turn !== turn || result.election?.cycle !== "ele2026") return "A referência precisa pertencer ao turno correto da eleição de 2026.";
  const fields = ["electorate", "turnout", "abstention", "validVotes", "remaining", "sections", "counted", "blank", "nullVotes"];
  if (fields.some(k => !integer(result[k])) || !Array.isArray(result.candidates) || result.candidates.length < 2) return "Há campos oficiais ausentes ou inválidos.";
  if (turn === 2 && result.candidates.length !== 2) return "O modelo exige exatamente dois finalistas oficiais.";
  if (new Set(result.candidates.map(c => String(c.number))).size !== result.candidates.length || result.candidates.some(c => !integer(c.votes))) return "A lista de candidatos contém inconsistências.";
  if (total(result.candidates, c => c.votes) !== result.validVotes || result.counted > result.sections || result.validVotes+result.blank+result.nullVotes > result.turnout || result.turnout+result.abstention+result.remaining > result.electorate) return "Os totais de votos e de eleitores não fecham.";
  if (!result.sections || !result.electorate) return "O TSE ainda não forneceu eleitorado e seções suficientes.";
  return null;
}

/** Shared server/client verification; generation identifiers need not match across UFs. */
export function assessModelData(data, now = Number(data?.checkedAt)) {
  const issues = [];
  const units = Array.isArray(data?.units) ? data.units : [];
  for (const [label, result, turn] of [["Brasil", data?.nation, 2], ["1º turno nacional", data?.baselineNation, 1]]) {
    const issue = resultIssue(result, turn);
    if (issue) issues.push(`${label}: ${issue}`);
  }
  if (!units.length) issues.push("Os resultados das unidades da Federação ainda não estão disponíveis.");
  if (new Set(units.map(u => u.scope)).size !== units.length) issues.push("Há unidades da Federação duplicadas.");
  const all = [];
  if (data?.nation) all.push(data.nation);
  if (data?.baselineNation) all.push(data.baselineNation);
  for (const unit of units) {
    for (const [label, result, turn] of [[unit.scope?.toUpperCase(), unit.current, 2], [`${unit.scope?.toUpperCase()} no 1º turno`, unit.baseline, 1]]) {
      const issue = resultIssue(result, turn);
      if (issue) issues.push(`${label}: ${issue}`);
      if (result) all.push(result);
    }
  }
  let reconciled = !issues.length;
  if (reconciled) {
    for (const [key, national] of [["current", data.nation], ["baseline", data.baselineNation]]) {
      for (const field of ["electorate", "turnout", "abstention", "validVotes", "remaining", "sections", "counted", "blank", "nullVotes"]) {
        if (total(units, u => u[key][field]) !== national[field]) {
          issues.push(`Brasil e soma das UFs não coincidem em ${field} (${key === "current" ? "2º" : "1º"} turno).`);
          reconciled = false;
        }
      }
      for (const candidate of national.candidates) {
        if (total(units, u => candidateVotes(u[key], candidate.number)) !== candidate.votes) {
          issues.push(`Brasil e soma das UFs não coincidem nos votos do candidato ${candidate.number}.`);
          reconciled = false;
        }
      }
      const nationalNumbers = new Set(national.candidates.map(c => String(c.number)));
      if (units.some(u => u[key].candidates.some(c => !nationalNumbers.has(String(c.number))))) {
        issues.push("As listas nacionais e estaduais de candidatos não coincidem.");
        reconciled = false;
      }
    }
    if (!data.baselineNation.finalized || units.some(u => !u.baseline.finalized || u.baseline.validVotes === 0)) issues.push("A referência do 1º turno precisa estar encerrada e conter votos válidos.");
    const finalists = data.nation.candidates.map(c => String(c.number));
    if (finalists.some(number => !data.baselineNation.candidates.some(c => String(c.number) === number))) issues.push("Não foi possível identificar os dois finalistas na referência oficial do 1º turno.");
    if (units.some(u => finalists.some(number => !u.current.candidates.some(c => String(c.number) === number) || !u.baseline.candidates.some(c => String(c.number) === number)))) issues.push("Faltam finalistas em uma ou mais referências estaduais.");
  }
  for (const result of all) {
    const trust = resultTrust(result,now);
    if (!trust.trustworthy) issues.push(trust.reason);
  }
  const stale = all.some(r => r.stale || !Number.isFinite(r.checkedAt) || !Number.isFinite(now) || now-r.checkedAt >= 120000 || (!r.finalized && r.validVotes > 0 && (parseSourceTime(r.totalized) === null || now-parseSourceTime(r.totalized) > 180000)));
  const disputed = all.some(r => r.disputed);
  if (stale) issues.push("Há leituras antigas ou falha de atualização; aguarde a próxima consulta.");
  if (disputed) issues.push("Há votos com situação pendente; a estimativa está suspensa.");
  if (data?.diagnostics?.reconciled === false) {reconciled = false; issues.push("A coleta ainda não conciliou Brasil e UFs.");}
  if (data?.diagnostics?.missingScopes?.length) issues.push("A coleta não recebeu todas as UFs e o exterior.");
  return {issues: [...new Set(issues)], reconciled, stale, disputed};
}

function randomGenerator() {
  // Fixed common random numbers make controls comparable and repeatable.
  let seed = 20261025;
  const uniform = () => {
    seed += 0x6D2B79F5;
    let n = seed;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0)/4294967296;
  };
  return () => Math.sqrt(-2*Math.log(Math.max(Number.EPSILON, uniform())))*Math.cos(2*Math.PI*uniform());
}

/** Values returned as percentages (0..100), including winProbability and interval95. */
export function projectScenario(data, options = {}, now = Number(data?.checkedAt)) {
  const nation = data?.nation;
  const method = options.method ?? "regional";
  const available = Array.isArray(nation?.candidates) ? nation.candidates : [];
  const number = String(options.candidateNumber ?? (available.some(c => String(c.number) === "22") ? "22" : available[0]?.number ?? ""));
  const candidate = available.find(c => String(c.number) === number) ?? null;
  const opponent = available.find(c => String(c.number) !== number) ?? null;
  const parameters = {method, candidateNumber:number, transferPercent:options.transferPercent ?? 50, turnoutFactor:options.turnoutFactor ?? 1, nationalSwing:options.nationalSwing ?? 0, uncertaintyPoints:options.uncertaintyPoints ?? 2};
  const empty = {status:"unavailable",reason:"Aguardando dados oficiais suficientes para o cenário.",kind:null,calibrated:false,candidate,opponent,expectedShare:null,interval95:null,winProbability:null,tieProbability:null,projectedVotes:null,method,assumptions:[],diagnostics:{issues:[],countedWeight:0,units:0,reconciled:false},simulations:0,options:parameters};
  if (!METHODS.includes(method) || ![[parameters.transferPercent,0,100],[parameters.turnoutFactor,.85,1.1],[parameters.nationalSwing,-10,10],[parameters.uncertaintyPoints,.5,5]].every(([n,lo,hi]) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi)) return {...empty,reason:"Os parâmetros do cenário estão fora dos limites permitidos."};
  if (!candidate || !opponent || resultIssue(nation, 2)) return empty;
  const nationalTrust = resultTrust(nation,now);
  if (!nationalTrust.trustworthy) return {...empty,reason:nationalTrust.reason};
  if (nation.finalized) return {...empty,status:"official",kind:"official",reason:"Apuração encerrada pelo TSE. A projeção foi substituída pelo resultado oficial.",officialResult:{candidates:available,elected:nation.elected ?? null,validVotes:nation.validVotes}};
  if (nation.remaining === 0) return {...empty,reason:"Não há eleitores pendentes. Aguardando o encerramento oficial do TSE, sem estimativa probabilística."};
  const diagnostics = assessModelData(data,now);
  if (diagnostics.issues.length || data?.status === "unavailable") return {...empty,reason:diagnostics.issues[0] || data.reason || empty.reason,diagnostics:{...empty.diagnostics,...diagnostics}};
  const units = [...data.units].sort((a,b) => a.scope.localeCompare(b.scope));
  const transfer = parameters.transferPercent/100;
  let eliminatedTotal = 0;
  const modeled = units.map(unit => {
    const current = unit.current, baseline = unit.baseline;
    const baseA = candidateVotes(baseline, number), baseB = candidateVotes(baseline, opponent.number);
    const eliminated = Math.max(0, baseline.validVotes-baseA-baseB);
    eliminatedTotal += eliminated;
    const prior = (baseA+eliminated*transfer)/baseline.validVotes;
    const accounted = current.electorate-current.remaining;
    const coverage = clamp(accounted/current.electorate);
    // Reported sections and geographic coverage determine shrinkage; votes are
    // never treated as millions of independent survey respondents.
    const weight = coverage/(coverage+.12) * current.counted/(current.counted+30);
    const baselineRate = clamp(baseline.validVotes/baseline.electorate*parameters.turnoutFactor);
    const observedRate = accounted > 0 ? clamp(current.validVotes/accounted) : baselineRate;
    const validRate = clamp(baselineRate*(1-weight)+observedRate*weight);
    // Estimate the valid-vote rate of unaccounted electors, not a target for the
    // full election minus counted votes. The latter can erase all future votes
    // when participation exceeds the baseline and manufacture near certainty.
    const future = Math.min(current.remaining, Math.max(0, Math.round(current.remaining*validRate)));
    const observed = current.validVotes > 0 ? candidateVotes(current, number)/current.validVotes : prior;
    return {scope:unit.scope,current,prior,coverage,weight,future,observed};
  });
  const overallCoverage = clamp((nation.electorate-nation.remaining)/nation.electorate);
  const globalWeight = overallCoverage/(overallCoverage+.12)*nation.counted/(nation.counted+120);
  const weightedResidual = nation.validVotes > 0 ? total(modeled,u => u.current.validVotes*(u.observed-u.prior))/nation.validVotes : 0;
  const weightedLogOdds = nation.validVotes > 0 ? total(modeled,u => u.current.validVotes*(logit(u.observed)-logit(u.prior)))/nation.validVotes : 0;
  for (const unit of modeled) {
    const estimate = method === "regional" ? unit.prior*(1-unit.weight)+unit.observed*unit.weight
      : method === "uniform" ? unit.prior+weightedResidual*globalWeight
      : logistic(logit(unit.prior)+weightedLogOdds*globalWeight);
    unit.share = clamp(estimate+parameters.nationalSwing/100);
  }
  const remainingValid = total(modeled,u => u.future);
  if (remainingValid === 0) return {...empty,reason:"O volume de votos pendentes deste cenário foi arredondado a zero. A probabilidade fica suspensa; acompanhe a contagem oficial.",diagnostics:{...empty.diagnostics,...diagnostics}};
  const aFuture = Math.round(total(modeled,u => u.future*u.share));
  const expectedA = candidate.votes+aFuture, expectedB = opponent.votes+remainingValid-aFuture;
  const expectedTotal = expectedA+expectedB;
  if (!expectedTotal) return {...empty,reason:"O cenário ainda não contém votos válidos suficientes.",diagnostics:{...empty.diagnostics,...diagnostics}};
  const normal = randomGenerator(), shares = [];
  const regionNames = [...new Set(modeled.map(u => REGIONS[u.scope] || u.scope))].sort();
  const canonical = [...available].sort((a,b) => String(a.number).localeCompare(String(b.number),undefined,{numeric:true}))[0];
  const orientation = String(canonical.number) === number ? 1 : -1;
  const uncertainty = parameters.uncertaintyPoints/100;
  let wins = 0, ties = 0;
  const simulations = 4000;
  for (let trial=0;trial<simulations;trial++) {
    const nationwide = normal();
    const regional = Object.fromEntries(regionNames.map(r => [r,normal()]));
    let simulatedA = candidate.votes, simulatedB = opponent.votes;
    for (const unit of modeled) {
      const region = REGIONS[unit.scope] || unit.scope;
      const correlatedError = orientation*uncertainty*(.8*nationwide+.5*regional[region]+.4*normal());
      const volumeError = normal()*(.02+.03*(1-unit.coverage));
      const pending = Math.min(unit.current.remaining,Math.max(0,Math.round(unit.future*(1+volumeError))));
      const a = pending*clamp(unit.share+correlatedError);
      simulatedA += a; simulatedB += pending-a;
    }
    const sum = simulatedA+simulatedB;
    shares.push(sum ? simulatedA/sum*100 : expectedA/expectedTotal*100);
    if (simulatedA > simulatedB) wins++; else if (simulatedA === simulatedB) ties++;
  }
  shares.sort((a,b) => a-b);
  // Jeffreys smoothing avoids a numerical 0%/100% claim from a finite sample.
  const probability = (wins+.5)/(simulations+1)*100;
  const kind = nation.validVotes === 0 ? "scenario" : "experimental";
  const descriptions = {
    regional:"Regional: cada UF combina a base do 1º turno com a parcial local; o peso observado depende das seções e do eleitorado contabilizados.",
    uniform:"Swing uniforme: um deslocamento nacional em pontos percentuais, estimado nas UFs já observadas, é aplicado às bases locais.",
    proportional:"Swing proporcional: um ajuste nacional nas chances relativas (odds), estimado nas UFs já observadas, é aplicado às bases locais."
  };
  return {...empty,status:"ready",reason:kind === "scenario" ? "Antes da contagem: cenário condicionado às hipóteses escolhidas." : "Modelo experimental condicionado às hipóteses; sem calibração retrospectiva.",kind,
    expectedShare:expectedA/expectedTotal*100,interval95:[shares[Math.floor(simulations*.025)],shares[Math.ceil(simulations*.975)-1]],winProbability:probability,tieProbability:ties/simulations*100,
    projectedVotes:{candidate:expectedA,opponent:expectedB,total:expectedTotal,remainingValid},simulations,
    assumptions:[descriptions[method],`Referência: primeiro turno oficial de 2026; ${eliminatedTotal.toLocaleString("pt-BR")} votos em candidatos eliminados.`,`${parameters.transferPercent}% dos votos dos eliminados vão para ${candidate.name}; o restante vai para ${opponent.name}. É uma hipótese editável.`,`A taxa de votos válidos por eleitor do 1º turno é multiplicada por ${parameters.turnoutFactor.toFixed(2)} e atualizada pela parcial local. Ela inclui comparecimento, brancos e nulos. A taxa mista é aplicada somente aos eleitores ainda não contabilizados.`,`O swing adicional de ${parameters.nationalSwing} p.p. vale apenas para os votos ainda pendentes.`,`Incerteza de ${parameters.uncertaintyPoints} p.p. sobre os votos pendentes, com erros nacionais, regionais e locais correlacionados; parâmetros escolhidos, sem calibração.`,"Os votos já totalizados permanecem fixos. O teto de votos futuros é o número oficial de eleitores ainda não contabilizados.","A probabilidade conta apenas simulações com mais de 50% dos votos válidos, com suavização de Jeffreys: (vitórias + 0,5) / (simulações + 1). Empates não contam como vitória.","Os limites de 95% são percentis das simulações do cenário; não possuem cobertura histórica validada."],
    diagnostics:{...diagnostics,countedWeight:globalWeight,units:units.length,winSimulations:wins,tieSimulations:ties,uncertaintyCalibrated:false}};
}
