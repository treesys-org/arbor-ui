
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

    // --- LOCAL LOGIC ENGINE ---

    analyzeLocalContent(node) {
        if (!node || !node.content) return null;
        
        const text = node.content;
        const lines = text.split('\n');
        
        // 1. Extract first meaningful paragraph (Summary)
        let summary = "No hay contenido de texto claro.";
        for (let line of lines) {
            const clean = line.trim();
            if (clean && !clean.startsWith('@') && !clean.startsWith('#') && !clean.startsWith('![')) {
                // Strip markdown bold/italic
                summary = clean.replace(/\*\*|\*/g, '');
                break;
            }
        }

        // 2. Count Quizzes
        const quizCount = (text.match(/@quiz:/g) || []).length;

        // 3. Estimate Reading Time (avg 200 words/min)
        const wordCount = text.split(/\s+/).length;
        const timeMin = Math.ceil(wordCount / 200);

        return { summary, quizCount, timeMin };
    }

    async chat(messages) {
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content;

        // 1. Check for LOCAL COMMANDS (Works offline)
        // Used by Quick Actions in UI
        if (lastMsg.startsWith('LOCAL_ACTION:')) {
            const action = lastMsg.split(':')[1];
            const node = store.value.selectedNode || store.value.previewNode;
            
            if (!node) return "Primero debes seleccionar o entrar a una lección.";

            const analysis = this.analyzeLocalContent(node);
            
            if (action === 'SUMMARIZE') {
                return `📝 **Resumen Rápido (Local):**\n\n"${analysis.summary}"`;
            }
            if (action === 'STATS') {
                return `📊 **Análisis de la Lección:**\n\n⏱️ Tiempo de lectura: ~${analysis.timeMin} min\n❓ Evaluaciones: ${analysis.quizCount}`;
            }
            if (action === 'NAV') {
                return `📍 **Ubicación:**\n\nEstás en: ${node.name}\nRuta: ${node.path}`;
            }
        }

        // 2. Smart Mode (Gemini)
        if (this.isSmartMode()) {
            try {
                const systemMsg = messages.find(m => m.role === 'system')?.content || '';
                
                const response = await this.client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: `${systemMsg}\n\nUser Question: ${lastMsg}`,
                    config: {
                        systemInstruction: "You are the Sage Owl of Arbor Academy. Keep answers concise, helpful, and encouraging. You are an educational assistant helping a student understand a specific lesson."
                    }
                });
                
                return response.text;
            } catch (e) {
                console.error("Gemini Error:", e);
                return "Huu huu... Mi cerebro en la nube está mareado (Error de API). Revisa tu llave.";
            }
        }

        // 3. Local Fallback (Chat attempt without AI)
        return "Mi cerebro inteligente está apagado. Solo puedo hacer análisis básicos locales (Resumen y Estadísticas). Conéctame a la nube para charlar de verdad.";
    }

    // Context-based tips (Synchronous / "Clippy" style)
    getContextTip(state) {
        const lang = state.lang;
        
        // Context 1: Reading a Lesson
        if (state.selectedNode) {
            const node = state.selectedNode;
            const analysis = this.analyzeLocalContent(node);
            if (analysis) {
                 if (lang === 'ES') return `Esta lección tiene ${analysis.quizCount} preguntas y toma unos ${analysis.timeMin} minutos.`;
                 return `This lesson has ${analysis.quizCount} quizzes and takes ~${analysis.timeMin} mins.`;
            }
        }

        // Context 2: Previewing
        if (state.previewNode) {
            const node = state.previewNode;
            if (lang === 'ES') return `Estás viendo "${node.name}". Pulsa ENTRAR para comenzar.`;
            return `Previewing "${node.name}". Press ENTER to start.`;
        }

        // Fallback Tips
        const tipsES = [
            "Tip: Riega tu árbol entrando todos los días.",
            "Tip: Los nodos rojos son Exámenes.",
            "Tip: Puedes usar la rueda del ratón para hacer zoom.",
            "Tip: Activa mi cerebro (API) para respuestas infinitas."
        ];
        return tipsES[Math.floor(Math.random() * tipsES.length)];
    }

    getSystemPrompt(contextNode, lang = 'EN') {
        const title = contextNode ? contextNode.name : 'General';
        const desc = contextNode ? (contextNode.description || '') : '';
        const content = contextNode ? (contextNode.content || '') : '';
        
        const cleanContent = content.length > 50000 ? content.substring(0, 50000) + '...(truncated)' : content;

        return `
        Current Context:
        Title: ${title}
        Description: ${desc}
        
        Lesson Content (Markdown):
        ${cleanContent}
        
        The user is currently reading this lesson. Use this content to answer their questions accurately. If the content doesn't contain the answer, say so, but offer general knowledge.
        `;
    }
}

export const aiService = new HybridAIService();
