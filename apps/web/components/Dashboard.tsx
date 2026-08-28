"use client";

import { useEffect, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, BrainCircuit, Check,
  ChevronRight, CircleDollarSign, Clock3, Gauge, Landmark, LockKeyhole, Pause,
  Play, Radio, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, TrendingUp,
  TriangleAlert, Wifi, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AGENT_ORDER, RISK_CONSTITUTION } from "@/lib/constants";
import { applyReplayMutation, initialState, replayScenario } from "@/lib/engine/replay";
import { trustDirection } from "@/lib/engine/governor";
import type { Agent, DecisionEvent, SimulationState } from "@/lib/types";

type Tab = "mission" | "decision" | "replay";

const money = (value: number, compact = false) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: compact ? 0 : 2,
  notation: compact ? "compact" : "standard",
}).format(value);

const signedMoney = (value: number) => `${value >= 0 ? "+" : "-"}${money(Math.abs(value))}`;
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function StatusPill({ status }: { status: Agent["status"] }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}><span />{status}</span>;
}

function MetricCard({ label, value, detail, tone = "neutral", icon: Icon }: {
  label: string; value: string; detail: string; tone?: "neutral" | "positive" | "warning"; icon: React.ElementType;
}) {
  return <article className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={17} /></div>
    <div><p className="eyebrow">{label}</p><strong>{value}</strong><span className={tone}>{detail}</span></div>
  </article>;
}

function AgentRow({ agent, selected, onSelect }: { agent: Agent; selected: boolean; onSelect: () => void }) {
  const direction = trustDirection(agent);
  return <button className={`agent-row ${selected ? "selected" : ""}`} onClick={onSelect}>
    <span className="agent-avatar" style={{ "--agent-color": agent.color } as React.CSSProperties}>{agent.shortName}</span>
    <span className="agent-main"><strong>{agent.name}</strong><small>{agent.mandate}</small></span>
    <span className="agent-trust"><span className="trust-value">{agent.trust}</span>
      {direction === "up" ? <ArrowUpRight size={14} className="up" /> : direction === "down" ? <ArrowDownRight size={14} className="down" /> : <span className="flat">—</span>}
      <small>TRUST</small>
    </span>
    <span className="agent-allocation"><strong>{money(agent.allocation, true)}</strong><small>CAPITAL</small></span>
    <StatusPill status={agent.status} />
    <ChevronRight size={15} className="row-chevron" />
  </button>;
}

function TimelineItem({ event, active, onClick }: { event: DecisionEvent; active: boolean; onClick: () => void }) {
  return <button className={`timeline-item kind-${event.kind} ${active ? "active" : ""}`} onClick={onClick}>
    <span className="timeline-time">{event.marketTime}</span><span className="timeline-node" />
    <span className="timeline-copy"><strong>{event.title}</strong><small>{event.detail}</small></span>
  </button>;
}

