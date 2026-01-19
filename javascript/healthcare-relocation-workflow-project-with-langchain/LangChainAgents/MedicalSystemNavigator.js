// node index.js
import { createAgent, tool } from 'langchain';
import { z } from 'zod';

const MCP_URL =
  'https://api.orkes-demo.orkesconductor.io/dr-finder-service/mcp';

/**
 * Generic MCP caller (matches your curl + your existing agent pattern).
 */
const callMcpTool = tool(
  async ({ toolName, args }) => {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args ?? {},
        },
        id: Date.now(),
      }),
    });

    const payload = await res.json();

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${JSON.stringify(payload)}`);
    }
    if (payload.error) {
      throw new Error(`MCP RPC error: ${JSON.stringify(payload.error)}`);
    }

    // Return STRING to avoid content-block issues
    return JSON.stringify(payload.result);
  },
  {
    name: 'call_mcp',
    description:
      'Call an MCP tool via JSON-RPC. Use toolName=GET_get_latest_information for Dutch healthcare KB updates when needed.',
    schema: z.object({
      toolName: z
        .string()
        .describe('MCP tool name (e.g. GET_get_latest_information)'),
      args: z.object({}).passthrough().optional(),
    }),
  }
);

function createDutchHealthcareNavigatorAgent() {
  return createAgent({
    model: 'openai:gpt-4o',
    tools: [callMcpTool],
    systemPrompt: `
You are a Dutch Healthcare System Navigator agent.

You have ONE tool: call_mcp.
The MCP endpoint is a knowledge base (KB) + update source for Dutch healthcare (laws, regulations, official guidance).

Goal:
- Help users understand how Dutch healthcare works with practical, accurate guidance.

CRITICAL: Answer-first policy
- First, try to answer from your general knowledge IF the question is general and timeless.
- ONLY call call_mcp when tool usage is required to be accurate or to avoid outdated info.

When the tool IS required (MUST call call_mcp):
- The user asks for "current", "latest", "as of 2025/2026", "new rules", "recent changes", or similar.
- The user asks for numeric amounts, deadlines, penalties, eligibility specifics, or legal/regulatory details that may change.
  Examples: eigen risico amount for the current year, premium ranges, exact registration deadlines, fines, new laws, regulator guidance updates.
- The user asks for citations/official sources or you feel uncertain (risk of being outdated).

When the tool is NOT required (answer directly):
- High-level explanations: what Zvw/Wlz are (conceptually), GP gatekeeper concept, what a huisarts does, typical care pathway, what “basisverzekering” vs supplementary means, what the NZa/IGJ are at a high level.
- Definitions and general workflow steps that don’t depend on current-year numbers.

If you call the tool:
- Use toolName="GET_get_latest_information".
- Pass args shaped like:
  { country: "Netherlands", topics: [...], recencyDays: 180 }
  - Use recencyDays=90 when user says "latest" or asks about changes.
  - Use recencyDays=365 for broader regulatory overviews.

Output format:
- Start with a short overview.
- Then sections with bullets:
  1) How it works
  2) What to do next (step-by-step)
  3) Costs + common pitfalls (ONLY include exact numbers if provided by MCP)
  4) If relevant: “What changed recently” (only if MCP returns changes)
- If MCP was used, add a "Sources" section with URLs/titles returned by MCP.
- If MCP was NOT used, do not invent citations; just answer clearly and mention that for up-to-date amounts the user can ask you to check.

Safety:
- No medical advice, no diagnosis, no medication changes.
- Administrative and system-navigation guidance only.

No follow-up questions. Make reasonable assumptions and proceed.
`.trim(),
  });
}

async function run() {
  const agent = await createDutchHealthcareNavigatorAgent();

  // Example 1: General question (should answer without MCP)
  const result1 = await agent.invoke({
    messages: [
      {
        role: 'user',
        content:
          'How does the Dutch healthcare system work in general for newcomers?',
      },
    ],
  });

  console.log('\n=== RESULT 1 (general) ===');
  console.log(result1.messages.at(-1)?.content);

  // Example 2: Time-sensitive question (should call MCP)
  const result2 = await agent.invoke({
    messages: [
      {
        role: 'user',
        content:
          'What is the current eigen risico in the Netherlands and have there been any recent changes to referral rules?',
      },
    ],
  });

  console.log('\n=== RESULT 2 (latest/current) ===');
  console.log(result2.messages.at(-1)?.content);
}

export { createDutchHealthcareNavigatorAgent, run };

if (import.meta.url === `file://${process.argv[1]}`) run().catch(console.error);
