import { randomUUID } from 'node:crypto';
import type { AnalyticsRecord, Repository } from '../store/types';

export class AnalyticsQueue {
  private pending: AnalyticsRecord[] = [];

  constructor(private repo: Repository) {}

  enqueue(input: { userId?: string; name: string; props?: Record<string, string | number | boolean | null> }): void {
    this.pending.push({
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      props: input.props ?? {},
      createdAt: new Date().toISOString(),
    });
  }

  start(): () => void {
    const timer = setInterval(() => void this.flush(), 1000);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  private async flush(): Promise<void> {
    const batch = this.pending.splice(0, 50);
    for (const event of batch) {
      try {
        await this.repo.addAnalytics(event);
      } catch (error) {
        console.warn('[analytics]', error instanceof Error ? error.message : error);
        this.pending.unshift(event);
        break;
      }
    }
  }
}

export async function dispatchDueReminders(repo: Repository, now = new Date()): Promise<void> {
  const due = await repo.dueReminders(now.toISOString());
  for (const item of due) {
    console.log(`[push] user=${item.userId} title="${item.title}" body="${item.body}"`);
    await repo.markReminderSent(item.id);
  }
}
