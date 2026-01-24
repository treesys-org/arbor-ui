


import { store } from "../store.js";
import { puterSync } from "./puter-sync.js"; // Import to use the lazy loader

// AI Service (Simplified: Puter Default + Local Ollama Option)
class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: localStorage.getItem('arbor_ai_provider') || 'puter', // Default to Puter
            ollamaModel: localStorage.getItem('arbor_ollama_model') || 'llama3',
            ollamaHost: localStorage.getItem('arbor_ollama_host') || 'http://127.0.0.1:11434'
        };
        this.currentController = null; 
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.provider) localStorage.setItem('arbor_ai_provider', newConfig.provider);
        if (newConfig.ollamaModel) localStorage.setItem('arbor_ollama_model', newConfig.ollamaModel);
        if (newConfig.ollamaHost) localStorage.setItem('arbor_ollama_host', newConfig.ollamaHost);
    }

    isSmartMode() {
        return true; 
    }

    async initialize() {
        // If provider is Puter, pre-load the library when AI is explicitly initialized
        if (this.config.provider === 'puter') {
            await puterSync.loadLibrary();
        }
        return true;
    }
    
    // --- HEALTH CHECK ---
    async checkHealth() {
        if (this.config.provider === 'ollama') {
            try {
                // Short timeout to avoid hanging if Ollama is down
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(`${this.config.ollamaHost}/api/tags`, { 
                    method: 'GET',
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId);
                return response.ok;
            } catch (e) {
                return false;
            }
        } else {
            // Puter Check
            // We lazily load it here if needed
            await puterSync.loadLibrary();
            return !!window.puter; 
        }
    }

    // Abort current generation
    abort() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
        }
    }

    // --- OLLAMA MANAGEMENT API ---

    async listOllamaModels() {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/tags`);
            if (!response.ok) return [];
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.warn("Could not list Ollama models", e);
            return [];
        }
    }

    async deleteOllamaModel(name) {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            return response.ok;
        } catch (e) {
            console.error("Delete failed", e);
            return false;
        }
    }

    async pullOllamaModel(name, progressCallback) {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) throw new Error(store.ui.aiErrorPull || "Pull failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());
                
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.status) {
                            let msg = json.status;
                            if (json.completed && json.total) {
                                const percent = Math.round((json.completed / json.total) * 100);
                                msg += ` (${percent}%)`;
                            }
                            if (progressCallback) progressCallback(msg);
                        }
                    } catch (e) {}
                }
            }
            return true;
        } catch (e) {
            console.error("Pull failed", e);
            if (progressCallback) progressCallback((store.ui.aiErrorPull || "Error: ") + e.message);
            return false;
        }
    }

    // --- LOCAL RAG ENGINE ---
    retrieveRelevantContext(userQuery, fullContent) {
        if (!fullContent) return "";

        const paragraphs = fullContent.split(/\n\s*\n/);
        const queryTokens = userQuery.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        
        if (queryTokens.length === 0) return fullContent.substring(0, 2000); 

        const scored = paragraphs.map(p => {
            const lowerP = p.toLowerCase();
            let score = 0;
            queryTokens.forEach(token => {
                if (lowerP.includes(token)) score += 1;
            });
            return { text: p, score };
        });

        scored.sort((a, b) => b.score - a.score);
        
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

    async chat(messages, contextNode = null) {
        this.abort(); 
        const ui = store.ui;
        const lang = store.value.lang || 'EN';

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content;
        
        // Detect Context Mode from Store
        const mode = store.value.ai?.contextMode || 'normal';

        // 1. Check for LOCAL COMMANDS
        if (lastMsg.startsWith('LOCAL_ACTION:')) {
            return { text: "Command executed." };
        }

        // 2. Determine System Context
        let systemContext = "";
        
        // Dynamic Prompts
        const prompts = {
            EN: {
                sage: "You are the Sage Owl of Arbor Academy. Answer general questions helpfully and concisely.",
                context: "CONTEXT FROM CURRENT LESSON",
                architect: "ROLE: You are the Sage Constructor (Architect) of the Arbor Knowledge Tree.\nTASK: Generate structured curriculum blueprints in JSON format.\nRULES: Output MUST include a JSON block using ```json ... ``` following this schema: { \"title\": \"Title\", \"modules\": [ { \"title\": \"Module\", \"description\": \"\", \"lessons\": [ { \"title\": \"Lesson\", \"description\": \"\", \"outline\": \"Markdown content\" } ] } ] }"
            },
            ES: {
                sage: "Eres el Búho Sabio de la Academia Arbor. Responde preguntas generales de forma útil y concisa.",
                context: "CONTEXTO DE LA LECCIÓN ACTUAL",
                architect: "ROL: Eres el Arquitecto Sabio del Árbol de Conocimiento.\nTAREA: Generar planos de currículo estructurados en formato JSON.\nREGLAS: La salida DEBE incluir un bloque JSON usando ```json ... ``` siguiendo este esquema: { \"title\": \"Título\", \"modules\": [ { \"title\": \"Módulo\", \"description\": \"\", \"lessons\": [ { \"title\": \"Lección\", \"description\": \"\", \"outline\": \"Contenido Markdown\" } ] } ] }"
            }
        };
        
        const currentPrompts = prompts[lang] || prompts['EN'];
        
        if (mode === 'architect') {
            systemContext = currentPrompts.architect;
        } else if (contextNode && contextNode.content) {
            const relevantText = this.retrieveRelevantContext(lastMsg, contextNode.content);
            systemContext = `
            ${currentPrompts.context} ("${contextNode.name}"):
            ${relevantText}
            INSTRUCTIONS:
            ${currentPrompts.sage}
            `;
        } else {
             systemContext = currentPrompts.sage;
        }

        // 3. EXECUTE BASED ON PROVIDER

        // --- OLLAMA (LOCAL) ---
        if (this.config.provider === 'ollama') {
            try {
                const ollamaMessages = [
                    { role: 'system', content: systemContext },
                    ...messages
                ];

                this.currentController = new AbortController();
                const timeoutId = setTimeout(() => {
                    if (this.currentController) this.currentController.abort();
                }, 300000); 

                const response = await fetch(`${this.config.ollamaHost}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.config.ollamaModel,
                        messages: ollamaMessages,
                        stream: false,
                        options: { num_predict: 2048, temperature: 0.7 }
                    }),
                    signal: this.currentController.signal
                });
                
                clearTimeout(timeoutId);
                this.currentController = null;

                if (!response.ok) throw new Error(`Ollama status: ${response.status}`);

                const data = await response.json();
                const txt = data.message.content;
                const trimmedTxt = txt.trim();
                
                if ((trimmedTxt.startsWith('{') && trimmedTxt.endsWith('}')) || (trimmedTxt.startsWith('[') && trimmedTxt.endsWith(']'))) {
                    try { JSON.parse(trimmedTxt); return { text: txt }; } catch (e) {}
                }
                
                const footer = "<br><br><span class='text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-75'>⚡ Local Intelligence (Ollama)</span>";
                return { text: txt + footer };

            } catch (e) {
                this.currentController = null;
                console.error("Ollama Error:", e);
                // Use localized error prefix
                const prefix = store.ui.aiErrorLocal || "Local AI Error: ";
                return { text: `🦉 ${prefix}${e.message}\nEnsure Ollama is running at ${this.config.ollamaHost}` };
            }
        }

        // --- PUTER.JS (DEFAULT CLOUD) ---
        // Ensure library is loaded before call
        await puterSync.loadLibrary();

        try {
            if (!window.puter) {
                return { text: "🦉 Puter.js system failed to load. Check blocklist or connection." };
            }
            
            const messagesFormat = [
                { role: 'system', content: systemContext },
                ...messages
            ];

            const response = await window.puter.ai.chat(messagesFormat);
            const txt = response?.message?.content || response.toString();
            
            const trimmedTxt = txt.trim();
            if ((trimmedTxt.startsWith('{') && trimmedTxt.endsWith('}')) || (trimmedTxt.startsWith('[') && trimmedTxt.endsWith(']'))) {
                try { JSON.parse(trimmedTxt); return { text: txt }; } catch (e) {}
            }
            
            const footer = `<br><br><div class='pt-2 mt-1 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400'>
                <span class='font-bold opacity-75'>Powered by Puter.com</span>
                <button class='btn-sage-privacy hover:text-blue-500 hover:underline transition-colors'>Disclaimer</button>
            </div>`;
            
            return { text: txt + footer };

        } catch (e) {
            console.error("Puter Error:", e);
            // Use localized error prefix
            const prefix = store.ui.aiErrorCloud || "Cloud AI Error: ";
            return { text: `🦉 ${prefix}${e.message || "Connection failed"}` };
        }
    }

    // --- ARCHITECT MODE (Structure Generation) ---
    async generateStructure(topic, instructions = "") {
        const constraints = instructions 
            ? `USER INSTRUCTIONS: ${instructions}` 
            : `GUIDANCE: Create a standard course outline with at least 3 modules and 2 lessons per module.`;

        const prompt = `
        Act as a curriculum architect. Create a structured course outline for: "${topic}".
        ${constraints}
        Return strict JSON format with this structure:
        { "title": "Course Title", "description": "Brief desc", "modules": [ { "title": "Module Title", "description": "", "lessons": [ { "title": "Lesson Title", "description": "", "outline": "3 bullet points" } ] } ] }
        IMPORTANT: Return ONLY the JSON. No markdown.
        `;

        try {
            const response = await this.chat([{ role: 'user', content: prompt }]);
            let text = response.text;
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
            return JSON.parse(text);
        } catch (e) {
            console.error("Architect Error:", e);
            throw new Error("Failed to generate structure: " + e.message);
        }
    }
}

export const aiService = new HybridAIService();