function ConstitutionModal({ onClose }: { onClose: () => void }) {
  const rules = [
    ["Risk / trade", `${RISK_CONSTITUTION.maxRiskPerTradePct}%`], ["Max position", `${RISK_CONSTITUTION.maxPositionPct}%`],
    ["Sector exposure", `${RISK_CONSTITUTION.maxSectorExposurePct}%`], ["Agent capital", `${RISK_CONSTITUTION.maxAgentCapitalPct}%`],
    ["Daily loss", `${RISK_CONSTITUTION.maxDailyLossPct}%`], ["Portfolio drawdown", `${RISK_CONSTITUTION.maxPortfolioDrawdownPct}%`],
  ];
  return <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
    <section className="constitution-modal" role="dialog" aria-modal="true" aria-labelledby="constitution-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close constitution"><X size={18} /></button>
      <div className="constitution-seal"><LockKeyhole size={25} /></div>
      <p className="eyebrow accent">IMMUTABLE POLICY LAYER</p>
      <h2 id="constitution-title">Risk Constitution</h2>
      <p>Agents may reason. The Governor may allocate. Neither can change these limits or bypass a veto.</p>
      <div className="rule-grid">{rules.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="required-list">
        <strong>Every order requires</strong>
        {["Fresh market data", "Confidence + evidence", "Protective stop", "Buying power"].map((rule) => <span key={rule}><Check size={14} />{rule}</span>)}
      </div>
      <div className="locked-banner"><ShieldCheck size={18} /><span><strong>CONSTITUTION LOCKED</strong> · AI override disabled</span></div>
    </section>
  </div>;
}

function GovernorBriefing({ state }: { state: SimulationState }) {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<{ headline: string; summary: string; posture?: string; mode?: string } | null>(null);
  const askGovernor = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        regime: state.regime,
        portfolio: { value: state.portfolioValue, pnlPct: state.todayPnlPct, drawdown: state.drawdown, cashPct: state.cashAllocation },
        lastDecision: state.lastDecision,
        agents: AGENT_ORDER.map((id) => { const a = state.agents[id]; return { name: a.name, trust: a.trust, status: a.status, allocation: a.allocation }; }),
      }) });
      const data = await response.json();
      setBriefing({ ...data.briefing, mode: data.mode });
    } catch {
      setBriefing({ headline: state.lastDecision.headline, summary: state.lastDecision.summary, mode: "offline" });
    } finally { setLoading(false); }
  };
  return <div className="governor-briefing">
    <div className="decision-label"><BrainCircuit size={16} /><span>GOVERNOR BRIEFING</span><i>REASONING ONLY</i></div>
    <h3>{briefing?.headline ?? state.lastDecision.headline}</h3>
    <p>{briefing?.summary ?? state.lastDecision.summary}</p>
    <div className="reason-chips">{state.lastDecision.reasons.map((reason) => <span key={reason}><Check size={12} />{reason}</span>)}</div>
    <button className="text-button" onClick={askGovernor} disabled={loading}><Sparkles size={14} />{loading ? "Synthesizing…" : briefing ? `Briefed · ${briefing.mode}` : "Ask AI Auditor"}</button>
  </div>;
}

