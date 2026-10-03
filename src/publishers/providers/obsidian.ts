import type { DocsTarget } from '../../config';
import { GITHUB_TIMEOUT_MS, githubHeaders } from '../../github';
import { failureNotice } from '../../report';
import type { DailyNote, Publisher } from '../types/publisher';

function buildNote(note: DailyNote): string {
	const frontmatter = [
		'---',
		`date: ${note.date}`,
		'tags: [daily]',
		`commits: ${note.total}`,
		`repos: [${note.repos.join(', ')}]`,
		'---',
	].join('\n');
	const notice = failureNotice(note.failures);

	if (note.total === 0) return `${frontmatter}\n\n# ${note.title}\n\n${notice}${note.emptyMessage}\n`;

	const callout = note.raw
		.split('\n')
		.map((line) => (line ? `> ${line}` : '>'))
		.join('\n');
	const summary = note.summary ? `${note.summary}\n\n` : '';
	return `${frontmatter}\n\n# ${note.title}\n\n${notice}${summary}> [!note]- Commits (${note.total})\n${callout}\n`;
}

async function writeNote(note: DailyNote, { repo, token, folder, branch }: DocsTarget): Promise<void> {
	const path = `${folder ? `${folder}/` : ''}${note.date}.md`;
	const url = `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
	const headers = { ...githubHeaders(token), 'content-type': 'application/json' };

	// Se o arquivo já existe (reexecução), o PUT precisa do sha para sobrescrever
	const existing = await fetch(branch ? `${url}?ref=${encodeURIComponent(branch)}` : url, {
		headers,
		signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
	});
	if (!existing.ok && existing.status !== 404) {
		throw new Error(`Vault ${existing.status} ao consultar ${path}: ${await existing.text()}`);
	}
	const sha = existing.ok ? ((await existing.json()) as { sha: string }).sha : undefined;

	const res = await fetch(url, {
		method: 'PUT',
		headers,
		body: JSON.stringify({
			message: `daily: ${note.date}`,
			content: Buffer.from(buildNote(note), 'utf8').toString('base64'),
			...(sha && { sha }),
			...(branch && { branch }),
		}),
		signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`Vault ${res.status} ao gravar ${path}: ${await res.text()}`);
	console.log(`Nota gravada no vault: ${repo}/${path}`);
}

/** Grava a nota no repo do vault via API de contents; o plugin Git do Obsidian faz o pull. */
export const obsidianPublisher: Publisher = {
	name: 'obsidian',
	prepare: ({ docs }) => (docs ? (note) => writeNote(note, docs) : null),
};
