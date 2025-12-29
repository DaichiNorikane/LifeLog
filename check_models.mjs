import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("No API key found in environment variables.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const modelResponse = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent("Test");
        console.log("Direct Test Success:", modelResponse.response.text());
    } catch (e) {
        console.log("Direct Test Failed:", e.message);
    }

    // Unfortunately the SDK doesn't expose listModels easily in the helper, 
    // but we can try to infer or just print specific error details.
    // Actually, we can make a direct fetch to the API to list models if SDK fails.
}

// Better approach: Direct Fetch because SDK might hide listModels
async function fetchModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Available Models:");
        if (data.models) {
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log("No models found or error:", data);
        }
    } catch (error) {
        console.error("Error fetching models:", error);
    }
}

fetchModels();