function MissionControl({ state, selectedAgent, setSelectedAgent, setSelectedEvent }: {
  state: SimulationState; selectedAgent: string; setSelectedAgent: (id: string) => void; setSelectedEvent: (event: DecisionEvent) => void;
}) {
  const agents = AGENT_ORDER.map((id) => state.agents[id]);
  const allocationData = [...agents.map((agent) => ({ name: agent.shortName, value: agent.allocation, color: agent.color })), { name: "CASH", value: state.portfolioValue * (state.cashAllocation / 100), color: "#596071" }];
  return <>
    <section className="metrics-grid">
      <MetricCard label="PORTFOLIO VALUE" value={money(state.portfolioValue)} detail={`${pct(state.todayPnlPct)} today`} tone={state.todayPnl >= 0 ? "positive" : "warning"} icon={CircleDollarSign} />
      <MetricCard label="TODAY'S P&L" value={signedMoney(state.todayPnl)} detail={`${state.timeline.length - 1} governed events`} tone={state.todayPnl >= 0 ? "positive" : "warning"} icon={TrendingUp} />
      <MetricCard label="DRAWDOWN" value={`-${state.drawdown.toFixed(2)}%`} detail={`5.00% hard limit`} tone={state.drawdown >= 4 ? "warning" : "neutral"} icon={Gauge} />
      <MetricCard label="BUYING POWER" value={money(state.buyingPower, true)} detail={`${state.cashAllocation}% held in reserve`} icon={Landmark} />
    </section>

    <section className="mission-grid">
      <article className="panel equity-panel">
        <div className="panel-heading"><div><p className="eyebrow">PORTFOLIO TELEMETRY</p><h2>Equity curve</h2></div><span className="live-indicator"><span />REPLAY DATA</span></div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={state.equityCurve} margin={{ left: 2, right: 8, top: 12, bottom: 0 }}>
            <defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#adff2f" stopOpacity={0.3}/><stop offset="90%" stopColor="#adff2f" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid stroke="#242936" vertical={false} strokeDasharray="3 6" />
            <XAxis dataKey="time" tick={{ fill: "#71798b", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18}/>
            <YAxis domain={["dataMin - 500", "dataMax + 500"]} hide />
            <ReferenceLine y={100000} stroke="#4d5565" strokeDasharray="3 5" />
            <Tooltip contentStyle={{ background: "#12151d", border: "1px solid #343b4b", borderRadius: 8, fontSize: 12 }} formatter={(value) => [money(Number(value)), "Equity"]}/>
            <Area type="monotone" dataKey="value" stroke="#adff2f" strokeWidth={2.2} fill="url(#equityFill)" animationDuration={500}/>
          </AreaChart></ResponsiveContainer>
        </div>
      </article>

      <article className="panel regime-panel">
        <div className="regime-orbit"><div className="orbit-ring"/><div><span>{state.regime.confidence}%</span><small>CONFIDENCE</small></div></div>
        <p className="eyebrow">CURRENT MARKET REGIME</p><h2>{state.regime.label}</h2>
        <div className="regime-meta"><span><Activity size={14}/>VOLATILITY <strong className={state.regime.volatility === "HIGH" ? "warning-text" : ""}>{state.regime.volatility}</strong></span><span><Radio size={14}/>AS OF <strong>{state.marketTime} ET</strong></span></div>
        <p>{state.regime.summary}</p>
      </article>

      <article className="panel workforce-panel">
        <div className="panel-heading"><div><p className="eyebrow">AI WORKFORCE</p><h2>Capital authority</h2></div><span className="panel-count">{agents.filter((a) => a.status === "ACTIVE").length} ACTIVE</span></div>
        <div className="agents-list">{agents.map((agent) => <AgentRow key={agent.id} agent={agent} selected={selectedAgent === agent.id} onSelect={() => setSelectedAgent(agent.id)} />)}</div>
      </article>

      <article className="panel allocation-panel">
        <div className="panel-heading"><div><p className="eyebrow">ALLOCATION MAP</p><h2>Capital by mandate</h2></div><span className="mono-note">MAX 35% / AGENT</span></div>
        <div className="allocation-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={allocationData} layout="vertical" margin={{ left: -12, right: 24, top: 4, bottom: 4 }}>
          <XAxis type="number" hide/><YAxis type="category" dataKey="name" tick={{ fill: "#969daf", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={48}/>
          <Tooltip cursor={{ fill: "#1b1f29" }} contentStyle={{ background: "#12151d", border: "1px solid #343b4b", borderRadius: 8, fontSize: 12 }} formatter={(value) => money(Number(value))}/>
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={11}>{allocationData.map((item) => <Cell key={item.name} fill={item.color}/>)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </article>

      <article className="panel decision-panel"><GovernorBriefing state={state} /></article>

      <article className="panel feed-panel">
        <div className="panel-heading"><div><p className="eyebrow">AUDIT LEDGER</p><h2>Decision feed</h2></div><span className="live-indicator"><span />IMMUTABLE</span></div>
        <div className="timeline-list">{state.timeline.slice(-5).reverse().map((event, index) => <TimelineItem key={event.id} event={event} active={index === 0} onClick={() => setSelectedEvent(event)} />)}</div>
      </article>
    </section>
  </>;
}

function DecisionRoom({ state, selectedEvent, setSelectedEvent }: { state: SimulationState; selectedEvent: DecisionEvent; setSelectedEvent: (event: DecisionEvent) => void }) {
  const stages = [
    { label: "SPECIALISTS", icon: Bot, detail: "Structured proposals", state: "done" },
    { label: "GOVERNOR", icon: BrainCircuit, detail: "Rank + allocate", state: "done" },
    { label: "RISK GUARDIAN", icon: ShieldCheck, detail: "Constitutional gate", state: selectedEvent.kind === "veto" ? "blocked" : "done" },
    { label: "ALPACA PAPER", icon: Zap, detail: selectedEvent.kind === "veto" ? "Not submitted" : "Execution adapter", state: selectedEvent.kind === "veto" ? "idle" : "done" },
    { label: "AUDITOR", icon: Activity, detail: "Score outcome", state: "active" },
  ];
  return <section className="decision-room">
    <article className="panel pipeline-panel">
      <div className="panel-heading"><div><p className="eyebrow">AUTONOMOUS DECISION LOOP</p><h2>Authority is separated by design</h2></div><span className="locked-mini"><LockKeyhole size={13}/> POLICY LOCKED</span></div>
      <div className="pipeline">{stages.map((stage, index) => <div className="pipeline-fragment" key={stage.label}><div className={`pipeline-stage ${stage.state}`}><stage.icon size={21}/><span><strong>{stage.label}</strong><small>{stage.detail}</small></span>{stage.state === "blocked" ? <X size={16}/> : stage.state === "done" ? <Check size={16}/> : <span className="stage-pulse"/>}</div>{index < stages.length - 1 && <ArrowRight size={18} className="pipeline-arrow"/>}</div>)}</div>
    </article>
    <div className="decision-columns">
      <article className="panel ledger-panel">
        <div className="panel-heading"><div><p className="eyebrow">SELECT AN EVENT</p><h2>Decision ledger</h2></div><span className="panel-count">{state.timeline.length} EVENTS</span></div>
        <div className="full-ledger">{state.timeline.slice().reverse().map((event) => <TimelineItem key={event.id} event={event} active={event.id === selectedEvent.id} onClick={() => setSelectedEvent(event)} />)}</div>
      </article>
      <article className={`panel inspector-panel inspector-${selectedEvent.kind}`}>
        <div className="inspector-top"><span className={`event-badge ${selectedEvent.kind}`}>{selectedEvent.kind === "veto" ? <ShieldCheck size={15}/> : <Activity size={15}/>} {selectedEvent.kind.toUpperCase()}</span><span className="mono-note">{selectedEvent.marketTime} ET · {selectedEvent.id.toUpperCase()}</span></div>
        <h2>{selectedEvent.title}</h2><p className="inspector-detail">{selectedEvent.detail}</p>
        {(selectedEvent.symbol || selectedEvent.amount) && <div className="event-stats">{selectedEvent.symbol && <div><span>SYMBOL</span><strong>{selectedEvent.symbol}</strong></div>}{selectedEvent.amount && <div><span>CAPITAL</span><strong>{money(selectedEvent.amount)}</strong></div>}<div><span>AGENT</span><strong>{selectedEvent.agentId ? state.agents[selectedEvent.agentId].shortName : "SYSTEM"}</strong></div></div>}
        <div className="evidence-box"><span>DECISION EVIDENCE</span>{(selectedEvent.reasoning ?? ["Signed event record", "Deterministic policy evaluation", "State transition logged"]).map((item) => <p key={item}><Check size={14}/>{item}</p>)}</div>
        {selectedEvent.kind === "veto" && <div className="veto-banner"><TriangleAlert size={20}/><div><strong>EXECUTION BLOCKED</strong><span>The Governor and every specialist agent are subordinate to the Risk Constitution.</span></div></div>}
        <div className="hash-line"><LockKeyhole size={12}/><span>AUDIT HASH</span><code>AG-{selectedEvent.id.toUpperCase()}-{selectedEvent.marketTime.replace(":", "")}</code></div>
      </article>
    </div>
  </section>;
}

function ReplayLab({ state, isRunning, onToggle, onReset, onStep }: { state: SimulationState; isRunning: boolean; onToggle: () => void; onReset: () => void; onStep: () => void }) {
  const progress = (state.replayIndex / replayScenario.length) * 100;
  return <section className="replay-lab">
    <article className="replay-hero panel">
      <div className="replay-copy"><p className="eyebrow accent">KILLER DEMO · 50× MARKET REPLAY</p><h1>Watch capital authority<br/><em>change hands.</em></h1><p>A complete autonomous session in under one minute: proposal, risk veto, paper execution, failure, probation, audit, and reallocation.</p>
        <div className="replay-actions"><button className="primary-button" onClick={onToggle}>{isRunning ? <Pause size={17}/> : <Play size={17}/>} {isRunning ? "Pause replay" : state.replayIndex === replayScenario.length ? "Replay complete" : "Run the market"}</button><button className="secondary-button" onClick={onReset}><RotateCcw size={16}/> Reset</button><button className="secondary-button" onClick={onStep} disabled={isRunning || state.replayIndex >= replayScenario.length}>Step <ChevronRight size={16}/></button></div>
      </div>
      <div className="replay-clock"><span>MARKET TIME</span><strong>{state.marketTime}</strong><small>50× ACCELERATED</small><div className="speed-lines"><i/><i/><i/><i/></div></div>
    </article>
    <article className="panel replay-track-panel">
      <div className="track-header"><span>09:30 · OPEN</span><strong>{Math.round(progress)}% SESSION COMPLETE</strong><span>12:15 · AUDIT</span></div>
      <div className="replay-progress"><i style={{ width: `${progress}%` }}/>{replayScenario.map((step, index) => <button key={step.event.id} title={step.event.title} className={`${index < state.replayIndex ? "complete" : ""} ${index === state.replayIndex - 1 ? "current" : ""}`} style={{ left: `${((index + 1) / replayScenario.length) * 100}%` }}><span>{step.event.marketTime}</span></button>)}</div>
      <div className="scenario-grid">{replayScenario.map((step, index) => <div key={step.event.id} className={`scenario-step kind-${step.event.kind} ${index < state.replayIndex ? "revealed" : ""}`}><span>{index + 1}</span><div><small>{step.event.marketTime}</small><strong>{step.event.title}</strong></div>{index < state.replayIndex && <Check size={15}/>}</div>)}</div>
    </article>
    <div className="demo-proof-grid">
      {[{ icon: Bot, title: "Competing specialists", copy: "Independent agents submit standardized proposals." }, { icon: ShieldCheck, title: "Visible risk veto", copy: "A $20K TSLA request is blocked on concentration." }, { icon: TriangleAlert, title: "Agent probation", copy: "Confident failures reduce trust and capital authority." }, { icon: RefreshCcw, title: "Closed learning loop", copy: "Outcomes update reputation and allocation." }].map((item) => <article className="panel proof-card" key={item.title}><item.icon size={21}/><div><strong>{item.title}</strong><p>{item.copy}</p></div></article>)}
    </div>
  </section>;
}

export function Dashboard() {
  const [tab, setTab] = useState<Tab>("mission");
  const [state, setState] = useState<SimulationState>(() => structuredClone(initialState));
  const [isRunning, setIsRunning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("momentum");
  const [selectedEvent, setSelectedEvent] = useState<DecisionEvent>(initialState.timeline[0]);
  const [showConstitution, setShowConstitution] = useState(false);
  const [connection, setConnection] = useState<"checking" | "replay" | "paper">("checking");
  const [systemStatus, setSystemStatus] = useState<"RUNNING" | "PAUSED" | "RISK_OFF">("PAUSED");
  const [proofStatus, setProofStatus] = useState("READY");
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/system/status").then((response) => response.json()),
      fetch("/api/v1/account").then((response) => response.json()),
      fetch("/api/v1/agents").then((response) => response.json()),
      fetch("/api/v1/market/regime").then((response) => response.json()),
    ]).then(([system, account, agents, regime]) => {
      setConnection(system.data.realAlpaca ? "paper" : "replay");
      setSystemStatus(system.data.tradingStatus);
      setState((current) => {
        const next = structuredClone(current); const value = account.data.portfolioValue;
        next.portfolioValue = value; next.buyingPower = account.data.buyingPower;
        next.todayPnl = value - account.data.previousEquity;
        next.todayPnlPct = account.data.previousEquity ? next.todayPnl / account.data.previousEquity * 100 : 0;
        next.regime = { label: String(regime.data.regime).replaceAll("_", " "), confidence: Math.round(regime.data.confidence * 100), volatility: ["HIGH_VOL", "EVENT_SHOCK"].includes(regime.data.regime) ? "HIGH" : "MODERATE", summary: regime.data.explanation };
        const ids: Record<string, keyof SimulationState["agents"]> = { MOMENTUM: "momentum", NEWS: "news", MEAN_REVERSION: "reversion", DEFENSIVE: "defensive" };
        for (const remote of agents.data) {
          const id = ids[remote.type];
          if (id) Object.assign(next.agents[id], { trust: remote.trustScore, allocation: value * remote.allocationWeight, pnl: remote.pnlPct, winRate: remote.winRate * 100, drawdown: remote.maxDrawdownPct, calibration: remote.calibrationScore * 100, compatibility: remote.regimeCompatibility * 100, status: remote.status === "DISABLED" ? "SUSPENDED" : remote.status });
        }
        return next;
      });
    }).catch(() => setConnection("replay"));
    const events = new EventSource("/api/v1/events");
    events.onopen = () => setProofStatus("LIVE AUDIT"); events.onerror = () => setProofStatus("RECONNECTING");
    return () => events.close();
  }, []);
  useEffect(() => {
    if (!isRunning) return;
    if (state.replayIndex >= replayScenario.length) return;
    const mutation = replayScenario[state.replayIndex];
    const timer = window.setTimeout(() => {
      setState((current) => applyReplayMutation(current, mutation));
      setSelectedEvent(mutation.event);
      if (state.replayIndex === replayScenario.length - 1) setIsRunning(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [isRunning, state.replayIndex]);

  const reset = () => { setIsRunning(false); setState(structuredClone(initialState)); setSelectedEvent(initialState.timeline[0]); };
  const step = () => {
    if (state.replayIndex >= replayScenario.length) return;
    const mutation = replayScenario[state.replayIndex];
    setState((current) => applyReplayMutation(current, mutation));
    setSelectedEvent(mutation.event);
  };
  const toggle = () => {
    if (state.replayIndex >= replayScenario.length) { reset(); return; }
    if (!isRunning && state.replayIndex === 0) {
      setProofStatus("VERIFYING");
      void fetch("/api/control/replay", { method: "POST" }).then(async (response) => {
        if (!response.ok) throw new Error(await response.text()); setProofStatus("PROOF COMPLETE");
      }).catch(() => setProofStatus("UI DEMO"));
    }
    setIsRunning((value) => !value);
  };
  const killSwitch = () => {
    if (!window.confirm("Engage RISK_OFF and cancel all open paper orders?")) return;
    void fetch("/api/control/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "kill" }) })
      .then((response) => { if (!response.ok) throw new Error("Kill switch failed"); setSystemStatus("RISK_OFF"); })
      .catch(() => setProofStatus("KILL ERROR"));
  };
  const nav = [{ id: "mission" as const, label: "Mission Control", icon: Activity }, { id: "decision" as const, label: "Decision Room", icon: BrainCircuit }, { id: "replay" as const, label: "Replay Lab", icon: RefreshCcw }];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span>AG</span><div><strong>ALPHA</strong><em>GOVERNOR</em></div></div>
      <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id === "replay" && <i>50×</i>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="constitution-button" onClick={() => setShowConstitution(true)}><ShieldCheck size={20}/><span><strong>RISK CONSTITUTION</strong><small>LOCKED · 11 RULES</small></span><ChevronRight size={15}/></button><div className="paper-only"><LockKeyhole size={13}/><span>PAPER TRADING ONLY</span></div></div>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <div><p className="eyebrow">AUTONOMOUS CAPITAL COMMAND CENTER</p><h1>{nav.find((item) => item.id === tab)?.label}</h1></div>
        <div className="topbar-actions"><div className="market-clock"><Clock3 size={15}/><span><small>{proofStatus}</small><strong>{state.marketTime}:00 ET</strong></span></div><span className={`connection-badge ${connection}`}><Wifi size={14}/>{connection === "paper" ? "ALPACA PAPER" : connection === "checking" ? "CHECKING" : `${systemStatus} · REPLAY`}</span><button className="emergency-button" onClick={killSwitch}><TriangleAlert size={14}/>RISK OFF</button><button className="primary-button compact" onClick={() => { setTab("replay"); toggle(); }}>{isRunning ? <Pause size={15}/> : <Play size={15}/>} {isRunning ? "PAUSE" : "RUN 50×"}</button></div>
      </header>
      <div className="content-area">
        {tab === "mission" && <MissionControl state={state} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} setSelectedEvent={(event) => { setSelectedEvent(event); setTab("decision"); }} />}
        {tab === "decision" && <DecisionRoom state={state} selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent} />}
        {tab === "replay" && <ReplayLab state={state} isRunning={isRunning} onToggle={toggle} onReset={reset} onStep={step} />}
      </div>
      <footer><span>AlphaGovernor v2.0</span><span>Educational demo · Not investment advice</span><span><span className="footer-dot"/>{systemStatus}</span></footer>
    </div>
    {showConstitution && <ConstitutionModal onClose={() => setShowConstitution(false)} />}
  </main>;
}
