
import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        // State for part-by-part iterator
        this.cursorIndex = 0;
        this.activeNodeId = null;
        this.playlist = []; 
    }

    connectedCallback() {
        this.render();
        this.setupBridge(); 
        setTimeout(() => this.loadGame(), 50);
    }

    disconnectedCallback() {
        delete window.__ARBOR_GAME_BRIDGE__;
    }

    close() {
        store.setModal('arcade'); 
    }

    // --- HELPER: Prepare Curriculum Iterator ---
    async prepareCurriculum() {
        const { moduleId } = store.value.modal || {};
        if (!moduleId) return;
        
        this.activeNodeId = moduleId;
        const node = store.findNode(moduleId);
        
        if (!node) return;

        this.playlist = [];

        // CASE A: It's a Leaf (Single Lesson)
        if (node.type === 'leaf' || node.type === 'exam') {
            this.playlist.push(node);
        } 
        // CASE B: It's a Branch (Module)
        else {
            // If children unloaded, load them first
            if (node.hasUnloadedChildren) {
                await store.loadNodeChildren(node);
            }
            // Flatten leaves (lessons)
            const traverse = (n) => {
                if (n.type === 'leaf' || n.type === 'exam') this.playlist.push(n);
                if (n.children) n.children.forEach(traverse);
            };
            traverse(node);
        }
        
        this.cursorIndex = 0;
        console.log(`[Arbor Game Bridge] Prepared ${this.playlist.length} items from node: ${node.name}`);
    }

    // --- HELPER: Fetch Specific Content ---
    async fetchLessonContent(node) {
        if (!node) return null;
        if (!node.content && node.contentPath) {
            await store.loadNodeContent(node);
        }
        // Return raw text (stripped of HTML ideally, or let game handle it)
        const raw = node.content || "";
        const clean = raw.replace(/<[^>]*>?/gm, ''); 
        return { 
            id: node.id,
            title: node.name,
            text: clean,
            raw: raw
        };
    }

    setupBridge() {
        // Initialize curriculum data before game asks
        this.prepareCurriculum();

        window.__ARBOR_GAME_BRIDGE__ = {
            // 1. AI Capability
            chat: async (messages, context) => {
                try {
                    const response = await aiService.chat(messages, null); 
                    return { success: true, text: response.text };
                } catch (e) {
                    console.error("Arbor Bridge AI Error:", e);
                    return { success: false, error: e.message };
                }
            },

            // 2. User/Gamification Capability
            addXP: (amount) => {
                store.addXP(amount);
                return true;
            },
            
            triggerConfetti: () => { },

            // 3. CURRICULUM API (Part-by-Part Consumption)
            
            // Get the list of all lessons (metadata only)
            getCurriculum: () => {
                return this.playlist.map(l => ({ id: l.id, title: l.name }));
            },

            // Get Next Lesson (Iterator) - Useful for linear games
            getNextLesson: async () => {
                // If playlist empty (e.g. empty module), return null
                if (this.playlist.length === 0) return null;

                // Loop if we reach end? Or stop? Let's loop for endless play
                if (this.cursorIndex >= this.playlist.length) {
                    this.cursorIndex = 0; 
                }
                
                const node = this.playlist[this.cursorIndex];
                this.cursorIndex++;
                
                return await this.fetchLessonContent(node);
            },

            // Get Specific Lesson by Index
            getLessonAt: async (index) => {
                if (index < 0 || index >= this.playlist.length) return null;
                return await this.fetchLessonContent(this.playlist[index]);
            },

            // 4. Navigation
            close: () => {
                this.close();
            }
        };
    }

    getCdnBase(urlStr) {
        try {
            let user, repo, branch, path;
            const url = new URL(urlStr);

            if (url.hostname === 'github.com') {
                const parts = url.pathname.split('/').filter(p => p);
                if (parts.length >= 4 && parts[2] === 'blob') {
                    [user, repo, , branch, ...path] = parts;
                }
            } else if (url.hostname === 'raw.githubusercontent.com') {
                const parts = url.pathname.split('/').filter(p => p);
                if (parts.length >= 3) {
                    [user, repo, branch, ...path] = parts;
                }
            }

            if (user && repo && branch) {
                const folderPath = path.slice(0, -1).join('/');
                const folderSuffix = folderPath ? `/${folderPath}/` : '/';
                return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}${folderSuffix}`;
            }
        } catch (e) { console.warn("CDN Base calc failed", e); }
        return null;
    }

    getRawUrl(urlStr) {
        try {
            const url = new URL(urlStr);
            if (url.hostname === 'github.com') {
                return urlStr.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            }
            return urlStr;
        } catch (e) { return urlStr; }
    }

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        const loader = this.querySelector('#loader');
        const errorMsg = this.querySelector('#error-msg');
        
        const isGitHub = url.includes('github.com') || url.includes('raw.githubusercontent.com');

        if (!isGitHub) {
            iframe.src = url;
            iframe.onload = () => {
                loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };
            return;
        }

        try {
            const fetchUrl = this.getRawUrl(url);
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Network Error (${response.status})`);
            
            let html = await response.text();

            const cdnBase = this.getCdnBase(url);
            if (cdnBase) {
                const baseTag = `<base href="${cdnBase}">`;
                html = html.includes('<head>') 
                    ? html.replace('<head>', `<head>${baseTag}`) 
                    : `${baseTag}${html}`;
            }

            const contextData = {
                lang: store.value.lang,
                theme: store.value.theme,
                user: {
                    username: store.value.gamification.username || 'Student',
                    avatar: store.value.gamification.avatar || '👤',
                    streak: store.value.gamification.streak
                },
                env: {
                    params: Object.fromEntries(new URLSearchParams(window.location.search))
                }
            };

            const sdkScript = `
                <script>
                    (function() {
                        const bridge = window.parent.__ARBOR_GAME_BRIDGE__;
                        const ctx = ${JSON.stringify(contextData)};

                        window.Arbor = {
                            lang: ctx.lang,
                            theme: ctx.theme,
                            user: ctx.user,
                            params: ctx.env.params,

                            ai: {
                                chat: async (messages) => {
                                    if (!bridge) return { success: false, error: "Disconnected" };
                                    const res = await bridge.chat(messages);
                                    if(res.success) return res.text;
                                    throw new Error(res.error);
                                }
                            },

                            game: {
                                addXP: (amount) => bridge ? bridge.addXP(amount) : console.log("XP Added (Dev):", amount),
                                exit: () => bridge ? bridge.close() : console.log("Exit called"),
                            },
                            
                            // NEW: Content API
                            content: {
                                getList: () => bridge ? bridge.getCurriculum() : [],
                                getNext: async () => bridge ? await bridge.getNextLesson() : null,
                                getAt: async (idx) => bridge ? await bridge.getLessonAt(idx) : null
                            }
                        };
                        console.log("🌳 Arbor SDK Initialized (v2.0)");
                    })();
                </script>
            `;
            
            html = html.replace('</body>', `${sdkScript}</body>`);

            iframe.removeAttribute('src');
            iframe.srcdoc = html;

            iframe.onload = () => {
                loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };

        } catch (e) {
            console.error("Game Load Failed:", e);
            loader.classList.add('hidden');
            if (errorMsg) {
                errorMsg.classList.remove('hidden');
                errorMsg.innerHTML = `<div class="text-red-500 font-bold p-4">Error loading game: ${e.message}</div>`;
            }
        }
    }

    render() {
        const { url, title } = store.value.modal || {};
        if (!url) { this.close(); return; }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full">
            <div class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0">
                <div class="flex items-center gap-4">
                    <button id="btn-back" class="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-bold">
                        <span>←</span> Back
                    </button>
                    <div class="w-px h-6 bg-slate-800"></div>
                    <h2 class="font-bold text-sm md:text-base flex items-center gap-2">
                        <span>🎮</span> ${title || 'Game'}
                    </h2>
                </div>
                
                <div class="flex items-center gap-2">
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white px-3 py-1.5 border border-slate-700 rounded-lg transition-colors hover:border-slate-500" title="Source">
                        <span>Code ↗</span>
                    </a>
                    <button class="btn-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-900/50 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                </div>
            </div>
            
            <div class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest">Loading Cartridge...</p>
                </div>
                <div id="error-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center z-10 p-4"></div>
                <iframe class="relative z-10 w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals"></iframe>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => store.setModal(null); 
        this.querySelector('#btn-back').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);
