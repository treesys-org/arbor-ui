import { GoogleGenAI } from "@google/genai";
import { store } from "../store.js";

// AI Service (Hybrid: Local Rule-Based + Cloud Gemini)
// Supports "Local/Offline" mode and "Smart/Gemini" mode (BYOK)

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
        // Smart Mode (Gemini)
        if (this.isSmartMode()) {
            try {
                const lastMsg = messages[messages.length - 1].content;
                const systemMsg = messages.find(m => m.role === 'system')?.content || '';
                
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
                return "Huu huu... Mi cerebro en la nube está mareado (Error de API).";
            }
        }

        // Local mode fallback
        return "Conecta mi cerebro para charlar.";
    }

    // Context-based tips (Synchronous / "Clippy" style)
    getContextTip(state) {
        const lang = state.lang;
        const ui = store.ui;

        // Context 1: Previewing a Node
        if (state.previewNode) {
            const node = state.previewNode;
            if (lang === 'ES') return `Has seleccionado "${node.name}". Pulsa "ENTRAR" para ver el contenido.`;
            return `You selected "${node.name}". Click "ENTER LESSON" to start learning.`;
        }

        // Context 2: Reading a Lesson
        if (state.selectedNode) {
            if (lang === 'ES') return "¡Sigue leyendo! Completa el quiz al final para ganar XP.";
            return "Keep reading! Finish the quiz at the end to earn XP.";
        }

        // Context 3: Certificates view
        if (state.viewMode === 'certificates') {
             if (lang === 'ES') return "Aquí están tus trofeos. Completa más módulos para llenar la estantería.";
             return "Here are your trophies. Complete more modules to fill the shelf.";
        }

        // Context 4: Idle / Exploring
        const tipsES = [
            "Arrastra el fondo para moverte por el mapa.",
            "Usa la rueda del ratón para hacer zoom.",
            "Haz clic en los círculos para expandir los temas.",
            "Riega tu árbol entrando todos los días para mantener la racha.",
            "Los nodos verdes ya están completados.",
            "Si activas mi cerebro (API Key), podré responder cualquier pregunta."
        ];
        const tipsEN = [
            "Drag the background to pan around the map.",
            "Use your mouse wheel to zoom in and out.",
            "Click on the circles to expand topics.",
            "Water your tree by visiting daily to keep your streak.",
            "Green nodes are already completed.",
            "If you activate my brain (API Key), I can answer any question."
        ];

        const list = lang === 'ES' ? tipsES : tipsEN;
        return list[Math.floor(Math.random() * list.length)];
    }

    getSystemPrompt(contextNode, lang = 'EN') {
        const title = contextNode ? contextNode.name : 'General';
        const desc = contextNode ? (contextNode.description || '') : '';
        return `Current Context: ${title}. ${desc}. The user is learning this topic.`;
    }
}

export const aiService = new HybridAIService();