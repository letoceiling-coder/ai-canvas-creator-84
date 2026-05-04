import { describe, expect, it } from "vitest";
import { context7JsonToToolItems, guessLibraryName } from "@/lib/tools/context7-adapters";

describe("guessLibraryName", () => {
  it("берёт первое осмысленное слово", () => {
    expect(guessLibraryName("react tailwind best practices")).toBe("react");
    expect(guessLibraryName("Next.js app router")).toBe("next.js");
  });

  it("пропускает стоп-слова", () => {
    expect(guessLibraryName("best practices for hooks")).toBe("practices");
    expect(guessLibraryName("how to use state")).toBe("state");
  });

  it("fallback на react если нет кандидатов", () => {
    expect(guessLibraryName("")).toBe("react");
    expect(guessLibraryName("the and for")).toBe("react");
  });
});

describe("context7JsonToToolItems", () => {
  it("парсит infoSnippets", () => {
    const items = context7JsonToToolItems({
      infoSnippets: [
        { title: "A11y", content: "Use semantic headings.", path: "/docs/a11y" },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("ctx7-info-0");
    expect(items[0].content).toContain("A11y");
    expect(items[0].content).toContain("semantic headings");
    expect(items[0].source).toBe("/docs/a11y");
  });

  it("парсит codeSnippets + codeList", () => {
    const items = context7JsonToToolItems({
      codeSnippets: [
        {
          codeTitle: "Example",
          codeList: [{ code: "const x = 1" }],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].content).toContain("Example");
    expect(items[0].content).toContain("const x = 1");
  });

  it("парсит плоский массив объектов", () => {
    const items = context7JsonToToolItems([
      { title: "T", content: "body", source: "s" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].content).toContain("T");
    expect(items[0].content).toContain("body");
  });

  it("возвращает [] для неожиданного input", () => {
    expect(context7JsonToToolItems(null)).toEqual([]);
    expect(context7JsonToToolItems({})).toEqual([]);
  });
});
