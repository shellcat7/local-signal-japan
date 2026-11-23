import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import {
  buildQuiz,
  dailyQuizSeed,
  formatNumber,
  isDailySeed,
  quizTitle,
  type AreaIndex,
  type Manifest,
  type NationalFile,
  type QuizQuestion
} from "@local-signal-japan/core";
import { hrefOf, type QuizRoute, type Route } from "../lib/route";
import type { AsyncState } from "../lib/useAsync";
import { Stamp } from "./PlayHeader";
import { cardSources, ShareButtons } from "./ShareButtons";

const LETTERS = ["A", "B", "C", "D"];

type QuizViewProps = {
  route: QuizRoute;
  manifest: Manifest;
  index: AreaIndex;
  national: AsyncState<NationalFile>;
  /** シードごとの、選んだ選択肢（問題の順。まだなら null）。このページを開いている間だけ持つ。 */
  answers: Readonly<Record<string, ReadonlyArray<number | null>>>;
  onAnswer: (seed: string, question: number, choice: number) => void;
  onNavigate: (route: Route, options?: { replace?: boolean }) => void;
};

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** 「11月23日の5問」のような見出し。 */
function setName(seed: string, length: number, withToday = true): string {
  if (!isDailySeed(seed)) return `いろいろな${length}問`;
  const [, month, day] = seed.split("-").map(Number);
  return withToday && seed === dailyQuizSeed()
    ? `今日の${length}問（${month}月${day}日）`
    : `${month}月${day}日の${length}問`;
}

function choiceText(question: QuizQuestion, choice: number): string {
  if (question.kind === "top") return question.choices[choice]?.name ?? "";
  return question.choices[choice]?.label ?? "";
}

/** 答え合わせのときに、選択肢ごとに添える値と順位。 */
function choiceDetail(question: QuizQuestion, choice: number): string {
  if (question.kind === "top") {
    const item = question.choices[choice];
    return item ? `${item.valueText}・${formatNumber(item.rank)}位` : "";
  }
  const item = question.choices[choice];
  if (!item) return "";
  const high = item.rankHigh <= item.rankLow;
  return `${item.valueText}・${high ? item.words.high : item.words.low}ほうから${formatNumber(high ? item.rankHigh : item.rankLow)}番目`;
}

/** 正解の説明。 */
function explanation(question: QuizQuestion): string {
  if (question.kind === "top") {
    const answer = question.choices[question.answer];
    return `${answer?.name ?? ""}は、${question.label}が${question.phrase}（${answer?.valueText ?? ""}、${question.period}）。`;
  }
  const answer = question.choices[question.answer];
  return `${question.name}は、${answer?.label ?? ""}が${question.highlight.phrase}（${answer?.valueText ?? ""}、${question.highlight.period}）。`;
}

/** 正解の市区町村（その画面へのリンクに使う）。 */
function answerArea(question: QuizQuestion): { code: string; name: string } | null {
  if (question.kind === "top") {
    const answer = question.choices[question.answer];
    return answer ? { code: answer.code, name: answer.name } : null;
  }
  return { code: question.code, name: question.name };
}

/**
 * まちクイズ。日替わり（日本時間の日付）か、ランダムなシードの5問。
 * 同じシードからは同じ問題ができるので、投稿したリンクから同じ問題に挑戦できる。
 */
