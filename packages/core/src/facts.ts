import { formatNumber, roundTo } from "./format";
import { residentsAsOf, type UpstreamSeries } from "./indicators";
import type { FactKey } from "./model";

/** くらしの指標の分野。画面ではこの順に見出しを立てる。 */
export const FACT_GROUPS = [
  { id: "people", label: "人口と暮らし" },
  { id: "commute", label: "通勤・通学" },
  { id: "housing", label: "住まい" },
  { id: "services", label: "医療・図書館・ごみ" },
  { id: "furusato", label: "ふるさと納税" }
] as const;
export type FactGroupId = (typeof FACT_GROUPS)[number]["id"];

/** 指標値を算出するもとになる数（データセットに値と一緒に保持し、検算に使う）。 */
export type FactBasis = Record<string, number>;

export type FactDefinition = {
  key: FactKey;
  group: FactGroupId;
  /** 正式な名前。 */
  label: string;
  /** 表の列見出しなどに使う短い名前。 */
  columnLabel: string;
  /** 単位。「円」は金額として「億円」「万円」に読み替えて表示する。 */
  unit: string;
  decimals: number;
  signed: boolean;
  /** 値が大きい側・小さい側を言うときの言葉（「全国で3番目に長い」など）。 */
  words: { high: string; low: string };
  /** 何を見る指標か（1文）。 */
  summary: string;
  /** 算出方法。 */
  method: string;
  /** 読み取り時の注意。 */
  notes: string[];
  /**
   * 人口の少ない市区町村では、少数の増減で大きく動く指標。
   * 全国1位などの抜き出しでは、人口1万人未満の市区町村を除く。
   */
  smallAreaCaution: boolean;
  /** 出典。dashboard = 統計ダッシュボード、furusato = 総務省「ふるさと納税に関する現況調査結果」。 */
  provider: "dashboard" | "furusato";
  /** 統計ダッシュボードから取得する系列。 */
  upstream: UpstreamSeries[];
  /** 基準年を決めるのに使う系列の id（upstream のどれか）。 */
  yearProbe?: string;
  /** 算出のもとになる数の名前と単位（表示と検算に使う）。 */
  basis: Record<string, { label: string; unit: string }>;
  /** もとになる数から指標値を求める。求められなければ null。 */
  compute: (basis: FactBasis) => number | null;
  /** 基準時点の書き方。 */
  period: (year: number) => string;
};

const ratio = (numerator: number | undefined, denominator: number | undefined, scale: number) =>
  numerator === undefined || denominator === undefined || denominator <= 0 ? null : (numerator / denominator) * scale;

const pick = (key: string) => (basis: FactBasis) => basis[key] ?? null;

const year = (value: number) => `${value}年`;
const fiscalYear = (value: number) => `${value}年度`;
/** 令和の年度。例: 2025 → 令和7年度（2025年度） */
const reiwaFiscalYear = (value: number) => `令和${value - 2018}年度（${value}年度）`;

const commute = (
  key: FactKey,
  id: string,
  code: string,
  mode: string,
  columnLabel: string,
  notes: string[] = []
): FactDefinition => ({
  key,
  group: "commute",
  label: `通勤・通学に${mode}だけを使う人の割合`,
  columnLabel,
  unit: "%",
  decimals: 1,
  signed: false,
  words: { high: "高い", low: "低い" },
  summary: `自宅の外へ通勤・通学する人のうち、利用する交通手段が${mode}だけの人の割合です。`,
  method: `国勢調査の「利用交通手段」で、${mode}だけを利用する人数を、自宅外へ通勤・通学する人の総数で割ります。`,
  notes: [
    "2種類以上の交通手段を使う人（電車とバスなど）は、どの手段の割合にも含まれません。",
    "常住地（住んでいる市区町村）で数えています。",
    ...notes
  ],
  smallAreaCaution: false,
  provider: "dashboard",
  upstream: [
    { id, code, cycle: "CY", fromYear: 2020 },
    { id: "commuteTotal", code: "1203180101000010010", cycle: "CY", fromYear: 2020 }
  ],
  yearProbe: id,
  basis: {
    [id]: { label: `${mode}だけ`, unit: "人" },
    commuteTotal: { label: "自宅外へ通勤・通学する人", unit: "人" }
  },
  compute: (basis) => ratio(basis[id], basis.commuteTotal, 100),
  period: year
});

