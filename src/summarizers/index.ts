import { geminiFactory } from './providers/gemini';
import { mangabaFactory } from './providers/mangaba';
import type { Summarizer, SummarizerFactory } from './types/summarizer';

export { buildPrompt } from './prompt';
export type { Prompt, Summarizer } from './types/summarizer';

// A ordem é a prioridade quando SUMMARY_PROVIDER não está definido.
const FACTORIES: SummarizerFactory[] = [geminiFactory, mangabaFactory];

/** Garante o contrato de `summarize`: qualquer exceção (rede, timeout, JSON inválido) vira null. */
function withFallback(summarizer: Summarizer | null): Summarizer | null {
	if (!summarizer) return null;
	return {
		name: summarizer.name,
		async summarize(prompt) {
			try {
				return await summarizer.summarize(prompt);
			} catch (err) {
				console.warn(
					`${summarizer.name} falhou: ${err instanceof Error ? err.message : String(err)} — usando lista bruta.`
				);
				return null;
			}
		},
	};
}

/**
 * SUMMARY_PROVIDER força um provedor; sem ele, usa o primeiro que tiver chave configurada.
 * Retorna null quando não há provedor utilizável (publica só a lista bruta).
 */
export function createSummarizer(): Summarizer | null {
	const forced = process.env.SUMMARY_PROVIDER?.trim().toLowerCase();
	if (forced) {
		const factory = FACTORIES.find((f) => f.name === forced);
		if (!factory)
			throw new Error(`SUMMARY_PROVIDER inválido: ${forced} (${FACTORIES.map((f) => f.name).join(' | ')})`);
		return withFallback(factory.create());
	}
	for (const factory of FACTORIES) {
		const summarizer = factory.create();
		if (summarizer) return withFallback(summarizer);
	}
	return null;
}
