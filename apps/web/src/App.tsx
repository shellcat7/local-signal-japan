import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Download, FileText, Search } from "lucide-react";
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

export function App() {
  const [query, setQuery] = useState("13101");
  const [area, setArea] = useState<AreaSignal>(() => getDefaultAreaSignal());
  const [status, setStatus] = useState("架空データのみ表示中");
  const options = listAreaOptions();

  const scoreBreakdown = useMemo(() => buildScoreBreakdown(area), [area]);
  const overallScore = useMemo(() => calculateOverallScore(area), [area]);
  const report = useMemo(() => generateMarkdownReport(area), [area]);
  const radarData = scoreBreakdown.map((item) => ({
    label: item.label.replace("シグナル", ""),
    score: item.score ?? 0
  }));

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

  const routeLabel = window.location.pathname === "/demo" ? "/demo" : "local demo";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="route-label">{routeLabel}</p>
          <h1>Local Signal Japan</h1>
        </div>
        <div className="topbar__meta">
          <span>demo</span>
          <span>mock</span>
        </div>
      </header>

      <section className="workspace-band">
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

        <section className="summary-panel" aria-label="地域概要">
          <div className="summary-panel__title">
            <div>
              <p>{area.prefectureName}</p>
              <h2>{area.areaName}</h2>
            </div>
            <ScorePill score={overallScore} />
          </div>
          <dl className="summary-grid">
            <div>
              <dt>自治体コード</dt>
              <dd>{area.areaCode}</dd>
            </div>
            <div>
              <dt>取得日</dt>
              <dd>{area.retrievedAt}</dd>
            </div>
            <div>
              <dt>信頼度</dt>
              <dd>{confidenceLabel(area.summary.confidence)}</dd>
            </div>
            <div>
              <dt>状態</dt>
              <dd>{status}</dd>
            </div>
          </dl>
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="analysis-panel chart-panel">
          <div className="panel-head">
            <h2>スコア内訳</h2>
            <p>0-100 normalized</p>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Radar dataKey="score" stroke="#1f7a64" fill="#8fd3c1" fillOpacity={0.55} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="analysis-panel chart-panel">
          <div className="panel-head">
            <h2>時系列サンプル</h2>
            <p>mock index</p>
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
                <Line type="monotone" dataKey="activity" name="法人" stroke="#1f7a64" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="analysis-panel">
          <div className="panel-head">
            <h2>公開データ上のシグナル</h2>
            <AlertTriangle size={18} aria-hidden="true" />
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
      </section>

      <section className="indicator-grid" aria-label="指標カード">
        {getIndicatorEntries(area).map(([, indicator]) => (
          <IndicatorCard key={indicator.label} indicator={indicator} />
        ))}
      </section>

      <section className="comparison-panel">
        <div className="panel-head">
          <h2>近隣自治体比較</h2>
          <p>demo comparison</p>
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
                    <Cell key={neighbor.areaCode} fill={neighbor.isSelected ? "#1f7a64" : "#8ba4b8"} />
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
          <h2>Markdownレポート</h2>
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
