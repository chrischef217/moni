export const runtime = "edge";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return new Response("STABILITY_API_KEY secret is missing.", {
      status: 503,
      headers: CORS,
    });
  }

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");

    if (!(audio instanceof File)) {
      return new Response("audio file is required", {
        status: 400,
        headers: CORS,
      });
    }

    const form = new FormData();
    form.append("audio", audio, audio.name || "humming.wav");
    form.append("prompt", String(incoming.get("prompt") || "").slice(0, 10000));
    form.append("output_format", "mp3");
    form.append(
      "duration",
      String(Math.max(6, Math.min(360, Number(incoming.get("duration") || 90))))
    );
    form.append(
      "strength",
      String(
        Math.max(
          0.01,
          Math.min(1, Number(incoming.get("strength") || 0.55))
        )
      )
    );

    const upstream = await fetch(
      "https://api.stability.ai/v2beta/audio/stable-audio/audio-to-audio",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + apiKey,
          accept: "application/json",
        },
        body: form,
      }
    );

    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Server error: " + error.message, {
      status: 500,
      headers: CORS,
    });
  }
}
