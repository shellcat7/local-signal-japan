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
  // 表示の切り替えで不透明度を変えている間は、色の判定がぶれる。
  // データの読み込みと、それに続く表示の動きが終わってから調べる。
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
  );
  expect(violations).toEqual([]);
}

test.describe("ダークモード", () => {
  test.use({ colorScheme: "dark" });

  for (const hash of ["", "#area=13101", "#area=13101&tab=indicators", "#area=16210&tab=comparison", "#view=ranking"]) {
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

  test("実際のデータからの抜粋と、見本のカードを表示する", async ({ page, isMobile }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");

    await expect(page.getByRole("heading", { name: "いまのデータから" })).toBeVisible();
    const leaderboard = page.locator(".leaderboard").filter({ hasText: "人口の増減率が大きい" });
    await expect(leaderboard.getByRole("listitem")).toHaveCount(5);

    if (!isMobile) {
      const preview = page.getByRole("complementary", { name: "表示の例" });
      await expect(preview.getByRole("heading", { name: "横浜市" })).toBeVisible();
      await preview.getByRole("button", { name: "横浜市を開く" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "横浜市" })).toBeVisible();
      await expect(page).toHaveURL(/#area=14100$/);
    }

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("「/」キーで検索欄に移れる", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "収録している指標" })).toBeVisible();
    // 描画の直後はキー操作の受け付けがまだ始まっていないことがあるため、効くまで試す。
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(page.getByRole("combobox", { name: /市区町村をさがす/ })).toBeFocused({ timeout: 500 });
    }).toPass();
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
    await expect(page.getByRole("option", { name: /南砺市/ })).toContainText("富山県・市");
    await expect(page.getByRole("option", { name: /南砺市/ })).toContainText("16210");

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
    await expect(page.getByRole("option", { name: /広島県・市\s*34208/ })).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "府中市" })).toBeVisible();
    await expect(page).toHaveURL(/#area=34208$/);
  });

  test("候補はクリックで選べ、選んだあとも次の検索ができる", async ({ page }) => {
    await page.goto("./");
    const input = page.getByRole("combobox", { name: /市区町村をさがす/ });

    await input.fill("中央区");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await page.getByRole("option", { name: /千葉市中央区/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "中央区" })).toBeVisible();
    await expect(page).toHaveURL(/#area=12101$/);

    // 前回の選択位置が残っていても、候補が1件ならその1件を選べる。
    await input.fill("南砺");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { name: /南砺市/ })).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");
    await expect(page).toHaveURL(/#area=16210$/);
  });

  test("表記のゆれ（ヶ・ケ）があっても見つかる", async ({ page }) => {
    await page.goto("./");
    const input = page.getByRole("combobox", { name: /市区町村をさがす/ });
    await input.fill("鎌ヶ谷");
    await expect(page.getByRole("option", { name: /鎌ケ谷市/ })).toBeVisible();
    await input.fill("茅ケ崎");
    await expect(page.getByRole("option", { name: /茅ヶ崎市/ })).toBeVisible();
  });

  test("一致しない検索語には、その旨を表示する", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("combobox", { name: /市区町村をさがす/ }).fill("どこにもない町");
    await expect(page.getByText("一致する市区町村がありません")).toBeVisible();
  });
});

