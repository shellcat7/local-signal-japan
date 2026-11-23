import { describe, expect, it } from "vitest";
import { pathBounds } from "./pathBounds";

describe("pathBounds", () => {
  it("絶対・相対の座標をたどって、囲む範囲を求める", () => {
    expect(pathBounds("M10 20l5 0 0 10-5 0z")).toEqual({ x: 10, y: 20, width: 5, height: 10 });
    expect(pathBounds("M0 0L4 0V3H-2z M10 10l1 1")).toEqual({ x: -2, y: 0, width: 13, height: 11 });
    expect(pathBounds("M743.3 172.4l-.5 .5-.4 .7")).toEqual({
      x: expect.closeTo(742.4, 5) as number,
      y: 172.4,
      width: expect.closeTo(0.9, 5) as number,
      height: expect.closeTo(1.2, 5) as number
    });
  });

  it("座標がなければ null", () => {
    expect(pathBounds("")).toBeNull();
  });
});
