import { intEnv } from '../../config';
import type { Summarizer, SummarizerFactory } from '../types/summarizer';

const TIMEOUT_MS = 240_000; // a geração pode levar dezenas de segundos

interface ChatCompletionResponse {
	choices?: { finish_reason?: string; message?: { content?: string | null } }[];
}

/** Mangaba Router: API OpenAI-compatível (POST {base}/chat/completions). */
export const mangabaFactory: SummarizerFactory = {
	name: 'mangaba',
	create(): Summarizer | null {
		const apiKey = process.env.MANGABA_API_KEY?.trim();
		if (!apiKey) return null;

		const model = process.env.MANGABA_MODEL?.trim() || 'mangaba-mini';
		const baseUrl = (process.env.MANGABA_BASE_URL?.trim() || 'https://mangabarouter.store/v1').replace(/\/+$/, '');
		const maxTokens = intEnv('MANGABA_MAX_TOKENS', 4096, 1);

		return {
			name: 'mangaba',
			async summarize({ system, user }) {
				console.log(`Usando o modelo ${model} (Mangaba Router)`);

				const res = await fetch(`${baseUrl}/chat/completions`, {
					method: 'POST',
					headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
					body: JSON.stringify({
						model,
						temperature: 0.4,
						max_tokens: maxTokens,
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: user },
						],
					}),
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});

				if (!res.ok) {
					console.warn(`Mangaba indisponível (${res.status}): ${await res.text()} — usando lista bruta.`);
					return null;
				}
				const choice = ((await res.json()) as ChatCompletionResponse).choices?.[0];
				if (choice?.finish_reason && choice.finish_reason !== 'stop') {
					console.warn(`Mangaba terminou com ${choice.finish_reason}: resumo pode estar incompleto. Ajuste MANGABA_MAX_TOKENS.`);
				}
				return choice?.message?.content?.trim() || null;
			},
		};
	},
};
