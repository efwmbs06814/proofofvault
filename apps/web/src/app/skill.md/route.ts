import { agentSkillMarkdown } from "../../generated/agent-skill-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return new Response(agentSkillMarkdown, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/markdown; charset=utf-8"
    }
  });
}
