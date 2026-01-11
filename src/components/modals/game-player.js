
import { store } from '../../store.js';

class ArborModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        this.currentBlobUrl = null;
    }

    connectedCallback() {
        this.render();
        // Delay load to ensure DOM is ready
        setTimeout(() => this.loadGame(), 100);
    }

    disconnectedCallback() {
        this.cleanup();
    }

    close() {
        this.cleanup();
        store.setModal('arcade'); 
    }

    cleanup() {
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
    }

    /**
     * Converts a GitHub URL into a jsDelivr CDN Base URL.
     * This allows assets (JS, CSS, Images) to load with correct MIME types.
     */
    getCDNBaseUrl(urlStr) {
        try {
            const url = new URL(urlStr);
            const path = url.pathname; // /user/repo/blob/branch/folder/index.html

            // Only process GitHub URLs
            if (!url.hostname.includes('github.com')) return null;

            // Pattern: /USER/REPO/blob/BRANCH/...
            const parts = path.split('/').filter(p => p);
            if (parts.length < 4 || parts[2] !== 'blob') return null;

            const user = parts[0];
            const repo = parts[1];
            const branch = parts[3];
            const remainingPath = parts.slice(4).join('/');
            
            // Get the folder containing the file
            const folderPath = remainingPath.substring(0, remainingPath.lastIndexOf('/') + 1);

            // Construct jsDelivr URL
            // Format: https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/FOLDER/
            return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${folderPath}`;

        } catch (e) {
            console.error("CDN Conversion Error", e);
            return null;
        }
    }

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        const loader = this.querySelector('#loader');
        const errorMsg = this.querySelector('#error-msg');

        try {
            // 1. Fetch the raw HTML content
            // We use the raw link for the content itself
            let fetchUrl = url;
            if (url.includes('github.com') && url.includes('/blob/')) {
                fetchUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            }

            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Failed to download game (${response.status})`);
            
            let html = await response.text();

            // 2. Calculate the CDN Base URL for assets
            const cdnBase = this.getCDNBaseUrl(url);
            
            // 3. Inject the <base> tag
            // This forces all relative links (script.js, style.css, img.png) to load from the CDN
            if (cdnBase) {
                const baseTag = `<base href="${cdnBase}">`;
                if (html.includes('<head>')) {
                    html = html.replace('<head>', `<head>${baseTag}`);
                } else if (html.includes('<html>')) {
                    html = html.replace('<html>', `<html><head>${baseTag}</head>`);
                } else {
                    html = `<head>${baseTag}</head>` + html;
                }
            }

            // 4. Create a Blob URL
            // We use 'text/html' explicitly so the browser renders it
            const blob = new Blob([html], { type: 'text/html' });
            this.cleanup(); // Clean previous if any
            this.currentBlobUrl = URL.createObjectURL(blob);

            // 5. Load into iframe
            // Pass context params via hash or query if needed, but blob handles content
            iframe.src = this.currentBlobUrl;

            iframe.onload = () => {
                loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };

        } catch (e) {
            console.error("Game Load Failed", e);
            loader.classList.add('hidden');
            if (errorMsg) {
                errorMsg.classList.remove('hidden');
                errorMsg.innerHTML = `
                    <div class="bg-red-900/80 p-6 rounded-xl border border-red-700 max-w-md mx-auto text-center">
                        <div class="text-3xl mb-2">🔌</div>
                        <h3 class="font-bold text-white mb-2">Connection Error</h3>
                        <p class="text-xs text-red-200 font-mono mb-4 bg-black/30 p-2 rounded break-all">${e.message}</p>
                        <p class="text-sm text-slate-300">
                            Check if the URL is a valid GitHub file.<br>
                            Example: <code>https://github.com/user/repo/blob/main/index.html</code>
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
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white px-3 py-1.5 border border-slate-700 rounded-lg transition-colors hover:border-slate-500" title="View Source on GitHub">
                        <span>Source ↗</span>
                    </a>
                    <button class="btn-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-900/50 text-slate-400 hover:text-red-500 transition-colors">✕</button>
                </div>
            </div>
            
            <!-- Game Container -->
            <div class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                
                <!-- Loader -->
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest">Inserting Cartridge...</p>
                </div>

                <!-- Error State -->
                <div id="error-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center z-10 p-4"></div>

                <iframe 
                    class="relative z-10 w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
                ></iframe>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => store.setModal(null); 
        this.querySelector('#btn-back').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);
