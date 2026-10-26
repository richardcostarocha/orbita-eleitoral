"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, CircleHelp, FlaskConical, Info, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { projectScenario } from "@/lib/projection.mjs";
import "./forecast-panel.css";

type Method = "regional" | "uniform" | "proportional";
type Candidate = { number: string; name: string; party: string; votes: number; photo?: string };
type Snapshot = { candidates: Candidate[]; validVotes: number; percent: number; finalized?: boolean; totalized?: string | null; generated?: string; checkedAt: number; stale?: boolean; disputed?: boolean };
type ModelData = {
  status: "ready" | "waiting" | "unavailable";
  reason: string;
  kind: "scenario" | "experimental" | "official" | null;
  nation: Snapshot | null;
  baselineNation: Snapshot | null;
  units: { scope: string; name: string; current: Snapshot; baseline: Snapshot }[];
  generation: string;
  checkedAt: number;
  diagnostics: { missingScopes: string[]; issues: string[]; reconciled: boolean; stale: boolean; disputed: boolean };
};
type Projection = {
  status: "ready" | "unavailable" | "official";
  reason: string;
  kind: "scenario" | "experimental" | "official" | null;
  calibrated: false;
  candidate: Candidate | null;
  opponent: Candidate | null;
  expectedShare: number | null;
  interval95: [number, number] | null;
  winProbability: number | null;
  projectedVotes: { candidate: number; opponent: number; total: number; remainingValid: number } | null;
  method: Method;
  assumptions: string[];
  diagnostics: { issues: string[]; countedWeight: number; units: number; reconciled: boolean };
  simulations: number;
};

