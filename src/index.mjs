#!/usr/bin/env node

// @anomalous/research-mcp v1.1.0
// MCP server for AI-powered research
// Usage: npx ilo415-research-mcp
// With API key: ANOMALOUS_API_KEY=ano_xxx npx ilo415-research-mcp

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";

const API_KEY = process.env.ANOMALOUS_API_KEY || "";
const API_URL = "https://research.anomalousagency.tech/api/v1/research";

// ─── Remote API mode (subscribers with API key) ────────────────────────────────

async function researchViaApi(query, type, maxResults) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ query, type, max_results: maxResults }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.result;
}

// ─── Local mode (no API key — runs Hermes CLI) ─────────────────────────────────

const PROMPTS = {
  company: (q, m) => `Research the following company: ${q}

Provide a structured intelligence report with:
1. Company overview (2-3 sentences)
2. Key facts (founded, headquarters, founders, employees, funding)
3. Products/Services offered
4. Recent news and developments (last 6 months)
5. Market position and competitors
6. Revenue/funding information if available
7. Relevant links

Keep it concise and factual. Max ${m} key findings.`,

  competitor: (q, m) => `Perform a competitive analysis of: ${q}

Provide a structured analysis with:
1. Market overview and landscape
2. Key competitors identified
3. Side-by-side comparison of strengths and weaknesses
4. Market positioning and differentiation
5. Pricing comparison if available
6. Strategic recommendations

Keep it concise and factual. Max ${m} key findings.`,

  industry: (q, m) => `Research the following industry/market: ${q}

Provide a structured industry analysis with:
1. Industry overview and definition
2. Market size and growth projections
3. Key players and market share
4. Trends and emerging technologies
5. Regulatory landscape
6. Challenges and opportunities
7. Relevant links

Keep it concise and factual. Max ${m} key findings.`,

  person: (q, m) => `Research the following person: ${q}

Provide a structured profile with:
1. Who they are (2-3 sentences)
2. Professional background and career highlights
3. Education
4. Notable achievements or publications
5. Current role and affiliations
6. Public presence (social media, talks, media coverage)

Keep it concise and factual. Max ${m} key findings.`,

  topic: (q, m) => `Research the following topic: ${q}

Provide a structured summary with:
1. Overview (2-3 sentences)
2. Key facts and context
3. Recent developments or news
4. Different perspectives or schools of thought
5. Relevant resources and links

Keep it concise and factual. Max ${m} key findings.`,

  scrape: (q, m) => `Extract and summarize information about the following: ${q}

If this is a URL, visit it and extract the key content. If it's a subject, research it comprehensively. Provide:
1. Main content summary
2. Key data points and facts
3. Sources and references
4. Key takeaways

Keep it concise and factual. Max ${m} key findings.`,
};

function runResearchLocal(query, type, maxResults) {
  const prompt = (PROMPTS[type] || PROMPTS.topic)(query, maxResults);
  const hermesCli = process.env.HERMES_CLI || "/home/hermes/.local/bin/hermes";
  const output = execSync(
    `${hermesCli} chat -q ${JSON.stringify(prompt)}`,
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, encoding: "utf-8", env: { ...process.env, HERMES_INTERACTIVE: "0", HERMES_QUIET: "1" } }
  );
  const lines = output.split("\n");
  const body = [];
  let capture = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("Query:")) { capture = true; continue; }
    if (capture && t && !t.startsWith("─") && !t.startsWith("Resume") && !t.startsWith("Session:")) {
      body.push(line.replace(/\u2500+/g, "").trim());
    }
  }
  return body.join("\n").trim() || output.slice(0, 3000);
}

// ─── Router: API key → remote API, otherwise local ────────────────────────────

async function runResearch(query, type, maxResults) {
  if (API_KEY) {
    return await researchViaApi(query, type, maxResults);
  }
  return runResearchLocal(query, type, maxResults);
}

// ─── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "anomalous-research",
  version: "1.1.0",
});

server.tool(
  "research_company",
  "Research a company: overview, key facts, recent news, market position, competitors.",
  { query: z.string().describe("Company name to research"), max_results: z.number().optional().describe("Max key findings (default 5)") },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "company", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "research_competitor",
  "Competitive analysis: market landscape, side-by-side comparison, positioning.",
  { query: z.string().describe("Company, product, or market to analyze"), max_results: z.number().optional() },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "competitor", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "research_industry",
  "Industry/market analysis: market size, key players, trends, regulatory landscape.",
  { query: z.string().describe("Industry or market name"), max_results: z.number().optional() },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "industry", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "research_person",
  "Person profile: background, career, education, achievements, public presence.",
  { query: z.string().describe("Person's name to research"), max_results: z.number().optional() },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "person", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "research_topic",
  "General topic research: context, facts, recent developments, perspectives.",
  { query: z.string().describe("Topic to research"), max_results: z.number().optional() },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "topic", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "research_scrape",
  "Extract and summarize content from a URL or subject.",
  { query: z.string().describe("URL or subject to extract/summarize"), max_results: z.number().optional() },
  async ({ query, max_results }) => {
    const result = await runResearch(query, "scrape", max_results ?? 5);
    return { content: [{ type: "text", text: result }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Anomalous Research MCP Server v1.1.0 — ${API_KEY ? "API key mode (remote)" : "local mode"}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});