import { handleMealNudgeRequest } from '@/app/api/cron/meal-nudge/route';

export async function GET(request, context = {}) {
    const params = await context.params;
    return handleMealNudgeRequest(request, params?.meal);
}
