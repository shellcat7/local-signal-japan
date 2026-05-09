import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Database, Download, FileText, Search, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  findAreaSignal,
  getDefaultAreaSignal,
  getIndicatorEntries,
  listAreaOptions,
  neighborComparisons
} from "@local-signal-japan/core";
import { generateMarkdownReport } from "@local-signal-japan/reporting";
import type { AreaSignal } from "@local-signal-japan/schemas";
import { buildScoreBreakdown, calculateOverallScore, confidenceLabel } from "@local-signal-japan/scoring";
import { IndicatorCard, ScorePill } from "@local-signal-japan/ui";

const trendSeries = [
  { year: "2022", population: 58, land: 62, activity: 54 },
  { year: "2023", population: 62, land: 69, activity: 59 },
  { year: "2024", population: 66, land: 74, activity: 65 },
  { year: "2025", population: 70, land: 77, activity: 68 },
  { year: "2026", population: 72, land: 79, activity: 69 }
];

const policyItems = [
  { icon: ShieldCheck, label: "検索履歴を保存しない", detail: "MVPでは入力値を永続化しません。" },
  { icon: Database, label: "公開データの出典を表示", detail: "取得日・加工有無・mock区分をカード単位で示します。" },
  { icon: AlertTriangle, label: "断定表現を避ける", detail: "地域評価ではなく公開データ上の補助シグナルとして扱います。" }
];

