import { intEnv } from '../../config';
import type { Summarizer, SummarizerFactory } from '../types/summarizer';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const AUTO_MODEL = 'auto';
const LIST_TIMEOUT_MS = 60_000;
const GENERATE_TIMEOUT_MS = 240_000; // a geração pode levar dezenas de segundos

interface GeminiModel {
	name: string; // ex.: "models/gemini-x-flash"
	supportedGenerationMethods?: string[];
}

interface GeminiResponse {
	candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
}

function modelVersion(name: string): number {
	const match = name.match(/gemini-(\d+)(?:[.-](\d+))?/);
	return match ? Number(match[1]) + Number(match[2] ?? 0) / 10 : 0;
}

/** Usa o modelo configurado; com `auto`, escolhe o Flash estável mais recente disponível para a chave. */
async function resolveModel(apiKey: string, configured: string): Promise<string | null> {
	if (configured.toLowerCase() !== AUTO_MODEL) return configured.replace(/^models\//, '');

	const res = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, {
		headers: { 'x-goog-api-key': apiKey },
		signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
	});
	if (!res.ok) {
		console.warn(`Não foi possível listar modelos do Gemini (${res.status}).`);
		return null;
	}
	const { models = [] } = (await res.json()) as { models?: GeminiModel[] };
	const excluded = /lite|image|tts|live|audio|embedding|thinking|exp|preview/;

	const candidates = models
		.filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
		.map((m) => m.name.replace(/^models\//, ''))
		.filter((name) => name.includes('flash') && !excluded.test(name))
		.sort((a, b) => modelVersion(b) - modelVersion(a) || a.length - b.length);

	return candidates[0] ?? null;
}

export const geminiFactory: SummarizerFactory = {
	name: 'gemini',
	create(): Summarizer | null {
		const apiKey = process.env.GEMINI_API_KEY?.trim();
		if (!apiKey) return null;

		// Modelo fixo por padrão: a auto-resolução (GEMINI_MODEL=auto) muda de comportamento sem commit
		const configuredModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
		// Tokens de raciocínio contam dentro do limite de saída; sem folga o resumo sai cortado.
		const maxOutputTokens = intEnv('GEMINI_MAX_OUTPUT_TOKENS', 8192, 1);
		const thinkingBudget = intEnv('GEMINI_THINKING_BUDGET', 0, -1); // 0 desliga; -1 = dinâmico
		let model: Promise<string | null> | undefined; // resolvido uma vez por execução

		return {
			name: 'gemini',
			async summarize({ system, user }) {
				const modelName = await (model ??= resolveModel(apiKey, configuredModel));
				if (!modelName) return null;
				console.log(`Usando o modelo ${modelName}`);

				const res = await fetch(`${GEMINI_BASE}/models/${modelName}:generateContent`, {
					method: 'POST',
					headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: system }] },
						contents: [{ role: 'user', parts: [{ text: user }] }],
						generationConfig: {
							temperature: 0.4,
							maxOutputTokens,
							thinkingConfig: { thinkingBudget },
						},
					}),
					signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
				});

				if (!res.ok) {
					console.warn(`Gemini indisponível (${res.status}): ${await res.text()} — usando lista bruta.`);
					return null;
				}
				const candidate = ((await res.json()) as GeminiResponse).candidates?.[0];
				if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
					console.warn(
						`Gemini terminou com ${candidate.finishReason}: resumo pode estar incompleto. ` +
							'Ajuste GEMINI_MAX_OUTPUT_TOKENS / GEMINI_THINKING_BUDGET.'
					);
				}
				const text = candidate?.content?.parts
					?.map((p) => p.text ?? '')
					.join('')
					.trim();
				return text || null;
			},
		};
	},
};
