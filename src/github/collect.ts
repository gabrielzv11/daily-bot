import type { SourceRepo } from "../config";
import { githubGet, githubList } from "./client";
import type { ChangedFile, CommitDetails, CommitInfo, DayWindow, RepoReport } from "../types";

const MAX_FILES_PER_COMMIT = 30;
const DETAIL_CONCURRENCY = 5;
const DEFAULT_BRANCHES = ["main", "master", "develop", "development", "homolog", "staging"];

interface Branch {
  name: string;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  parents: { sha: string }[];
  commit: { message: string; author: { date: string } | null };
}

interface GitHubCommitDetail {
  files?: ChangedFile[];
}

/** Executa `fn` sobre os itens com no máximo `limit` chamadas simultâneas, preservando a ordem. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchCommitDetails(source: SourceRepo, fullSha: string): Promise<CommitDetails | null> {
  try {
    const data = await githubGet<GitHubCommitDetail>(`/repos/${source.owner}/${source.name}/commits/${fullSha}`, source.token);
    // Só metadados: o campo "patch" é descartado de propósito
    const all: ChangedFile[] = (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));
    return {
      files: all.slice(0, MAX_FILES_PER_COMMIT),
      omitted: Math.max(0, all.length - MAX_FILES_PER_COMMIT),
      fileCount: all.length,
      additions: all.reduce((sum, f) => sum + f.additions, 0),
      deletions: all.reduce((sum, f) => sum + f.deletions, 0),
    };
  } catch (err) {
    console.warn(`Sem detalhes do commit ${fullSha.slice(0, 7)} (${source.name}): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Commits do `author` na janela, em todas as branches do repositório (sem merges nem duplicados). */
export async function collectRepo(source: SourceRepo, window: DayWindow, author: string): Promise<RepoReport> {
  const branches = await githubList<Branch>(`/repos/${source.owner}/${source.name}/branches`, source.token);

  // Branches de feature primeiro, para o commit ficar associado à branch onde nasceu
  branches.sort(
    (a, b) => Number(DEFAULT_BRANCHES.includes(a.name)) - Number(DEFAULT_BRANCHES.includes(b.name)),
  );

  const params = new URLSearchParams({
    author,
    since: window.since.toISOString(),
    until: window.until.toISOString(),
  });

  const perBranch = await Promise.all(
    branches.map(async (branch) => {
      const query = `${params.toString()}&sha=${encodeURIComponent(branch.name)}`;
      const commits = await githubList<GitHubCommit>(`/repos/${source.owner}/${source.name}/commits?${query}`, source.token);
      return commits.map((c) => ({ c, branch: branch.name }));
    }),
  );

  const seen = new Map<string, CommitInfo>();
  for (const { c, branch } of perBranch.flat()) {
    if (seen.has(c.sha) || c.parents.length > 1) continue; // ignora duplicados e merges
    seen.set(c.sha, {
      sha: c.sha.slice(0, 7),
      fullSha: c.sha,
      details: null,
      message: c.commit.message.trim(),
      branch,
      url: c.html_url,
      date: c.commit.author?.date ?? "",
    });
  }

  const commits = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { repo: source.name, source, commits };
}

/** Preenche `details` (arquivos alterados) de cada commit. */
export async function enrichCommits(reports: RepoReport[]): Promise<void> {
  const tasks = reports.flatMap((r) => r.commits.map((commit) => ({ source: r.source, commit })));
  await mapLimit(tasks, DETAIL_CONCURRENCY, async ({ source, commit }) => {
    commit.details = await fetchCommitDetails(source, commit.fullSha);
  });
}
