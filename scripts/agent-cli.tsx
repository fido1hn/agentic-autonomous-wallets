import React, { useCallback, useMemo, useState } from "react";
import { Agent, MemorySession, run, tool } from "@openai/agents";
import { Box, render, Text, useApp, useInput } from "ink";
import { z } from "zod";
import { AegisApiClient, AegisApiError } from "../src/demo/agent/AegisApiClient";
import { loadSkillsDocument } from "../src/demo/agent/skillsLoader";
import { createAgentSession } from "../src/demo/agent/session";
import type { ExecutionResultResponse } from "../src/demo/agent/types";

interface CliConfig {
  name: string;
  baseUrl: string;
  model: string;
}

interface ChatLine {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  text: string;
}

interface ToolLine {
  id: string;
  tool: string;
  status: "ok" | "error" | "info";
  detail: string;
}

function parseArgs(argv: string[]): CliConfig {
  const args = [...argv];
  const getArg = (flag: string): string | undefined => {
    const idx = args.findIndex((value) => value === flag);
    if (idx === -1) {
      return undefined;
    }
    return args[idx + 1];
  };

  const name = getArg("--name");
  if (!name || name.trim() === "") {
    throw new Error("Missing --name. Example: bun run scripts/agent-cli.tsx --name agent-alpha");
  }

  const baseUrl = getArg("--base-url") ?? "http://localhost:3000";
  const model = getArg("--model") ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  return { name: name.trim(), baseUrl: baseUrl.trim(), model: model.trim() };
}

function renderApiError(error: unknown): string {
  if (error instanceof AegisApiError) {
    const requestIdPart = error.requestId ? ` requestId=${error.requestId}` : "";
    return `API_ERROR status=${error.status} code=${error.code} message="${error.message}"${requestIdPart}`;
  }
  if (error instanceof Error) {
    return `ERROR ${error.message}`;
  }
  return `ERROR ${String(error)}`;
}

function buildInstructions(skillsDoc: string): string {
  return [
    "You are an autonomous wallet assistant for Aegis.",
    "Do normal conversation naturally.",
    "Only call tools when user asks for Aegis operations (register, wallet, balances, transfers, swaps, session).",
    "Use tools for wallet/account operations; do not invent API capabilities.",
    "Keep responses concise and operational unless user asks for detail.",
    "Never claim access to private keys.",
    "When an API error happens, report the requestId if present.",
    "",
    "Aegis skills contract follows:",
    skillsDoc,
  ].join("\n");
}

function labelColor(role: ChatLine["role"]): "cyan" | "green" | "yellow" | "red" {
  if (role === "assistant") return "green";
  if (role === "user") return "cyan";
  if (role === "error") return "red";
  return "yellow";
}

function roleLabel(role: ChatLine["role"]): string {
  if (role === "assistant") return "assistant";
  if (role === "user") return "you";
  if (role === "error") return "error";
  return "system";
}

