import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        // State for part-by-part iterator
        this.cursorIndex = 0;
        this.activeNodeId = null;
        this.playlist = []; 
        this.isPreparing = true;
        this.error = null;
    }

    async connectedCallback() {
        this.render(); // Render loader state immediately
        
        try {
            await this.prepareCurriculum();
            this.setupBridge();
            this.isPreparing = false;
            this.render(); // Re-render to show iframe container
            this.loadGame();
        } catch (e) {
            console.error("Failed to prepare game context", e);
            this.error = e.message;
            this.isPreparing = false;
            this.render();
        }
    }

    disconnectedCallback() {
        // Clean up the global bridge when the component is removed
        delete window.__ARBOR_GAME_BRIDGE__;
    }

    close() {
        // Return to the arcade, not the main map
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
                if (node.hasUnloadedChildren) {
                    await store.loadNodeChildren(node);
                }
                
                if (node.children && node.children.length > 0) {
                    // Use a standard for-loop for sequential awaiting
                    for (const child of node.children) {
                        await collectLeaves(child);
                    }
                }
            }
        };

        await collectLeaves(rootNode);
        
        this.cursorIndex = 0;
        console.log(`[Arbor Game Bridge] Prepared ${this.playlist.length} items from node: ${rootNode.name}`);
        
        if (this.playlist.length === 0) {
            throw new Error("This module contains no playable lessons (Exams are excluded). Please select a different module.");
        }
    }

    async fetchLessonContent(node) {
        if (!node) return null;
        if (!node.content && node.contentPath) {
            await store.loadNodeContent(node);
        }
        const raw = node.content || "";
        // Clean HTML tags and metadata lines
        const clean = raw
            .replace(/<[^>]*>?/gm, '')
            .replace(/@\w+:.*?\n/g, '')
            .replace(/\s+/g, ' ')
            .trim(); 

        return { 
            id: node.id,
            title: node.name,
            text: clean,
            raw: raw // Keep raw for games that might want to parse it differently
        };
    }

    setupBridge() {
        const gameId = store.value.modal.url; // Use URL as a unique ID for data sandboxing
        
        window.__ARBOR_GAME_BRIDGE__ = {
            // AI chat is now handled directly inside the iframe via its own Puter.js instance.
            addXP: (amount) => {
                store.userStore.addXP(amount, true); // Use userStore directly
                return true;
            },
            getCurriculum: () => {
                return this.playlist.map(l => ({ id: l.id, title: l.name }));
            },
            getNextLesson: async () => {
                if (this.playlist.length === 0) return null;
                if (this.cursorIndex >= this.playlist.length) {
                    this.cursorIndex = 0; // Loop for endless play
                }
                const node = this.playlist[this.cursorIndex];
                this.cursorIndex++;
                return await this.fetchLessonContent(node);
            },
            getLessonAt: async (index) => {
                if (index < 0 || index >= this.playlist.length) return null;
                return await this.fetchLessonContent(this.playlist[index]);
            },
            // NEW: Generic Storage API
            save: (key, value) => {
                store.userStore.saveGameData(gameId, key, value);
                return true;
            },
            load: (key) => {
                return store.userStore.loadGameData(gameId, key);
            },
            close: () => {
                this.close();
            }
        };
    }

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        if (!iframe) return;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load game from ${url} (Status: ${response.status})`);
        let html = await response.text();

        // Inject a <base> tag to fix relative asset paths (CSS, images, etc.)
        const baseTag = `<base href="${url.substring(0, url.lastIndexOf('/') + 1)}">`;
        // NEW: Inject Puter.js script directly into the game's head
        const puterScript = `<script src="https://js.puter.com/v2/"></script>`;
        
        // Replace head tag, adding both base and puter script
        html = html.replace('<head>', `<head>${baseTag}${puterScript}`);

        const sdkScript = `
        <script>
            (function() {
                const bridge = window.parent.__ARBOR_GAME_BRIDGE__;
                if (!bridge) {
                    console.error("Arbor Bridge not found! Game cannot run.");
                    return;
                }
                
                window.Arbor = {
                    user: {
                        username: '${store.value.gamification.username || 'Student'}',
                        avatar: '${store.value.gamification.avatar || '👤'}',
                        lang: '${store.value.lang || 'EN'}'
                    },
                    ai: {
                        chat: async (messages) => {
                            // NEW: Use the iframe's own Puter.js instance
                            if (!window.puter) {
                                throw new Error("Puter.js is not loaded in the game context. Ensure the script tag is present.");
                            }
                            try {
                                const response = await window.puter.ai.chat(messages);
                                return response?.message?.content || response.toString();
                            } catch (e) {
                                console.error("Game AI Error:", e);
                                // Provide a user-friendly error
                                throw new Error("The AI assistant could not be reached. " + e.message);
                            }
                        }
                    },
                    game: {
                        addXP: (amount) => bridge.addXP(amount),
                        exit: () => bridge.close(),
                    },
                    content: {
                        getList: () => bridge.getCurriculum(),
                        getNext: () => bridge.getNextLesson(),
                        getAt: (idx) => bridge.getLessonAt(idx)
                    },
                    storage: {
                        save: (key, value) => bridge.save(key, value),
                        load: (key) => bridge.load(key)
                    }
                };
                console.log("Arbor SDK Injected & Ready", window.Arbor);
            })();
        <\/script>
        `;

        // Inject SDK script just before closing body tag
        html = html.replace('</body>', `${sdkScript}</body>`);
        
        iframe.srcdoc = html;
        iframe.onload = () => {
            this.querySelector('#loader').classList.add('hidden');
            iframe.classList.remove('opacity-0');
        };
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