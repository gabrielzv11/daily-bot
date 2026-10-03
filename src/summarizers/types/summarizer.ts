export interface Prompt {
  system: string;
  user: string;
}

export interface Summarizer {
  name: string;
  /** Texto em Markdown, ou null se o provedor falhar (o chamador cai na lista bruta). */
  summarize(prompt: Prompt): Promise<string | null>;
}

export interface SummarizerFactory {
  /** Valor aceito em SUMMARY_PROVIDER. */
  name: string;
  /** Lê a configuração do ambiente; null quando falta a chave do provedor. */
  create(): Summarizer | null;
}
