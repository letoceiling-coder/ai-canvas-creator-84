import { describe, expect, it } from "vitest";
import {
  extractJsonFromText,
  safeParseJson,
  tryParseJsonObject,
} from "@/lib/json-extract";

describe("extractJsonFromText", () => {
  it("возвращает чистый JSON как есть", () => {
    expect(extractJsonFromText('{"a":1}')).toBe('{"a":1}');
  });

  it("снимает markdown-fence ```json", () => {
    const t = '```json\n{"x":2}\n```';
    expect(extractJsonFromText(t)).toBe('{"x":2}');
  });

  it("снимает fence без языка", () => {
    expect(extractJsonFromText('```\n{"y":3}\n```')).toBe('{"y":3}');
  });

  it("режет преамбулу до первого {", () => {
    const t = 'Sure, here is the JSON you asked for: {"a":1,"b":2}';
    expect(extractJsonFromText(t)).toBe('{"a":1,"b":2}');
  });

  it("режет постамбулу после последнего }", () => {
    const t = '{"a":1}\nThanks!';
    expect(extractJsonFromText(t)).toBe('{"a":1}');
  });

  it("корректно ищет сбалансированную скобку среди вложенных", () => {
    const t = 'prefix {"a":{"b":[1,2,{"c":true}]}} suffix';
    expect(extractJsonFromText(t)).toBe('{"a":{"b":[1,2,{"c":true}]}}');
  });

  it("игнорирует скобки внутри строки", () => {
    const t = '{"s":"hello } world"} trailing';
    expect(extractJsonFromText(t)).toBe('{"s":"hello } world"}');
  });

  it("работает с массивом верхнего уровня", () => {
    expect(extractJsonFromText('[1,2,3]')).toBe('[1,2,3]');
  });

  it("дополняет незакрытые скобки {", () => {
    const t = '{"a":1,"b":{"c":2}';
    const got = extractJsonFromText(t);
    expect(JSON.parse(got)).toEqual({ a: 1, b: { c: 2 } });
  });

  it("дополняет незакрытые скобки [", () => {
    const t = '{"arr":[1,2,3';
    const got = extractJsonFromText(t);
    expect(JSON.parse(got)).toEqual({ arr: [1, 2, 3] });
  });

  it("возвращает пусто на тексте без JSON", () => {
    expect(extractJsonFromText("hello world")).toBe("");
  });

  it("возвращает пусто на пустой строке", () => {
    expect(extractJsonFromText("")).toBe("");
  });

  it("не падает на не-строке", () => {
    expect(extractJsonFromText(undefined as unknown as string)).toBe("");
    expect(extractJsonFromText(123 as unknown as string)).toBe("");
  });
});

describe("safeParseJson", () => {
  it("парсит корректный JSON", () => {
    const r = safeParseJson<{ a: number }>('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ a: 1 });
      expect(r.repaired).toBe(false);
    }
  });

  it("парсит JSON с преамбулой и помечает repaired=true", () => {
    const r = safeParseJson('Here: {"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ a: 1 });
      expect(r.repaired).toBe(true);
    }
  });

  it("парсит JSON в markdown fence", () => {
    const r = safeParseJson('```json\n{"x":2}\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ x: 2 });
  });

  it("чинит trailing commas", () => {
    const r = safeParseJson('{"a":1,"b":[1,2,3,],}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("чинит JS-style комментарии", () => {
    const r = safeParseJson(`{
      // comment line
      "a": 1, /* block comment */
      "b": 2
    }`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ a: 1, b: 2 });
  });

  it("чинит незакрытые скобки", () => {
    const r = safeParseJson('{"arr":[1,2,3,"end"');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ arr: [1, 2, 3, "end"] });
  });

  it("возвращает invalid_json на полном мусоре", () => {
    const r = safeParseJson("just plain text without json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_json");
  });

  it("возвращает invalid_json на пустом вводе", () => {
    expect(safeParseJson("")).toEqual({ ok: false, error: "invalid_json" });
    expect(safeParseJson(undefined)).toEqual({ ok: false, error: "invalid_json" });
    expect(safeParseJson(null)).toEqual({ ok: false, error: "invalid_json" });
  });

  it("не использует eval — безопасный ввод не выполняется", () => {
    const r = safeParseJson('{"x":"alert(1)"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ x: "alert(1)" });
  });
});

describe("tryParseJsonObject", () => {
  it("возвращает данные при успехе", () => {
    expect(tryParseJsonObject<{ n: number }>('{"n":7}')).toEqual({ n: 7 });
  });

  it("возвращает undefined при провале", () => {
    expect(tryParseJsonObject("garbage")).toBeUndefined();
  });
});
