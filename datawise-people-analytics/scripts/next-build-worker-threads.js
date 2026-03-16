const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

if (process.platform === "win32") {
  const originalJsLoader = Module._extensions[".js"];
  const patches = [
    {
      suffix: path.join("next", "dist", "build", "type-check.js"),
      rewrite(source) {
        return source.replace("config.experimental.workerThreads", "true");
      }
    },
    {
      suffix: path.join("next", "dist", "build", "index.js"),
      rewrite(source) {
        return source.replace(
          "enableWorkerThreads: config.experimental.workerThreads",
          "enableWorkerThreads: true"
        );
      }
    },
    {
      suffix: path.join("next", "dist", "export", "index.js"),
      rewrite(source) {
        return source
          .replace(
            "renderOpts,\n                options,",
            "renderOpts: globalThis.__NEXT_WORKER_SAFE(renderOpts),\n                options: globalThis.__NEXT_WORKER_SAFE(options),"
          )
          .replace(
            "nextConfig,\n                cacheHandler:",
            "nextConfig: globalThis.__NEXT_WORKER_SAFE(nextConfig),\n                cacheHandler:"
          );
      }
    }
  ];

  globalThis.__NEXT_WORKER_SAFE = function sanitizeForWorker(value) {
    if (typeof value === "function") {
      return undefined;
    }

    if (value === null || typeof value !== "object") {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizeForWorker(item))
        .filter((item) => item !== undefined);
    }

    const output = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const nextValue = sanitizeForWorker(nestedValue);

      if (nextValue !== undefined) {
        output[key] = nextValue;
      }
    }

    return output;
  };

  Module._extensions[".js"] = function patchedJs(module, filename) {
    const patch = patches.find((candidate) => filename.endsWith(candidate.suffix));

    if (patch) {
      let source = fs.readFileSync(filename, "utf8");
      source = patch.rewrite(source);
      module._compile(source, filename);
      return;
    }

    originalJsLoader(module, filename);
  };
}
