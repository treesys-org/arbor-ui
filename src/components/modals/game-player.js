import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        this.cursorIndex = 0;
        this.activeNodeId = null;
        this.playlist = []; 
        this.isPreparing = true;
        this.error = null;
        this.scriptCache = new Map();
    }

    async connectedCallback() {
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
            save: (key, value) => store.userStore.saveGameData(gameId, key, value),
            load: (key) => store.userStore.loadGameData(gameId, key),
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

            const sdkScriptContent = `
            (function() {
                const bridge = window.parent.__ARBOR_GAME_BRIDGE__;
                if (!bridge) { console.error("Arbor Bridge not found!"); return; }
                window.Arbor = {
                    user: { username: '${store.value.gamification.username || 'Student'}', avatar: '${store.value.gamification.avatar || '👤'}', lang: '${store.value.lang || 'EN'}' },
                    ai: {
                        chat: async (messages) => {
                            if (!window.puter) throw new Error("Puter.js not loaded in game context.");
                            try {
                                const response = await window.puter.ai.chat(messages);
                                return response?.message?.content || response.toString();
                            } catch (e) { console.error("Game AI Error:", e); throw new Error("AI assistant unreachable: " + e.message); }
                        }
                    },
                    game: { addXP: (amount) => bridge.addXP(amount), exit: () => bridge.close() },
                    content: { getList: () => bridge.getCurriculum(), getNext: () => bridge.getNextLesson(), getAt: (idx) => bridge.getLessonAt(idx) },
                    storage: { save: (key, value) => bridge.save(key, value), load: (key) => bridge.load(key) }
                };
            })();`;
            
            const sdkScript = doc.createElement('script');
            sdkScript.textContent = sdkScriptContent;
            doc.body.appendChild(sdkScript);

            // No <base> tag is needed as all module imports are now absolute blob URLs.
            // Other assets like images/css will be resolved relative to the iframe's src, which we are not setting.
            // Using srcdoc means their base is about:srcdoc, so they MUST be absolute or inlined.
            // To fix relative assets (CSS, images) in the game's HTML, we need to manually resolve them.
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
                this.querySelector('#loader').classList.add('hidden');
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
        if (!url) { this.close(); return; }

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
                    allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals"></iframe>
                ` : ''}
            </main>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close(); 
        this.querySelector('#btn-back').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);