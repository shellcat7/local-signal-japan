import { useState } from "react";
import type { Manifest } from "@local-signal-japan/core";
import { downloadBlob } from "../lib/download";
import { renderCard, type Card, type CardSources } from "../lib/shareImage";
import { SITE_HOST } from "../lib/site";

/** 画像に描き込む出典の行。 */
export function cardSources(manifest: Manifest, options: { furusato?: boolean; map?: string } = {}): CardSources {
  const furusato = manifest.additionalSources.find((source) => source.id === "furusato");
  return {
    lines: [
      `出典：${manifest.source.attribution}`,
      ...(options.furusato && furusato ? [`出典：${furusato.attribution}`] : []),
      ...(options.map ? [`地図：${options.map}`] : []),
      manifest.source.credit
    ],
    site: SITE_HOST
  };
}

type ShareButtonsProps = {
  /** 押されたときに、描く内容を組み立てる。 */
  card: () => Card | Promise<Card>;
  filename: string;
  /** X に投稿するときの文（ページのアドレスは別に付く）。 */
  text: string;
  /** 投稿に付けるアドレス。省くと、いま開いているページのアドレス。 */
  url?: string;
  /** ボタンの文言（「Xに出題」など）。 */
  postLabel?: string;
  saveLabel?: string;
  /** あそぶ画面では、ポップなボタンにする。 */
  pop?: boolean;
};

/**
 * 出典つきの画像を保存する、X に投稿する、の2つのボタン。
 * 画像はブラウザの中で作り、どこにも送らない。X への投稿は、利用者が押したときだけ X のページを開く。
 */
export function ShareButtons({
  card,
  filename,
  text,
  url,
  postLabel = "Xに投稿",
  saveLabel = "画像で保存",
  pop = false
}: ShareButtonsProps) {
  const [status, setStatus] = useState<"idle" | "working" | "saved" | "shared" | "failed">("idle");
  const pageUrl = url ?? (typeof window === "undefined" ? "" : window.location.href);
  const intent = `https://x.com/intent/post?${new URLSearchParams({ text, url: pageUrl }).toString()}`;

  const makeFile = async () => {
    const blob = await renderCard(await card());
    return new File([blob], filename, { type: "image/png" });
  };

  const save = async () => {
    setStatus("working");
    try {
      const file = await makeFile();
      // スマートフォンでは共有シートから、画像を付けたまま X などに送れる。
      if (navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ files: [file], text, url: pageUrl });
        setStatus("shared");
        return;
      }
      downloadBlob(filename, file);
      setStatus("saved");
    } catch (error) {
      // 共有シートを閉じただけのときは、失敗として扱わない。
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    }
  };

  return (
    <div className={pop ? "share share--pop" : "share"}>
      <a
        className={pop ? "pop-button pop-button--ink" : "button"}
        href={intent}
        target="_blank"
        rel="noopener noreferrer"
      >
        {postLabel}
      </a>
      <button
        type="button"
        className={pop ? "pop-button pop-button--plain" : "button"}
        onClick={() => void save()}
        disabled={status === "working"}
      >
        {status === "working" ? "画像を作っています…" : saveLabel}
      </button>
      <p className="share__status" role="status">
        {status === "saved" && "画像を保存しました。Xに投稿するときは、保存した画像を添付してください。"}
        {status === "shared" && "共有しました。"}
        {status === "failed" && "画像を作れませんでした。"}
      </p>
    </div>
  );
}
