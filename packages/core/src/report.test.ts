import { describe, expect, it } from "vitest";
import { DISCLAIMER, formatScore, generateMarkdownReport } from "./report";
import { makeArea, makeManifest, withMissing } from "./testing/fixtures";

const manifest = makeManifest();

describe("generateMarkdownReport", () => {
  const report = generateMarkdownReport(makeArea(), manifest);

  it("見出しと基本情報を含む", () => {
    expect(report).toContain("# まちのものさし レポート: 東京都 見本市");
    expect(report).toContain("- 市区町村コード: 99201");
    expect(report).toContain("- 人口: 105,000人（住民基本台帳）");
    expect(report).toContain("- 総合補助スコア: 61/100（7指標中7指標の平均）");
    expect(report).toContain("- データ取得日: 2026-11-23");
  });

  it("断定を避ける免責文を含む", () => {
    expect(report).toContain(DISCLAIMER);
  });

  it("スコア内訳を表にする", () => {
    expect(report).toContain("| 指標 | 指標値 | 基準時点 | 補助スコア | 区分 |");
    expect(report).toContain("| 5年間の人口増減率 | +5.0% | 2020→2025年 | 90/100 | 上位 |");
  });

  it("指標ごとに算出方法・注意・出典系列を繰り返す", () => {
    expect(report).toContain("### 人口");
    expect(report).toContain("- 算出方法: （基準年の住民基本台帳人口 ÷ 5年前の住民基本台帳人口 − 1）× 100");
    expect(report).toContain("- 読み取り時の注意:");
    expect(report).toContain(
      "[テスト系列（population）](https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=JP&IndicatorCode=0000000000000000001&RegionCode=99201)"
    );
  });

  it("出典表記とAPI利用のクレジットを含む", () => {
    expect(report).toContain(`- 出典: ${manifest.source.attribution}`);
    expect(report).toContain(manifest.source.credit);
    expect(report).toContain("[公共データ利用規約（第1.0版）](https://dashboard.e-stat.go.jp/static/terms)");
  });

  it("シグナルを全国の中での位置で見出し分けする", () => {
    expect(report).toContain("## 補助スコアが上位の指標\n\n- 5年間の人口増減率は+5.0%");
    expect(report).toContain("## 補助スコアが下位の指標\n\n- 完全失業率（国勢調査）は4.5%");
    expect(report).toContain("## 読み取り時の注意");
  });

  it("該当のない節には「該当なし」と書く", () => {
    expect(report).toContain("## 欠損データ\n\n- 該当なし");
  });

  it("欠損した指標は欠損として表記し、理由を書く", () => {
    const sparse = generateMarkdownReport(withMissing(makeArea({ kind: "special-ward" }), ["fiscal"]), manifest);
    expect(sparse).toContain("| 財政力指数 | 欠損 | 2022年度 | 欠損 | 欠損 |");
    expect(sparse).toContain("- 欠損理由: 出典（統計ダッシュボード）に特別区の値が収録されていません。");
    expect(sparse).toContain("- 総合補助スコア: 57/100（7指標中6指標の平均）");
  });

  it("指標が少なすぎる場合は総合補助スコアを算出しない", () => {
    const sparse = generateMarkdownReport(
      withMissing(makeArea(), ["migration", "business", "employment", "income"]),
      manifest
    );
    expect(sparse).toContain("- 総合補助スコア: 欠損（利用できる指標が3指標のため算出していません）");
  });
});

describe("formatScore", () => {
  it("欠損と数値を書き分ける", () => {
    expect(formatScore(null)).toBe("欠損");
    expect(formatScore(72)).toBe("72/100");
  });
});