function signalGroups(area: AreaSignal) {
  return [
    { label: "成長シグナル", items: area.summary.growthSignals, tone: "growth" },
    { label: "停滞シグナル", items: area.summary.stagnationSignals, tone: "flat" },
    { label: "要注意シグナル", items: area.summary.cautionSignals, tone: "caution" }
  ];
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatScore(score: number | null) {
  return score === null ? "欠損" : `${score}`;
}

export function App() {
  const [query, setQuery] = useState("13101");
  const [area, setArea] = useState<AreaSignal>(() => getDefaultAreaSignal());
  const [status, setStatus] = useState("架空データのみ表示中");
  const options = listAreaOptions();

  const indicatorEntries = useMemo(() => getIndicatorEntries(area), [area]);
  const scoreBreakdown = useMemo(() => buildScoreBreakdown(area), [area]);
  const overallScore = useMemo(() => calculateOverallScore(area), [area]);
  const report = useMemo(() => generateMarkdownReport(area), [area]);
  const evidenceCount = indicatorEntries.reduce((count, [, indicator]) => count + indicator.sources.length, 0);
  const radarData = scoreBreakdown.map((item) => ({
    label: item.label.replace("シグナル", "").replace("推移", ""),
    score: item.score ?? 0
  }));

  const metricTiles = [
    { label: "総合補助スコア", value: formatScore(overallScore), detail: "利用可能な指標のみで算出" },
    { label: "指標数", value: `${indicatorEntries.length}`, detail: "人口・地価・法人活動など" },
    { label: "出典表示", value: `${evidenceCount}`, detail: "カード単位で確認可能" },
    { label: "信頼度メモ", value: confidenceLabel(area.summary.confidence), detail: "mock接続の暫定評価" }
  ];

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextArea = findAreaSignal(query);

    if (nextArea) {
      setArea(nextArea);
      setStatus(`${nextArea.prefectureName} ${nextArea.areaName} / mock`);
      return;
    }

    setStatus("該当するデモ自治体がないため、初期データを表示中");
    setArea(getDefaultAreaSignal());
  };

  const routeLabel = window.location.pathname === "/demo" ? "/demo" : "preview";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="route-label">{routeLabel}</p>
          <h1>Local Signal Japan</h1>
          <p className="header-copy">公開データ上の補助シグナルを、根拠と欠損メモごと確認します。</p>
        </div>
        <div className="header-badges" aria-label="データ状態">
          <span>demo</span>
          <span>mock data</span>
          <span>no history</span>
        </div>
      </header>

      <section className="command-band">
        <form className="search-panel" onSubmit={submitSearch}>
          <label htmlFor="area-query">市区町村名・自治体コード</label>
          <div className="search-panel__row">
            <input
              id="area-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="13101 / 千代田区"
              autoComplete="off"
            />
            <button type="submit" title="検索">
              <Search size={18} aria-hidden="true" />
              <span>検索</span>
            </button>
          </div>
          <div className="option-row" aria-label="デモ自治体">
            {options.map((option) => (
              <button
                type="button"
                key={option.areaCode}
                className={option.areaCode === area.areaCode ? "option-chip is-active" : "option-chip"}
                onClick={() => {
                  setQuery(option.areaCode);
                  setArea(findAreaSignal(option.areaCode) ?? getDefaultAreaSignal());
                  setStatus(`${option.prefectureName} ${option.areaName} / mock`);
                }}
              >
                {option.areaName}
              </button>
            ))}
          </div>
        </form>

        <aside className="policy-panel" aria-label="公開前提の設計方針">
          {policyItems.map((item) => {
            const Icon = item.icon;
            return (
              <div className="policy-item" key={item.label}>
                <Icon size={18} aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            );
          })}
        </aside>
      </section>

      <section className="area-overview" aria-label="地域概要">
        <div className="area-title">
          <p>{area.prefectureName}</p>
          <h2>{area.areaName}</h2>
          <span>{status}</span>
        </div>
        <dl className="area-facts">
          <div>
            <dt>自治体コード</dt>
            <dd>{area.areaCode}</dd>
          </div>
          <div>
            <dt>取得日</dt>
            <dd>{area.retrievedAt}</dd>
          </div>
          <div>
            <dt>欠損メモ</dt>
            <dd>{area.summary.missingDataNotes.length}</dd>
          </div>
        </dl>
        <div className="metric-strip">
          {metricTiles.map((metric) => (
            <article className="metric-tile" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <section className="analysis-panel signal-panel">
          <div className="panel-head">
            <div>
              <p>signal review</p>
              <h2>公開データ上のシグナル</h2>
            </div>
            <TrendingUp size={18} aria-hidden="true" />
          </div>
          <div className="signal-columns">
            {signalGroups(area).map((group) => (
              <article className={`signal-box signal-box--${group.tone}`} key={group.label}>
                <h3>{group.label}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="analysis-panel chart-panel">
          <div className="panel-head">
            <div>
              <p>breakdown</p>
              <h2>スコア内訳</h2>
            </div>
            <ScorePill score={overallScore} />
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Radar dataKey="score" stroke="#236c62" fill="#8fd3c1" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="analysis-panel chart-panel">
          <div className="panel-head">
            <div>
              <p>mock index</p>
              <h2>時系列サンプル</h2>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9e2e7" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="population" name="人口" stroke="#2d6cdf" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="land" name="地価" stroke="#bf6a02" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activity" name="法人" stroke="#236c62" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </section>

      <section className="section-head">
        <div>
          <p>evidence cards</p>
          <h2>指標カード</h2>
        </div>
      </section>
      <section className="indicator-grid" aria-label="指標カード">
        {indicatorEntries.map(([, indicator]) => (
          <IndicatorCard key={indicator.label} indicator={indicator} />
        ))}
      </section>

      <section className="comparison-panel">
        <div className="panel-head">
          <div>
            <p>demo comparison</p>
            <h2>近隣自治体比較</h2>
          </div>
        </div>
        <div className="comparison-layout">
          <div className="chart-box chart-box--wide">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={neighborComparisons} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d9e2e7" />
                <XAxis dataKey="areaName" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="overallScore" name="総合補助スコア">
                  {neighborComparisons.map((neighbor) => (
                    <Cell key={neighbor.areaCode} fill={neighbor.isSelected ? "#236c62" : "#879caf"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table>
            <thead>
              <tr>
                <th>自治体</th>
                <th>人口</th>
                <th>地価</th>
                <th>活動</th>
                <th>総合</th>
              </tr>
            </thead>
            <tbody>
              {neighborComparisons.map((neighbor) => (
                <tr key={neighbor.areaCode} className={neighbor.isSelected ? "is-selected" : ""}>
                  <td>{neighbor.areaName}</td>
                  <td>{neighbor.populationScore}</td>
                  <td>{neighbor.landPriceScore}</td>
                  <td>{neighbor.activityScore}</td>
                  <td>{neighbor.overallScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-panel">
        <div className="panel-head">
          <div>
            <p>export</p>
            <h2>Markdownレポート</h2>
          </div>
          <button
            type="button"
            onClick={() => downloadText(`local-signal-${area.areaCode}.md`, report)}
            title="Markdownをダウンロード"
          >
            <Download size={18} aria-hidden="true" />
            <span>MD</span>
          </button>
        </div>
        <div className="report-body">
          <FileText size={18} aria-hidden="true" />
          <pre>{report}</pre>
        </div>
      </section>
    </main>
  );
}
