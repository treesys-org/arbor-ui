
import { store } from "../store.js";
import { puterSync } from "./puter-sync.js"; 

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: localStorage.getItem('arbor_ai_provider') || 'puter', 
            ollamaModel: localStorage.getItem('arbor_ollama_model') || 'llama3',
            ollamaHost: localStorage.getItem('arbor_ollama_host') || 'http://127.0.0.1:11434',
            browserModel: localStorage.getItem('arbor_browser_model') || 'Xenova/Qwen1.5-0.5B-Chat',
        };
        this.currentController = null; 
        
        // Worker State
        this.worker = null;
        this.workerReady = false;
        this.workerInitializing = false;
        this.workerPromise = null;
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.provider) localStorage.setItem('arbor_ai_provider', newConfig.provider);
        if (newConfig.ollamaModel) localStorage.setItem('arbor_ollama_model', newConfig.ollamaModel);
        if (newConfig.ollamaHost) localStorage.setItem('arbor_ollama_host', newConfig.ollamaHost);
        if (newConfig.browserModel) localStorage.setItem('arbor_browser_model', newConfig.browserModel);

        if (newConfig.provider === 'browser') {
            this.initWorker();
        }
    }

    async initialize() {
        if (this.config.provider === 'puter') {
            await puterSync.loadLibrary();
        }
        if (this.config.provider === 'browser') {
            await this.initWorker();
        }
        return true;
    }
    
    // --- WORKER MANAGEMENT ---
    
    async initWorker() {
        if (this.workerReady) return Promise.resolve();
        if (this.workerPromise) return this.workerPromise;
        
        this.workerInitializing = true;

        this.workerPromise = new Promise((resolve, reject) => {
            if (!this.worker) {
                try {
                    this.worker = new Worker(new URL('../workers/ai-worker.js', import.meta.url), { type: 'module' });
                    
                    this.worker.addEventListener('message', (e) => {
                        const { status, message, progress, text } = e.data;
                        
                        if (status === 'progress') {
                            if (this.onProgress) {
                                const pct = progress ? Math.round(progress) + '%' : '...';
                                this.onProgress({ text: `${message} ${pct}` });
                            }
                        } else if (status === 'ready') {
                            this.workerReady = true;
                            this.workerInitializing = false;
                            if (this.onProgress) this.onProgress({ text: 'Neural Engine Ready (CPU).' });
                            resolve(); // Resolve only when ready
                        } else if (status === 'error') {
                            console.error("Worker Error:", message);
                            this.workerInitializing = false;
                            this.workerPromise = null; // Reset promise to allow retry
                            if (this.onProgress) this.onProgress({ text: `Error: ${message}` });
                            reject(new Error(message));
                        }
                    });
                    
                    this.worker.addEventListener('error', (e) => {
                        console.error("Worker Global Error:", e);
                        if (this.onProgress) this.onProgress({ text: "Worker Initialization Failed (CSP/Security)" });
                        this.workerInitializing = false;
                        this.workerPromise = null;
                        reject(new Error("Worker Failed to Start"));
                    });

                } catch (e) {
                    console.error("Failed to create worker:", e);
                    if (this.onProgress) this.onProgress({ text: "Failed to start AI Worker. Check console." });
                    this.workerInitializing = false;
                    this.workerPromise = null;
                    reject(e);
                    return;
                }
            }

            // Trigger model load inside worker
            if (this.onProgress) this.onProgress({ text: 'Initializing Worker...' });
            
            this.worker.postMessage({ 
                type: 'init', 
                data: { model: this.config.browserModel } 
            });
        });
        
        return this.workerPromise;
    }
    
    async checkHealth() {
        if (this.config.provider === 'ollama') {
            try {
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
        } else if (this.config.provider === 'browser') {
            if (!this.worker) {
                try { await this.initWorker(); } catch(e) { return false; }
            }
            return true;
        } else {
            await puterSync.loadLibrary();
            return !!window.puter; 
        }
    }

    abort() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
        }
    }

    async listOllamaModels() {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/tags`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.warn("Could not list Ollama models", e);
            return null;
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
        
        try {
            const lang = store.value.lang || 'EN';
            const lastMsgObj = messages[messages.length - 1];
            const lastMsg = lastMsgObj.content;
            const mode = store.value.ai?.contextMode || 'normal';

            if (lastMsg.startsWith('LOCAL_ACTION:')) {
                return { text: "Command executed." };
            }

            let systemContext = "";
            const prompts = {
                EN: {
                    sage: "You are the Sage Owl of Arbor Academy. Answer concisely.",
                    guardrails: "If asked for dangerous real-world advice, refuse.",
                    context: "CONTEXT:",
                    architect: "ROLE: Architect.\nTASK: Generate JSON curriculum."
                },
                ES: {
                    sage: "Eres el Búho Sabio. Responde de forma concisa.",
                    guardrails: "Si piden consejos peligrosos, rechaza.",
                    context: "CONTEXTO:",
                    architect: "ROL: Arquitecto.\nTAREA: Generar JSON curricular."
                }
            };
            
            const currentPrompts = prompts[lang] || prompts['EN'];
            let retrievedContext = "";

            if (mode === 'architect') {
                systemContext = currentPrompts.architect;
            } else if (contextNode && contextNode.content) {
                retrievedContext = this.retrieveRelevantContext(lastMsg, contextNode.content);
                systemContext = `${currentPrompts.sage}`;
            } else {
                 systemContext = currentPrompts.sage;
            }

            // --- IN-BROWSER (WORKER) ---
            if (this.config.provider === 'browser') {
                // Ensure ready before sending message
                if (!this.workerReady) await this.initWorker();
                
                return new Promise((resolve, reject) => {
                    const handler = (e) => {
                        const { status, text, message } = e.data;
                        if (status === 'complete') {
                            this.worker.removeEventListener('message', handler);
                            
                            // Cleanup
                            let cleanText = text.replace(/^User Question:.*$/im, '').replace(/^Answer:/i, '').trim();
                            cleanText = cleanText.replace(/<end_of_turn>/g, '').trim(); 
                            cleanText = cleanText.replace(/<\|im_end\|>/g, '').trim();
                            
                            const footer = `<br><br><span class='text-[10px] text-green-600 dark:text-green-400 font-bold opacity-75'>⚡ ${this.config.browserModel} (CPU/Worker)</span>`;
                            resolve({ text: cleanText + footer });
                        }
                        if (status === 'error') {
                            this.worker.removeEventListener('message', handler);
                            reject(new Error(message));
                        }
                    };
                    
                    this.worker.addEventListener('message', handler);
                    
                    this.worker.postMessage({ 
                        type: 'generate', 
                        data: { messages, config: {} }
                    });
                });
            }

            // --- OLLAMA (LOCAL) ---
            if (this.config.provider === 'ollama') {
                const ollamaContext = retrievedContext ? `CONTEXT:\n${retrievedContext}\n\n` : "";
                const ollamaMessages = [
                    { role: 'system', content: systemContext },
                    { role: 'user', content: ollamaContext + lastMsg }
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

                if (!response.ok) throw new Error(`Ollama responded with Status ${response.status}`);

                const data = await response.json();
                const txt = data.message.content;
                
                const footer = "<br><br><span class='text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-75'>⚡ Local (Ollama)</span>";
                return { text: txt + footer };
            }

            // --- PUTER.JS (CLOUD) ---
            await puterSync.loadLibrary();

            if (!window.puter) throw new Error("Puter.js not loaded. Check internet.");
            
            const puterContext = retrievedContext ? `CONTEXT:\n${retrievedContext}\n\n` : "";
            const messagesFormat = [
                { role: 'system', content: systemContext },
                { role: 'user', content: puterContext + lastMsg }
            ];

            const response = await window.puter.ai.chat(messagesFormat);
            const txt = response?.message?.content || response.toString();
            
            const footer = `<br><br><div class='pt-2 mt-1 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400'>
                <span class='font-bold opacity-75'>Powered by Puter.com</span>
                <button class='btn-sage-privacy hover:text-blue-500 hover:underline transition-colors'>Disclaimer</button>
            </div>`;
            
            return { text: txt + footer };

        } catch (e) {
            console.error("Sage Chat Error:", e);
            
            let hint = "";
            const msg = e.message || e.toString();
            
            if (msg.includes('Failed to fetch') || msg.includes('Cross-Origin') || msg.includes('NetworkError')) {
                if (this.config.provider === 'ollama') {
                    hint = "<br><br><b>🚨 CORS ERROR DETECTED</b><br>Your browser blocked the connection to Ollama.<br>To fix this, restart Ollama with this command:<br><code class='bg-black text-white p-1 rounded'>OLLAMA_ORIGINS=\"*\" ollama serve</code>";
                } else if (this.config.provider === 'browser') {
                    hint = "<br><br><b>Hint:</b> The browser could not download the model. Check your internet connection.";
                }
            }
            
            if (msg.includes('401') || msg.includes('403')) {
                hint = "<br><br><b>🚨 ACCESS DENIED</b><br>The model you selected is Gated (Requires License).<br>Please switch to a public model like <b>Xenova/Qwen1.5-0.5B-Chat</b> in Settings.";
            }
            
            return { text: `🦉 <span class="text-red-500 font-bold">ERROR:</span> ${msg}${hint}` };
        }
    }
}

export const aiService = new HybridAIService();
