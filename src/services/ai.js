
import { GoogleGenAI } from "@google/genai";
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { store } from "../store.js";

// AI Service (Hybrid: Local RAG + Cloud Gemini/Local Ollama/WebLLM)
class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: localStorage.getItem('arbor_ai_provider') || 'none', // 'gemini' | 'ollama' | 'webllm' | 'none'
            apiKey: localStorage.getItem('arbor_gemini_key') || null,
            ollamaModel: localStorage.getItem('arbor_ollama_model') || 'llama3',
            webllmModel: localStorage.getItem('arbor_webllm_model') || 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
        };
        this.client = null;
        this.webllmEngine = null;
        this.ollamaHost = 'http://127.0.0.1:11434';
        this.currentController = null; // Store controller to allow aborting
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.provider) localStorage.setItem('arbor_ai_provider', newConfig.provider);
        if (newConfig.apiKey !== undefined) {
             if (newConfig.apiKey) localStorage.setItem('arbor_gemini_key', newConfig.apiKey);
             else localStorage.removeItem('arbor_gemini_key');
        }
        if (newConfig.ollamaModel) localStorage.setItem('arbor_ollama_model', newConfig.ollamaModel);
        if (newConfig.webllmModel) localStorage.setItem('arbor_webllm_model', newConfig.webllmModel);

        this.initializeClient();
    }

    isSmartMode() {
        return this.config.provider !== 'none';
    }

    async initialize() {
        if (this.onProgress) this.onProgress({ text: "Despertando al Búho..." });
        await this.initializeClient();
        await new Promise(r => setTimeout(r, 500));
        return true;
    }

    async initializeClient() {
        // Gemini
        if (this.config.provider === 'gemini' && this.config.apiKey) {
            this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
        } 
        
        // WebLLM (Needs specific init)
        if (this.config.provider === 'webllm' && !this.webllmEngine) {
             // Does not auto-init engine here to avoid massive download on startup.
             // UI must call explicit load.
        }

        if (this.config.provider !== 'gemini') {
            this.client = null;
        }
    }
    
    // Explicitly load WebLLM (triggered by UI button)
    async loadWebLLM(progressCallback) {
        if (this.webllmEngine) return true; // Already loaded
        
        try {
            this.webllmEngine = await CreateMLCEngine(
                this.config.webllmModel,
                { initProgressCallback: (report) => {
                    if (progressCallback) progressCallback(report.text);
                }}
            );
            return true;
        } catch (e) {
            console.error("WebLLM Init Error", e);
            if (progressCallback) progressCallback("Error: " + e.message);
            return false;
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
            const response = await fetch(`${this.ollamaHost}/api/tags`);
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
            const response = await fetch(`${this.ollamaHost}/api/delete`, {
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
            const response = await fetch(`${this.ollamaHost}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) throw new Error("Pull failed");

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
            if (progressCallback) progressCallback("Error: " + e.message);
            return false;
        }
    }

    // --- LOCAL RAG ENGINE (Retrieval-Augmented Generation) ---
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

    analyzeLocalContent(node) {
        if (!node || !node.content) return null;
        
        const text = node.content;
        const quizCount = (text.match(/@quiz:/g) || []).length;
        const wordCount = text.split(/\s+/).length;
        const timeMin = Math.ceil(wordCount / 200);

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
        this.abort(); // Cancel any previous pending request

        const lastMsgObj = messages[messages.length - 1];
        const lastMsg = lastMsgObj.content;

        // 1. Check for LOCAL COMMANDS (Works offline without AI)
        if (lastMsg.startsWith('LOCAL_ACTION:')) {
            const action = lastMsg.split(':')[1];
            const node = contextNode || store.value.selectedNode || store.value.previewNode;
            
            if (!node) return { text: "Primero debes seleccionar o entrar a una lección." };

            const analysis = this.analyzeLocalContent(node);
            
            if (action === 'SUMMARIZE') return { text: `📝 **Resumen Rápido:**\n\n"${analysis.summary}"` };
            if (action === 'STATS') return { text: `📊 **Datos:**\n\n⏱️ Lectura: ~${analysis.timeMin} min\n❓ Preguntas: ${analysis.quizCount}` };
            if (action === 'NAV') return { text: `📍 **Ubicación:**\n\n${node.name}\n📂 ${node.path}` };
        }

        // 2. Determine System Context (RAG)
        let systemContext = "";
        if (contextNode && contextNode.content) {
            const relevantText = this.retrieveRelevantContext(lastMsg, contextNode.content);
            systemContext = `
            CONTEXT FROM CURRENT LESSON ("${contextNode.name}"):
            ${relevantText}
            
            INSTRUCTIONS:
            You are the Sage Owl of Arbor Academy.
            Use the LESSON CONTEXT above to answer if possible.
            Keep answers concise and encouraging.
            `;
        } else {
             systemContext = "You are the Sage Owl of Arbor Academy. Answer general questions helpfully.";
        }

        // 3. EXECUTE BASED ON PROVIDER
        
        // --- GEMINI (CLOUD) ---
        if (this.config.provider === 'gemini' && this.client) {
            try {
                const response = await this.client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        { role: 'user', parts: [{ text: systemContext + `\n\nUSER QUESTION: ${lastMsg}` }] }
                    ],
                    config: {
                        tools: [{ googleSearch: {} }], 
                    }
                });
                
                const text = response.text;
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
                return { text: "🦉 Error en la nube (Gemini). Revisa tu API Key." };
            }
        }

        // --- WEBLLM (BROWSER WEBGPU) ---
        if (this.config.provider === 'webllm') {
             try {
                 if (!this.webllmEngine) {
                     return { text: "🦉 El modelo WebGPU no está cargado. Ve a configuración y pulsa 'Cargar'." };
                 }

                 const messagesFormat = [
                    { role: 'system', content: systemContext },
                    ...messages
                 ];
                 
                 const reply = await this.webllmEngine.chat.completions.create({
                     messages: messagesFormat,
                     temperature: 0.7,
                     max_tokens: 1024
                 });
                 
                 return { text: reply.choices[0].message.content + "\n\n*(Generado en Navegador vía WebGPU)*" };

             } catch (e) {
                 console.error("WebLLM Error", e);
                 return { text: "🦉 Error WebLLM. Es posible que tu GPU no sea compatible o la memoria esté llena." };
             }
        }

        // --- OLLAMA (LOCAL CPU) ---
        if (this.config.provider === 'ollama') {
            try {
                // Prepare messages for Ollama format
                const ollamaMessages = [
                    { role: 'system', content: systemContext },
                    ...messages
                ];

                this.currentController = new AbortController();
                
                // Add a timeout signal (Safety fallback)
                const timeoutId = setTimeout(() => {
                    if (this.currentController) this.currentController.abort();
                }, 300000); // 5 minute hard timeout

                const response = await fetch(`${this.ollamaHost}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.config.ollamaModel,
                        messages: ollamaMessages,
                        stream: false,
                        options: {
                            num_predict: 2048, // Reverted to original
                            temperature: 0.7
                            // num_ctx removed to let Ollama use model defaults
                        }
                    }),
                    signal: this.currentController.signal
                });
                
                clearTimeout(timeoutId);
                this.currentController = null;

                if (!response.ok) {
                    throw new Error(`Ollama responded with status: ${response.status}`);
                }

                const data = await response.json();
                return { text: data.message.content + "\n\n*(Generado localmente en tu CPU)*" };

            } catch (e) {
                this.currentController = null;
                console.error("Ollama Error:", e);
                
                if (e.name === 'AbortError') {
                    return { text: "🦉 ...(Detenido por el usuario o timeout)..." };
                }
                return { text: `🦉 Error conectando con tu cerebro local.\n\nDiagnóstico posible:\n1. El modelo '${this.config.ollamaModel}' falló al cargar (Logs: "llm server error").\n2. Asegúrate de que Ollama siga corriendo en el puerto 11434.` };
            }
        }

        return { text: "Estoy en modo básico. Conéctame a la nube (Gemini), a tu CPU (Ollama) o usa WebGPU en Configuración." };
    }
}

export const aiService = new HybridAIService();