const methods: { id: Method; title: string; short: string; description: string }[] = [
  { id: "regional", title: "Regional", short: "Ajuste por UF", description: "Parte do 1º turno em cada UF e incorpora o sinal local da apuração, com redução de ajustes onde há poucos dados." },
  { id: "uniform", title: "Uniforme", short: "Mesmo deslocamento", description: "Aplica o mesmo deslocamento em pontos percentuais às bases das UFs, preservando o volume de votos pendentes em cada uma." },
  { id: "proportional", title: "Proporcional", short: "Ajuste em chances", description: "Ajusta as chances relativas (odds) nas bases das UFs. O mesmo ajuste nacional tem efeitos diferentes conforme a votação local." },
];
const defaults = { transferPercent: 50, turnoutFactor: 1, nationalSwing: 0, uncertaintyPoints: 2 };
const number = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
const percent = (n: number, digits = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const nice = (name: string) => name.toLocaleLowerCase("pt-BR").replace(/(^|[\s'-])\p{L}/gu, c => c.toLocaleUpperCase("pt-BR"));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function RangeControl({ title, description, value, min, max, step, suffix, onChange }: {
  title: string; description: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (n: number) => void;
}) {
  const id = useId();
  return <div className="forecast-control">
    <div className="forecast-control-top"><label htmlFor={id}>{title}</label><div className="forecast-number-input"><input aria-label={`${title}, valor numérico`} type="number" min={min} max={max} step={step} value={Number(value.toFixed(2))} onChange={e => { if (e.target.value === "") return; const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(n, min, max)); }} /><span>{suffix}</span></div></div>
    <input id={id} className="forecast-slider" type="range" min={min} max={max} step={step} value={value} style={{ "--forecast-fill": `${(value - min) / (max - min) * 100}%` } as React.CSSProperties} onChange={e => onChange(Number(e.target.value))} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`}>{description}</p>
  </div>;
}

function Probability({ value, simulations, kind }: { value: number | null; simulations: number; kind: ModelData["kind"] }) {
  return <div className="forecast-probability">
    <span className="forecast-label">PROBABILIDADE CONDICIONAL</span>
    <strong>{value === null ? "—" : value > 99.9 ? ">99,9" : value < 0.1 ? "<0,1" : percent(value)}{value !== null && <small>%</small>}</strong>
    <span className="forecast-probability-caption">de superar 50% dos votos válidos</span>
    <p>{value === null ? "Cálculo pausado até haver uma base válida." : <>Entre {number(simulations)} cenários simulados.<br />{kind === "scenario" ? "Depende das hipóteses que você escolheu." : "Condicionada aos parâmetros e aos dados atuais."}</>}</p>
    <span className="forecast-experimental"><span />Modelo experimental · não calibrado</span>
  </div>;
}

function ProjectionResults({ projection, candidate, opponent, blockedReason, scenario }: { projection: Projection | null; candidate: Candidate | undefined; opponent: Candidate | undefined; blockedReason: string; scenario: boolean }) {
  const available = projection?.status === "ready" && projection.expectedShare !== null;
  const share = available ? projection.expectedShare : null;
  const range = available ? projection.interval95 : null;
  const votes = available ? projection.projectedVotes : null;
  const official = projection?.status === "official";
  return <section className="forecast-result-card" aria-label="Resultado do cenário condicional" aria-live="polite" aria-atomic="true">
    <div className="forecast-card-heading"><div><span className="forecast-label">{official ? "CONTAGEM CONCLUÍDA" : "CENÁRIO CONDICIONAL"}</span><h2>{official ? "Apuração encerrada" : "O que as hipóteses desenham"}</h2></div><span className="forecast-card-mark"><FlaskConical size={19} /></span></div>
    <div className="forecast-output-grid">
      <div className="forecast-vote-estimate"><span className="forecast-target"><i />{candidate ? nice(candidate.name) : "Candidato selecionado"} <small>{candidate?.number}</small></span><div className="forecast-share"><strong>{share === null ? "—" : percent(share)}{share !== null && <small>%</small>}</strong><span>dos votos válidos ao final<br /><b>{scenario ? "no cenário escolhido" : "estimativa central"}</b></span></div>
        <div className="forecast-interval"><span>Faixa de 95% dos cenários</span><b>{range ? `${percent(range[0])}% a ${percent(range[1])}%` : "—"}</b></div>
        <div className="forecast-range-chart" role="img" aria-label={range && share !== null ? `Média de ${percent(share)} por cento. Faixa de 95 por cento dos cenários entre ${percent(range[0])} e ${percent(range[1])} por cento. Não é garantia de cobertura.` : "Faixa indisponível"}><div className="forecast-range-rail"><i className="forecast-majority-line" />{range && share !== null && <><span className="forecast-range-band" style={{ left: `${range[0]}%`, width: `${range[1] - range[0]}%` }} /><b className="forecast-range-point" style={{ left: `${share}%` }} /></>}</div><div className="forecast-range-axis"><span>0%</span><span>50% · maioria</span><span>100%</span></div></div>
      </div>
      <Probability value={available ? projection.winProbability : null} simulations={projection?.simulations || 0} kind={projection?.kind || null} />
    </div>
    {!available && <div className="forecast-paused"><Info size={17} /><div><strong>{official ? "Consulte o resultado oficial no painel de apuração." : "Cenários temporariamente indisponíveis"}</strong><p>{blockedReason || projection?.reason || "Carregando as bases do primeiro e segundo turnos."}</p></div></div>}
    <div className="forecast-vote-totals"><div><span><i />{candidate ? nice(candidate.name) : "Candidato"}</span><strong>{votes ? number(votes.candidate) : "—"}<small> votos no cenário</small></strong></div><div><span><i />{opponent ? nice(opponent.name) : "Adversário"}</span><strong>{votes ? number(votes.opponent) : "—"}<small> votos no cenário</small></strong></div><div><span>Total válido modelado</span><strong>{votes ? number(votes.total) : "—"}<small> Brasil + exterior</small></strong></div></div>
    <div className="forecast-result-note"><CircleHelp size={14} /><p>{scenario ? "Antes dos primeiros votos, estes números exploram suas escolhas. Não constituem uma previsão da eleição." : "A faixa e a probabilidade descrevem as simulações do modelo. A incerteza foi escolhida por hipótese, sem calibração histórica."}</p></div>
  </section>;
}

export default function ForecastPanel({ turn, autoRefresh = true }: { turn: number; autoRefresh?: boolean }) {
  const [data, setData] = useState<ModelData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(0);
  const [method, setMethod] = useState<Method>("regional");
  const [candidateNumber, setCandidateNumber] = useState("22");
  const [params, setParams] = useState(defaults);
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (turn !== 2) return;
    let active = true;
    let sequence = 0;
    let controller: AbortController | null = null;
    async function load() {
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      setRefreshing(true);
      try {
        const response = await fetch("/api/model-data?turn=2", { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as Partial<ModelData> & { error?: string };
        if (!response.ok) throw new Error(body?.error || "Não foi possível consultar as bases oficiais.");
        if (!body || !["ready", "waiting", "unavailable"].includes(body.status || "") || !Array.isArray(body.units) || !body.diagnostics || typeof body.checkedAt !== "number") throw new Error("A leitura das bases está incompleta. O cálculo foi pausado.");
        if (!active || request !== sequence) return;
        setData(body as ModelData);
        setError("");
        setNow(Date.now());
      } catch (cause) {
        if (!active || request !== sequence || (cause instanceof Error && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "Não foi possível atualizar as bases do modelo.");
      } finally {
        if (active && request === sequence) { setLoading(false); setRefreshing(false); }
      }
    }
    loadRef.current = load;
    load();
    const clock = window.setInterval(() => setNow(Date.now()), 5000);
    return () => { active = false; sequence++; controller?.abort(); if (loadRef.current === load) loadRef.current = null; window.clearInterval(clock); };
  }, [turn, reload]);

  useEffect(() => {
    if (turn !== 2 || !autoRefresh) return;
    const interval = window.setInterval(() => { if (!document.hidden) loadRef.current?.(); }, 60000);
    return () => window.clearInterval(interval);
  }, [turn, autoRefresh]);

  const candidates = data?.nation?.candidates || [];
  const candidate = candidates.find(c => c.number === candidateNumber) || candidates.find(c => c.number === "22") || candidates[0];
  const opponent = candidates.find(c => c.number !== candidate?.number);
  const selection = candidate?.number || candidateNumber;
  const aged = !!data && !!now && now - data.checkedAt > 120000;
  const blockedReason = error || (aged ? "A última consulta tem mais de dois minutos. Atualize a base para retomar o cálculo." : data?.status === "unavailable" ? data.reason : "");
  const projections = useMemo(() => {
    if (!data || blockedReason || turn !== 2) return null;
    try {
      // Revalidate source ages against the live clock, even when no new response
      // has arrived. The individual snapshots retain their real checkedAt values.
      const liveData = { ...data, checkedAt: Math.max(data.checkedAt, now) };
      const run = (selectedMethod: Method) => projectScenario(liveData, { method: selectedMethod, candidateNumber: selection, ...params }) as unknown as Projection;
      return { regional: run("regional"), uniform: run("uniform"), proportional: run("proportional") };
    } catch {
      return null;
    }
  }, [data, blockedReason, turn, selection, params, now]);
  const projection = projections?.[method] || null;
  const paused = !!blockedReason || projection?.status === "unavailable";
  const scenario = data?.kind === "scenario" || data?.status === "waiting";
  const currentMethod = methods.find(item => item.id === method)!;
  const update = (name: keyof typeof defaults, value: number) => setParams(previous => ({ ...previous, [name]: value }));
  const date = data ? new Date(data.checkedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null;
  const issues = [...new Set([...(data?.diagnostics.issues || []), ...(projection?.diagnostics.issues || [])])];

  if (turn !== 2) return <div className="forecast-panel"><section className="forecast-first-round"><span className="forecast-icon"><FlaskConical size={27} /></span><span className="forecast-label">LABORATÓRIO DE MODELOS</span><h2>Do primeiro turno ao cenário final.</h2><p>Este laboratório compara os dois finalistas da eleição presidencial. Selecione o <strong>2º turno</strong> no topo para explorar transferências de votos, diferenças regionais e cenários de votação.</p><div className="forecast-first-formula"><span>A conta do 1º turno continua no painel</span><b>Votos do líder &gt; votos dos demais + máximo restante</b><p>Essa condição garante maioria absoluta mesmo no pior cenário. A análise aritmética é independente dos modelos experimentais.</p></div></section></div>;

  return <div className="forecast-panel">
    <header className="forecast-header"><div><div className="forecast-header-pills"><span className="forecast-pill"><FlaskConical size={13} />Cenário condicional</span><span className="forecast-unvalidated">Modelo experimental · não calibrado</span></div><h1>Explore o que ainda pode acontecer.</h1><p>{scenario ? "Explorador de cenários · segundo turno ainda sem votos" : "Hipóteses explícitas. Três métodos. Um cenário que você pode explorar."}</p></div><button className="forecast-refresh" disabled={refreshing} onClick={() => setReload(value => value + 1)}><RefreshCw size={14} className={refreshing ? "forecast-spinning" : ""} />{refreshing ? "Consultando…" : "Atualizar base"}</button></header>

    <div className={`forecast-data-status ${paused ? "forecast-data-error" : ""}`} role="status"><span className="forecast-status-dot" /><span>{loading && !data ? "Buscando os dados oficiais dos dois turnos…" : paused ? "Cálculo pausado · base precisa de nova validação" : projection?.status === "official" ? "Totalização encerrada · probabilidades suspensas" : scenario ? "Base oficial do 1º turno + parâmetros do cenário" : "Base oficial por UF + parcial atual do 2º turno"}</span>{date && <small>Consulta às {date} · Brasília</small>}</div>

    <div className="forecast-workspace"><aside className="forecast-settings"><div className="forecast-settings-title"><div><span className="forecast-label">SUAS HIPÓTESES</span><h2>Monte o cenário</h2></div><SlidersHorizontal size={19} /></div>
      <div className="forecast-candidate-selector"><label htmlFor="forecast-candidate">Candidato analisado</label><div><select id="forecast-candidate" value={selection} disabled={!candidates.length} onChange={e => setCandidateNumber(e.target.value)}>{!candidates.length ? <option value={candidateNumber}>Aguardando candidaturas</option> : candidates.map(c => <option key={c.number} value={c.number}>{nice(c.name)} · {c.number}</option>)}</select><ChevronDown size={15} /></div></div>
      <div className="forecast-method-selector"><label>Método de distribuição</label><div role="group" aria-label="Método de distribuição dos votos restantes">{methods.map(item => <button key={item.id} aria-pressed={method === item.id} className={method === item.id ? "forecast-method-active" : ""} onClick={() => setMethod(item.id)}>{item.title}</button>)}</div><p>{currentMethod.description}</p></div>
      <RangeControl title="Transferência dos eliminados" description={`${percent(params.transferPercent, 0)}% dos votos do 1º turno dos eliminados vão para ${candidate ? nice(candidate.name) : "o candidato"}; o restante, ao adversário.`} value={params.transferPercent} min={0} max={100} step={1} suffix="%" onChange={value => update("transferPercent", value)} />
      <RangeControl title="Volume de votos válidos" description="Ajusta a taxa de votos válidos por eleitor do 1º turno. A taxa atualizada pela parcial é aplicada apenas aos eleitores ainda não contabilizados." value={params.turnoutFactor * 100} min={85} max={110} step={1} suffix="%" onChange={value => update("turnoutFactor", value / 100)} />
      <RangeControl title="Swing nacional" description="Deslocamento adicional a favor do candidato analisado. Valor negativo favorece o adversário." value={params.nationalSwing} min={-10} max={10} step={0.1} suffix="p.p." onChange={value => update("nationalSwing", value)} />
      <RangeControl title="Incerteza assumida" description="Escala do erro compartilhado nas simulações. É uma hipótese editável, sem calibração histórica." value={params.uncertaintyPoints} min={0.5} max={5} step={0.1} suffix="p.p." onChange={value => update("uncertaintyPoints", value)} />
      <button className="forecast-reset" onClick={() => { setParams(defaults); setMethod("regional"); }}><RotateCcw size={13} />Restaurar hipóteses iniciais</button>
    </aside><div className="forecast-results-column"><ProjectionResults projection={projection} candidate={candidate} opponent={opponent} blockedReason={blockedReason || (!loading && data && !projections ? "Não foi possível executar os cenários com a base atual." : data?.reason || "")} scenario={scenario} />
      <section className="forecast-comparison"><div className="forecast-card-heading"><div><span className="forecast-label">MESMAS HIPÓTESES, OUTRAS LENTES</span><h2>Compare os três métodos</h2></div><span className="forecast-small-tag">{number(projection?.simulations || 4000)} cenários / método</span></div><div className="forecast-method-cards">{methods.map(item => { const result = projections?.[item.id]; const ready = result?.status === "ready" && result.expectedShare !== null; return <button key={item.id} className={`forecast-method-card ${method === item.id ? "forecast-method-card-active" : ""}`} aria-pressed={method === item.id} onClick={() => setMethod(item.id)}><span>{item.title}<ArrowRight size={13} /></span><small>{item.short}</small><strong>{ready ? percent(result.expectedShare!) : "—"}{ready && <em>%</em>}</strong><p>votação central de {candidate ? nice(candidate.name) : "seu candidato"}</p><div><span>Chance condicional</span><b>{ready && result.winProbability !== null ? result.winProbability > 99.9 ? ">99,9%" : result.winProbability < 0.1 ? "<0,1%" : `${percent(result.winProbability)}%` : "—"}</b></div></button>; })}</div><p className="forecast-comparison-note">{scenario && "Antes dos primeiros votos, os métodos coincidem com swing adicional zero: ainda não há um sinal observado para diferenciá-los. "}A concordância entre métodos não valida a probabilidade. Eles compartilham a mesma base e as mesmas hipóteses de erro.</p></section>
    </div></div>

    <section className="forecast-explanation"><div className="forecast-explanation-intro"><span className="forecast-icon"><CircleHelp size={23} /></span><div><span className="forecast-label">A CONTA FICA À VISTA</span><h2>O que entra em cada cenário</h2><p>Votos já apurados permanecem fixos. Os parâmetros alteram apenas o volume e a distribuição modelados para os votos pendentes.</p></div></div><div className="forecast-explanation-grid"><div><b>01</b><h3>Base por estado</h3><p>O 1º turno fornece a referência de cada UF. Os votos dos eliminados são redistribuídos pela hipótese escolhida.</p></div><div><b>02</b><h3>Sinal da apuração</h3><p>Quando houver votos no 2º turno, os métodos usam a parcial para ajustar a distribuição do que ainda falta.</p></div><div><b>03</b><h3>Milhares de caminhos</h3><p>As simulações variam o cenário com erros compartilhados entre UFs. A chance exibida é a frequência de vitória dentro delas.</p></div></div>
      <details className="forecast-assumptions"><summary>Hipóteses, cobertura e limitações <ChevronDown size={15} /></summary><div><p><strong>Não há calibração histórica.</strong> Não interpretamos uma chance de 80% como taxa de acerto validada. A faixa de 95% também descreve apenas o conjunto de simulações produzido pelo modelo.</p><p><strong>Referência metodológica.</strong> Os métodos de swing e transferência são inspirados em simuladores eleitorais, com uma implementação própria para explorar cenários presidenciais. Não reproduzimos nem atribuímos validação ao modelo de terceiros.</p>{projection?.assumptions?.length ? <ul>{projection.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul> : <p>As hipóteses detalhadas aparecem quando uma base consistente estiver disponível.</p>}<div className="forecast-coverage"><span>UFs + exterior usadas <b>{projection?.diagnostics.units ?? data?.units.length ?? "—"}</b></span><span>Base reconciliada <b>{data ? data.diagnostics.reconciled ? "Sim" : "Não" : "—"}</b></span><span>Validação retrospectiva <b>Não realizada</b></span></div>{issues.length > 0 && <div className="forecast-diagnostics"><strong>Diagnósticos da base</strong><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}{!!data?.diagnostics.missingScopes.length && <p>Leituras ausentes: {data.diagnostics.missingScopes.map(scope => scope.toUpperCase()).join(", ")}.</p>}<p>A definição de vantagem matematicamente irreversível é feita separadamente, na aba de apuração. Falhas, bases antigas, pendências ou totalização final suspendem as probabilidades experimentais.</p><a href="https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados" target="_blank" rel="noreferrer">Documentação dos dados oficiais do TSE <ArrowRight size={13} /></a></div></details>
    </section>
  </div>;
}

