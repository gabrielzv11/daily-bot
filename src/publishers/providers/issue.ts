import { GITHUB_TIMEOUT_MS, githubHeaders } from '../../github';
import { failureNotice } from '../../report';
import type { DailyNote, Publisher } from '../types/publisher';

const MAX_BODY = 65_536; // limite de caracteres do corpo de uma issue na API do GitHub
const TRAILER_RESERVE = 32; // espaço para o "… +N commits"

/** Corta a lista bruta em linhas inteiras para caber em `budget`, indicando quantos commits ficaram de fora. */
function fitRaw(raw: string, budget: number): string {
	if (raw.length <= budget) return raw;
	const lines = raw.split('\n');
	const kept: string[] = [];
	let size = 0;
	for (const line of lines) {
		if (size + line.length + 1 > budget - TRAILER_RESERVE) break;
		kept.push(line);
		size += line.length + 1;
	}
	const omitted = lines.slice(kept.length).filter((line) => line.startsWith('- ')).length;
	return `${kept.join('\n')}\n\n… +${omitted} commits`;
}

function buildBody(note: DailyNote): string {
	const notice = failureNotice(note.failures);
	if (note.total === 0) return `${notice}${note.emptyMessage}`;
	const [head, tail] = note.summary
		? [`${notice}${note.summary}\n\n<details><summary>Commits (${note.total})</summary>\n\n`, '\n\n</details>']
		: [`${notice}## Commits (${note.total})\n\n`, ''];
	return `${head}${fitRaw(note.raw, MAX_BODY - head.length - tail.length)}${tail}`;
}

async function createIssue(note: DailyNote): Promise<void> {
	const body = buildBody(note);
	const repo = process.env.GITHUB_REPOSITORY;
	const token = process.env.GITHUB_TOKEN;
	if (!repo || !token) {
		console.log(`\n${note.title}\n\n${body}`);
		return;
	}

	const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
		method: 'POST',
		headers: { ...githubHeaders(token), 'content-type': 'application/json' },
		body: JSON.stringify({ title: note.title, body, assignees: [process.env.GH_AUTHOR] }),
		signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`Falha ao criar issue: ${res.status} ${await res.text()}`);
	const issue = (await res.json()) as { html_url: string };
	console.log(`Resumo publicado: ${issue.html_url}`);
}

/** Cria uma issue no repo do próprio bot. Fora do Actions, apenas imprime no console. */
export const issuePublisher: Publisher = {
	name: 'issue',
	prepare: () => createIssue,
};
