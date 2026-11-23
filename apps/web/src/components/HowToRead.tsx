import { formatNumber, MIN_INDICATORS_FOR_OVERALL, type Manifest } from "@local-signal-japan/core";
import { DOCS_URL } from "../lib/site";

/** 補助スコアの意味と限界の説明。トップページと概要タブで共通に使う。 */
export function HowToRead({ manifest }: { manifest: Manifest }) {
  return (
    <div className="prose">
      <p>
        補助スコアは、その指標値が全国の市区町村の中でどの位置にあるかを0〜100で表したものです。50が全国の中央値にあたります。比べる相手は、政令指定都市の区を除く
        {formatNumber(manifest.counts.referenceAreas)}
        団体のうち、その指標の値がある団体です。
      </p>
      <p>
        人口増減率・転入超過率・事業所の密度・所得・財政力指数は値が大きいほど、高齢化率・完全失業率は値が小さいほど、スコアが高くなる向きにそろえています。向きは集計上の約束であり、地域の良し悪しを示すものではありません。
      </p>
      <p>
        総合補助スコアは、利用できる指標のスコアの単純平均です。値がそろわない指標は「欠損」として平均から除き、低い評価としては扱いません（利用できる指標が
        {MIN_INDICATORS_FOR_OVERALL}つ未満の場合は算出しません）。
      </p>
      <p>
        <a href={`${DOCS_URL}/METHODOLOGY.md`} target="_blank" rel="noreferrer">
          算出方法の詳細
        </a>
      </p>
    </div>
  );
}
