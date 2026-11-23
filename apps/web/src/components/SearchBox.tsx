import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { AREA_KIND_LABELS, areaLocalName, searchAreas, type AreaIndex } from "@local-signal-japan/core";

type SearchBoxProps = {
  index: AreaIndex;
  onSelect: (areaCode: string) => void;
  /** hero = トップページの大きな検索欄、bar = 上部バーの検索欄、inline = 比較に追加する欄。 */
  variant?: "hero" | "bar" | "inline";
  label?: string;
  placeholder?: string;
  /** 選んだあと入力欄を空に戻す（続けて追加する欄で使う）。 */
  clearOnSelect?: boolean;
  /** 「/」キーでこの欄にフォーカスを移す。 */
  shortcut?: boolean;
  /** 候補から除く市区町村コード。 */
  exclude?: readonly string[];
  disabled?: boolean;
};

const MAX_RESULTS = 8;

/** 候補の名前のうち、入力した文字と一致する部分に印を付ける（よみがなやコードで一致したときは付かない）。 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  const start = needle === "" ? -1 : text.indexOf(needle);
  if (start < 0) return text;

  return (
    <>
      {text.slice(0, start)}
      <mark>{needle}</mark>
      {text.slice(start + needle.length)}
    </>
  );
}

/**
 * 市区町村の検索欄。候補の絞り込みはブラウザ内で完結し、入力した文字はどこにも送信・保存しない。
 */
export function SearchBox({
  index,
  onSelect,
  variant = "hero",
  label = "市区町村をさがす",
  placeholder = "市区町村名・よみがな・5桁のコード（例: 千代田区、なんと、14117）",
  clearOnSelect = false,
  shortcut = false,
  exclude,
  disabled = false
}: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const results = useMemo(() => {
    const found = searchAreas(index, query, MAX_RESULTS + (exclude?.length ?? 0));
    return (exclude ? found.filter((area) => !exclude.includes(area.code)) : found).slice(0, MAX_RESULTS);
  }, [index, query, exclude]);
  const showList = open && query.trim() !== "";
  // 候補が減っても、選択位置が範囲の外を指さないようにする。
  const activePosition = Math.min(activeIndex, Math.max(results.length - 1, 0));
  const optionId = (position: number) => `${listId}-option-${position}`;

  useEffect(() => {
    if (!shortcut) return;
    const focusOnSlash = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, [shortcut]);

  const choose = (position: number) => {
    const result = results[position];
    if (!result) return;
    setQuery(clearOnSelect ? "" : areaLocalName(result));
    setActiveIndex(0);
    setOpen(false);
    onSelect(result.code);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力の変換確定の Enter では選択しない。
    // Safari は確定の keydown を変換終了の後に送るため、keyCode 229 でも見分ける。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActiveIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setOpen(true);
        setActiveIndex((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
        break;
      case "Enter":
        if (showList && results.length > 0) {
          event.preventDefault();
          choose(activePosition);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="search" data-variant={variant}>
      <label className="visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <div className="search__field">
        <Search className="search__icon" size={variant === "hero" ? 20 : 16} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          className="search__input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results.length > 0 ? optionId(activePosition) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <ul className="search__list" id={listId} role="listbox" aria-label="市区町村の候補" hidden={!showList}>
        {results.map((result, position) => (
          <li
            key={result.code}
            id={optionId(position)}
            role="option"
            aria-selected={position === activePosition}
            className={position === activePosition ? "search__option is-active" : "search__option"}
            // 押した時点で入力欄からフォーカスが外れると、候補が閉じて click が届かない。
            onMouseDown={(event) => event.preventDefault()}
            // 選択は click で確定する。押した時点で確定すると、スクロールのつもりの操作でも移動してしまう。
            onClick={() => choose(position)}
            onPointerEnter={() => setActiveIndex(position)}
          >
            <span className="search__option-name">
              <Highlighted text={areaLocalName(result)} query={query} />
            </span>
            <span className="search__option-meta">
              {result.prefName}・{AREA_KIND_LABELS[result.kind]}
              <code>{result.code}</code>
            </span>
          </li>
        ))}
        {results.length === 0 && (
          <li className="search__empty" role="presentation">
            一致する市区町村がありません。名前の一部か、5桁の市区町村コードで試してください。
          </li>
        )}
      </ul>

      <p className="visually-hidden" role="status">
        {showList ? (results.length > 0 ? `${results.length}件の候補があります。` : "候補がありません。") : ""}
      </p>
    </div>
  );
}
