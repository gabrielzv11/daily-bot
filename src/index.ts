import { appendFileSync } from "node:fs";
import { collectRepo, enrichCommits } from "./github";
import { loadProjects, requireEnv, type Project } from "./config";
import { publishAll, type DailyNote } from "./publishers";
import { failureNotice, rawReport } from "./report";
import { buildPrompt, createSummarizer, type Summarizer } from "./summarizers";
import type { DayWindow } from "./types";
import { resolveWindow } from "./window";

interface RunContext {
  author: string;
  window: DayWindow;
  summarizer: Summarizer | null;
  multi: boolean; // mais de um projeto na execução
}

/** Publica a nota do projeto e devolve os repos que não puderam ser lidos (resumo parcial). */
async function runProject(project: Project, { author, window, summarizer, multi }: RunContext): Promise<string[]> {
  const settled = await Promise.allSettled(project.sources.map((source) => collectRepo(source, window, author)));
  const reports = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failures = [
    ...project.unavailable,
    ...settled.flatMap((r, i) => {
      if (r.status === "fulfilled") return [];
      const source = project.sources[i]!;
      return [`${source.owner}/${source.name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`];
    }),
  ];
  // Nenhum repo lido: uma nota "nenhum commit" seria enganosa
  if (reports.length === 0) throw new Error(`nenhum repositório pôde ser lido:\n${failures.join("\n")}`);

  const total = reports.reduce((sum, r) => sum + r.commits.length, 0);
  if (total > 0) await enrichCommits(reports);

  const note: DailyNote = {
    title: `Daily — ${window.label}${multi ? ` — ${project.name}` : ""}`,
    date: window.date,
    total,
    repos: reports.filter((r) => r.commits.length > 0).map((r) => r.repo),
    summary: total > 0 && summarizer ? await summarizer.summarize(buildPrompt(reports, window)) : null,
    raw: rawReport(reports),
    emptyMessage: `Nenhum commit seu encontrado em ${window.label} nos repositórios monitorados.`,
    failures,
  };

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    const body = total === 0 ? note.emptyMessage : `${note.summary ?? ""}\n\n${note.raw}`;
    appendFileSync(stepSummary, `# ${note.title}\n\n${failureNotice(failures)}${body}\n`);
  }

  await publishAll(note, { docs: project.docs });
  return failures;
}

async function main(): Promise<void> {
  const author = requireEnv("GH_AUTHOR");
  const window = resolveWindow();
  const projects = loadProjects();
  const summarizer = createSummarizer();
  const failures: string[] = [];

  // Um projeto por vez: logs legíveis e sem estourar limite do provedor de IA; a falha de um não barra os outros
  for (const project of projects) {
    console.log(`\n== ${project.name} ==`);
    try {
      const repoFailures = await runProject(project, { author, window, summarizer, multi: projects.length > 1 });
      failures.push(...repoFailures.map((f) => `${project.name}: ${f}`));
    } catch (err) {
      failures.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Resumo parcial também é publicado, mas o job termina com erro para a falha não passar despercebida
  if (failures.length > 0) throw new Error(`Falhas na execução (${failures.length}):\n${failures.join("\n")}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
