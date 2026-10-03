/** Teto por requisição à API do GitHub: sem ele, um socket pendurado segura o job. */
export const GITHUB_TIMEOUT_MS = 60_000;

export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function githubGet<T>(path: string, token: string): Promise<T> {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GitHub ${res.status} em ${url}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Percorre todas as páginas de uma listagem. */
export async function githubList<T>(path: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `https://api.github.com${path}${path.includes("?") ? "&" : "?"}per_page=100`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (res.status === 409) return results; // repositório vazio
    if (!res.ok) throw new Error(`GitHub ${res.status} em ${url}: ${await res.text()}`);
    results.push(...((await res.json()) as T[]));
    url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return results;
}
