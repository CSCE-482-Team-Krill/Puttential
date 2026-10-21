import { apiError } from '../../../../../backend/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getTodaysPuzzle } = await import('../../../../../backend/services/puzzle_service');
    const puzzle = await getTodaysPuzzle();
    return puzzle
      ? Response.json(puzzle, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: "Today's puzzle was not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
