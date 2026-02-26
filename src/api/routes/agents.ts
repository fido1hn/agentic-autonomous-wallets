import { Hono } from "hono";
import { getActiveAppContext } from "../appContext";
import { jsonError, safeParseJson } from "../http";

interface CreateAgentBody {
  name?: string;
  status?: "active" | "paused";
}

const agentsRoutes = new Hono();

agentsRoutes.post("/agents", async (c) => {
  const body = await safeParseJson<CreateAgentBody>(c);
  if (!body || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError(c, 400, "BAD_REQUEST", "name is required");
  }

  if (body.status && body.status !== "active" && body.status !== "paused") {
    return jsonError(c, 400, "BAD_REQUEST", "status must be active or paused");
  }

  const { agentService, agentAuthService } = getActiveAppContext();
  const agent = await agentService.createAgent({
    name: body.name.trim(),
    status: body.status
  });

  const { apiKey } = await agentAuthService.issueKey(agent.id);
  return c.json({
    agentId: agent.id,
    name: agent.name,
    status: agent.status,
    apiKey
  });
});

export { agentsRoutes };
