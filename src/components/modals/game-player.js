
import { store } from '../../store.js';

class ArborModalGamePlayer extends HTMLElement {
    connectedCallback() {
        this.render();
        // Trigger the load process after render
        setTimeout(() => this.loadGame(), 0);
    }

    close() {
        // Revoke blob URL if it exists to free memory
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
        // Return to Arcade menu
        store.setModal('arcade'); 
    }

    normalizeGameUrl(urlStr) {
        try {
            const url = new URL(urlStr);
            // Fix 1: Convert GitHub Blob UI URL to Raw
            // From: https://github.com/user/repo/blob/main/index.html
            // To:   https://raw.githubusercontent.com/user/repo/main/index.html
            if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) {
                url.hostname = 'raw.githubusercontent.com';
                url.pathname = url.pathname.replace('/blob/', '/');
            }
            return url.href;
        } catch(e) {
            return urlStr;
        }
    }

    getBaseUrlForAssets(fileUrl) {
        try {
            const url = new URL(fileUrl);
            
            // Optimization: If GitHub Raw, use jsDelivr for ASSETS (<base>)
            // This fixes the "MIME type text/plain" error for JS/CSS files in Chrome.
            if (url.hostname === 'raw.githubusercontent.com') {
                const parts = url.pathname.split('/').filter(p => p);
                // Structure: [user, repo, branch, ...path]
                if (parts.length >= 3) {
                    const user = parts[0];
                    const repo = parts[1];
                    const branch = parts[2];
                    const path = parts.slice(3).join('/');
                    const folder = path.substring(0, path.lastIndexOf('/') + 1);
                    
                    return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${folder}`;
                }
            }
            
            // Fallback: Standard relative folder
            return fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
        } catch(e) {
            return '';
        }
    }

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        const loader = this.querySelector('#loader');
        const errorMsg = this.querySelector('#error-msg');

        try {
            // 1. Clean and Normalize the URL
            const urlObj = new URL(url);
            const queryParams = urlObj.search; // Keep context params (?source=...)
            urlObj.search = ''; 
            
            const cleanUrl = this.normalizeGameUrl(urlObj.href);

            // 2. Fetch the HTML content
            const response = await fetch(cleanUrl);
            if (!response.ok) {
                if (response.status === 404) throw new Error(`Game file not found (404). Check the URL.`);
                throw new Error(`Failed to load game (HTTP ${response.status})`);
            }
            
            let htmlContent = await response.text();

            // 3. Calculate the Best Base URL for Assets (CDN preferred)
            const baseUrl = this.getBaseUrlForAssets(cleanUrl);

            // 4. Inject <base> tag 
            // We inject it aggressively at the top
            const baseTag = `<base href="${baseUrl}">`;
            
            if (htmlContent.includes('<head>')) {
                htmlContent = htmlContent.replace('<head>', `<head>${baseTag}`);
            } else if (htmlContent.includes('<html>')) {
                htmlContent = htmlContent.replace('<html>', `<html><head>${baseTag}</head>`);
            } else {
                htmlContent = `<head>${baseTag}</head>` + htmlContent;
            }

            // 5. Create Blob
            const blob = new Blob([htmlContent], { type: 'text/html' });
            this.currentBlobUrl = URL.createObjectURL(blob);

            // 6. Set iframe src
            // Note: We append query params to the blob URL so window.location.search works inside the game
            iframe.src = this.currentBlobUrl + queryParams;

            // Handle Load Success
            iframe.onload = () => {
                loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };

        } catch (e) {
            console.error("Game Load Error:", e);
            loader.classList.add('hidden');
            if(errorMsg) {
                errorMsg.classList.remove('hidden');
                errorMsg.innerHTML = `
                    <div class="bg-red-900/50 p-6 rounded-xl border border-red-700/50 max-w-md mx-auto">
                        <div class="text-3xl mb-2">👾</div>
                        <h3 class="font-bold text-white mb-2">Game Over (Load Error)</h3>
                        <p class="text-xs text-red-200 font-mono mb-4 bg-black/30 p-2 rounded">${e.message}</p>
                        <p class="text-xs text-slate-400">The cartridge could not be read.</p>
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
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="hidden md:flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white px-3 py-1.5 border border-slate-700 rounded-lg transition-colors hover:border-slate-500" title="Open in new tab if iframe fails">
                        <span>Open Ext. ↗</span>
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
                <div id="error-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center z-10 p-4 text-center bg-black">
                </div>

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
