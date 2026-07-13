const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "Convive Connect <notificaciones@datawiseconsultoria.com>";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Metodo no permitido." }, 405);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Canal de correo no configurado." }, 503);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const to = clean(body.to, 180).toLowerCase();
  const subject = clean(body.subject, 240);
  const html = clean(body.html, 50_000);
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailPattern.test(to) || !subject || !html) {
    return json({ error: "Solicitud de correo invalida." }, 400);
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };

    if (!response.ok || !result.id) {
      console.error("[commercial-email] Resend rejected delivery:", result.message || response.status);
      return json({ error: result.message || "Proveedor de correo no disponible." }, 502);
    }

    return json({ id: result.id });
  } catch (error) {
    console.error("[commercial-email] Unexpected delivery failure:", error);
    return json({ error: "No se pudo entregar el correo." }, 502);
  }
});
