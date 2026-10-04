const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "GREEM Music API",
      version: "1.0.0",
      providers: {
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        stability: !!process.env.STABILITY_API_KEY,
      },
    },
    { headers: CORS }
  );
}
