#!/usr/bin/env node

/**
 * kvl — the KVL GrowthOS command-line client.
 *
 * A real, working CLI for the platform's actual public API — exactly the 4
 * endpoints documented in src/lib/developer-platform-content.ts and
 * implemented by sdk/javascript/kvl-client.ts:
 *
 *   POST /api/v1/workflows/{workflowId}/trigger   (scope: workflows:trigger)
 *   GET  /api/export/companies                    (scope: export:companies:read)
 *   GET  /api/export/deals                         (scope: export:deals:read)
 *   GET  /api/export/contacts                      (scope: export:contacts:read)
 *
 * Auth: `Authorization: Bearer <raw_api_key>`, generated at
 * /dashboard/settings/api-manager. Error shape on failure is always the
 * real API response: `{ "error": "message" }`.
 *
 * This file is NOT published to npm. After `npm link` (or `npm install -g .`
 * from the repo root) it becomes available as the `kvl` command on your
 * PATH. Until then, run it directly with `node cli/kvl.js ...`.
 *
 * Requires only Node's built-in `fetch` (Node 18+) — no CLI-framework
 * dependency was added for this.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_BASE_URL = "https://growthos.kvlbusinesssolutions.com";
const CONFIG_DIR = path.join(os.homedir(), ".kvl");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const VALID_FORMATS = ["csv", "crm", "excel", "pdf"];

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Could not read config at ${CONFIG_PATH}: ${error.message}`);
  }
}

function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

/** Pulls `--flag value` / `--flag=value` pairs and bare `--flag` out of an argv slice, leaving positional args behind. */
function parseFlags(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const name = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function resolveBaseUrl(flags) {
  const config = loadConfig();
  const baseUrl = flags["base-url"] || config.baseUrl || DEFAULT_BASE_URL;
  return String(baseUrl).replace(/\/+$/, "");
}

function requireApiKey() {
  const config = loadConfig();
  if (!config.apiKey) {
    printError("No API key saved. Run `kvl auth <apiKey>` first (get one at /dashboard/settings/api-manager).");
    process.exit(1);
  }
  return config.apiKey;
}

function printError(message) {
  process.stderr.write(`Error: ${message}\n`);
}

/** Extracts a filename from a Content-Disposition header, if present. */
function filenameFromContentDisposition(header) {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

function extensionForFormat(format) {
  if (format === "excel") return "xlsx";
  if (format === "pdf") return "pdf";
  return "csv";
}

async function doFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    printError(`Network request to ${url} failed: ${error.message}`);
    process.exit(1);
  }
}

/** Reads the real `{ "error": "..." }` body from a non-2xx response, matching the API's documented error shape. */
async function extractApiError(response) {
  let message = `Request failed with status ${response.status}.`;
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // Body wasn't JSON — fall back to the generic message above.
  }
  return message;
}

async function cmdAuth(args) {
  const { flags, positional } = parseFlags(args);
  const apiKey = positional[0];

  if (!apiKey) {
    printError("Usage: kvl auth <apiKey>");
    process.exit(1);
  }

  // There's no "whoami" endpoint on the real API, so this only checks that
  // the key *looks* plausible (the real format is `gos_<64 hex chars>`,
  // src/app/profile/actions.ts) — it is not verified against the server
  // until your first real command.
  const looksPlausible = /^\S{20,}$/.test(apiKey);
  if (!looksPlausible) {
    printError("That doesn't look like a valid API key (expected a long token with no spaces, e.g. starting with \"gos_\").");
    process.exit(1);
  }
  if (!apiKey.startsWith("gos_")) {
    process.stdout.write('Note: real KVL GrowthOS API keys start with "gos_" — saving it anyway, but double-check where you copied it from.\n');
  }

  const config = loadConfig();
  config.apiKey = apiKey;
  if (flags["base-url"]) config.baseUrl = String(flags["base-url"]).replace(/\/+$/, "");
  saveConfig(config);

  process.stdout.write(`Saved API key to ${CONFIG_PATH}.\n`);
  process.stdout.write("This key is not validated yet — it'll be checked for real on your first `kvl workflows:trigger` or `kvl export:*` call.\n");
}