function statusColor(status: ToolLine["status"]): "green" | "red" | "yellow" {
  if (status === "ok") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function renderExecutionResult(result: ExecutionResultResponse): string {
  if (result.status === "approved") {
    const count = result.txSignatures?.length ?? 1;
    return `approved txSignature=${result.txSignature}${count > 1 ? ` txCount=${count}` : ""}`;
  }
  return `rejected reasonCode=${result.reasonCode}${result.reasonDetail ? ` detail="${result.reasonDetail}"` : ""}`;
}

function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

function AgentCliApp({ config, skillsDoc }: { config: CliConfig; skillsDoc: string }) {
  const { exit } = useApp();
  const session = useMemo(() => createAgentSession(config.name), [config.name]);
  const runSession = useMemo(() => new MemorySession(), []);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([
    {
      id: crypto.randomUUID(),
      role: "system",
      text: `Agent "${config.name}" ready. Type /help for commands.`,
    },
  ]);
  const [toolEvents, setToolEvents] = useState<ToolLine[]>([]);

  const addChat = useCallback((role: ChatLine["role"], text: string) => {
    setChat((prev) => [...prev, { id: crypto.randomUUID(), role, text }]);
  }, []);

  const addToolEvent = useCallback((toolName: string, status: ToolLine["status"], detail: string) => {
    setToolEvents((prev) => [...prev, { id: crypto.randomUUID(), tool: toolName, status, detail }]);
  }, []);

  const api = useMemo(() => new AegisApiClient(config.baseUrl), [config.baseUrl]);

  const requireSession = useCallback(() => {
    const state = session.get();
    if (!state.agentId || !state.apiKey) {
      throw new Error("Missing session credentials. Call create_agent first.");
    }
    if (!state.walletRef) {
      throw new Error("Missing wallet binding. Call create_wallet first.");
    }
    return state;
  }, [session]);

  const createAgentTool = useMemo(
    () =>
      tool({
        name: "create_agent",
        description: "Register this agent in Aegis and store agentId + apiKey in local session.",
        parameters: z.object({}),
        execute: async () => {
          const created = await api.createAgent({
            name: session.get().name,
            status: "active",
          });
          session.setCredentials(created);
          addToolEvent("create_agent", "ok", `agentId=${created.agentId}`);
          return created;
        },
      }),
    [addToolEvent, api, session]
  );

  const createWalletTool = useMemo(
    () =>
      tool({
        name: "create_wallet",
        description: "Create or fetch this agent's wallet binding in Aegis.",
        parameters: z.object({}),
        execute: async () => {
          const state = session.get();
          if (!state.agentId || !state.apiKey) {
            throw new Error("Missing session credentials. Call create_agent first.");
          }
          const wallet = await api.createWallet(state.agentId, state.apiKey);
          session.setWallet(wallet);
          addToolEvent("create_wallet", "ok", `walletRef=${wallet.walletRef}`);
          return wallet;
        },
      }),
    [addToolEvent, api, session]
  );

  const getWalletTool = useMemo(
    () =>
      tool({
        name: "get_wallet",
        description: "Get current wallet binding for this agent from Aegis.",
        parameters: z.object({}),
        execute: async () => {
          const state = session.get();
          if (!state.agentId || !state.apiKey) {
            throw new Error("Missing session credentials. Call create_agent first.");
          }
          const wallet = await api.getWallet(state.agentId, state.apiKey);
          session.setWallet(wallet);
          addToolEvent("get_wallet", "ok", `walletRef=${wallet.walletRef}`);
          return wallet;
        },
      }),
    [addToolEvent, api, session]
  );

  const showSessionTool = useMemo(
    () =>
      tool({
        name: "show_session",
        description: "Show local in-memory auth and wallet session state.",
        parameters: z.object({}),
        execute: async () => session.get(),
      }),
    [session]
  );

  const getWalletBalanceTool = useMemo(
    () =>
      tool({
        name: "get_wallet_balance",
        description: "Fetch native SOL and SPL token balances for this agent wallet.",
        parameters: z.object({}),
        execute: async () => {
          const state = requireSession();
          const balances = await api.getBalances(state.agentId!, state.apiKey!);
          addToolEvent("get_wallet_balance", "ok", `sol=${balances.native.sol} tokens=${balances.tokens.length}`);
          return balances;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const transferSolTool = useMemo(
    () =>
      tool({
        name: "transfer_sol",
        description: "Transfer native SOL (lamports) from this wallet to another Solana address.",
        parameters: z.object({
          recipientAddress: z.string(),
          amountLamports: z.string(),
        }),
        execute: async ({ recipientAddress, amountLamports }) => {
          const state = requireSession();
          const result = await api.transferSol(state.agentId!, state.apiKey!, {
            recipientAddress,
            amountLamports,
            idempotencyKey: createIdempotencyKey(),
          });
          addToolEvent("transfer_sol", result.status === "approved" ? "ok" : "error", renderExecutionResult(result));
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const transferSplTool = useMemo(
    () =>
      tool({
        name: "transfer_spl",
        description: "Transfer SPL tokens from this wallet to another Solana address.",
        parameters: z.object({
          recipientAddress: z.string(),
          mintAddress: z.string(),
          amountAtomic: z.string(),
        }),
        execute: async ({ recipientAddress, mintAddress, amountAtomic }) => {
          const state = requireSession();
          const result = await api.transferSpl(state.agentId!, state.apiKey!, {
            recipientAddress,
            mintAddress,
            amountAtomic,
            idempotencyKey: createIdempotencyKey(),
          });
          addToolEvent("transfer_spl", result.status === "approved" ? "ok" : "error", renderExecutionResult(result));
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const swapTokensTool = useMemo(
    () =>
      tool({
        name: "swap_tokens",
        description:
          "Execute a token swap for this wallet. Use protocol=auto unless the user explicitly requests orca, raydium, or jupiter.",
        parameters: z.object({
          protocol: z.enum(["auto", "orca", "raydium", "jupiter"]),
          fromToken: z.string(),
          toToken: z.string(),
          amountLamports: z.string(),
        }),
        execute: async ({ protocol, fromToken, toToken, amountLamports }) => {
          const state = requireSession();
          const result = await api.swapTokens(state.agentId!, state.apiKey!, {
            protocol,
            fromToken,
            toToken,
            amountLamports,
            maxSlippageBps: 100,
            idempotencyKey: createIdempotencyKey(),
          });
          addToolEvent("swap_tokens", result.status === "approved" ? "ok" : "error", renderExecutionResult(result));
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const getWalletPoliciesTool = useMemo(
    () =>
      tool({
        name: "get_wallet_policies",
        description: "List the active and assigned policies for this wallet.",
        parameters: z.object({}),
        execute: async () => {
          const state = requireSession();
          const result = await api.getWalletPolicies(state.agentId!, state.apiKey!);
          addToolEvent("get_wallet_policies", "ok", `count=${result.count}`);
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const createPolicyTool = useMemo(
    () =>
      tool({
        name: "create_policy",
        description:
          "Create a wallet policy. Pass dslJson as a JSON string matching aegis.policy.v1 or aegis.policy.v2. Useful rule kinds include allowed_recipients, blocked_recipients, allowed_swap_protocols, allowed_swap_pairs, max_lamports_per_day_by_action, max_lamports_per_tx_by_action, and max_lamports_per_tx_by_mint. Use an empty description string if not needed.",
        parameters: z.object({
          name: z.string(),
          description: z.string(),
          dslJson: z.string(),
        }),
        execute: async ({ name, description, dslJson }) => {
          const state = requireSession();
          const dsl = JSON.parse(dslJson) as Record<string, unknown>;
          const policy = await api.createPolicy(state.agentId!, state.apiKey!, {
            name,
            description: description.trim() === "" ? undefined : description,
            dsl,
          });
          addToolEvent("create_policy", "ok", `policyId=${policy.id}`);
          return policy;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const updatePolicyTool = useMemo(
    () =>
      tool({
        name: "update_policy",
        description:
          "Update a policy. Use status=unchanged to keep status. Use empty strings for name/description/dslJson when not changing them. dslJson may be aegis.policy.v1 or aegis.policy.v2.",
        parameters: z.object({
          policyId: z.string(),
          name: z.string(),
          description: z.string(),
          status: z.enum(["unchanged", "active", "disabled"]),
          dslJson: z.string(),
        }),
        execute: async ({ policyId, name, description, status, dslJson }) => {
          const state = requireSession();
          const update: Record<string, unknown> = {};
          if (name.trim() !== "") update.name = name;
          if (description.trim() !== "") update.description = description;
          if (status !== "unchanged") update.status = status;
          if (dslJson.trim() !== "") update.dsl = JSON.parse(dslJson) as Record<string, unknown>;
          const policy = await api.updatePolicy(state.agentId!, state.apiKey!, policyId, update);
          addToolEvent("update_policy", "ok", `policyId=${policy.id} status=${policy.status}`);
          return policy;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const archivePolicyTool = useMemo(
    () =>
      tool({
        name: "archive_policy",
        description: "Archive a policy so it can no longer be edited or newly assigned.",
        parameters: z.object({
          policyId: z.string(),
        }),
        execute: async ({ policyId }) => {
          const state = requireSession();
          const result = await api.archivePolicy(state.agentId!, state.apiKey!, policyId);
          addToolEvent("archive_policy", "ok", `policyId=${result.id}`);
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const assignPolicyTool = useMemo(
    () =>
      tool({
        name: "assign_policy_to_wallet",
        description: "Assign a policy to this wallet with an explicit priority.",
        parameters: z.object({
          policyId: z.string(),
          priority: z.number().int().min(0).max(1000),
        }),
        execute: async ({ policyId, priority }) => {
          const state = requireSession();
          const result = await api.assignPolicy(state.agentId!, state.apiKey!, policyId, { priority });
          addToolEvent("assign_policy_to_wallet", "ok", `policyId=${result.policyId} priority=${priority}`);
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const removePolicyTool = useMemo(
    () =>
      tool({
        name: "remove_policy_from_wallet",
        description: "Unassign a policy from this wallet without deleting the policy.",
        parameters: z.object({
          policyId: z.string(),
        }),
        execute: async ({ policyId }) => {
          const state = requireSession();
          const result = await api.unassignPolicy(state.agentId!, state.apiKey!, policyId);
          addToolEvent("remove_policy_from_wallet", "ok", `policyId=${result.policyId}`);
          return result;
        },
      }),
    [addToolEvent, api, requireSession]
  );

  const agent = useMemo(
    () =>
      new Agent({
        name: `Aegis Demo Agent (${config.name})`,
        instructions: buildInstructions(skillsDoc),
        model: config.model,
        tools: [
          createAgentTool,
          createWalletTool,
          getWalletTool,
          showSessionTool,
          getWalletBalanceTool,
          transferSolTool,
          transferSplTool,
          swapTokensTool,
          getWalletPoliciesTool,
          createPolicyTool,
          updatePolicyTool,
          archivePolicyTool,
          assignPolicyTool,
          removePolicyTool,
        ],
      }),
    [
      config.model,
      config.name,
      createAgentTool,
      createWalletTool,
      getWalletTool,
      showSessionTool,
      getWalletBalanceTool,
      transferSolTool,
      transferSplTool,
      swapTokensTool,
      getWalletPoliciesTool,
      createPolicyTool,
      updatePolicyTool,
      archivePolicyTool,
      assignPolicyTool,
      removePolicyTool,
      skillsDoc,
    ]
  );

  const handleCommand = useCallback(
    (raw: string): boolean => {
      const cmd = raw.trim();
      if (cmd === "/help") {
        addChat("system", "Commands: /help, /session, /reset, /exit");
        return true;
      }
      if (cmd === "/session") {
        addChat("system", JSON.stringify(session.get(), null, 2));
        return true;
      }
      if (cmd === "/reset") {
        session.clear();
        addChat("system", "Session cleared.");
        addToolEvent("session", "info", "cleared");
        return true;
      }
      if (cmd === "/exit") {
        exit();
        return true;
      }
      return false;
    },
    [addChat, addToolEvent, exit, session]
  );

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) {
        return;
      }

      if (trimmed.startsWith("/") && handleCommand(trimmed)) {
        return;
      }

      addChat("user", trimmed);
      setBusy(true);
      try {
        const result = await run(agent, trimmed, { session: runSession, maxTurns: 10 });
        addChat("assistant", String(result.finalOutput ?? ""));
      } catch (error) {
        const message = renderApiError(error);
        addChat("error", message);
        addToolEvent("runtime", "error", message);
      } finally {
        setBusy(false);
      }
    },
    [addChat, addToolEvent, agent, busy, handleCommand, runSession]
  );

  useInput((value, key) => {
    if (key.ctrl && value === "c") {
      exit();
      return;
    }

    if (key.return) {
      const next = input;
      setInput("");
      void submit(next);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && value) {
      setInput((prev) => prev + value);
    }
  });

  const sessionState = session.get();
  const chatLines = chat.slice(-14);
  const toolLines = toolEvents.slice(-8);

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="greenBright" bold>
        Aegis Agent CLI
      </Text>
      <Text dimColor>
        agent={config.name} baseUrl={config.baseUrl} model={config.model}
      </Text>

      <Box marginTop={1}>
        <Box flexDirection="column" width="70%" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">
            Chat
          </Text>
          {chatLines.map((line) => (
            <Text key={line.id}>
              <Text color={labelColor(line.role)} bold>
                {roleLabel(line.role)}&gt;
              </Text>{" "}
              {line.text}
            </Text>
          ))}
        </Box>

        <Box
          marginLeft={1}
          flexDirection="column"
          width="30%"
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
        >
          <Text bold color="yellow">
            Session
          </Text>
          <Text>agentId: {sessionState.agentId ?? "-"}</Text>
          <Text>walletRef: {sessionState.walletRef ?? "-"}</Text>
          <Text>address: {sessionState.walletAddress ?? "-"}</Text>
          <Text>provider: {sessionState.provider ?? "-"}</Text>
          <Text>busy: {busy ? "yes" : "no"}</Text>
          <Text>apiKey: {sessionState.apiKey ? "set" : "-"}</Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text bold color="magenta">
          Tool Timeline
        </Text>
        {toolLines.length === 0 ? (
          <Text dimColor>No tool calls yet.</Text>
        ) : (
          toolLines.map((line) => (
            <Text key={line.id}>
              <Text color={statusColor(line.status)}>{line.status.toUpperCase()}</Text> {line.tool}: {line.detail}
            </Text>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="cyan" bold>
          you&gt;
        </Text>
        <Text> {input}</Text>
      </Box>
      <Text dimColor>Enter to send • /help • /session • /reset • /exit • Ctrl+C</Text>
    </Box>
  );
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === "") {
    throw new Error("OPENAI_API_KEY is required to run agent-cli.");
  }
  const config = parseArgs(process.argv.slice(2));
  const skillsDoc = await loadSkillsDocument();
  render(<AgentCliApp config={config} skillsDoc={skillsDoc} />);
}

main().catch((error) => {
  console.error(renderApiError(error));
  process.exit(1);
});
