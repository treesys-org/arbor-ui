
import { CreateMLCEngine } from "@mlc-ai/web-llm";

// Model: Gemma 3 1B (High efficiency, low VRAM usage)
const SELECTED_MODEL = "gemma-3-1b-it-q4f32_1-MLC";

class LocalAIService {
    constructor() {
        this.engine = null;
        this.initProgressCallback = null;
    }

    setCallback(cb) {
        this.initProgressCallback = cb;
    }

    async initialize() {
        if (this.engine) return;

        try {
            this.engine = await CreateMLCEngine(
                SELECTED_MODEL,
                {
                    initProgressCallback: (progress) => {
                        if (this.initProgressCallback) {
                            this.initProgressCallback(progress);
                        }
                    },
                }
            );
            return true;
        } catch (e) {
            console.error("Failed to load WebLLM", e);
            throw e;
        }
    }

    async chat(messages) {
        if (!this.engine) throw new Error("AI not initialized");

        try {
            const response = await this.engine.chat.completions.create({
                messages: messages,
                temperature: 0.7,
                max_tokens: 500, 
            });
            return response.choices[0].message.content;
        } catch (e) {
            console.error("Chat error", e);
            throw e;
        }
    }

    getSystemPrompt(contextNode, lang = 'EN') {
        const contextText = contextNode 
            ? `Current Context: Lesson "${contextNode.name}". Description: "${contextNode.description}".` 
            : "Context: The user is exploring the knowledge tree.";

        if (lang === 'ES') {
            return `Eres el "Sabio Búho" de Arbor, una plataforma educativa abierta.
            Tu misión es ayudar al estudiante a entender el tema actual de forma breve, alentadora y sabia.
            Usa emojis de búhos o naturaleza ocasionalmente.
            Responde siempre en Español.
            ${contextText}`;
        } else {
            return `You are the "Sage Owl" of Arbor, an open educational platform.
            Your mission is to help the student understand the current topic in a brief, encouraging, and wise manner.
            Use owl or nature emojis occasionally.
            ${contextText}`;
        }
    }
}

export const aiService = new LocalAIService();
