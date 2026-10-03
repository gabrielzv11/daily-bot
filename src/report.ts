import type { RepoReport } from "./types";

/** Lista bruta de commits em Markdown, usada quando não há resumo e como anexo dele. */
export function rawReport(reports: RepoReport[]): string {
  return reports
    .filter((r) => r.commits.length > 0)
    .map((r) => {
      const lines = r.commits.map((c) => {
        const stats = c.details
          ? ` — ${c.details.fileCount} arquivo(s), +${c.details.additions}/−${c.details.deletions}`
          : "";
        return `- [\`${c.sha}\`](${c.url}) (${c.branch}) ${c.message.split("\n")[0]}${stats}`;
      });
      return `### ${r.repo}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/** Alerta (GitHub e Obsidian) com os repositórios que ficaram fora do resumo; vazio quando não há falhas. */
export function failureNotice(failures: string[]): string {
  if (failures.length === 0) return "";
  const items = failures.map((f) => `> - ${f.replace(/\s+/g, " ")}`);
  return `> [!WARNING]\n> Resumo parcial: ${failures.length} repositório(s) não puderam ser lidos.\n${items.join("\n")}\n\n`;
}
