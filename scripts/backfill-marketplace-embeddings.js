const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = process.cwd();

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) acc[key] = value;
      return acc;
    }, {});
}

const localEnv = readEnvFile(path.join(root, ".env.local"));

function env(key) {
  return process.env[key] || localEnv[key] || "";
}

async function embedDocument(text) {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("VOYAGE_API_KEY")}`,
    },
    body: JSON.stringify({
      input: [text],
      model: env("VOYAGE_EMBEDDING_MODEL") || "voyage-3.5-lite",
      input_type: "document",
      output_dimension: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage returned ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Voyage response did not include an embedding array");
  }

  return embedding;
}

async function main() {
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const voyageKey = env("VOYAGE_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !voyageKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or VOYAGE_API_KEY");
  }

  const limit = Number(process.env.BACKFILL_LIMIT || "200");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: items, error } = await supabase
    .from("marketplace_items")
    .select("id,title,description,category,price,embedding_voyage")
    .is("embedding_voyage", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  if (!items?.length) {
    console.log("OK No marketplace items pending Voyage embeddings.");
    return;
  }

  console.log(`Backfilling ${items.length} marketplace embeddings...`);

  for (const item of items) {
    const text = [
      item.title,
      item.category,
      item.description,
      item.price ? `Precio ${item.price}` : "",
    ].filter(Boolean).join("\n");

    const embedding = await embedDocument(text);
    const { error: updateError } = await supabase
      .from("marketplace_items")
      .update({ embedding_voyage: embedding })
      .eq("id", item.id);

    if (updateError) throw updateError;
    console.log(`OK ${item.id} ${item.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
