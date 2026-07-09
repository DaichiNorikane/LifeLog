import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readVercelConfig = () => JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')
);

describe('vercel cron configuration', () => {
  it('keeps existing cron entries and adds meal nudges', () => {
    const config = readVercelConfig();

    expect(config.crons.slice(0, 6)).toEqual([
      { path: '/api/cron/morning-boost', schedule: '30 22 * * *' },
      { path: '/api/cron/reminder', schedule: '0 3 * * *' },
      { path: '/api/cron/afternoon-check', schedule: '0 5 * * *' },
      { path: '/api/cron/evening-preview', schedule: '30 8 * * *' },
      { path: '/api/cron/daily-report', schedule: '0 13 * * *' },
      { path: '/api/cron/weekly-summary', schedule: '0 23 * * 0' },
    ]);
    expect(config.crons.slice(6)).toEqual([
      { path: '/api/cron/meal-nudge/breakfast', schedule: '30 0 * * *' },
      { path: '/api/cron/meal-nudge/lunch', schedule: '30 4 * * *' },
      { path: '/api/cron/meal-nudge/dinner', schedule: '0 11 * * *' },
    ]);
  });
});
