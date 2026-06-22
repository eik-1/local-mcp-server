# learn-mcp

A learning MCP (Model Context Protocol) project built with the official TypeScript SDK. It contains both:

- a **server** (`src/index.ts`) that exposes tools, resources, prompts, and sampling to AI clients like Cursor, and
- a **CLI client** (`src/client.ts`) that connects to the server and lets you interact with those capabilities from the terminal, including LLM-powered queries via the Vercel AI SDK.

Data is stored in a local JSON file (`src/data/users.json`) — no external database required.

## Features

### Tools

| Tool | Description |
|------|-------------|
| `create-user` | Create a user with `name`, `email`, `address`, and `phone` |
| `create-random-user` | Uses MCP **sampling** to ask the client's AI to generate a fake user, then saves it |

### Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `users` | `users://all` | All users (static resource) |
| `user-details` | `users://{userId}/profile` | Single user by ID (resource template) |

### Prompts

| Prompt | Args | Description |
|--------|------|-------------|
| `generate-fake-name` | `name` | Returns a message template asking the AI to generate a fake user for a given name |

## Prerequisites

- Node.js 18+
- npm

## Getting started

```bash
# Install dependencies
npm install

# Build TypeScript (optional — Cursor config uses tsx directly)
npm run build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run build:watch` | Recompile on file changes |
| `npm start` | Run compiled server (`node build/index.js`) |
| `npm run mcp` | Run server via tsx (development) |
| `npm run dev` | Run with tsx watch mode |
| `npm run inspect` | Open MCP Inspector in the browser |
| `npm run client:dev` | Run the CLI client (`tsx src/client.ts`) |

## Cursor setup

This project includes `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "learn-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

After opening the project in Cursor:

1. Go to **Settings → MCP** and confirm `learn-mcp` is connected
2. Use **Agent mode** to invoke tools and read resources
3. Reload the window if the server doesn't appear (`Ctrl+Shift+P` → "Developer: Reload Window")

### Example prompts in Cursor

```
Create a user named Alice with email alice@example.com, address 42 Oak St, phone 555-1234
Show me all users
Read users://5/profile
Use the generate-fake-name prompt with name "Jared Leto"
```

## CLI client

`src/client.ts` is a standalone MCP client that spawns the server over stdio and gives you an interactive terminal menu. It's a hands-on way to exercise every capability without Cursor or the Inspector.

```bash
# Requires GOOGLE_API_KEY in .env for the Query and sampling features
npm run client:dev
```

The menu offers:

| Option | What it does |
|--------|--------------|
| **Query** | Runs your natural-language prompt through Gemini (`gemini-2.5-flash`), letting the model call the server's tools to answer |
| **Tools** | Pick a tool and fill in its arguments interactively, then see the result |
| **Resources** | Read a static resource or a resource template (prompts you for `{placeholders}` like `userId`) |
| **Prompts** | Pick a prompt, supply its arguments, and optionally run the generated message through the LLM |

The client also advertises the **sampling** capability, so server-initiated `sampling/createMessage` requests (used by `create-random-user`) are fulfilled locally — with a confirmation prompt before any LLM call runs.

> Requires a `GOOGLE_API_KEY` in `.env`. The Query and sampling features call the Google Generative AI API via the Vercel AI SDK.

## MCP Inspector

Test tools, resources, and prompts without Cursor:

```bash
npm run inspect
```

Open the URL printed in the terminal (usually `http://localhost:6274`).

> **Stdio rule:** Never run the server through `npm run dev` in MCP config — npm prints to stdout and breaks the JSON-RPC transport. Always use `tsx src/index.ts` or `node build/index.js` directly.

## Project structure

```
├── .cursor/
│   └── mcp.json          # Cursor MCP configuration
├── src/
│   ├── index.ts          # Server entry point
│   ├── client.ts         # Interactive CLI client
│   └── data/
│       └── users.json    # User "database"
├── build/                # Compiled output (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Transport

Uses **stdio** — the client spawns the server process and communicates over stdin/stdout. This is the standard setup for local MCP servers in Cursor and Claude Desktop.

## Sampling note

`create-random-user` calls `sampling/createMessage`, which asks the **client** (not the server) to run an LLM and return generated text. This requires the client to support the sampling capability.

- Works when the client implements `sampling/createMessage` and the user approves the request
- **Cursor may not fully support sampling yet** — if `create-random-user` fails with `Method not found`, use `create-user` instead

## Development notes

- Use `registerTool()`, `registerResource()`, and `registerPrompt()` — the older `.tool()`, `.resource()`, and `.prompt()` methods are deprecated
- Resource templates need a `list` callback for Cursor to discover individual URIs
- Use `console.error()` for debug logs — never `console.log()` on stdio transport (stdout is reserved for JSON-RPC)
- `McpServer` constructor takes two arguments: server info (`name`, `version`) and options (`capabilities`, etc.)

## License

ISC
