import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Încarcă explicit .env din folderul curent (server/)
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("GEOAPIFY_API_KEY =", process.env.GEOAPIFY_API_KEY);
console.log("LLM_PROVIDER =", process.env.LLM_PROVIDER);
console.log("OLLAMA_API_URL =", process.env.OLLAMA_API_URL);

