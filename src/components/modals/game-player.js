
import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { storageManager } from '../../stores/storage-manager.js';

class ArborModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        this.cursorIndex = 0;
        this.activeNodeId = null;
        this.playlist = []; 
        this.isPreparing = true;
        this.needsConsent = false;
        this.checkingAI = false;
        this.aiError = null;
        this.error = null;
        this.scriptCache = new Map();
        
        // Tracking for notification
        this.sessionXP = 0;
    }

    async connectedCallback() {
        // Reset session stats
        this.sessionXP = 0;
        this.aiError = null;
        this.error = null;
        
        // Check provider first
        const isOllama = aiService.config.provider === 'ollama';
        
        // Check for unified AI consent key
        const hasConsent = localStorage.getItem('arbor-ai-consent') === 'true';
        
        // PRIVACY LOGIC:
        // If using Cloud (Puter) AND no consent => Show Warning.
        // If using Local (Ollama) => Skip Warning (User owns the data).
        if (!isOllama && !hasConsent) {
            this.needsConsent = true;
            this.render();
            return;
        }

        // 1. HEALTH CHECK: Verify AI Availability
        this.checkingAI = true;
        this.render();
        
        const isHealthy = await aiService.checkHealth();
        this.checkingAI = false;
        
        if (!isHealthy) {
            const provider = aiService.config.provider;
            this.aiError = provider === 'ollama' 
                ? "Could not connect to Local AI (Ollama). Please ensure it is running on localhost:11434." 
                : "Could not connect to Cloud AI (Puter). Please check your internet connection.";
            this.render();
            return;
        }

        // 2. LOAD GAME
        this.render();
        try {
            await this.prepareCurriculum();
            this.setupBridge();
            this.isPreparing = false;
            this.render();
            this.loadGame();
        } catch (e) {
            console.error("Failed to prepare game context", e);
            this.error = e.message;
            this.isPreparing = false;
            this.render();
        }
    }

    disconnectedCallback() {
        delete window.__ARBOR_GAME_BRIDGE__;
        this.scriptCache.forEach(url => URL.revokeObjectURL(url));
        this.scriptCache.clear();
    }

    close() {
        // Notification Logic
        if (this.sessionXP > 0) {
            const ui = store.ui;
            store.notify(`+${this.sessionXP} ${ui.xpUnit || 'XP'} - Session Complete`);
        }
        store.setModal('arcade'); 
    }
    
    grantConsent() {
        localStorage.setItem('arbor-ai-consent', 'true');
        this.needsConsent = false;
        this.connectedCallback();
    }
    
    retryConnection() {
        this.connectedCallback();
    }

    async prepareCurriculum() {
        const { moduleId } = store.value.modal || {};
        if (!moduleId) throw new Error("No context module selected.");
        
        this.activeNodeId = moduleId;
        const rootNode = store.findNode(moduleId);
        
        if (!rootNode) throw new Error("Could not find the selected module in memory.");

        this.playlist = [];
        const collectLeaves = async (node) => {
            if (node.type === 'leaf') {
                this.playlist.push(node);
                return;
            }
            if (node.type === 'exam') return;

            if (node.type === 'branch' || node.type === 'root') {
                if (node.hasUnloadedChildren) await store.loadNodeChildren(node);
                if (node.children) {
                    for (const child of node.children) await collectLeaves(child);
                }
            }
        };

        await collectLeaves(rootNode);
        this.cursorIndex = 0;
        if (this.playlist.length === 0) {
            throw new Error("This module contains no playable lessons. Please select a different module.");
        }
    }

    async fetchLessonContent(node) {
        if (!node) return null;
        if (!node.content && node.contentPath) await store.loadNodeContent(node);
        const raw = node.content || "";
        const clean = raw.replace(/<[^>]*>?/gm, '').replace(/@\w+:.*?\n/g, '').replace(/\s+/g, ' ').trim(); 
        return { id: node.id, title: node.name, text: clean, raw: raw };
    }
    
    setupBridge() {
        const gameId = store.value.modal.url;
        let storageId = "unknown_game";
        try {
            const urlObj = new URL(gameId);
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length >= 2) {
                storageId = pathParts[pathParts.length - 2];
            }
        } catch(e) { storageId = gameId; }

        window.__ARBOR_GAME_BRIDGE__ = {
            addXP: (amount) => {
                this.sessionXP += amount;
                store.addXP(amount, true); // Silent update
            },
            getCurriculum: () => this.playlist.map(l => ({ id: l.id, title: l.name })),
            
            getNextLesson: async () => {
                if (this.playlist.length === 0) return null;
                if (this.cursorIndex >= this.playlist.length) this.cursorIndex = 0; 
                const node = this.playlist[this.cursorIndex++];
                return await this.fetchLessonContent(node);
            },
            
            getLessonAt: async (index) => {
                if (index < 0 || index >= this.playlist.length) return null;
                return await this.fetchLessonContent(this.playlist[index]);
            },

            aiChat: async (promptMessages, contextNode) => {
                try {
                    // Calls Parent AI Service (which lazy loads if needed)
                    return await aiService.chat(promptMessages, contextNode);
                } catch(e) {
                    console.error("AI Bridge Error:", e);
                    throw e;
                }
            },
            
            save: (key, value) => {
                try {
                    return storageManager.saveGameData(storageId, key, value);
                } catch(e) {
                    console.error("Game Save Failed:", e);
                    store.notify("⚠️ Storage Full! Delete old saves in Arcade menu.");
                    return false;
                }
            },
            load: (key) => storageManager.loadGameData(storageId, key),
            
            getDue: () => store.userStore.getDueNodes(),
            reportMemory: (nodeId, quality) => store.userStore.reportMemory(nodeId, quality),
            
            reportError: (msg) => {
                console.error("Game Crash Reported:", msg);
                this.error = "Game Crash: " + msg;
                this.render();
            },
            
            close: () => this.close()
        };
    }
    
    async resolveScript(url) {
        if (this.scriptCache.has(url)) return this.scriptCache.get(url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch script: ${url}`);
        let scriptContent = await response.text();

        const importRegex = /(import\s+.*?\s+from\s+)(['"])(.+?)\2/g;
        const promises = [];
        
        const matches = [...scriptContent.matchAll(importRegex)];

        for(const match of matches) {
            const pre = match[1];
            const quote = match[2];
            const path = match[3];

            if (path.startsWith('./') || path.startsWith('../')) {
                const nestedUrl = new URL(path, url).href;
                promises.push(
                    this.resolveScript(nestedUrl).then(blobUrl => {
                        scriptContent = scriptContent.replace(match[0], `${pre}${quote}${blobUrl}${quote}`);
                    })
                );
            }
        }
        
        await Promise.all(promises);

        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.scriptCache.set(url, blobUrl);
        return blobUrl;
    }


    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        if (!iframe) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load game from ${url} (Status: ${response.status})`);
            let html = await response.text();
            const baseHref = url.substring(0, url.lastIndexOf('/') + 1);

            this.scriptCache.clear();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // INJECT ERROR TRAP
            const errorTrapScript = doc.createElement('script');
            errorTrapScript.textContent = `
                window.onerror = function(msg, url, line, col, error) {
                    if (window.parent && window.parent.__ARBOR_GAME_BRIDGE__) {
                        window.parent.__ARBOR_GAME_BRIDGE__.reportError(msg + " (Line " + line + ")");
                    }
                };
                window.onunhandledrejection = function(e) {
                    if (window.parent && window.parent.__ARBOR_GAME_BRIDGE__) {
                        window.parent.__ARBOR_GAME_BRIDGE__.reportError(e.reason ? e.reason.message : "Unknown Promise Error");
                    }
                };
            `;
            doc.head.prepend(errorTrapScript);

            const scripts = doc.querySelectorAll('script[type="module"][src]');
            for (const script of scripts) {
                const src = script.getAttribute('src');
                const scriptUrl = new URL(src, baseHref).href;
                const blobUrl = await this.resolveScript(scriptUrl);
                script.setAttribute('src', blobUrl);
            }

            // INJECTED SDK
            const sdkScriptContent = `
            (function() {
                const bridge = window.parent.__ARBOR_GAME_BRIDGE__;
                if (!bridge) { console.error("Arbor Bridge not found!"); return; }
                
                window.Arbor = {
                    user: { username: '${store.value.gamification.username || 'Student'}', avatar: '${store.value.gamification.avatar || '👤'}', lang: '${store.value.lang || 'EN'}' },
                    ai: { 
                        chat: (prompt, context) => bridge.aiChat(prompt, context),
                        
                        askJSON: async (promptText, onComplete = null) => {
                             const TIMEOUT_MS = 60000; 
                             
                             const timeoutPromise = new Promise((_, reject) => {
                                 const id = setTimeout(() => {
                                     clearTimeout(id);
                                     reject(new Error("AI_TIMEOUT: The Guardian is thinking too slowly."));
                                 }, TIMEOUT_MS);
                             });

                             try {
                                 const res = await Promise.race([
                                     bridge.aiChat([{role: 'user', content: promptText + "\\n\\nIMPORTANT: Return ONLY valid JSON. Do not include markdown code blocks."}]),
                                     timeoutPromise
                                 ]);

                                 // ROBUST JSON EXTRACTION (Arbor v3.8)
                                 const raw = res.rawText || res.text;
                                 let clean = raw.trim();

                                 // 1. Remove Markdown Wrappers (Common in local LLMs)
                                 const mdMatch = clean.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`/i);
                                 if (mdMatch) {
                                     clean = mdMatch[1].trim();
                                 }

                                 // 2. Find JSON boundaries (First {/[ and last }/])
                                 const firstBrace = clean.indexOf('{');
                                 const firstBracket = clean.indexOf('[');
                                 const lastBrace = clean.lastIndexOf('}');
                                 const lastBracket = clean.lastIndexOf(']');

                                 let start = -1;
                                 let end = -1;

                                 if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
                                     start = firstBrace;
                                     end = lastBrace + 1;
                                 } else if (firstBracket !== -1) {
                                     start = firstBracket;
                                     end = lastBracket + 1;
                                 }

                                 if (start !== -1 && end > start) {
                                     clean = clean.substring(start, end);
                                 }

                                 const result = JSON.parse(clean);
                                 
                                 if (onComplete && typeof onComplete === 'function') {
                                     onComplete(result);
                                 }
                                 return result;
                             } catch(e) {
                                console.error("Arbor Bridge Error:", e);
                                throw e;
                             }
                        }
                    },
                    game: { addXP: (amount) => bridge.addXP(amount), exit: () => bridge.close() },
                    content: { getList: () => bridge.getCurriculum(), getNext: () => bridge.getNextLesson(), getAt: (idx) => bridge.getLessonAt(idx) },
                    storage: { save: (key, value) => bridge.save(key, value), load: (key) => bridge.load(key) },
                    memory: {
                        getDue: () => bridge.getDue(),
                        report: (nodeId, quality) => bridge.reportMemory(nodeId, quality)
                    }
                };
            })();`;
            
            const sdkScript = doc.createElement('script');
            sdkScript.textContent = sdkScriptContent;
            doc.body.appendChild(sdkScript);

            const assetTags = doc.querySelectorAll('link[href], img[src], audio[src], video[src]');
            assetTags.forEach(tag => {
                const attr = tag.hasAttribute('href') ? 'href' : 'src';
                const path = tag.getAttribute(attr);
                if (path && !path.startsWith('http') && !path.startsWith('data:') && !path.startsWith('blob:')) {
                    const absolutePath = new URL(path, baseHref).href;
                    tag.setAttribute(attr, absolutePath);
                }
            });

            const finalHtml = doc.documentElement.outerHTML;
            iframe.srcdoc = finalHtml;
            iframe.onload = () => {
                const loader = this.querySelector('#loader');
                if(loader) loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };
        } catch (e) {
            this.error = e.message;
            this.isPreparing = false;
            this.render();
        }
    }

    render() {
        const { url, title } = store.value.modal || {};
        const ui = store.ui;
        if (!url) { this.close(); return; }

        if (this.needsConsent) {
            // Updated Consent Screen with Sage keys and Disclaimer
            this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full items-center justify-center p-4">
                <div class="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-xl text-center shadow-2xl relative overflow-hidden w-full">
                    
                    <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                    
                    <div class="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 shadow-xl border border-slate-700">
                        🧠
                    </div>
                    
                    <h2 class="text-xl font-black text-white mb-2 uppercase tracking-wide">${ui.gameAiRequiredTitle || "Neural Interface Required"}</h2>
                    
                    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6 text-left">
                        
                        <!-- Privacy / Puter Notice -->
                        <div class="bg-blue-900/20 p-3 rounded-lg border border-blue-800/30 mb-3">
                            <p class="text-xs text-blue-200 leading-relaxed font-medium">
                                ${ui.sageGdprText || 'This service uses Puter.js to provide Artificial Intelligence. Your messages will be processed by an external service (Puter.com). Arbor does not store your conversation history on any server.'}
                            </p>
                        </div>

                        <!-- Age Warning -->
                        <div class="bg-red-900/20 p-3 rounded-lg border border-red-800/30 mb-3">
                            <p class="text-xs font-bold text-red-400 leading-tight">
                                ${ui.sageGdprAge || '⚠️ Age Requirement: By using this service, you confirm you are 13+ years old (per Puter.com terms).'}
                            </p>
                        </div>

                        <!-- Legal Disclaimer -->
                        <div class="flex items-start gap-2 p-2 bg-yellow-900/10 rounded border border-yellow-800/20">
                            <span class="text-base">⚠️</span>
                            <div class="text-[10px] text-yellow-200/80 leading-snug">
                                <span class="font-bold uppercase">Disclaimer</span><br>
                                <span>${ui.gameDisclaimer || "Arbor acts purely as a visualization client. We assume no responsibility for content generated by third-party AI providers."}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-3">
                        <button id="btn-grant-consent" class="w-full py-3.5 bg-white text-slate-900 font-black rounded-xl shadow-lg hover:bg-slate-200 active:scale-95 transition-all text-sm uppercase tracking-wider">
                            ${ui.sageGdprAccept || "I Understand & Accept"}
                        </button>
                        <button id="btn-cancel-consent" class="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider">
                            ${ui.cancel || "Cancel"}
                        </button>
                    </div>
                </div>
            </div>`;
            
            this.querySelector('#btn-grant-consent').onclick = () => this.grantConsent();
            this.querySelector('#btn-cancel-consent').onclick = () => this.close();
            return;
        }
        
        // --- AI ERROR SCREEN ---
        if (this.aiError) {
            this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full items-center justify-center">
                <div class="bg-slate-900 border border-red-500/50 p-8 rounded-3xl max-w-xl text-center shadow-2xl relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                    
                    <div class="w-20 h-20 bg-red-900/20 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 text-red-500 shadow-xl border border-red-900/50 animate-pulse">
                        🔌
                    </div>
                    
                    <h2 class="text-xl font-black text-white mb-2 uppercase tracking-wide">Connection Lost</h2>
                    <p class="text-sm text-red-300 font-medium mb-6 max-w-sm mx-auto leading-relaxed">${this.aiError}</p>
                    
                    <div class="flex flex-col gap-3">
                        <button id="btn-retry" class="w-full py-3.5 bg-red-600 text-white font-black rounded-xl shadow-lg hover:bg-red-500 active:scale-95 transition-all text-sm uppercase tracking-wider">
                            ${store.ui.sageRetryConnection || "Retry Connection"}
                        </button>
                        <button id="btn-cancel-error" class="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider">
                            ${ui.cancel || "Cancel"}
                        </button>
                    </div>
                </div>
            </div>`;
            
            this.querySelector('#btn-retry').onclick = () => this.retryConnection();
            this.querySelector('#btn-cancel-error').onclick = () => this.close();
            return;
        }

        let loadingText = "Loading Cartridge...";
        if (this.checkingAI) {
            loadingText = "Establishing Neural Uplink...";
        } else if (this.isPreparing) {
            loadingText = `Reading Knowledge Tree... (${this.playlist.length} lessons found)`;
        }

        if (this.error) {
            this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full items-center justify-center">
                <div class="bg-slate-900 border border-red-500/50 p-8 rounded-2xl max-w-md text-center shadow-2xl relative">
                    <div class="text-6xl mb-4 animate-bounce">🐛</div>
                    <h2 class="text-xl font-bold text-white mb-2">Game Crashed</h2>
                    <p class="text-xs text-red-300 font-mono mb-6 bg-black/50 p-3 rounded break-all">${this.error}</p>
                    <button class="btn-close px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors w-full">
                        Close
                    </button>
                </div>
            </div>`;
            this.querySelector('.btn-close').onclick = () => this.close();
            return;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full">
            <header class="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-slate-900 border-b border-slate-800 text-white shrink-0">
                <div class="flex items-center gap-4 shrink-0">
                    <button id="btn-back" class="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-bold">
                        <span>←</span> Back
                    </button>
                </div>
                
                <h2 class="flex-1 text-center font-bold text-sm md:text-base px-2 truncate min-w-0">
                    <span class="mr-2">🎮</span> ${title || 'Game'}
                </h2>
                
                <div class="flex items-center gap-2 shrink-0">
                    <button class="btn-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-900/50 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                </div>
            </header>
            
            <main class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest animate-pulse">${loadingText}</p>
                </div>
                
                ${!this.isPreparing && !this.checkingAI ? `
                <iframe class="relative z-10 w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals allow-popups-to-escape-sandbox"></iframe>
                ` : ''}
            </main>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close(); 
        this.querySelector('#btn-back').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);
