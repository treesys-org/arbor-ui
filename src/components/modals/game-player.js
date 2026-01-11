
import { store } from '../../store.js';

class ArborModalGamePlayer extends HTMLElement {
    connectedCallback() {
        this.render();
        // Slight delay to allow DOM paint before heavy fetch
        setTimeout(() => this.loadGame(), 50);
    }

    close() {
        store.setModal('arcade'); 
    }

    /**
     * Calculates the jsDelivr CDN URL for a given GitHub file path.
     * This allows relative assets (images, css, js) to load correctly.
     */
    getCdnBase(urlStr) {
        try {
            // Support both github.com and raw.githubusercontent.com inputs
            let user, repo, branch, path;
            const url = new URL(urlStr);

            if (url.hostname === 'github.com') {
                // https://github.com/USER/REPO/blob/BRANCH/PATH...
                const parts = url.pathname.split('/').filter(p => p);
                if (parts.length >= 4 && parts[2] === 'blob') {
                    [user, repo, , branch, ...path] = parts;
                }
            } else if (url.hostname === 'raw.githubusercontent.com') {
                // https://raw.githubusercontent.com/USER/REPO/BRANCH/PATH...
                const parts = url.pathname.split('/').filter(p => p);
                if (parts.length >= 3) {
                    [user, repo, branch, ...path] = parts;
                }
            }

            if (user && repo && branch) {
                // Remove filename from path to get folder
                const folderPath = path.slice(0, -1).join('/');
                const folderSuffix = folderPath ? `/${folderPath}/` : '/';
                return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}${folderSuffix}`;
            }
        } catch (e) {
            console.warn("CDN Base calc failed", e);
        }
        return null;
    }

    getRawUrl(urlStr) {
        try {
            const url = new URL(urlStr);
            if (url.hostname === 'github.com') {
                return urlStr.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            }
            return urlStr;
        } catch (e) {
            return urlStr;
        }
    }

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        const loader = this.querySelector('#loader');
        const errorMsg = this.querySelector('#error-msg');

        try {
            // 1. Get Fetch URL (Raw)
            const fetchUrl = this.getRawUrl(url);

            // 2. Fetch Content
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                if (response.status === 404) throw new Error("File not found (404). Check the URL.");
                throw new Error(`Network Error (${response.status})`);
            }
            
            let html = await response.text();

            // 3. Inject Base Tag for Relative Assets
            const cdnBase = this.getCdnBase(url);
            if (cdnBase) {
                // Inject aggressively at the top
                const baseTag = `<base href="${cdnBase}">`;
                if (html.includes('<head>')) {
                    html = html.replace('<head>', `<head>${baseTag}`);
                } else {
                    html = `${baseTag}${html}`;
                }
            }

            // 4. Inject Context Script (Game Params)
            // Passes context (lang, theme) to the game via window.ARBOR_CONTEXT
            const contextScript = `
                <script>
                    window.ARBOR_CONTEXT = ${JSON.stringify({
                        lang: store.value.lang,
                        theme: store.value.theme,
                        params: Object.fromEntries(new URLSearchParams(window.location.search))
                    })};
                </script>
            `;
            html = html.replace('</body>', `${contextScript}</body>`);

            // 5. Render via srcdoc (Most robust method)
            iframe.removeAttribute('src'); // Ensure no conflicting source
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
                errorMsg.innerHTML = `
                    <div class="text-center p-6 bg-slate-900 rounded-xl border border-red-900/50">
                        <div class="text-4xl mb-2">👾</div>
                        <h3 class="text-red-400 font-bold mb-2">Load Error</h3>
                        <p class="text-xs text-slate-400 font-mono mb-4 break-all bg-black/30 p-2 rounded">${e.message}</p>
                        <p class="text-xs text-slate-500">
                            <strong>Tip:</strong> Ensure the URL points to an <code>.html</code> file on GitHub.<br>
                            Example: <code>https://github.com/user/repo/blob/main/game.html</code>
                        </p>
                    </div>
                `;
            }
        }
    }

    render() {
        const { url, title } = store.value.modal || {};
        
        if (!url) {
            this.close();
            return;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in h-full w-full">
            
            <!-- Toolbar -->
            <div class="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0">
                <div class="flex items-center gap-4">
                    <button id="btn-back" class="flex items-center gap-2 text-slate-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-bold">
                        <span>←</span> Back to Arcade
                    </button>
                    <div class="w-px h-6 bg-slate-800"></div>
                    <h2 class="font-bold text-sm md:text-base flex items-center gap-2">
                        <span>🎮</span> ${title || 'Game'}
                    </h2>
                </div>
                
                <div class="flex items-center gap-2">
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white px-3 py-1.5 border border-slate-700 rounded-lg transition-colors hover:border-slate-500" title="Open Source">
                        <span>Code ↗</span>
                    </a>
                    <button class="btn-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-900/50 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                </div>
            </div>
            
            <!-- Game Container -->
            <div class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                
                <!-- Loader -->
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest">Loading Cartridge...</p>
                </div>

                <!-- Error State -->
                <div id="error-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center z-10 p-4"></div>

                <iframe 
                    class="relative z-10 w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals"
                ></iframe>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => store.setModal(null); 
        this.querySelector('#btn-back').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);
