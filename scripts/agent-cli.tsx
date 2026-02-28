import React, { useCallback, useMemo, useState } from "react";
import { Agent, MemorySession, run, tool } from "@openai/agents";
import { Box, render, Text, useApp, useInput } from "ink";
import { z } from "zod";
import { AegisApiClient, AegisApiError } from "../src/demo/agent/AegisApiClient";
import { loadSkillsDocument } from "../src/demo/agent/skillsLoader";
import { createAgentSession } from "../src/demo/agent/session";

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
    "Only call tools when user asks for Aegis operations (register, wallet, session).",
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

  const agent = useMemo(
    () =>
      new Agent({
        name: `Aegis Demo Agent (${config.name})`,
        instructions: buildInstructions(skillsDoc),
        model: config.model,
        tools: [createAgentTool, createWalletTool, getWalletTool, showSessionTool],
      }),
    [config.model, config.name, createAgentTool, createWalletTool, getWalletTool, showSessionTool, skillsDoc]
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
