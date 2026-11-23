import { describe, expect, it } from "vitest";
import {
  areaFullName,
  areaLocalName,
  formatDate,
  formatDateWithEra,
  formatNumber,
  formatYear,
  roundTo,
  yearOf
} from "./format";

describe("formatNumber", () => {
  it("桁区切りと小数桁をそろえる", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(16.2, 1)).toBe("16.2");
    expect(formatNumber(0.3, 2)).toBe("0.30");
  });

  it("signed のときは 0 以外に符号を付ける", () => {
    expect(formatNumber(4.4, 1, true)).toBe("+4.4");
    expect(formatNumber(-0.14, 2, true)).toBe("−0.14");
    expect(formatNumber(0, 1, true)).toBe("0.0");
  });
});

describe("roundTo", () => {
  it("指定した小数桁に丸める", () => {
    expect(roundTo(4.44, 1)).toBe(4.4);
    expect(roundTo(0.345, 2)).toBe(0.35);
  });

  it("-0 を 0 に正規化する", () => {
    expect(Object.is(roundTo(-0.04, 1), 0)).toBe(true);
  });
});

describe("formatDate", () => {
  it("日本時間の日付にする", () => {
    expect(formatDate("2026-11-23T07:30:54.969Z")).toBe("2026-11-23");
    // UTC では前日でも、日本時間では翌日になっている。
    expect(formatDate("2026-11-02T18:17:00.000Z")).toBe("2026-11-03");
    expect(yearOf("2026-12-31T15:00:00.000Z")).toBe(2027);
  });
});

describe("formatYear", () => {
  it("年と年度を書き分ける", () => {
    expect(formatYear(2025)).toBe("2025年");
    expect(formatYear(2024, "FY")).toBe("2024年度");
  });
});

describe("市区町村の表示名", () => {
  it("政令指定都市の区には市名を前置する", () => {
    expect(areaLocalName({ name: "青葉区", parentName: "横浜市" })).toBe("横浜市青葉区");
    expect(areaFullName({ name: "青葉区", parentName: "横浜市", prefName: "神奈川県" })).toBe("神奈川県 横浜市青葉区");
    expect(areaFullName({ name: "南砺市", prefName: "富山県" })).toBe("富山県 南砺市");
  });
});

describe("formatDateWithEra", () => {
  it("和暦を先に、西暦を括弧で添える（日本時間）", () => {
    expect(formatDateWithEra("2026-11-23T09:38:39.686Z")).toBe("令和8年（2026年）11月23日");
    // UTC では前日でも、日本時間では年が明けている。
    expect(formatDateWithEra("2026-12-31T15:30:00.000Z")).toBe("令和9年（2027年）1月1日");
  });
});
