import OpenAI, { AzureOpenAI } from "openai";
import { AzureCliCredential, getBearerTokenProvider } from "@azure/identity";

type Provider = "azure" | "openai" | "ollama";
const PROVIDER = (process.env.LLM_PROVIDER ?? "azure") as Provider;

let _client: OpenAI | AzureOpenAI | null = null;

function buildClient(): OpenAI | AzureOpenAI {
  if (PROVIDER === "azure") {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
    const useEntra = (process.env.AZURE_OPENAI_USE_ENTRA ?? "").toLowerCase() === "true";
    if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT required");

    if (useEntra) {
      // Entra ID (AAD) auth — requires az login. Scope can be overridden for APIM/custom gateways.
      const scope = process.env.AZURE_OPENAI_ENTRA_SCOPE ?? "https://cognitiveservices.azure.com/.default";
      const credential = new AzureCliCredential();
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      return new AzureOpenAI({ endpoint, apiVersion, azureADTokenProvider });
    }

    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY required (or set AZURE_OPENAI_USE_ENTRA=true for Entra ID auth)");
    return new AzureOpenAI({ endpoint, apiKey, apiVersion });
  }
  if (PROVIDER === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required");
    const baseURL = process.env.OPENAI_BASE_URL;
    return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  if (PROVIDER === "ollama") {
    return new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      apiKey: "ollama",
    });
  }
  throw new Error(`Unknown LLM_PROVIDER: ${PROVIDER}`);
}

export function llm(): OpenAI | AzureOpenAI {
  if (!_client) _client = buildClient();
  return _client;
}

// Azure: deployment name. OpenAI/Ollama: model name.
export const CHAT_MODEL =
  PROVIDER === "azure"
    ? process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "gpt-4o"
    : PROVIDER === "openai"
      ? process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"
      : process.env.OLLAMA_CHAT_MODEL ?? "llama3.1";

export const EMBED_MODEL =
  PROVIDER === "azure"
    ? process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small"
    : PROVIDER === "openai"
      ? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
      : process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";

export const PROVIDER_NAME = PROVIDER;

export async function embed(text: string): Promise<number[]> {
  const r = await llm().embeddings.create({ model: EMBED_MODEL, input: text });
  return r.data[0].embedding;
}