export function QuizView({ route, manifest, index, national, answers, onAnswer, onNavigate }: QuizViewProps) {
  const seed = route.seed ?? dailyQuizSeed();
  const prefNames = useMemo(() => new Map(index.prefectures.map((pref) => [pref.code, pref.name])), [index]);
  const rows = national.status === "ready" ? national.value.areas : null;
  const quiz = useMemo(
    () => (rows ? buildQuiz(rows, manifest, prefNames, seed) : []),
    [rows, manifest, prefNames, seed]
  );
  const picks = answers[seed] ?? [];
  const number = route.question ?? 1;
  const current = quiz[number - 1];
  const picked = picks[number - 1] ?? null;
  const answeredCount = picks.filter((pick) => pick !== null && pick !== undefined).length;
  const correctCount = quiz.filter((question, at) => picks[at] === question.answer).length;
  const verdictRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 答えたら正誤の文へ、次の問題に進んだら問題文へ、読み上げ位置を移す。
  useEffect(() => {
    if (picked !== null) verdictRef.current?.focus();
  }, [picked]);

  const base = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  const setUrl = `${base}#view=quiz&seed=${seed}`;
  const go = (next: number) => {
    onNavigate({ view: "quiz", seed, question: next }, { replace: true });
    window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: false }));
  };
  const link = (next: Route) => ({
    href: hrefOf(next),
    onClick: (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onNavigate(next);
    }
  });
  // ほかの5問は、押したときにシードを決める（描画のたびに変わらないように）。
  const playAnother = () => {
    onNavigate({ view: "quiz", seed: Math.random().toString(36).slice(2, 8), question: 1 });
    window.scrollTo({ top: 0 });
  };
  const sources = cardSources(manifest, { furusato: true });

  if (national.status === "loading") return <p className="play-status">問題を用意しています…</p>;
  if (national.status === "error") return <p className="play-status">{national.message}</p>;

  const progress = (
    <ol className="quiz__progress" aria-label={`${quiz.length}問中${Math.min(number, quiz.length)}問目`}>
      {quiz.map((question, at) => {
        const pick = picks[at];
        const state =
          pick === null || pick === undefined
            ? at === number - 1
              ? "current"
              : "todo"
            : pick === question.answer
              ? "right"
              : "wrong";
        return (
          <li key={at} data-state={state}>
            <span aria-hidden="true">{state === "right" ? "○" : state === "wrong" ? "×" : at + 1}</span>
          </li>
        );
      })}
    </ol>
  );

  // 結果
  if (!current) {
    const title = quizTitle(correctCount, quiz.length);
    const marks = quiz.map((question, at) => picks[at] === question.answer);
    const squares = marks.map((mark) => (mark ? "🟨" : "⬜")).join("");
    return (
      <div className="quiz">
        {progress}
        <section className="quiz-card quiz-result" aria-labelledby="quiz-result-title">
          <p className="quiz-card__kicker">{setName(seed, quiz.length)}</p>
          <h3 id="quiz-result-title" className="quiz-result__score" tabIndex={-1} ref={headingRef}>
            <strong>{correctCount}</strong>
            <span>/{quiz.length}問正解</span>
          </h3>
          <p className="quiz-result__title">{answeredCount === 0 ? "まだ答えていません" : title}</p>
          {answeredCount > 0 && <Stamp top="称号" bottom={title.replace(/^まち/, "")} />}
          <div className="quiz-card__actions">
            <ShareButtons
              pop
              url={setUrl}
              filename={`machiquiz-${seed}.png`}
              postLabel="結果をXに投稿"
              text={`まちクイズ ${setName(seed, quiz.length, false)}\n${squares} ${correctCount}/${quiz.length} ${title}\n#まちクイズ`}
              card={() => ({
                kind: "quizResult",
                heading: `まちクイズ ${setName(seed, quiz.length, false)}`,
                correct: correctCount,
                total: quiz.length,
                title,
                marks,
                sources
              })}
            />
            <button type="button" className="pop-button" onClick={playAnother}>
              ほかの{quiz.length}問であそぶ
            </button>
          </div>
        </section>

        <section className="quiz-review" aria-labelledby="quiz-review-title">
          <h3 id="quiz-review-title">答え合わせ</h3>
          <ol>
            {quiz.map((question, at) => {
              const area = answerArea(question);
              return (
                <li key={at} data-right={picks[at] === question.answer}>
                  <span className="quiz-review__mark" aria-label={picks[at] === question.answer ? "正解" : "不正解"}>
                    {picks[at] === question.answer ? "○" : "×"}
                  </span>
                  <div>
                    <p className="quiz-review__prompt">{question.prompt}</p>
                    <p>{explanation(question)}</p>
                    {area && (
                      <a
                        className="text-link"
                        {...link({ view: "area", areaCode: area.code, tab: "overview", compare: [] })}
                      >
                        {area.name}を見る
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <QuizNotes />
      </div>
    );
  }

  const answered = picked !== null;
  const right = picked === current.answer;
  const area = answerArea(current);
  const questionUrl = `${setUrl}&q=${number}`;
  const questionText = [
    `Q. ${current.prompt}`,
    ...current.choices.map((_, at) => `${LETTERS[at]} ${choiceText(current, at)}`),
    "#まちクイズ"
  ].join("\n");

  return (
    <div className="quiz">
      {progress}
      <section className="quiz-card" aria-labelledby="quiz-question">
        <p className="quiz-card__kicker">
          {setName(seed, quiz.length)}・<span>Q{number}</span>
        </p>
        <h3 id="quiz-question" className="quiz-card__prompt" tabIndex={-1} ref={headingRef}>
          {current.prompt}
        </h3>
        <p className="quiz-card__meta">
          {current.kind === "top"
            ? `${current.period}${current.limited ? "・人口1万人以上の市区町村で比べています" : ""}`
            : "全国（政令指定都市の区を除く）の中での順位です"}
        </p>

        <ul className="quiz-choices">
          {current.choices.map((_, at) => {
            const state = !answered ? undefined : at === current.answer ? "answer" : at === picked ? "picked" : "other";
            return (
              <li key={at}>
                <button
                  type="button"
                  className="quiz-choice"
                  data-state={state}
                  disabled={answered}
                  onClick={() => onAnswer(seed, number - 1, at)}
                  aria-label={`${LETTERS[at]} ${choiceText(current, at)}${answered ? `、${choiceDetail(current, at)}${at === current.answer ? "、正解" : ""}` : ""}`}
                >
                  <span className="quiz-choice__letter" aria-hidden="true">
                    {LETTERS[at]}
                  </span>
                  <span className="quiz-choice__text" aria-hidden="true">
                    {choiceText(current, at)}
                    {answered && <small>{choiceDetail(current, at)}</small>}
                  </span>
                  {answered && at === current.answer && (
                    <span className="quiz-choice__mark" aria-hidden="true">
                      ○
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {answered ? (
          <div className="quiz-verdict" data-right={right}>
            <p className="quiz-verdict__head" tabIndex={-1} ref={verdictRef}>
              {right ? "正解！" : `ざんねん… 正解は ${LETTERS[current.answer]}`}
            </p>
            <p>{explanation(current)}</p>
            <div className="quiz-card__actions">
              <button type="button" className="pop-button pop-button--big" onClick={() => go(number + 1)}>
                {number < quiz.length ? "次の問題へ" : "結果を見る"}
              </button>
              {area && (
                <a
                  className="pop-button pop-button--plain"
                  {...link({ view: "area", areaCode: area.code, tab: "overview", compare: [] })}
                >
                  {area.name}を見る
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="quiz-card__share">
            <p>答える前に、この問題を出題できます。</p>
            <ShareButtons
              pop
              url={questionUrl}
              filename={`machiquiz-${seed}-q${number}.png`}
              postLabel="Xに出題"
              saveLabel="問題を画像で保存"
              text={questionText}
              card={() => ({
                kind: "quiz",
                number,
                footnote: `まちクイズ ${setName(seed, quiz.length, false)}より。答えはリンク先で。`,
                prompt: current.prompt,
                choices: current.choices.map((_, at) => choiceText(current, at)),
                sources
              })}
            />
          </div>
        )}
      </section>
      <p className="quiz__other">
        <button type="button" className="link-button" onClick={playAnother}>
          ほかの{quiz.length}問であそぶ
        </button>
        {!isDailySeed(seed) || seed !== dailyQuizSeed() ? (
          <a className="text-link" {...link({ view: "quiz", seed: null, question: null })}>
            今日の{quiz.length}問にもどる
          </a>
        ) : null}
      </p>
      <QuizNotes />
    </div>
  );
}

function QuizNotes() {
  return (
    <ul className="notes">
      <li>
        問題は、同梱している公的統計の値から決まった規則で作ります。日替わりの問題は、日本時間の0時に変わり、同じ日ならだれでも同じ問題です。
      </li>
      <li>
        「全国で最も◯◯」の問題は、1位が1つに決まる項目だけから出します。失業率が高いことのように、特定の市区町村を悪く言うことになりやすい項目は出しません。
      </li>
      <li>答えた内容はどこにも送らず、ブラウザにも保存しません。</li>
    </ul>
  );
}
