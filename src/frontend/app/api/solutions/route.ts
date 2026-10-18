import { apiError, jsonBody, parseSolution } from '../../../../backend/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = parseSolution(await jsonBody(request));
    const { createSolution } = await import('../../../../backend/services/solution_service');
    return Response.json(await createSolution(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
