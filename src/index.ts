import {McpServer, ResourceTemplate} from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import z from "zod";
import fs from "node:fs/promises"
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types";

const server = new McpServer(
    {
        name: "learn-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
            prompts: {},
        },
    }
);

server.registerResource(
    "users",
    "users://all",
    {
        title: "Users",
        description: "Get all users data from the database",
        mimeType: "application/json",
    },
    async (uri) => {
        const users = await import("./data/users.json", {
            with: { type: "json" },
        }).then((m) => m.default);

        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify(users, null, 2),
                mimeType: "application/json",
            }],
        };
    }
);

server.registerResource(
    "user-details",
    new ResourceTemplate("users://{userId}/profile", {
        list: async () => {
            const users = await import("./data/users.json", {
                with: { type: "json" },
            }).then((m) => m.default);

            return {
                resources: users.map((user) => ({
                    uri: `users://${user.id}/profile`,
                    name: user.name,
                    mimeType: "application/json",
                })),
            };
        },
    }),
    {
        title: "User Details",
        description: "Get a user's details from the database",
        mimeType: "application/json",
    },
    async (uri, { userId }) => {
        const users = await import("./data/users.json", {
            with: { type: "json" },
        }).then((m) => m.default);

        const user = users.find((u) => u.id === Number(userId));

        if (!user) {
            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify({ error: "User not found" }),
                    mimeType: "application/json",
                }],
            };
        }

        return {
            contents: [{
                uri: uri.href,
                text: JSON.stringify(user, null, 2),
                mimeType: "application/json",
            }],
        };
    }
);

server.registerTool("create-random-user", {
    title: "Create Random User",
    description: "Create a random user in the database",
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
}, async () => {
    const res = await server.server.request({
        method: "sampling/createMessage",
        params: {
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Generate a fake user data. The user should have a realistic 
                    name, email, address and phone number. Return the user data in JSON format
                    with no other text or formatting.`
                }
            }],
            maxTokens: 1024
        }
    }, CreateMessageResultSchema)

    if (res.content.type !== "text") {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to generate user data",
                }
            ]
        }
    }

    try {
        const fakeUser = JSON.parse(res.content.text.trim().replace(/^```json\n|```$/g, '').trim());
    
        const id = await createUser(fakeUser);
        return {
            content: [
                { type: "text", text: `User created with id ${id}` },
            ],
        };
    } catch(err) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to generate user data",
                }
            ]
        }
    }
})

server.registerTool(
    "create-user",
    {
        title: "Create User",
        description: "Create a new user in the database",
        inputSchema: {
            name: z.string(),
            email: z.email(),
            address: z.string(),
            phone: z.string(),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    },
    async (args) => {
        try {
            const id = await createUser(args);
            return {
                content: [
                    { type: "text", text: `User created with id ${id}` },
                ],
            };
        } catch (err) {
            return {
                content: [
                    { type: "text", text: "Failed to save user" },
                ],
            };
        }
    }
);

async function createUser(user: {
    name: string,
    email: string,
    address: string,
    phone: string
}) {
    const users = await import("./data/users.json", {
        with: { type: "json" }
    }).then(m => m.default);

    const id = users.length + 1;

    users.push({ id, ...user });

    await fs.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
    return id;
}

server.registerPrompt("generate-fake-name", {
    title: "Generate Fake Name",
    description: "Generate a fake user based on a given name",
    argsSchema:  {
        name: z.string(),
    }
}, async (args) => {
    return {
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Generate a fake user based on the name ${args.name}. The user should have a realistic email, address and phone number.`,
            }
        }]
    }
})

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("MCP server failed to start:", error);
    process.exit(1);
});