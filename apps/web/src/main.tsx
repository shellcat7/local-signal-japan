import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// あそぶ画面の丸ゴシック。文字ごとに分かれたファイルのうち、画面に出る文字のぶんだけをブラウザが読む。
import "@fontsource/zen-maru-gothic/700.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root が見つかりません");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
