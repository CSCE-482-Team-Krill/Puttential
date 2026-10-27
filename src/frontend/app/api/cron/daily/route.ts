export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily maintenance called by Vercel Cron: keep the next week of courses published. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 });

  try {
    const { publishSchedule, recoverRuns, checkSchedule } =
      await import('../../../../../backend/course-publishing');
    const published = await publishSchedule();
    const recovered = await recoverRuns();
    const ready = await checkSchedule();
    console.log('Daily maintenance finished', { published, recovered });
    return Response.json({ published, recovered, ready });
  } catch (error) {
    console.error('Daily maintenance failed', error);
    return Response.json({ error: 'Daily maintenance failed.' }, { status: 500 });
  }
}