async function cmdTriggerWorkflow(args) {
  const { flags, positional } = parseFlags(args);
  const workflowId = positional[0];

  if (!workflowId) {
    printError("Usage: kvl workflows:trigger <workflowId> [--data '<json object>']");
    process.exit(1);
  }

  const apiKey = requireApiKey();
  const baseUrl = resolveBaseUrl(flags);
  const url = `${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/trigger`;

  const headers = { Authorization: `Bearer ${apiKey}` };
  let body;
  if (flags.data) {
    try {
      JSON.parse(flags.data);
    } catch {
      printError("--data must be valid JSON (a JSON object).");
      process.exit(1);
    }
    headers["Content-Type"] = "application/json";
    body = flags.data;
  }

  process.stdout.write(`POST ${url}\n`);
  const response = await doFetch(url, { method: "POST", headers, body });

  if (!response.ok) {
    const message = await extractApiError(response);
    printError(`(${response.status}) ${message}`);
    process.exit(1);
  }

  const json = await response.json();
  process.stdout.write(`${response.status} ${JSON.stringify(json)}\n`);
}

async function cmdExport(resource, args) {
  const { flags } = parseFlags(args);
  const format = flags.format || "csv";

  if (!VALID_FORMATS.includes(format)) {
    printError(`--format must be one of: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }

  const apiKey = requireApiKey();
  const baseUrl = resolveBaseUrl(flags);
  const url = new URL(`${baseUrl}/api/export/${resource}`);
  url.searchParams.set("format", format);

  process.stdout.write(`GET ${url.toString()}\n`);
  const response = await doFetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const message = await extractApiError(response);
    printError(`(${response.status}) ${message}`);
    process.exit(1);
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const defaultName = `${resource}-${format}-${dateStamp}.${extensionForFormat(format)}`;
  const outputName =
    (typeof flags.output === "string" && flags.output) ||
    filenameFromContentDisposition(response.headers.get("content-disposition")) ||
    defaultName;

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputName, buffer);

  process.stdout.write(`${response.status} OK — saved ${buffer.length} bytes to ${outputName}\n`);
}

function printHelp() {
  process.stdout.write(`kvl — KVL GrowthOS CLI

Usage:
  kvl auth <apiKey> [--base-url <url>]
      Save your API key to ${CONFIG_PATH}. Get a key at
      /dashboard/settings/api-manager. Not validated against the server
      until your first real command.

  kvl workflows:trigger <workflowId> [--data '<json>'] [--base-url <url>]
      POST /api/v1/workflows/{workflowId}/trigger (scope: workflows:trigger)
      Triggers a workflow run. Prints the real JSON response, e.g.
      202 {"runId":"..."}.

  kvl export:companies [--format csv|crm|excel|pdf] [--output <file>] [--base-url <url>]
      GET /api/export/companies (scope: export:companies:read)

  kvl export:deals [--format csv|crm|excel|pdf] [--output <file>] [--base-url <url>]
      GET /api/export/deals (scope: export:deals:read)

  kvl export:contacts [--format csv|crm|excel|pdf] [--output <file>] [--base-url <url>]
      GET /api/export/contacts (scope: export:contacts:read)

  kvl --help
      Show this message.

Flags:
  --base-url <url>   Override the API base URL (default: ${DEFAULT_BASE_URL}).
                      Persist a default with \`kvl auth <apiKey> --base-url <url>\`,
                      e.g. to point at a local dev server.

Config file: ${CONFIG_PATH}

Not published to npm yet. After \`npm link\` (or \`npm install -g .\`) from the
repo root, this becomes available as the \`kvl\` command on your PATH.
Until then: node cli/kvl.js <command>
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  const rest = argv.slice(1);

  switch (command) {
    case "auth":
      await cmdAuth(rest);
      break;
    case "workflows:trigger":
      await cmdTriggerWorkflow(rest);
      break;
    case "export:companies":
      await cmdExport("companies", rest);
      break;
    case "export:deals":
      await cmdExport("deals", rest);
      break;
    case "export:contacts":
      await cmdExport("contacts", rest);
      break;
    default:
      printError(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  printError(error && error.message ? error.message : String(error));
  process.exit(1);
});
