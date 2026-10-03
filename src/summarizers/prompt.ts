import type { CommitDetails, DayWindow, RepoReport } from '../types';
import type { Prompt } from './types/summarizer';

const SYSTEM_PROMPT =
	'Você prepara o resumo da daily de um desenvolvedor front-end. Escreva em português do Brasil, ' +
	'em primeira pessoa e no passado. Para cada repositório com commits, crie um título com o nome dele ' +
	'e de 2 a 5 tópicos curtos agrupando commits relacionados pelo que foi entregue, sem hashes nem jargão de git. ' +
	'Cada commit pode vir com a lista de arquivos alterados (status e linhas +/-), sem o código. ' +
	'Use os caminhos para deduzir o que foi feito (componentes, hooks, rotas, estilos, testes, configuração) ' +
	'e descreva a mudança em linguagem de funcionalidade; a mensagem do commit manda quando for clara. ' +
	'Nunca liste caminhos, nomes de arquivo nem contagem de linhas no texto final. ' +
	"Termine com uma seção 'Para falar na daily' com 2 ou 3 frases corridas. Responda apenas em Markdown.";

function formatFiles(details: CommitDetails): string {
	const lines = details.files.map((f) => `  ${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`);
	if (details.omitted > 0) lines.push(`  … e mais ${details.omitted} arquivo(s) não listados`);
	return lines.join('\n');
}

/** Prompt único para qualquer provedor. */
export function buildPrompt(reports: RepoReport[], window: DayWindow): Prompt {
	const input = reports
		.filter((r) => r.commits.length > 0)
		.map((r) => {
			const commits = r.commits.map((c) => {
				const head = `- [${c.branch}] ${c.message}`;
				return c.details && c.details.fileCount > 0 ? `${head}\n  Arquivos alterados:\n${formatFiles(c.details)}` : head;
			});
			return `Repositório: ${r.repo}\n${commits.join('\n')}`;
		})
		.join('\n\n');

	return { system: SYSTEM_PROMPT, user: `Commits de ${window.label}:\n\n${input}` };
}
