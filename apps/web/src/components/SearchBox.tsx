import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { AREA_KIND_LABELS, areaLocalName, searchAreas, type AreaIndex } from "@local-signal-japan/core";

type SearchBoxProps = {
  index: AreaIndex;
  onSelect: (areaCode: string) => void;
};

const MAX_RESULTS = 8;

/**
 * 市区町村の検索欄。候補の絞り込みはブラウザ内で完結し、入力した文字はどこにも送信・保存しない。
 */
export function SearchBox({ index, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const inputId = useId();

  const results = useMemo(() => searchAreas(index, query, MAX_RESULTS), [index, query]);
  const showList = open && query.trim() !== "";
  // 候補が減っても、選択位置が範囲の外を指さないようにする。
  const activePosition = Math.min(activeIndex, Math.max(results.length - 1, 0));
  const optionId = (position: number) => `${listId}-option-${position}`;

  const choose = (position: number) => {
    const result = results[position];
    if (!result) return;
    setQuery(areaLocalName(result));
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
    <div className="search">
      <label className="search__label" htmlFor={inputId}>
        市区町村をさがす
        <span>名前・よみがな・5桁の市区町村コード</span>
      </label>
      <div className="search__field">
        <Search className="search__icon" size={20} aria-hidden="true" />
        <input
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
          placeholder="例: 千代田区、なんと、14117"
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
            <span className="search__option-name">{areaLocalName(result)}</span>
            <span className="search__option-meta">
              {result.prefName}・{AREA_KIND_LABELS[result.kind]}・{result.code}
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
