
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
        this.error = null;
        this.scriptCache = new Map();
    }

    async connectedCallback() {
        // Check for unified AI consent key
        const hasConsent = localStorage.getItem('arbor-ai-consent') === 'true';
        
        if (!hasConsent) {
            this.needsConsent = true;
            this.render();
            return;
        }

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
        store.setModal('arcade'); 
    }
    
    grantConsent() {
        localStorage.setItem('arbor-ai-consent', 'true');
        this.needsConsent = false;
        // Reboot the component logic basically
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
            throw new Error("This module contains no playable lessons (Exams are excluded). Please select a different module.");
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
        // Generate a clean ID from the URL to use as storage key
        // e.g. "https://.../firstjob/index.html" -> "firstjob"
        let storageId = "unknown_game";
        try {
            const urlObj = new URL(gameId);
            const pathParts = urlObj.pathname.split('/');
            // Usually the folder name before index.html is a good ID
            // .../arbor-games/firstjob/index.html
            if (pathParts.length >= 2) {
                storageId = pathParts[pathParts.length - 2];
            }
        } catch(e) { storageId = gameId; }

        window.__ARBOR_GAME_BRIDGE__ = {
            addXP: (amount) => store.userStore.addXP(amount, true),
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
                    return await aiService.chat(promptMessages, contextNode);
                } catch(e) {
                    console.error("AI Bridge Error:", e);
                    throw e;
                }
            },
            
            // CONNECT TO STORAGE MANAGER
            save: (key, value) => {
                try {
                    return storageManager.saveGameData(storageId, key, value);
                } catch(e) {
                    console.error("Game Save Failed:", e);
                    // Notify User via Toast or Alert
                    store.notify("⚠️ Storage Full! Delete old saves in Arcade menu.");
                    return false;
                }
            },
            load: (key) => storageManager.loadGameData(storageId, key),
            
            // --- MEMORY CORE API ---
            getDue: () => store.userStore.getDueNodes(),
            reportMemory: (nodeId, quality) => store.userStore.reportMemory(nodeId, quality),
            
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

            const scripts = doc.querySelectorAll('script[type="module"][src]');
            for (const script of scripts) {
                const src = script.getAttribute('src');
                const scriptUrl = new URL(src, baseHref).href;
                const blobUrl = await this.resolveScript(scriptUrl);
                script.setAttribute('src', blobUrl);
            }

            const puterScript = doc.createElement('script');
            puterScript.src = "https://js.puter.com/v2/";
            doc.head.prepend(puterScript);

            // INJECTED SDK WITH TIMEOUT PROTECTION
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

                                 const txt = res.text;
                                 const match = txt.match(/(\\{[\\s\\S]*\\}|\\[[\\s\\S]*\\])/);
                                 if (!match) {
                                     console.error("AI Response was not JSON:", txt);
                                     throw new Error("AI did not return a valid JSON object or array.");
                                 }
                                 
                                 const result = JSON.parse(match[0]);
                                 
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
            const isOllama = aiService.config.provider === 'ollama';
            
            this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full items-center justify-center">
                <div class="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-xl text-center shadow-2xl relative overflow-hidden">
                    
                    <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                    
                    <div class="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 shadow-xl border border-slate-700">
                        🧠
                    </div>
                    
                    <h2 class="text-xl font-black text-white mb-2 uppercase tracking-wide">${ui.gameAiRequiredTitle || "Neural Interface Required"}</h2>
                    
                    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6 text-left">
                        <p class="text-xs text-slate-300 mb-2 leading-relaxed">
                            ${ui.gameAiRequiredDesc || "This game uses AI to generate content."}
                        </p>
                        
                        ${isOllama ? `
                            <div class="flex items-center gap-2 mt-3 p-2 bg-orange-900/20 rounded border border-orange-800/30">
                                <span class="text-lg">🏠</span>
                                <span class="text-[10px] text-orange-200 font-bold uppercase">Local Mode (Ollama)</span>
                            </div>
                        ` : `
                            <div class="flex items-center gap-2 mt-3 p-2 bg-blue-900/20 rounded border border-blue-800/30">
                                <span class="text-lg">☁️</span>
                                <div class="text-[10px] text-blue-200">
                                    <span class="font-bold uppercase">Puter Cloud</span><br>
                                    <span class="opacity-70">Data processed by Puter.com</span>
                                </div>
                            </div>
                        `}
                    </div>

                    <div class="flex flex-col gap-3">
                        <button id="btn-grant-consent" class="w-full py-3.5 bg-white text-slate-900 font-black rounded-xl shadow-lg hover:bg-slate-200 active:scale-95 transition-all text-sm uppercase tracking-wider">
                            ${ui.gameAiConnect || "Connect & Play"}
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

        let loadingText = "Loading Cartridge...";
        if (this.isPreparing) {
            loadingText = `Reading Knowledge Tree... (${this.playlist.length} lessons found)`;
        }

        if (this.error) {
            this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full items-center justify-center">
                <div class="bg-slate-900 border border-red-500/50 p-8 rounded-2xl max-w-md text-center shadow-2xl">
                    <div class="text-4xl mb-4">🍂</div>
                    <h2 class="text-xl font-bold text-white mb-2">Could not start game</h2>
                    <p class="text-sm text-red-300 font-mono mb-6">${this.error}</p>
                    <button class="btn-close px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors">
                        Close
                    </button>
                </div>
            </div>`;
            this.querySelector('.btn-close').onclick = () => this.close();
            return;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full">
            <header class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0">
                <div class="flex items-center gap-4">
                    <button id="btn-back" class="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-bold">
                        <span>←</span> Back to Arcade
                    </button>
                </div>
                
                <h2 class="font-bold text-sm md:text-base flex items-center gap-2 text-center absolute left-1/2 -translate-x-1/2">
                    <span>🎮</span> ${title || 'Game'}
                </h2>
                
                <div class="flex items-center gap-2">
                    <button class="btn-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-900/50 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                </div>
            </header>
            
            <main class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest animate-pulse">${loadingText}</p>
                </div>
                
                ${!this.isPreparing ? `
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