export const FACTS: Record<FactKey, FactDefinition> = {
  lifeFemale: {
    key: "lifeFemale",
    group: "people",
    label: "平均寿命（女性）",
    columnLabel: "平均寿命・女",
    unit: "年",
    decimals: 1,
    signed: false,
    words: { high: "長い", low: "短い" },
    summary: "0歳の女性が平均してあと何年生きるかの見込み（0歳の平均余命）です。",
    method: "厚生労働省「市区町村別生命表」の0歳の平均余命です。",
    notes: [
      "市区町村別生命表は5年ごとの作成です。人口の少ない市区町村でも安定した値になるよう、周辺の地域の死亡状況も使って推定しています。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "lifeFemale", code: "0203090201000010010", cycle: "CY", fromYear: 2010 }],
    yearProbe: "lifeFemale",
    basis: { lifeFemale: { label: "0歳の平均余命（女）", unit: "年" } },
    compute: pick("lifeFemale"),
    period: year
  },
  lifeMale: {
    key: "lifeMale",
    group: "people",
    label: "平均寿命（男性）",
    columnLabel: "平均寿命・男",
    unit: "年",
    decimals: 1,
    signed: false,
    words: { high: "長い", low: "短い" },
    summary: "0歳の男性が平均してあと何年生きるかの見込み（0歳の平均余命）です。",
    method: "厚生労働省「市区町村別生命表」の0歳の平均余命です。",
    notes: [
      "市区町村別生命表は5年ごとの作成です。人口の少ない市区町村でも安定した値になるよう、周辺の地域の死亡状況も使って推定しています。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "lifeMale", code: "0203090101000010010", cycle: "CY", fromYear: 2010 }],
    yearProbe: "lifeMale",
    basis: { lifeMale: { label: "0歳の平均余命（男）", unit: "年" } },
    compute: pick("lifeMale"),
    period: year
  },
  projection2050: {
    key: "projection2050",
    group: "people",
    label: "2050年の推計人口（2025年比）",
    columnLabel: "2050年推計",
    unit: "%",
    decimals: 1,
    signed: true,
    words: { high: "高い", low: "低い" },
    summary: "国立社会保障・人口問題研究所の推計で、2050年の人口が2025年からどれだけ増減する見込みかです。",
    method: "「日本の地域別将来推計人口（令和5年推計）」の2050年の人口を、同じ推計の2025年の人口と比べた増減率です。",
    notes: [
      "推計は、過去の出生・死亡・移動の傾向が続くと仮定した場合の見込みで、予測や目標ではありません。",
      "東日本大震災と原子力発電所の事故の影響を受けた福島県の一部の市町村は、推計の対象外です。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "projection", code: "0201130020000010000", cycle: "CY", fromYear: 2025 }],
    basis: {
      projection2025: { label: "2025年の推計人口", unit: "人" },
      projection2050: { label: "2050年の推計人口", unit: "人" }
    },
    compute: (basis) => {
      const change = ratio(basis.projection2050, basis.projection2025, 100);
      return change === null ? null : change - 100;
    },
    period: () => "2025→2050年（推計）"
  },
  foreignShare: {
    key: "foreignShare",
    group: "people",
    label: "外国人住民の割合",
    columnLabel: "外国人住民",
    unit: "%",
    decimals: 1,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "住民基本台帳に記録されている住民のうち、外国人住民の割合です。",
    method: "住民基本台帳人口の外国人住民の数を、住民基本台帳人口の総数で割ります。",
    notes: [
      "観光地のリゾートや工場がある市区町村では、働く人の在留で割合が大きく動くことがあります。",
      "国籍は問わず、日本国籍を持たない住民の合計です。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "foreignResidents", code: "0201220000000010010", cycle: "CY", fromYear: 2020 }],
    yearProbe: "foreignResidents",
    basis: { foreignResidents: { label: "外国人住民", unit: "人" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.foreignResidents, basis.residents, 100),
    period: (value) => `${value}年${residentsAsOf(value)}`
  },
  marriageRate: {
    key: "marriageRate",
    group: "people",
    label: "婚姻率（人口千人当たり）",
    columnLabel: "婚姻率",
    unit: "",
    decimals: 2,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "1年間の婚姻件数を、人口千人当たりにしたものです。",
    method: "人口動態統計の婚姻件数を、同じ年の住民基本台帳人口で割り、千を掛けます。",
    notes: [
      "婚姻届を出した夫の住所地で数えるため、若い世代が多く住む都市部で高くなりやすい数字です。",
      "人口の少ない市区町村では、数組の違いで大きく動きます。"
    ],
    smallAreaCaution: true,
    provider: "dashboard",
    upstream: [{ id: "marriages", code: "0203070000000010010", cycle: "CY", fromYear: 2018 }],
    yearProbe: "marriages",
    basis: { marriages: { label: "婚姻件数", unit: "組" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.marriages, basis.residents, 1000),
    period: year
  },
  birthRate: {
    key: "birthRate",
    group: "people",
    label: "出生率（人口千人当たり）",
    columnLabel: "出生率",
    unit: "",
    decimals: 2,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "1年間の出生数を、人口千人当たりにしたものです。",
    method: "出生数を、同じ年の住民基本台帳人口で割り、千を掛けます。",
    notes: [
      "女性1人が生む子どもの数（合計特殊出生率）とは別の数字です。若い世代の多い地域で高くなります。",
      "人口の少ない市区町村では、数人の違いで大きく動きます。"
    ],
    smallAreaCaution: true,
    provider: "dashboard",
    upstream: [{ id: "births", code: "0203010000000010000", cycle: "CY", fromYear: 2018 }],
    yearProbe: "births",
    basis: { births: { label: "出生数", unit: "人" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.births, basis.residents, 1000),
    period: year
  },
  elderlyAlone: {
    key: "elderlyAlone",
    group: "people",
    label: "高齢者の一人暮らし世帯の割合",
    columnLabel: "高齢単身世帯",
    unit: "%",
    decimals: 1,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "一般世帯のうち、65歳以上の人が一人で暮らす世帯の割合です。",
    method: "国勢調査の65歳以上の単独世帯数を、一般世帯数で割ります（社会・人口統計体系の値）。",
    notes: ["施設に入所している人は、一般世帯に含まれません。"],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "elderlyAlone", code: "0202010401000020010", cycle: "FY", fromYear: 2015 }],
    yearProbe: "elderlyAlone",
    basis: { elderlyAlone: { label: "65歳以上の単独世帯の割合", unit: "%" } },
    compute: pick("elderlyAlone"),
    period: year
  },
  commuteRail: commute("commuteRail", "commuteRail", "1203180101000010030", "鉄道・電車", "鉄道・電車"),
  commuteCar: commute("commuteCar", "commuteCar", "1203180101000010060", "自家用車", "自家用車"),
  commuteBike: commute("commuteBike", "commuteBike", "1203180101000010120", "自転車", "自転車"),
  commuteWalk: commute("commuteWalk", "commuteWalk", "1203180101000010020", "徒歩", "徒歩", [
    "職場や学校が自宅と同じ敷地や近くにある人が多い地域（観光地、農村、寮のある学校など）で高くなります。"
  ]),
  vacancy: {
    key: "vacancy",
    group: "housing",
    label: "空き家率",
    columnLabel: "空き家率",
    unit: "%",
    decimals: 1,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "住宅のうち、人が住んでいない住宅（空き家）の割合です。",
    method: "住宅・土地統計調査の空き家数を、総住宅数で割ります（社会・人口統計体系の値）。",
    notes: [
      "別荘などの二次的住宅や、賃貸・売却用の住宅も空き家に含まれます。別荘地のある市区町村で高くなります。",
      "住宅・土地統計調査は標本調査で、市と人口1万5千人以上の町村だけが集計の対象です。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "vacancy", code: "0801010101000020040", cycle: "FY", fromYear: 2013 }],
    yearProbe: "vacancy",
    basis: { vacancy: { label: "空き家率", unit: "%" } },
    compute: pick("vacancy"),
    period: year
  },
  floorArea: {
    key: "floorArea",
    group: "housing",
    label: "1住宅当たりの延べ面積",
    columnLabel: "住宅の広さ",
    unit: "㎡",
    decimals: 1,
    signed: false,
    words: { high: "広い", low: "狭い" },
    summary: "人が住んでいる住宅1戸当たりの、床面積の合計です。",
    method: "住宅・土地統計調査の、居住世帯のある住宅1戸当たりの延べ面積です。",
    notes: ["住宅・土地統計調査は標本調査で、市と人口1万5千人以上の町村だけが集計の対象です。"],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "floorArea", code: "0801010401000010000", cycle: "CY", fromYear: 2013 }],
    yearProbe: "floorArea",
    basis: { floorArea: { label: "1住宅当たり延べ面積", unit: "㎡" } },
    compute: pick("floorArea"),
    period: year
  },
  doctors: {
    key: "doctors",
    group: "services",
    label: "医師の数（人口10万人当たり）",
    columnLabel: "医師の数",
    unit: "人",
    decimals: 0,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "その市区町村で働く医師の数を、人口10万人当たりにしたものです。",
    method: "医師・歯科医師・薬剤師統計の医師数を、同じ年の住民基本台帳人口で割り、10万を掛けます。",
    notes: [
      "医師が働いている場所で数えるため、大学病院や大きな病院のある市区町村で多くなります。住民がかかれる医療の量とは一致しません。",
      "人口の少ない市区町村では、数人の違いで大きく動きます。"
    ],
    smallAreaCaution: true,
    provider: "dashboard",
    upstream: [{ id: "doctors", code: "1505040000000010000", cycle: "CY", fromYear: 2016 }],
    yearProbe: "doctors",
    basis: { doctors: { label: "医師数", unit: "人" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.doctors, basis.residents, 100_000),
    period: year
  },
  libraries: {
    key: "libraries",
    group: "services",
    label: "図書館の数（人口10万人当たり）",
    columnLabel: "図書館の数",
    unit: "館",
    decimals: 1,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "公立・私立の図書館の数を、人口10万人当たりにしたものです。",
    method: "社会教育調査の図書館数を、同じ年の住民基本台帳人口で割り、10万を掛けます。",
    notes: [
      "公民館の図書室や移動図書館は含みません。図書館がなくても、本を借りられる場所がある市区町村もあります。",
      "人口の少ない市区町村では、1館の違いで大きく動きます。"
    ],
    smallAreaCaution: true,
    provider: "dashboard",
    upstream: [{ id: "libraries", code: "1202010400000010010", cycle: "CY", fromYear: 2015 }],
    yearProbe: "libraries",
    basis: { libraries: { label: "図書館数", unit: "館" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.libraries, basis.residents, 100_000),
    period: year
  },
  garbage: {
    key: "garbage",
    group: "services",
    label: "1人1日当たりのごみの量",
    columnLabel: "ごみの量",
    unit: "g",
    decimals: 0,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "家庭と事業所から出るごみの総量を、住民1人1日当たりにしたものです。",
    method: "一般廃棄物処理実態調査の、1人1日当たりのごみ排出量です（社会・人口統計体系の値）。",
    notes: [
      "観光客や通勤者が多い市区町村では、住民の数に比べてごみが多くなります。",
      "原子力発電所の事故で避難指示が出た地域では、住民登録と実際に住む人の数が大きく違い、極端な値になります。"
    ],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "garbage", code: "1405050102000010010", cycle: "FY", fromYear: 2018 }],
    yearProbe: "garbage",
    basis: { garbage: { label: "1人1日当たりのごみ排出量", unit: "g" } },
    compute: pick("garbage"),
    period: fiscalYear
  },
  recycling: {
    key: "recycling",
    group: "services",
    label: "ごみのリサイクル率",
    columnLabel: "リサイクル率",
    unit: "%",
    decimals: 1,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "ごみのうち、資源として再利用された量の割合です。",
    method: "一般廃棄物処理実態調査のリサイクル率です（社会・人口統計体系の値）。",
    notes: ["ごみを燃料や建設資材に加工する施設を使う市町村では、極端に高い値になることがあります。"],
    smallAreaCaution: false,
    provider: "dashboard",
    upstream: [{ id: "recycling", code: "1405050800000020010", cycle: "FY", fromYear: 2018 }],
    yearProbe: "recycling",
    basis: { recycling: { label: "リサイクル率", unit: "%" } },
    compute: pick("recycling"),
    period: fiscalYear
  },
  furusatoReceipts: {
    key: "furusatoReceipts",
    group: "furusato",
    label: "ふるさと納税の受入額",
    columnLabel: "受入額",
    unit: "円",
    decimals: 0,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "その市区町村が1年間にふるさと納税で受け入れた寄附の額です。",
    method: "総務省「ふるさと納税に関する現況調査結果」の、各団体の受入額です。",
    notes: [
      "寄附を集めるための費用（返礼品・送料・広告など）を差し引く前の金額です。費用の割合は「受入額に占める費用の割合」で見られます。",
      "政令指定都市の区は、市全体の値だけが公表されています。"
    ],
    smallAreaCaution: false,
    provider: "furusato",
    upstream: [],
    basis: { receipts: { label: "受入額", unit: "円" } },
    compute: pick("receipts"),
    period: reiwaFiscalYear
  },
  furusatoPerCapita: {
    key: "furusatoPerCapita",
    group: "furusato",
    label: "ふるさと納税の受入額（住民1人当たり）",
    columnLabel: "受入額/人",
    unit: "円",
    decimals: 0,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "ふるさと納税の受入額を、住民1人当たりにしたものです。",
    method: "ふるさと納税の受入額を、住民基本台帳人口で割ります。",
    notes: ["人口の少ない町村ほど、受入額が少し増えただけで大きな値になります。"],
    smallAreaCaution: false,
    provider: "furusato",
    upstream: [],
    basis: { receipts: { label: "受入額", unit: "円" }, residents: { label: "住民", unit: "人" } },
    compute: (basis) => ratio(basis.receipts, basis.residents, 1),
    period: reiwaFiscalYear
  },
  furusatoCostShare: {
    key: "furusatoCostShare",
    group: "furusato",
    label: "ふるさと納税の受入額に占める費用の割合",
    columnLabel: "費用の割合",
    unit: "%",
    decimals: 1,
    signed: false,
    words: { high: "高い", low: "低い" },
    summary: "受け入れた寄附のうち、返礼品の調達・送付、広報、決済、事務などの募集に使った費用の割合です。",
    method: "総務省「ふるさと納税に関する現況調査結果」の、募集に要した費用の合計を受入額で割ります。",
    notes: [
      "国の基準では、募集に要する費用は受入額の5割以下、返礼品の調達費用は3割以下とされています。",
      "受入額が少ない市区町村では、事務の費用などで割合が大きくなることがあります。"
    ],
    smallAreaCaution: false,
    provider: "furusato",
    upstream: [],
    basis: { receipts: { label: "受入額", unit: "円" }, costs: { label: "募集に要した費用", unit: "円" } },
    compute: (basis) =>
      basis.receipts === undefined || basis.receipts <= 0 ? null : ratio(basis.costs, basis.receipts, 100),
    period: reiwaFiscalYear
  },
  furusatoOutflow: {
    key: "furusatoOutflow",
    group: "furusato",
    label: "ふるさと納税による住民税の控除額",
    columnLabel: "住民税の控除額",
    unit: "円",
    decimals: 0,
    signed: false,
    words: { high: "多い", low: "少ない" },
    summary: "住民がほかの自治体へふるさと納税をしたことで、その市区町村の住民税（市町村民税）が減った額です。",
    method:
      "総務省「ふるさと納税に関する現況調査結果」の、寄附金税額控除のうち市町村民税の控除額（都道府県等に対する寄附金・特例控除対象分）です。",
    notes: [
      "前の年の寄附にもとづいて、その年度の住民税から差し引かれた額です。",
      "地方交付税を受けている市区町村では、控除で減った住民税の多くが交付税で補われます。控除額がそのまま減収になるのは、主に交付税を受けていない市区町村です。"
    ],
    smallAreaCaution: false,
    provider: "furusato",
    upstream: [],
    basis: { deduction: { label: "市町村民税の控除額", unit: "円" } },
    compute: pick("deduction"),
    period: (value) => `令和${value - 2018}年度課税（${value - 1}年中の寄附）`
  },
  furusatoNet: {
    key: "furusatoNet",
    group: "furusato",
    label: "ふるさと納税の受入額と住民税の控除額の差",
    columnLabel: "受入と控除の差",
    unit: "円",
    decimals: 0,
    signed: true,
    words: { high: "大きい", low: "小さい" },
    summary: "受け入れた寄附の額から、住民がほかへ寄附したことによる住民税の控除額を引いたものです。",
    method: "受入額（令和7年度）から、市町村民税の控除額（令和8年度課税）を引きます。",
    notes: [
      "受入額は返礼品などの費用を差し引く前の金額で、控除額の多くは地方交付税で補われる場合があります。実際の収支とは異なる、目安の数字です。",
      "受入額と控除額は、対象の期間が少しずれています（受入額は年度、控除額は前の年の寄附）。"
    ],
    smallAreaCaution: false,
    provider: "furusato",
    upstream: [],
    basis: { receipts: { label: "受入額", unit: "円" }, deduction: { label: "市町村民税の控除額", unit: "円" } },
    compute: (basis) =>
      basis.receipts === undefined || basis.deduction === undefined ? null : basis.receipts - basis.deduction,
    period: (value) => `令和${value - 2018}年度`
  }
};

/** 指標値を、定義の小数桁に丸めて求める。 */
export function computeFact(key: FactKey, basis: FactBasis): number | null {
  const value = FACTS[key].compute(basis);
  return value === null || !Number.isFinite(value) ? null : roundTo(value, FACTS[key].decimals);
}

/** 金額を「億円」「万円」で読みやすく書く。 */
export function formatYen(value: number, signed = false): string {
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${sign}${formatNumber(absolute / 100_000_000, 1)}億円`;
  if (absolute >= 10_000) return `${sign}${formatNumber(Math.round(absolute / 10_000))}万円`;
  return `${sign}${formatNumber(Math.round(absolute))}円`;
}

/** くらしの指標の値を、単位つきで書く。 */
export function formatFact(definition: FactDefinition, value: number): string {
  if (definition.unit === "円") return formatYen(value, definition.signed);
  return `${formatNumber(value, definition.decimals, definition.signed)}${definition.unit}`;
}

/** 統計ダッシュボードから取得する、くらしの指標用の系列（重複を除く）。 */
export function factUpstreamSeries(): UpstreamSeries[] {
  const seen = new Map<string, UpstreamSeries>();
  for (const definition of Object.values(FACTS)) {
    for (const upstream of definition.upstream) seen.set(upstream.id, upstream);
  }
  return [...seen.values()];
}
