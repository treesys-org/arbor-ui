
import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';

class ArborModalGamePlayer extends HTMLElement {
    connectedCallback() {
        this.render();
        this.setupBridge(); // Initialize the communication bridge
        // Slight delay to allow DOM paint before heavy fetch
        setTimeout(() => this.loadGame(), 50);
    }

    disconnectedCallback() {
        // Clean up global bridge to prevent memory leaks or conflicts
        delete window.__ARBOR_GAME_BRIDGE__;
    }

    close() {
        store.setModal('arcade'); 
    }

    /**
     * Sets up the API Bridge that the iframe will call.
     * The iframe sees 'window.Arbor', which calls 'window.parent.__ARBOR_GAME_BRIDGE__'
     */
    setupBridge() {
        window.__ARBOR_GAME_BRIDGE__ = {
            // 1. AI Capability
            chat: async (messages, context) => {
                // The game sends messages. We route them through the active Arbor AI Service (Puter/Ollama/etc)
                // We wrap the result to simplify it for the game dev
                try {
                    // We don't pass a node context here because the Game controls the context now.
                    // The game is the "Context Node" effectively.
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
            
            triggerConfetti: () => {
                // Optional: Allow game to trigger UI effects in the main app
                // Implementation pending in store
            },

            // 3. Navigation
            close: () => {
                this.close();
            }
        };
    }

    /**
     * Calculates the jsDelivr CDN URL for a given GitHub file path.
     */
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

            // Inject Base Tag for Relative Assets
            const cdnBase = this.getCdnBase(url);
            if (cdnBase) {
                const baseTag = `<base href="${cdnBase}">`;
                html = html.includes('<head>') 
                    ? html.replace('<head>', `<head>${baseTag}`) 
                    : `${baseTag}${html}`;
            }

            // --- THE ARBOR SDK INJECTION ---
            // This script creates the 'window.Arbor' object inside the iframe.
            // It proxies calls to the parent window's __ARBOR_GAME_BRIDGE__.
            
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
                        
                        // Static Context
                        const ctx = ${JSON.stringify(contextData)};

                        window.Arbor = {
                            // Data
                            lang: ctx.lang,
                            theme: ctx.theme,
                            user: ctx.user,
                            params: ctx.env.params,

                            // AI Interface
                            ai: {
                                chat: async (messages) => {
                                    if (!bridge) return { success: false, error: "Disconnected" };
                                    const res = await bridge.chat(messages);
                                    if(res.success) return res.text;
                                    throw new Error(res.error);
                                }
                            },

                            // Game Interface
                            game: {
                                addXP: (amount) => bridge ? bridge.addXP(amount) : console.log("XP Added (Dev):", amount),
                                exit: () => bridge ? bridge.close() : console.log("Exit called"),
                            }
                        };
                        
                        console.log("🌳 Arbor SDK Initialized");
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
            <!-- Toolbar -->
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
            
            <!-- Game Container -->
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
