import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { confirm, input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CreateMessageRequestSchema, Prompt, PromptMessage, SamplingMessage, Tool } from "@modelcontextprotocol/sdk/types";
import { generateText, jsonSchema, stepCountIs, tool, ToolSet } from "ai";
import dotenv from "dotenv";
dotenv.config();

const mcp = new Client(
    {
        name: "learn-mcp-client",
        version: "1.0.0",
    },
    {
        capabilities: {
            sampling: {},
        },
    }
)

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
})

const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    stderr: "inherit",
});

async function main() {
    await mcp.connect(transport);

    const [
        { tools },
        { resources },
        { resourceTemplates },
        { prompts },
    ] = await Promise.all([
        mcp.listTools(),
        mcp.listResources(),
        mcp.listResourceTemplates(),
        mcp.listPrompts(),
    ]);

    mcp.setRequestHandler(CreateMessageRequestSchema, async request => {
        const texts: string[] = [];
        for (const message of request.params.messages) {
            const text = await handleServerMessagePrompt(message);
            if (text != null) {
                texts.push(text);
            }
        }

        return {
            role: "user",
            model: "gemini-2.5-flash",
            stopReason: "endTurn",
            content: {
                type: "text",
                text: texts.join("\n"),
            }
        }
    })

    console.log("You are connected ...");
    
    while (true) {
        const option = await select({
            message: "What would you like to do ?",
            choices: ["Query", "Tools", "Resources", "Prompts"],
        })

        switch (option) {
            case "Tools":
                const toolName = await select({
                    message: "Select a tool",
                    choices: tools.map(tool => ({
                        name: tool.annotations?.title || tool.name,
                        value: tool.name,
                        description: tool.description,
                    }))
                })
                const tool = tools.find(tool => tool.name === toolName);
                if (!tool) {
                    console.error("Tool not found");
                } else {
                    await handleTool(tool);
                }
                break;
            
            case "Resources":
                const resourceUri = await select({
                    message: "Select a resource",
                    choices: [
                        ...resources.map((resource) => ({
                            name: resource.name,
                            value: resource.uri,
                            description: resource.description,
                        })),
                        ...resourceTemplates.map((resourceTemplate) => ({
                            name: resourceTemplate.name,
                            value: resourceTemplate.uriTemplate,
                            description: resourceTemplate.description,
                        })),
                    ]
                })
                const uri = resources.find((resource) => resource.uri === resourceUri)?.uri ?? 
                    resourceTemplates.find((resourceTemplate) => resourceTemplate.uriTemplate === resourceUri)?.uriTemplate;

                if (!uri) {
                    console.error("Resource not found");
                } else {
                    await handleResource(uri);
                }
                
                break;

            case "Prompts":
                const promptName = await select({
                    message: "Select a prompt",
                    choices: prompts.map((prompt) => ({
                        name: prompt.name,
                        value: prompt.name,
                        description: prompt.description,
                    }))
                })

                const prompt = prompts.find((prompt) => prompt.name === promptName);
                if (!prompt) {
                    console.error("Prompt not found");
                } else {
                    await handlePrompt(prompt);
                }
                break;

            case "Query":
                await handleQuery(tools);
                break;

            default:
                console.error("Invalid option");
                break;
        }
    }
}

async function handleQuery(tools: Tool[]) {
    const query = await input({message: "Enter your query:"});
    
    const {text, toolResults} = await generateText({
        model: google("gemini-2.5-flash"),
        prompt: query,
        tools: tools.reduce((obj, t) => ({
            ...obj,
            [t.name]: tool({
                description: t.description,
                inputSchema: jsonSchema(t.inputSchema),
                execute: async (args: Record<string, any>) => {
                    return await mcp.callTool({
                        name: t.name,
                        arguments: args,
                    })
                }
            })
        }), {} as ToolSet),
        stopWhen: stepCountIs(10),
    })

    console.log(text || (toolResults[0]?.output as any)?.content?.[0]?.text || "No text generated");
}

async function handleTool(tool: Tool) {
    const args: Record<string, string> = {};

    for (const [key, value] of Object.entries(tool.inputSchema?.properties ?? {})) {
        args[key] = await input({
            message: `Enter the value for ${key} :`,
        })
    }

    const res = await mcp.callTool({
        name: tool.name,
        arguments: args
    })

    console.log((res.content as [{text: string}])[0].text);
}

async function handleResource(uri: string) {
    let finalUri = uri;
    const paramMatches = uri.match(/{([^}]+)}/g);

    if (paramMatches !== null) {
        for (const paramMatch of paramMatches) {
            const paramName = paramMatch.replace("{", "").replace("}", "");
            const paramValue = await input({
                message: `Enter the value for ${paramName} :`,
            })
            finalUri = finalUri.replace(paramMatch, paramValue);
        }
    }

    const res = await mcp.readResource({
        uri: finalUri,
    })

    console.log(JSON.stringify(JSON.parse((res.contents[0] as {text: string}).text), null, 2));

}

async function handlePrompt(prompt: Prompt) {
    const args: Record<string, string> = {};

    for (const arg of prompt.arguments ?? []) {
        args[arg.name] = await input({
            message: `Enter the value for ${arg.name} :`,
        })
    }

    const res = await mcp.getPrompt({
        name: prompt.name,
        arguments: args,
    })

    for (const message of res.messages) {
        console.log(await handleServerMessagePrompt(message))
    }
}

async function handleServerMessagePrompt(message: PromptMessage | SamplingMessage) {
    // content may be a single block (PromptMessage) or an array of blocks (SamplingMessage)
    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    const textBlock = blocks.find((block) => block.type === "text");
    if (textBlock == null) {
        return;
    }

    console.log(textBlock.text);
    const run = await confirm({
        message: "Would you like to run the prompt ?",
        default: true,
    })

    if (!run) return;

    const {text} = await generateText({
        model: google("gemini-2.5-flash"),
        prompt: textBlock.text,
    })

    return text;
}

main().catch((error) => {
    console.error("Client failed:", error);
    process.exit(1);
});
