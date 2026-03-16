import "dotenv/config";

import { runAnalyticsPipeline } from "../src/lib/analytics/pipeline";

async function main() {
  const companyId = process.argv[2];
  const results = await runAnalyticsPipeline({ companyId });

  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
