// node index.js
import { createAgent, tool } from 'langchain';
import { z } from 'zod';

const MCP_URL =
  'https://api.orkes-demo.orkesconductor.io/dr-finder-service/mcp';

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

    // Return STRING to avoid OpenAI/LangChain content-block issues
    return JSON.stringify(payload.result);
  },
  {
    name: 'call_mcp',
    description:
      'Call an MCP tool via JSON-RPC. Use toolName=GET_find_doctor to retrieve doctors.',
    schema: z.object({
      toolName: z.string().describe('MCP tool name (e.g. GET_find_doctor)'),

      // IMPORTANT: avoid z.record(z.any()) with zod v4
      // This accepts any JSON object as args.
      args: z.object({}).passthrough().optional(),
    }),
  }
);

function createHealthcareProviderFinderAgent() {
  return createAgent({
    model: 'openai:gpt-4o',
    tools: [callMcpTool],
    systemPrompt: `You are a Healthcare Provider Finder agent.

You have ONE tool: call_mcp.

Rules:
- Use call_mcp to retrieve doctor data.
- For doctor search, call toolName = "GET_find_doctor".
- Do not ask follow-up questions.
- Assume primary care + the city the user mentioned + English preference when relevant.

Workflow:
1) call_mcp (GET_find_doctor)
2) parse the returned JSON
3) rank and present up to 3 options + next steps

Safety: no medical advice or medication changes.`,
  });
}

async function run() {
  const agent = await createHealthcareProviderFinderAgent();

  const result = await agent.invoke({
    messages: [
      {
        role: 'user',
        content:
          'I am moving to amsterdam and need an English-speaking primary care doctor soon.',
      },
    ],
  });

  console.log('\n=== AGENT RESULT ===');
  console.log(result.messages.at(-1)?.content);
}

export { createHealthcareProviderFinderAgent, run };

if (import.meta.url === `file://${process.argv[1]}`) run().catch(console.error);
