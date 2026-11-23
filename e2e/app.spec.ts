import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CREDIT =
  "このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";

/** ページ内のエラーと、配信元以外への通信を記録する。 */
function watch(page: Page) {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const origin = new URL(test.info().project.use.baseURL ?? "").origin;

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) externalRequests.push(request.url());
  });

  return { errors, externalRequests };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, "ページが横にはみ出していないこと").toBeLessThanOrEqual(0);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
  );
  expect(violations).toEqual([]);
}

test.describe("ダークモード", () => {
  test.use({ colorScheme: "dark" });

  for (const hash of ["", "#area=13101", "#area=13101&tab=indicators", "#area=16210&tab=comparison"]) {
    test(`文字のコントラストなどの基準を満たす: ${hash || "トップページ"}`, async ({ page }) => {
      await page.goto(`./${hash}`);
      await expect(page.getByText(CREDIT)).toBeVisible();
      await expectAccessible(page);
    });
  }
});

test.describe("トップページ", () => {
  test("収録している指標と、出典・クレジットを表示する", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");

    await expect(page.getByRole("heading", { level: 1, name: "Local Signal Japan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "収録している指標" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(8);
    await expect(page.getByText(CREDIT)).toBeVisible();
    await expect(page.getByRole("link", { name: "統計ダッシュボード（総務省統計局）" })).toHaveAttribute(
      "href",
      "https://dashboard.e-stat.go.jp/"
    );

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
    expect(externalRequests, "外部への通信をしないこと").toEqual([]);
  });

  test("例のボタンから市区町村を開ける", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "富山県 南砺市" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "南砺市" })).toBeVisible();
    await expect(page).toHaveURL(/#area=16210$/);
  });
});

test.describe("検索", () => {
  test("よみがなで候補を出し、キーボードだけで選べる", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");

    const input = page.getByRole("combobox", { name: /市区町村をさがす/ });
    await input.fill("なんと");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { name: /南砺市/ })).toContainText("富山県・市・16210");

    await input.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "南砺市" })).toBeFocused();
    await expect(page).toHaveURL(/#area=16210$/);
    await expect(page).toHaveTitle("富山県 南砺市 | Local Signal Japan");

    expect(errors).toEqual([]);
    expect(externalRequests, "検索語を外部へ送らないこと").toEqual([]);
  });

  test("同名の市区町村は都道府県名つきで区別でき、矢印キーで選べる", async ({ page }) => {
    await page.goto("./");
    const input = page.getByRole("combobox", { name: /市区町村をさがす/ });
    await input.fill("府中");

    await expect(page.getByRole("option")).toHaveCount(3);
    await input.press("ArrowDown");
    await expect(page.getByRole("option", { name: /広島県・市・34208/ })).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "府中市" })).toBeVisible();
    await expect(page).toHaveURL(/#area=34208$/);
  });

  test("一致しない検索語には、その旨を表示する", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("combobox", { name: /市区町村をさがす/ }).fill("どこにもない町");
    await expect(page.getByText("一致する市区町村がありません")).toBeVisible();
  });
});

