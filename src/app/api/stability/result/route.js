export const runtime = "edge";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return new Response("STABILITY_API_KEY secret is missing.", {
      status: 503,
      headers: CORS,
    });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response("id is required", { status: 400, headers: CORS });
    }

    const upstream = await fetch(
      "https://api.stability.ai/v2beta/audio/results/" +
        encodeURIComponent(id),
      {
        headers: {
          authorization: "Bearer " + apiKey,
          accept: "audio/*",
        },
      }
    );

    const headers = new Headers(CORS);
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ||
        (upstream.status === 202 ? "application/json" : "audio/mpeg")
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return new Response("Server error: " + error.message, {
      status: 500,
      headers: CORS,
    });
  }
}
