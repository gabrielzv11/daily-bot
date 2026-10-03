import type { SourceRepo } from "./config";

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface CommitDetails {
  files: ChangedFile[]; // limitado a MAX_FILES_PER_COMMIT
  omitted: number;
  fileCount: number;
  additions: number;
  deletions: number;
}

export interface CommitInfo {
  sha: string; // curto, só para exibição
  fullSha: string;
  details: CommitDetails | null;
  message: string;
  branch: string;
  url: string;
  date: string;
}

export interface RepoReport {
  repo: string; // nome de exibição
  source: SourceRepo;
  commits: CommitInfo[];
}

export interface DayWindow {
  since: Date;
  until: Date;
  label: string;
  date: string; // AAAA-MM-DD
}
