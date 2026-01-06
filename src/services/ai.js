
import { GoogleGenAI } from "@google/genai";

// SERVICIO DE IA HÍBRIDO (GOGO v2)
// Soporta modo "Tonto/Local" (Gratis) y "Inteligente/Gemini" (BYOK - Bring Your Own Key)

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.apiKey = localStorage.getItem('arbor_gemini_key') || null;
        this.client = null;
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setApiKey(key) {
        if (!key) {
            this.apiKey = null;
            this.client = null;
            localStorage.removeItem('arbor_gemini_key');
            return;
        }
        this.apiKey = key;
        localStorage.setItem('arbor_gemini_key', key);
        this.client = new GoogleGenAI({ apiKey: key });
    }

    isSmartMode() {
        return !!this.apiKey;
    }

    async initialize() {
        if (this.onProgress) this.onProgress({ text: "Despertando al Búho..." });
        
        // Re-hydrate client if key exists
        if (this.apiKey && !this.client) {
            this.client = new GoogleGenAI({ apiKey: this.apiKey });
        }
        
        await new Promise(r => setTimeout(r, 500));
        return true;
    }

    async chat(messages) {
        // MODO INTELIGENTE (GEMINI)
        if (this.isSmartMode()) {
            try {
                // Convert Arbor messages format to Gemini format if strictly needed,
                // but usually we just send the prompt. Ideally we send history.
                // For simplicity/robustness in "Clippy" mode, we'll send a combined prompt.
                
                const lastMsg = messages[messages.length - 1].content;
                const systemMsg = messages.find(m => m.role === 'system')?.content || '';
                
                // Using the specific model requested
                const response = await this.client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `${systemMsg}\n\nUser Question: ${lastMsg}`,
                    config: {
                        systemInstruction: "You are the Sage Owl of Arbor Academy. Keep answers concise, helpful, and encouraging. You are an educational assistant."
                    }
                });
                
                return response.text;
            } catch (e) {
                console.error("Gemini Error:", e);
                return "Huu huu... Mi cerebro en la nube está mareado (Error de API). Usaré mi lógica local.";
            }
        }

        // MODO LOCAL (GRATIS / TONTO)
        return this.chatLocal(messages);
    }

    // El cerebro "tonto" basado en reglas (Copia del anterior)
    async chatLocal(messages) {
        await new Promise(r => setTimeout(r, 600));

        const lastMsgObj = messages[messages.length - 1];
        const userText = lastMsgObj.content.toLowerCase();
        
        // Reglas Locales
        if (userText.includes('ayuda') || userText.includes('help') || userText.includes('como funciona')) {
            return "Modo Local: Para navegar, arrastra el fondo. Haz clic en círculos para aprender. ¡Dame una API Key para que pueda explicarte todo!";
        }
        
        if (userText.includes('hola') || userText.includes('hi')) {
            return "¡Huu huu! Soy el Búho en modo Ahorro de Energía (Local). Si quieres que sea un genio, configúrame.";
        }

        if (userText.includes('fruta') || userText.includes('xp')) {
            return "Completa módulos para ganar frutas. Lee para ganar XP.";
        }

        const fallbacks = [
            "Interesante. Lee la lección en pantalla para saber más.",
            "¡Huu huu! Sigue estudiando.",
            "Sin mi cerebro de nube (API Key), solo puedo animarte. ¡Tú puedes!",
            "Esa es una buena pregunta para investigar en la lección."
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    getSystemPrompt(contextNode, lang = 'EN') {
        const title = contextNode ? contextNode.name : 'General';
        const desc = contextNode ? (contextNode.description || '') : '';
        // Pass content context if smart mode
        return `Current Context: ${title}. ${desc}. The user is learning this topic.`;
    }
}

export const aiService = new HybridAIService();
