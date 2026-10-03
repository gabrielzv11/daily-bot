import { describe, expect, test } from "bun:test";
import { normalizeSlug, parseRepoList } from "./config";

describe("normalizeSlug", () => {
  test("aceita owner/repo e URL completa", () => {
    expect(normalizeSlug("gabrielzv11/notas")).toBe("gabrielzv11/notas");
    expect(normalizeSlug("https://github.com/gabrielzv11/notas")).toBe("gabrielzv11/notas");
    expect(normalizeSlug("https://github.com/gabrielzv11/notas.git/")).toBe("gabrielzv11/notas");
  });
});

describe("parseRepoList", () => {
  test("títulos definem o dono e links definem o destino", () => {
    const text = [
      "# minha-org",
      "[app-a](https://github.com/gabrielzv11/notas)",
      "[app-b](https://github.com/gabrielzv11/notas)",
      "# gabrielzv11",
      "[site](https://github.com/gabrielzv11/estudos)",
    ].join("\n");

    expect(parseRepoList(text)).toEqual([
      { owner: "minha-org", name: "app-a", docs: "gabrielzv11/notas" },
      { owner: "minha-org", name: "app-b", docs: "gabrielzv11/notas" },
      { owner: "gabrielzv11", name: "site", docs: "gabrielzv11/estudos" },
    ]);
  });

  test("vários repos por linha, sem link ficam sem destino", () => {
    const result = parseRepoList("# org\na, b\nc");
    expect(result.map((e) => [e.owner, e.name, e.docs])).toEqual([
      ["org", "a", null],
      ["org", "b", null],
      ["org", "c", null],
    ]);
  });

  test("dono/repo dispensa o título", () => {
    expect(parseRepoList("org/app")).toEqual([{ owner: "org", name: "app", docs: null }]);
  });

  test("ignora linhas vazias, marcadores de lista e repetidos", () => {
    const result = parseRepoList("# org\n\n- a\n* a\r\n");
    expect(result).toEqual([{ owner: "org", name: "a", docs: null }]);
  });

  test("falha com número da linha quando falta o dono", () => {
    expect(() => parseRepoList("# org\nok\n\nsolto/")).toThrow(/linha/);
    expect(() => parseRepoList("a")).toThrow(/linha 1/);
  });

  test("falha com destino inválido", () => {
    expect(() => parseRepoList("# org\n[a](isso-nao-e-slug)")).toThrow(/destino inválido/);
  });
});
