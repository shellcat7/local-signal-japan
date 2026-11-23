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

  for (const hash of [
    "",
    "#area=13101",
    "#area=01668&tab=life",
    "#area=13101&tab=indicators",
    "#area=16210&tab=comparison",
    "#view=ranking",
    "#view=topics",
    "#view=ranking&topic=bicycle&metric=commuteBike&show=map"
  ]) {
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

    await expect(page.getByRole("heading", { level: 1, name: "まちのものさし" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "収録している指標" })).toBeVisible();
    await expect(page.getByRole("region", { name: "収録している指標の表" }).getByRole("row")).toHaveCount(8);
    await expect(page.getByRole("region", { name: "くらしの指標の表" }).getByRole("row")).toHaveCount(23);
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

  test("特集の抜粋を表示し、特集の一覧へ進める", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");

    const featured = page.getByRole("region", { name: "特集" });
    await expect(featured.locator(".topic")).toHaveCount(6);
    const shrinking = featured.getByRole("region", { name: "2050年に人口が半分以下になる見込みの市区町村" });
    await expect(shrinking.getByRole("listitem")).toHaveCount(3);
    await shrinking.getByRole("link", { name: /件すべてを見る/ }).click();

    await expect(page).toHaveURL(
      /#view=ranking&topic=half-by-2050&metric=projection2050&order=asc&projection2050=\.\.-50$/
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "2050年に人口が半分以下になる見込みの市区町村" })
    ).toBeVisible();
    await expect(page).toHaveTitle("2050年に人口が半分以下になる見込みの市区町村 | まちのものさし");

    // 条件を変えると、特集の見出しは外れる。
    await page.getByLabel("都道府県").selectOption("01");
    await expect(page.getByRole("heading", { level: 2, name: "条件でさがす" })).toBeVisible();
    await expect(page).not.toHaveURL(/topic=/);

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("特集の一覧から、それぞれの一覧を開ける", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "特集" }).click();
    await expect(page).toHaveURL(/#view=topics$/);
    await expect(page.locator(".topic")).toHaveCount(15);
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    await page.getByRole("link", { name: "ふるさと納税の受入額が多い市区町村" }).click();
    await expect(page.getByRole("table").getByRole("row").nth(1)).toContainText("億円");
    await expect(page.getByText(/総務省「ふるさと納税に関する現況調査結果」を加工して作成/).first()).toBeVisible();
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

  test("都道府県の索引から、その都道府県の市区町村の一覧を開ける", async ({ page }) => {
    await page.goto("./");
    const index = page.getByRole("region", { name: "都道府県からさがす" });
    await expect(index.getByRole("link")).toHaveCount(47);
    await index.getByRole("link", { name: "富山県" }).click();

    await expect(page).toHaveURL(/#view=ranking&pref=16$/);
    const rows = page.getByRole("table").getByRole("row");
    // 富山県は15市町村。人口の多い順に並ぶ。
    await expect(rows).toHaveCount(16);
    await expect(rows.nth(1)).toContainText("富山市");

    await rows.nth(1).getByRole("button", { name: "富山市" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "富山市" })).toBeFocused();
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
    await expect(page).toHaveTitle("富山県 南砺市 | まちのものさし");

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

test.describe("条件でさがす", () => {
  test("指標値の範囲で絞り込み、並べ替え、URLで共有できる", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./");
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "条件でさがす" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "条件でさがす" })).toBeVisible();
    await expect(page).toHaveURL(/#view=ranking$/);
    await expect(page).toHaveTitle("条件でさがす | まちのものさし");

    // 条件がなければ、対象の全市区町村が人口の多い順に並ぶ。
    const table = page.getByRole("table");
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(51);
    await expect(rows.nth(1)).toContainText("横浜市");
    const result = page.getByRole("status").filter({ hasText: "該当" });
    await expect(result).toContainText(/該当\s*1,741\s*市区町村/);

    // 全角の数字でも条件を入れられる。条件は「下限..上限」の形でURLに入る。
    await page.getByLabel("高齢化率（%）の上限").fill("３０");
    await page.getByLabel("課税対象所得（万円）の下限").fill("350");
    await expect(page).toHaveURL(/#view=ranking&aging=\.\.30&income=350\.\.$/);
    await expect(result).not.toContainText("1,741 市区町村／");
    const matched = Number((await result.innerText()).replace(/[^0-9／]/g, "").split("／")[0]);
    expect(matched).toBeGreaterThan(50);
    expect(matched).toBeLessThan(600);

    // 列見出しで並べ替える。同じ列をもう一度選ぶと逆順になる。
    await table.getByRole("button", { name: /高齢化率/ }).click();
    await expect(page).toHaveURL(/metric=aging&aging=/);
    await expect(table.getByRole("columnheader", { name: /高齢化率/ })).toHaveAttribute("aria-sort", "descending");
    await table.getByRole("button", { name: /高齢化率/ }).click();
    await expect(page).toHaveURL(/metric=aging&order=asc&aging=/);
    await expect(table.getByRole("columnheader", { name: /高齢化率/ })).toHaveAttribute("aria-sort", "ascending");

    // 条件に合う行だけが残っている（高齢化率30%以下、所得350万円以上）。
    const values = await rows.nth(1).getByRole("cell").allInnerTexts();
    expect(Number(values[3])).toBeLessThanOrEqual(30);
    expect(Number(values[7]?.replace(",", ""))).toBeGreaterThanOrEqual(350);

    // 読めない文字は条件に反映せず、欄を離れると元に戻る。
    const upper = page.getByLabel("高齢化率（%）の上限");
    await upper.fill("30くらい");
    await expect(upper).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/aging=\.\.30&/);
    await upper.blur();
    await expect(upper).toHaveValue("30");

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    // 都道府県と人口規模で絞り込む。順位は絞り込んだ中で付け直す。
    await page.getByRole("button", { name: "条件をすべて外す" }).click();
    await expect(page).toHaveURL(/#view=ranking&metric=aging&order=asc$/);
    await page.getByLabel("都道府県").selectOption("16");
    await page.getByLabel("人口規模").selectOption("10k-50k");
    await expect(page).toHaveURL(/#view=ranking&metric=aging&order=asc&pref=16&size=10k-50k$/);
    await expect(rows.nth(1)).toContainText("富山県");
    await expect(rows.nth(1).getByRole("cell").first()).toHaveText("1");

    // 行から市区町村を開く。
    const first = rows.nth(1).getByRole("button");
    const name = await first.innerText();
    await first.click();
    await expect(page.getByRole("heading", { level: 2, name })).toBeFocused();

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("くらしの指標でも絞り込み・並べ替えができ、結果を画像で保存できる", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#view=ranking");

    await page.getByLabel("くらしの指標で絞り込む").selectOption("lifeFemale");
    await page.getByLabel("平均寿命・女（年）の下限").fill("88.5");
    await expect(page).toHaveURL(/lifeFemale=88\.5\.\.$/);

    await page.getByLabel("並べる値").selectOption("furusatoReceipts");
    await expect(page).toHaveURL(/metric=furusatoReceipts/);
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: /受入額/ })).toHaveAttribute("aria-sort", "descending");
    await expect(table.getByRole("columnheader", { name: /平均寿命・女/ })).toBeVisible();

    // 金額の条件は万円で入れる。
    await page.getByLabel("くらしの指標で絞り込む").selectOption("furusatoReceipts");
    await page.getByLabel("受入額（万円）の下限").fill("100000");
    await expect(page).toHaveURL(/furusatoReceipts=1000000000\.\./);
    const rows = table.getByRole("row");
    await expect(rows.nth(1)).toContainText("億円");

    const downloadPromise = page.waitForEvent("download");
    await page.locator(".results__share").getByRole("button", { name: "画像で保存" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("machinomonosashi-furusatoReceipts.png");

    // 条件を外す。
    await page.getByRole("button", { name: "受入額（万円）の条件を外す" }).click();
    await expect(page).not.toHaveURL(/furusatoReceipts=/);

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("結果を地図で見られ、地図も画像で保存できる", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#view=ranking&metric=foreignShare");
    await page.getByRole("button", { name: "地図" }).click();
    await expect(page).toHaveURL(/show=map/);

    const map = page.getByRole("img", { name: /外国人住民の割合の大きい順の地図/ });
    await expect(map).toBeVisible();
    await expect(page.locator(".map__areas path")).toHaveCount(1741);
    await expect(page.locator(".map__source")).toContainText(
      "国土数値情報（行政区域データ）（国土交通省）を加工して作成"
    );
    await expect(page.getByRole("list", { name: "凡例" }).getByRole("listitem")).not.toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.locator(".results__share").getByRole("button", { name: "画像で保存" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("machinomonosashi-foreignShare.png");

    // 地図から市区町村を開ける。
    // 小さな町の形は、外接矩形の中央が隣の町にかかることがあるため、その町の形に直接クリックを送る。
    await page.locator('.map__areas path[data-code="10524"]').dispatchEvent("click");
    await expect(page.getByRole("heading", { level: 2, name: "大泉町" })).toBeFocused();

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("条件に合う市区町村がないときは、その旨を表示する", async ({ page }) => {
    await page.goto("./#view=ranking&aging=..5");
    await expect(page.getByText("条件に合う市区町村がありません")).toBeVisible();
    await expect(page.getByRole("button", { name: "CSVで保存" })).toBeDisabled();
    await page.getByRole("button", { name: "条件をすべて外す" }).click();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(51);
  });

  test("並べる値が欠損の市区町村も、順位を付けずに末尾に残す", async ({ page }) => {
    // 東京都の特別区は財政力指数が収録されていない。
    await page.goto("./#view=ranking&metric=fiscal&pref=13");
    await expect(page.getByRole("status").filter({ hasText: "該当" })).toContainText(/該当\s*62\s*市区町村/);

    await page.getByRole("button", { name: /さらに\d+件を表示/ }).click();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(63);
    const last = rows.nth(62);
    await expect(last.getByRole("cell").first()).toHaveText("—");
    await expect(last).toContainText("区");
  });

  test("結果をCSVで保存できる", async ({ page }) => {
    await page.goto("./#view=ranking&pref=16");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(16);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSVで保存" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^machinomonosashi-\d{4}-\d{2}-\d{2}\.csv$/);

    const csv = await readFile(await download.path(), "utf8");
    // Excel で文字化けしないよう、先頭に BOM がある。
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toMatch(/^順位,市区町村コード,都道府県,市区町村,区分,人口/);
    expect(lines[1]).toMatch(/^1,16201,富山県,富山市,市,\d+/);
    // 見出し1行 + 15市町村 + 空行 + 出典・注記・取得日
    expect(lines).toHaveLength(21);
    expect(csv).toContain("総務省「ふるさと納税に関する現況調査結果」を加工して作成");
    expect(csv).toContain("統計ダッシュボード（https://dashboard.e-stat.go.jp/）のデータを加工して作成");
    expect(csv).toContain(CREDIT);
  });

  test("続きを表示でき、市区町村を開いて戻っても続きから見られる", async ({ page }) => {
    await page.goto("./#view=ranking&metric=aging&order=asc&size=over-200k");

    await expect(page.getByLabel("並べる値")).toHaveValue("aging");
    await expect(page.getByLabel("並び順")).toHaveValue("asc");
    await expect(page.getByLabel("人口規模")).toHaveValue("over-200k");

    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(51);
    await page.getByRole("button", { name: /さらに\d+件を表示/ }).click();
    await expect(rows).toHaveCount(101);

    await rows.nth(60).getByRole("button").click();
    await expect(page.getByRole("tab", { name: "概要" })).toBeVisible();
    await page.goBack();
    await expect(rows).toHaveCount(101);
  });

  test("市区町村の画面の都道府県名から、その都道府県の一覧を開ける", async ({ page }) => {
    await page.goto("./#area=16210");
    await page.getByRole("link", { name: "富山県" }).click();
    await expect(page).toHaveURL(/#view=ranking&pref=16$/);
    await expect(page.getByLabel("都道府県")).toHaveValue("16");
    // 押したリンクは消えるので、フォーカスは本文へ移る。
    await expect(page.locator("main")).toBeFocused();
  });
});

test.describe("市区町村の画面", () => {
  test("概要: 指標値・全国順位・補助スコアと、読み取り時の注意を表示する", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#area=13101");

    await expect(page.getByRole("heading", { level: 2, name: "千代田区" })).toBeVisible();
    await expect(page.getByText("市区町村コード 13101")).toBeVisible();
    await expect(page.getByRole("tab", { name: "概要" })).toHaveAttribute("aria-selected", "true");
    // 指標サマリー: 順位と位置は、同じ行の指標値（人口なら増減率）についてのもの。
    const summary = page.getByRole("table").filter({ hasText: "全国順位" });
    await expect(summary.getByRole("row")).toHaveCount(8);
    const populationRow = summary.getByRole("row", { name: /人口増減率/ });
    await expect(populationRow).toContainText(/[+−]\d+\.\d%/);
    await expect(populationRow).toContainText(/\d+位/);
    await expect(populationRow).toContainText("/1,741");
    await expect(populationRow.getByRole("img", { name: /全国での位置/ })).toBeVisible();
    // 高齢化率は差をポイントで示す。
    await expect(summary.getByRole("row", { name: /高齢化率/ })).toContainText(/[+−]\d+\.\dポイント/);

    // 補助スコアは指標ごとの内訳と、その平均を並べる。
    const scores = page.getByRole("table").filter({ hasText: "総合" });
    await expect(scores.getByRole("row")).toHaveCount(9);
    await expect(scores.getByRole("row", { name: /財政力指数/ })).toContainText("欠損");
    await expect(scores.getByRole("row", { name: /総合/ })).toContainText("6指標の平均");
    await expect(page.getByRole("heading", { name: "読み取り時の注意" })).toBeVisible();
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

    await expect(page.getByRole("tab", { name: "くらし" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "くらし" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#area=13101&tab=life$/);
  });

  test("全国で目立つところ: 全国の上位・下位に入る項目を抜き出す", async ({ page }) => {
    const { errors, externalRequests } = watch(page);
    await page.goto("./#area=27223");

    const highlights = page.getByRole("region", { name: "全国で目立つところ" });
    const bicycle = highlights.getByRole("listitem").filter({ hasText: "通勤・通学に自転車だけを使う人の割合" });
    await expect(bicycle).toContainText("全国で最も高い");
    await expect(bicycle).toContainText(/\d+\.\d%/);

    // 出典つきの画像を保存できる。
    const downloadPromise = page.waitForEvent("download");
    await highlights.getByRole("button", { name: "画像で保存" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("machinomonosashi-27223.png");
    const image = await readFile(await download.path());
    expect(image.subarray(1, 4).toString()).toBe("PNG");
    await expect(highlights.getByRole("status")).toContainText("画像を保存しました");

    // X への投稿は、利用者が押したときだけ X のページを開くリンク。
    const post = highlights.getByRole("link", { name: "Xに投稿" });
    await expect(post).toHaveAttribute("href", /^https:\/\/x\.com\/intent\/post\?text=/);
    await expect(post).toHaveAttribute("target", "_blank");

    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("くらし: 平均寿命やふるさと納税などを、全国順位と出典つきで示す", async ({ page }) => {
    const { errors } = watch(page);
    await page.goto("./#area=01668&tab=life");

    for (const group of ["人口と暮らし", "通勤・通学", "住まい", "医療・図書館・ごみ", "ふるさと納税"]) {
      await expect(page.getByRole("heading", { level: 3, name: group })).toBeVisible();
    }
    const rowOf = (name: string) =>
      page.getByRole("row").filter({ has: page.locator(".life-table__name", { hasText: new RegExp(`^${name}$`) }) });
    const receipts = rowOf("ふるさと納税の受入額");
    await expect(receipts).toContainText(/\d+\.\d億円/);
    await expect(receipts).toContainText("令和7年度（2025年度）");
    await expect(receipts).toContainText(/\d+位/);
    const perCapita = rowOf("ふるさと納税の受入額（住民1人当たり）");
    await expect(perCapita).toContainText(/受入額 .*億円／住民 [\d,]+人/);

    // 集計の対象外の調査は、欠損ではなく理由を書く。
    await expect(rowOf("空き家率")).toContainText("この調査の集計の対象外です");

    // 算出方法と資料を開ける。
    await receipts.getByText("算出方法と注意").click();
    await expect(receipts.getByText(/資料：総務省「各自治体の令和7年度受入額等」/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test("指標: 7つの指標それぞれに出典の系列と取得日を添える", async ({ page }) => {
    const { errors } = watch(page);
    await page.goto("./#area=13101&tab=indicators");

    await expect(page.locator(".indicator-list").getByRole("article")).toHaveCount(7);

    const population = page.getByRole("article", { name: "人口" });
    await expect(population.getByText("5年間の人口増減率")).toBeVisible();
    await expect(population.getByText(/資料（\d{4}年\d{1,2}月\d{1,2}日取得）/)).toBeVisible();
    await expect(population.getByRole("link", { name: /住民基本台帳人口（総数）/ })).toHaveAttribute(
      "href",
      "https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=JP&IndicatorCode=0201200000000010010&RegionCode=13101"
    );

    // 全国の分布と順位。
    await expect(population.getByText("/ 1,741（値が大きい順）")).toBeVisible();
    await expect(
      population.getByRole("img", { name: /全国1,741市区町村の分布。値が大きい順で[\d,]+位/ })
    ).toBeVisible();

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
    const ranking = page.getByRole("table", { name: /人口（\d{4}年）の大きい順/ });
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
    expect(download.suggestedFilename()).toBe("machinomonosashi-14117.md");

    const markdown = await readFile(await download.path(), "utf8");
    expect(markdown).toContain("# まちのものさし レポート: 神奈川県 横浜市青葉区");
    expect(markdown).toContain("出典: 統計ダッシュボード（https://dashboard.e-stat.go.jp/）のデータを加工して作成");
    expect(markdown).toContain(CREDIT);
    // 政令指定都市の区は所得・財政が収録されていない。
    expect(markdown).toContain("政令指定都市の区単位では収録されていません。市全体（横浜市）の値を参照してください。");
  });

  test("戻る操作でトップページに戻れる", async ({ page }) => {
    await page.goto("./");
    const search = page.getByRole("combobox", { name: /市区町村をさがす/ });
    await search.fill("千代田区");
    await search.press("Enter");
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
