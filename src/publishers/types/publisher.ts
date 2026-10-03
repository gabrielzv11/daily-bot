import type { DocsTarget } from '../../config';

export interface DailyNote {
	title: string;
	date: string; // AAAA-MM-DD
	total: number;
	repos: string[]; // repositórios com commits no dia
	summary: string | null; // resumo do provedor de IA, se disponível
	raw: string; // lista bruta de commits em Markdown
	emptyMessage: string; // texto usado quando total === 0
	failures: string[]; // repositórios que não puderam ser lidos (resumo parcial)
}

export interface PublishContext {
	docs: DocsTarget | null; // destino de documentação do projeto, se configurado
}

/** Publica a nota num destino já configurado. */
export type PublishFn = (note: DailyNote) => Promise<void>;

export interface Publisher {
	name: string;
	/**
	 * Resolve a configuração deste destino para o projeto e devolve a função de publicação já tipada;
	 * null quando o projeto não tem o necessário para este destino.
	 */
	prepare(ctx: PublishContext): PublishFn | null;
}