test.describe("市区町村の画面", () => {
  test("概要: 総合補助スコアと、規則で書き出したシグナルを表示する", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#area=13101");

    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeVisible();
    await expect(page.getByText("市区町村コード 13101")).toBeVisible();
    await expect(page.getByRole("tab", { name: "概要" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "補助スコアが上位の指標" })).toBeVisible();
    // 特別区は財政力指数が出典に収録されていない。欠損として明示されること。
    await expect(page.getByText("財政: 出典（統計ダッシュボード）に特別区の値が収録されていません。")).toBeVisible();
    await expect(page.getByText("地域の良し悪しや将来を断定するものではありません")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("タブは矢印キーで切り替えられ、URLに反映される", async ({ page }) => {
    await page.goto("./#area=13101");
    await page.getByRole("tab", { name: "概要" }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("tab", { name: "指標" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "指標" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#area=13101&tab=indicators$/);
  });

  test("指標: 7つの指標それぞれに出典の系列と取得日を添える", async ({ page }) => {
    const { errors } = watch(page);
    await page.goto("./#area=13101&tab=indicators");

    await expect(page.locator(".indicator-grid").getByRole("article")).toHaveCount(7);

    const population = page.getByRole("article", { name: "人口" });
    await expect(population.getByText("5年間の人口増減率")).toBeVisible();
    await expect(population.getByText(/出典（取得日 \d{4}-\d{2}-\d{2}）/)).toBeVisible();
    await expect(population.getByRole("link", { name: /住民基本台帳人口（総数）/ })).toHaveAttribute(
      "href",
      "https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=JP&IndicatorCode=0201200000000010010&RegionCode=13101"
    );

    const fiscal = page.getByRole("article", { name: "財政" });
    await expect(fiscal.getByText("欠損").first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test("指標: グラフの値をキーボードでも表でも読める", async ({ page }) => {
    await page.goto("./#area=13101&tab=indicators");
    const population = page.getByRole("article", { name: "人口" });

    const chart = population.getByRole("group", { name: /住民基本台帳人口の推移のグラフ/ });
    await chart.focus();
    await chart.press("Home");
    await expect(population.locator(".chart-tooltip")).toContainText("2013年");

    await population.getByText("数値を表で見る").click();
    await expect(population.getByRole("row", { name: /2025年/ })).toBeVisible();
  });

  test("比較: 同じ都道府県の市区町村と並べ、別の市区町村へ移動できる", async ({ page }) => {
    const { errors } = watch(page);
    await page.goto("./#area=16210&tab=comparison");

    await expect(page.getByRole("heading", { name: "富山県内での比較" })).toBeVisible();
    const ranking = page.getByRole("table", { name: /総合補助スコアの大きい順/ });
    await expect(ranking.getByRole("row")).toHaveCount(11);
    await expect(ranking.getByRole("row", { name: /南砺市/ })).toContainText("表示中");

    await page.getByLabel("比べる値").selectOption("aging");
    await expect(
      page.getByRole("table", { name: /高齢化率（65歳以上人口の割合）（\d{4}年）の大きい順/ })
    ).toBeVisible();

    await page.getByLabel("並べる範囲").selectOption("all");
    await expect(page.getByRole("table", { name: /高齢化率/ }).getByRole("row")).toHaveCount(16);

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    await page
      .getByRole("table", { name: /高齢化率/ })
      .getByRole("button", { name: "氷見市" })
      .click();
    // 切り替え後は、新しい市区町村の見出しへフォーカスが移る。
    await expect(page.getByRole("heading", { level: 2, name: "氷見市" })).toBeFocused();
    await expect(page).toHaveURL(/#area=16205&tab=comparison$/);
    expect(errors).toEqual([]);
  });

  test("レポート: 出典とクレジットを含むMarkdownをダウンロードできる", async ({ page }) => {
    await page.goto("./#area=14117&tab=report");
    await expect(page.getByRole("heading", { name: "Markdownレポート" })).toBeVisible();
    await expectAccessible(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ダウンロード" }).click()
    ]);
    expect(download.suggestedFilename()).toBe("local-signal-14117.md");

    const markdown = await readFile(await download.path(), "utf8");
    expect(markdown).toContain("# Local Signal Japan レポート: 神奈川県 横浜市青葉区");
    expect(markdown).toContain("出典: 統計ダッシュボード（https://dashboard.e-stat.go.jp/）のデータを加工して作成");
    expect(markdown).toContain(CREDIT);
    // 政令指定都市の区は所得・財政が収録されていない。
    expect(markdown).toContain("政令指定都市の区単位では収録されていません。市全体（横浜市）の値を参照してください。");
  });

  test("戻る操作でトップページに戻れる", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "東京都 千代田区" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "収録している指標" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeHidden();
  });

  test("収録していない市区町村コードには、その旨を表示する", async ({ page }) => {
    await page.goto("./#area=13999");
    await expect(page.getByText("市区町村コード 13999 のデータは収録されていません")).toBeVisible();
  });
});
