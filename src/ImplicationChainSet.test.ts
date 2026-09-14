import { describe, expect, test } from "vitest";
import { ImplicationChainSet } from "./ImplicationChainSet.js";

const values = (set: Set<string>) => [...set].sort();

describe("ImplicationChainSet", () => {
  test("adds chains as implication closure without explicit nearest edges", () => {
    const set = new ImplicationChainSet()
      .addChain(["动物", "哺乳动物", "人类"])
      .addChain(["动物", "猫科动物", "猫"])
      .addChain(["生物", "猫"]);

    expect(set.implies("人类", "动物")).toBe(true);
    expect(set.implies("猫", "动物")).toBe(true);
    expect(set.implies("猫", "生物")).toBe(true);
    expect(set.implies("动物", "猫")).toBe(false);

    expect(values(set.getNearestAncestors("猫"))).toEqual(["猫科动物", "生物"]);
    expect(values(set.getFarthestAncestors("猫"))).toEqual(["动物", "生物"]);
    expect(values(set.getNearestDescendants("动物"))).toEqual(["哺乳动物", "猫科动物"]);
    expect(values(set.getFarthestDescendants("动物"))).toEqual(["人类", "猫"]);

    expect(values(set.getExplicitNearestAncestors("猫"))).toEqual([]);
    expect(values(set.getExplicitNearestDescendants("动物"))).toEqual([]);
  });

  test("adds descendants and ancestors as explicit nearest relations", () => {
    const set = new ImplicationChainSet()
      .addDescendantsTo("动物", ["猫", "狗"])
      .addAncestorsTo("猫", ["生物"]);

    expect(values(set.getExplicitNearestDescendants("动物"))).toEqual(["狗", "猫"]);
    expect(values(set.getExplicitNearestAncestors("猫"))).toEqual(["动物", "生物"]);
    expect(values(set.getNearestAncestors("猫"))).toEqual(["动物", "生物"]);
  });

  test("adds trees and graphs with explicit nearest relations", () => {
    const set = new ImplicationChainSet()
      .addTree({
        name: "动物",
        children: [
          {
            name: "哺乳动物",
            children: [{ name: "人类" }],
          },
        ],
      })
      .addGraph({
        nodes: ["生物", "猫"],
        edges: [{ from: "生物", to: "猫" }],
      });

    expect(set.implies("人类", "动物")).toBe(true);
    expect(values(set.getExplicitNearestAncestors("人类"))).toEqual(["哺乳动物"]);
    expect(values(set.getExplicitNearestDescendants("生物"))).toEqual(["猫"]);
  });

  test("returns longest up, down, and all paths from derived nearest relations", () => {
    const set = new ImplicationChainSet()
      .addChain(["动物", "哺乳动物", "人类"])
      .addChain(["动物", "灵长目", "人类"])
      .addChain(["生物", "动物"]);

    expect(set.getUpPaths("人类", "动物").sort()).toEqual([
      ["人类", "哺乳动物", "动物"],
      ["人类", "灵长目", "动物"],
    ]);
    expect(set.getDownPaths("动物", "人类").sort()).toEqual([
      ["动物", "哺乳动物", "人类"],
      ["动物", "灵长目", "人类"],
    ]);
    expect(set.getAllPaths("人类", "生物")).toEqual([
      ["人类", "哺乳动物", "动物", "生物"],
      ["人类", "灵长目", "动物", "生物"],
    ]);
  });

  test("explicit paths only use explicit nearest relations", () => {
    const set = new ImplicationChainSet()
      .addChain(["动物", "猫科动物", "猫"])
      .addDescendantsTo("生物", ["猫"]);

    expect(set.getExplicitUpPaths("猫", "动物")).toEqual([]);
    expect(set.getExplicitUpPaths("猫", "生物")).toEqual([["猫", "生物"]]);
  });

  test("reports implication cycles", () => {
    const set = new ImplicationChainSet()
      .addDescendantsTo("A", ["B"])
      .addDescendantsTo("B", ["A"]);

    expect(set.getDiagnostics().cycles).toEqual([{ items: ["A", "B"] }]);
  });
});
