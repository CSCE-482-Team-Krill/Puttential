import { apiError, jsonBody, parseAttempt } from '../../../../backend/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = parseAttempt(await jsonBody(request));
    const { createAttempt } = await import('../../../../backend/services/attempt_service');
    return Response.json(await createAttempt(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
