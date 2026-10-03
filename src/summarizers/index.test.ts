import { afterEach, describe, expect, test } from "bun:test";
import { createSummarizer } from "./index";

const KEYS = ["SUMMARY_PROVIDER", "GEMINI_API_KEY", "MANGABA_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("createSummarizer", () => {
  test("sem chaves: null", () => {
    setEnv({});
    expect(createSummarizer()).toBeNull();
  });

  test("só Mangaba configurado: usa Mangaba", () => {
    setEnv({ MANGABA_API_KEY: "mr-x" });
    expect(createSummarizer()?.name).toBe("mangaba");
  });

  test("ambos configurados: Gemini tem prioridade (compatível com o comportamento anterior)", () => {
    setEnv({ GEMINI_API_KEY: "g", MANGABA_API_KEY: "mr-x" });
    expect(createSummarizer()?.name).toBe("gemini");
  });

  test("SUMMARY_PROVIDER força o provedor", () => {
    setEnv({ GEMINI_API_KEY: "g", MANGABA_API_KEY: "mr-x", SUMMARY_PROVIDER: "mangaba" });
    expect(createSummarizer()?.name).toBe("mangaba");
  });

  test("SUMMARY_PROVIDER sem a chave correspondente: null", () => {
    setEnv({ GEMINI_API_KEY: "g", SUMMARY_PROVIDER: "mangaba" });
    expect(createSummarizer()).toBeNull();
  });

  test("SUMMARY_PROVIDER desconhecido: erro", () => {
    setEnv({ SUMMARY_PROVIDER: "outro" });
    expect(() => createSummarizer()).toThrow("SUMMARY_PROVIDER inválido");
  });
});
