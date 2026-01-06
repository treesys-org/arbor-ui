
import { GoogleGenAI } from "@google/genai";
import { store } from "../store.js";

// AI Service (Hybrid: Local RAG + Cloud Gemini with Grounding)
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

    // --- LOCAL RAG ENGINE (Retrieval-Augmented Generation) ---
    // Instead of sending the whole book, we find the relevant paragraphs.
    retrieveRelevantContext(userQuery, fullContent) {
        if (!fullContent) return "";

        // 1. Split content into logical chunks (paragraphs)
        const paragraphs = fullContent.split(/\n\s*\n/);
        
        // 2. Tokenize Query (remove stopwords in a real app, simplified here)
        const queryTokens = userQuery.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        
        if (queryTokens.length === 0) return fullContent.substring(0, 2000); // Fallback

        // 3. Score paragraphs based on keyword density
        const scored = paragraphs.map(p => {
            const lowerP = p.toLowerCase();
            let score = 0;
            queryTokens.forEach(token => {
                if (lowerP.includes(token)) score += 1;
            });
            return { text: p, score };
        });

        // 4. Sort and Pick Top Chunks (Limit to ~3000 chars context)
        scored.sort((a, b) => b.score - a.score);
        
        // Always include the first paragraph (Introduction) context
        const contextChunks = [paragraphs[0]]; 
        let currentLength = paragraphs[0].length;
        
        for (const item of scored) {
            if (item.score > 0 && !contextChunks.includes(item.text)) {
                if (currentLength + item.text.length < 3000) {
                    contextChunks.push(item.text);
                    currentLength += item.text.length;
                }
            }
        }

        return contextChunks.join('\n\n---\n\n');
    }

    analyzeLocalContent(node) {
        if (!node || !node.content) return null;
        
        const text = node.content;
        const quizCount = (text.match(/@quiz:/g) || []).length;
        const wordCount = text.split(/\s+/).length;
        const timeMin = Math.ceil(wordCount / 200);

        // Simple summary extraction
        let summary = "Contenido multimedia o breve.";
        const lines = text.split('\n');
        for (let line of lines) {
            const clean = line.trim();
            if (clean && !clean.startsWith('@') && !clean.startsWith('#') && clean.length > 50) {
                summary = clean.replace(/\*\*|\*/g, '').substring(0, 150) + "...";
                break;
            }
        }

        return { summary, quizCount, timeMin };
    }

    async chat(messages, contextNode = null) {
        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content;

        // 1. Check for LOCAL COMMANDS (Works offline)
        if (lastMsg.startsWith('LOCAL_ACTION:')) {
            const action = lastMsg.split(':')[1];
            const node = contextNode || store.value.selectedNode || store.value.previewNode;
            
            if (!node) return { text: "Primero debes seleccionar o entrar a una lección." };

            const analysis = this.analyzeLocalContent(node);
            
            if (action === 'SUMMARIZE') return { text: `📝 **Resumen Rápido:**\n\n"${analysis.summary}"` };
            if (action === 'STATS') return { text: `📊 **Datos:**\n\n⏱️ Lectura: ~${analysis.timeMin} min\n❓ Preguntas: ${analysis.quizCount}` };
            if (action === 'NAV') return { text: `📍 **Ubicación:**\n\n${node.name}\n📂 ${node.path}` };
        }

        // 2. Smart Mode (Gemini with RAG + Grounding)
        if (this.isSmartMode()) {
            try {
                // RAG: Get only relevant context from the lesson
                let systemContext = "";
                if (contextNode && contextNode.content) {
                    const relevantText = this.retrieveRelevantContext(lastMsg, contextNode.content);
                    systemContext = `
                    CONTEXT FROM CURRENT LESSON ("${contextNode.name}"):
                    ${relevantText}
                    
                    INSTRUCTIONS:
                    You are the Sage Owl of Arbor Academy.
                    1. Use the LESSON CONTEXT above to answer if possible.
                    2. If the answer is not in the context, use your built-in Google Search tool to find the answer.
                    3. Keep answers concise and encouraging.
                    `;
                } else {
                     systemContext = "You are the Sage Owl of Arbor Academy. Answer general questions helpfully.";
                }

                // Call Gemini with Grounding (Search)
                const response = await this.client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        { role: 'user', parts: [{ text: systemContext + `\n\nUSER QUESTION: ${lastMsg}` }] }
                    ],
                    config: {
                        tools: [{ googleSearch: {} }], // Enable Web Search
                    }
                });
                
                // Extract Text
                const text = response.text;
                
                // Extract Grounding Metadata (Sources)
                let sources = [];
                const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (groundingChunks) {
                    sources = groundingChunks
                        .filter(c => c.web && c.web.uri)
                        .map(c => ({ title: c.web.title, url: c.web.uri }));
                }

                return { text, sources };

            } catch (e) {
                console.error("Gemini Error:", e);
                return { text: "🦉 Mi conexión con la nube falló. Por favor revisa tu API Key." };
            }
        }

        // 3. Local Fallback
        return { text: "Estoy en modo Local. Conéctame a la nube (Configuración) para responder cualquier cosa." };
    }
}

export const aiService = new HybridAIService();