test.describe("全国ランキング", () => {
  test("指標値の順に並べ、条件で絞り込める", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ランキング" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "全国ランキング" })).toBeVisible();
    await expect(page).toHaveURL(/#view=ranking$/);
    await expect(page).toHaveTitle("全国ランキング | Local Signal Japan");

    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(51);
    await expect(page.getByText(/条件に合う1,7\d\d団体を、値が大きい順に並べています/)).toBeVisible();

    // 並べる値を変えると、URLと見出しが変わる。
    await page.getByLabel("並べる値").selectOption("income");
    await expect(page).toHaveURL(/#view=ranking&metric=income$/);
    await expect(page.getByRole("heading", { level: 3, name: /納税義務者1人当たりの課税対象所得/ })).toBeVisible();
    await expect(table.getByRole("row").nth(1)).toContainText("万円");

    // 都道府県と人口規模で絞り込む。順位は絞り込んだ中で付け直す。
    await page.getByLabel("都道府県").selectOption("16");
    await page.getByLabel("人口規模").selectOption("10k-50k");
    await expect(page).toHaveURL(/#view=ranking&metric=income&pref=16&size=10k-50k$/);
    const rows = table.getByRole("row");
    await expect(rows.nth(1)).toContainText("富山県");
    await expect(rows.nth(1).getByRole("cell").first()).toHaveText("1");

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    // 行から市区町村を開く。
    const first = rows.nth(1).getByRole("button");
    const name = await first.innerText();
    await first.click();
    await expect(page.getByRole("heading", { level: 2, name })).toBeFocused();

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("続きを表示でき、共有されたURLから同じ条件を開ける", async ({ page }) => {
    await page.goto("./#view=ranking&metric=aging&order=asc&size=over-200k");

    await expect(page.getByLabel("並べる値")).toHaveValue("aging");
    await expect(page.getByLabel("並び順")).toHaveValue("asc");
    await expect(page.getByLabel("人口規模")).toHaveValue("over-200k");

    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(51);
    await page.getByRole("button", { name: /さらに\d+件を表示/ }).click();
    await expect(table.getByRole("row")).toHaveCount(101);
  });

  test("市区町村の画面の都道府県名から、その都道府県のランキングを開ける", async ({ page }) => {
    await page.goto("./#area=16210");
    await page.getByRole("link", { name: "富山県" }).click();
    await expect(page).toHaveURL(/#view=ranking&pref=16$/);
    await expect(page.getByLabel("都道府県")).toHaveValue("16");
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
    // 指標サマリー: 水準・5年前比・全国順位が1行にまとまっている。
    const summary = page.getByRole("table").filter({ hasText: "全国順位" });
    await expect(summary.getByRole("row")).toHaveCount(8);
    const populationRow = summary.getByRole("row", { name: /人口/ }).first();
    await expect(populationRow).toContainText("5年前比");
    await expect(populationRow).toContainText(/\d+位/);
    await expect(populationRow).toContainText("/ 1,741");
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

    await expect(page.locator(".indicator-list").getByRole("article")).toHaveCount(7);

    const population = page.getByRole("article", { name: "人口" });
    await expect(population.getByText("5年間の人口増減率")).toBeVisible();
    await expect(population.getByText(/出典（取得日 \d{4}-\d{2}-\d{2}）/)).toBeVisible();
    await expect(population.getByRole("link", { name: /住民基本台帳人口（総数）/ })).toHaveAttribute(
      "href",
      "https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=JP&IndicatorCode=0201200000000010010&RegionCode=13101"
    );

    // 全国の分布と順位。
    await expect(population.getByText(/1,741団体（値が大きい順）/)).toBeVisible();
    await expect(population.getByRole("img", { name: /全国1,741団体の分布。値が大きい順で\d+位/ })).toBeVisible();

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

  test("指標: グラフをタップすると、その年の値を読める", async ({ page, isMobile }) => {
    test.skip(!isMobile, "タッチ操作の確認");
    await page.goto("./#area=13101&tab=indicators");
    const population = page.getByRole("article", { name: "人口" });
    const chart = population.locator(".line-chart svg");
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error("グラフが表示されていません");

    // 2013〜2025年のグラフの左から3割あたり。最新年ではなく、タップした付近の年が出る。
    await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
    await expect(population.locator(".chart-tooltip")).toContainText(/201[4-7]年/);
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

  test("比較: 全国の市区町村を選んで並べ、URLで共有できる", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#area=16210&tab=comparison");

    const table = page.getByRole("table").filter({ hasText: "総合補助スコア" }).first();
    await expect(table.getByRole("columnheader")).toHaveCount(2);

    // 検索から追加する。
    const add = page.getByRole("combobox", { name: "比べる市区町村を追加" });
    await add.fill("千代田区");
    await add.press("Enter");
    await expect(table.getByRole("columnheader", { name: /千代田区/ })).toBeVisible();
    await expect(page).toHaveURL(/#area=16210&tab=comparison&with=13101$/);

    // 候補（指標の傾向が近い市区町村）から追加する。
    const suggestion = page.locator(".suggestions").filter({ hasText: "指標の傾向が近い" }).getByRole("button").first();
    const suggested = (await suggestion.innerText()).replace(/\s+/g, " ");
    await suggestion.click();
    await expect(table.getByRole("columnheader")).toHaveCount(4);
    await expect(page).toHaveURL(/with=13101,\d{5}$/);
    expect(suggested.length).toBeGreaterThan(0);

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    // 外す。
    await page.getByRole("button", { name: "千代田区を比較から外す" }).click();
    await expect(table.getByRole("columnheader", { name: /千代田区/ })).toHaveCount(0);

    // 共有されたURLを開くと、同じ組み合わせが並ぶ。
    await page.goto("./#area=13101&tab=comparison&with=14100,16210");
    const shared = page.getByRole("table").filter({ hasText: "総合補助スコア" }).first();
    await expect(shared.getByRole("columnheader", { name: /横浜市/ })).toBeVisible();
    await expect(shared.getByRole("columnheader", { name: /南砺市/ })).toBeVisible();
    await expect(shared.getByRole("columnheader")).toHaveCount(4);

    // 並べた市区町村を開くと、いま見ていた市区町村と入れ替わる。
    await shared.getByRole("button", { name: "横浜市", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "横浜市" })).toBeFocused();
    await expect(page).toHaveURL(/#area=14100&tab=comparison&with=13101,16210$/);

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
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

  for (const code of ["13999", "99999"]) {
    test(`収録していない市区町村コードには、その旨を表示する: ${code}`, async ({ page }) => {
      const { errors } = watch(page);
      await page.goto(`./#area=${code}`);
      await expect(page.getByText(`市区町村コード ${code} のデータは収録されていません`)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("「本文へ移動」を使っても、表示中の市区町村のままになる", async ({ page }) => {
    await page.goto("./#area=13101&tab=indicators");
    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "本文へ移動" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.locator("main")).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeVisible();
    await expect(page).toHaveURL(/#area=13101&tab=indicators$/);
  });
});
