/** The public UI now uses the bounded, validated /api/cards pipeline. */
export function POST(): Response {
  return Response.json(
    {
      error:
        'This endpoint has retired. Use /api/cards for grounded knowledge cards.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
