export interface SourceRepo {
  owner: string;
  name: string;
  token: string;
}

export interface DocsTarget {
  repo: string; // owner/repo
  token: string;
  folder: string;
  branch?: string;
}

export interface Project {
  name: string;
  sources: SourceRepo[];
  docs: DocsTarget | null;
  unavailable: string[]; // repos que não podem ser lidos (ex.: sem token): avisados na nota, sem barrar o projeto
}

export interface RepoEntry {
  owner: string;
  name: string;
  docs: string | null; // owner/repo de destino
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function intEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} inválida: ${raw} (inteiro >= ${min})`);
  return value;
}

/** Aceita "owner/repo" ou a URL completa do repositório. */
export function normalizeSlug(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");
}

const SLUG = /^[\w.-]+\/[\w.-]+$/;

/**
 * Lê a lista de repositórios. Formato:
 *
 *   # dono
 *   [repo](https://github.com/dono-docs/repo-de-docs)   -> resumo vai para o repo de docs
 *   outro-repo, mais-um                                  -> sem destino (só a issue)
 *
 * Um título `# dono` vale até o próximo. O repo também pode vir como `dono/repo`.
 */
export function parseRepoList(text: string): RepoEntry[] {
  const entries = new Map<string, RepoEntry>();
  let owner: string | undefined;

  const add = (lineNo: number, repoText: string, docsText: string | undefined): void => {
    const [first, second] = repoText.split("/");
    const repoOwner = second === undefined ? owner : first;
    const name = second === undefined ? first : second;
    if (!repoOwner || !name) throw new Error(`GH_REPOS linha ${lineNo}: "${repoText}" sem dono. Use "# dono" antes ou "dono/repo".`);

    const docs = docsText ? normalizeSlug(docsText) : null;
    if (docs && !SLUG.test(docs)) throw new Error(`GH_REPOS linha ${lineNo}: destino inválido "${docsText}" (esperado owner/repo).`);
    entries.set(`${repoOwner}/${name}`.toLowerCase(), { owner: repoOwner, name, docs });
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (!line) return;

    const heading = line.match(/^#+\s*(.+)$/);
    if (heading) {
      owner = heading[1]!.trim();
      return;
    }
    const link = line.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return add(i + 1, link[1]!.trim(), link[2]);
    for (const repo of line.split(/[,\s]+/).filter(Boolean)) add(i + 1, repo, undefined);
  });

  return [...entries.values()];
}

function loadSecrets(): Map<string, string> {
  const secrets = new Map<string, string>();
  const raw = process.env.ALL_SECRETS?.trim();
  if (!raw) return secrets;
  try {
    for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
      if (value) secrets.set(key.toUpperCase(), value);
    }
  } catch {
    console.warn("ALL_SECRETS não é um JSON válido; ignorando.");
  }
  return secrets;
}

function ownerTokenName(owner: string): string {
  return `GH_TOKEN_${owner.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Token do dono (GH_TOKEN_<DONO>), vindo de ALL_SECRETS ou, em execução local, do ambiente. */
function findToken(secrets: Map<string, string>, owner: string): string | undefined {
  const name = ownerTokenName(owner);
  return secrets.get(name) ?? process.env[name]?.trim() ?? undefined;
}

/** Agrupa os repos por destino: cada destino de documentação vira um projeto, com um resumo só. */
export function loadProjects(): Project[] {
  const entries = parseRepoList(requireEnv("GH_REPOS"));
  if (entries.length === 0) throw new Error("GH_REPOS não contém nenhum repositório.");

  const secrets = loadSecrets();
  const folder = (process.env.DOCS_FOLDER?.trim() || "Daily").replace(/^\/+|\/+$/g, "");
  const branch = process.env.DOCS_BRANCH?.trim() || undefined;

  const groups = new Map<string, RepoEntry[]>();
  for (const entry of entries) groups.set(entry.docs ?? "", [...(groups.get(entry.docs ?? "") ?? []), entry]);

  return [...groups].map(([docsRepo, group]) => {
    const sources: SourceRepo[] = [];
    const unavailable: string[] = [];
    for (const e of group) {
      const token = findToken(secrets, e.owner);
      if (token) sources.push({ owner: e.owner, name: e.name, token });
      else unavailable.push(`${e.owner}/${e.name}: token ausente, defina o secret ${ownerTokenName(e.owner)}.`);
    }

    let docs: DocsTarget | null = null;
    if (docsRepo) {
      const docsOwner = docsRepo.split("/")[0] as string;
      const token = findToken(secrets, docsOwner);
      if (token) docs = { repo: docsRepo, token, folder, branch };
      else console.warn(`Destino ${docsRepo} ignorado: defina o secret ${ownerTokenName(docsOwner)}.`);
    }

    return { name: docsRepo ? (docsRepo.split("/")[1] as string) : "geral", sources, docs, unavailable };
  });
}
