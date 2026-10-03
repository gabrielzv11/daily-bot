import { issuePublisher } from './providers/issue';
import { obsidianPublisher } from './providers/obsidian';
import type { DailyNote, PublishContext, Publisher } from './types/publisher';

export type { DailyNote, PublishContext } from './types/publisher';

const PUBLISHERS: Publisher[] = [issuePublisher, obsidianPublisher];

/** Roda todos os publishers habilitados; a falha de um não impede os demais. */
export async function publishAll(note: DailyNote, ctx: PublishContext): Promise<void> {
	const active = PUBLISHERS.flatMap((p) => {
		const publish = p.prepare(ctx);
		return publish ? [{ name: p.name, publish }] : [];
	});
	const results = await Promise.allSettled(active.map((p) => p.publish(note)));

	const failures = results.flatMap((r, i) =>
		r.status === 'rejected' ? [`${active[i]?.name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`] : []
	);
	if (failures.length > 0) throw new Error(`Falha ao publicar:\n${failures.join('\n')}`);
}
