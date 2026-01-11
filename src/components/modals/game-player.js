
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

    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        const loader = this.querySelector('#loader');
        const errorMsg = this.querySelector('#error-msg');

        try {
            // 1. Split the URL to get the clean file path and the query params (context)
            // Example: https://raw.github.../index.html?source=...
            const urlObj = new URL(url);
            const queryParams = urlObj.search; // "?source=..."
            
            // Remove search params to get the clean URL for fetching the file
            urlObj.search = ''; 
            const fileUrl = urlObj.href;

            // 2. Calculate Base URL (folder path) for assets (images, css, js)
            // Example: https://raw.github.../game/index.html -> https://raw.github.../game/
            const baseUrl = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);

            // 3. Fetch the HTML content directly (Bypasses X-Frame-Options)
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            let htmlContent = await response.text();

            // 4. Inject <base> tag so relative links in the game work correctly
            // We inject it right after <head>
            if (htmlContent.includes('<head>')) {
                htmlContent = htmlContent.replace('<head>', `<head><base href="${baseUrl}">`);
            } else if (htmlContent.includes('<html>')) {
                htmlContent = htmlContent.replace('<html>', `<html><head><base href="${baseUrl}"></head>`);
            } else {
                // Fallback for partial HTML
                htmlContent = `<head><base href="${baseUrl}"></head>` + htmlContent;
            }

            // 5. Create a Blob (Virtual File) with correct MIME type
            const blob = new Blob([htmlContent], { type: 'text/html' });
            this.currentBlobUrl = URL.createObjectURL(blob);

            // 6. Set iframe src to Blob URL + original Query Params (Context)
            iframe.src = this.currentBlobUrl + queryParams;

            // Hide loader when iframe loads
            iframe.onload = () => {
                loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };

        } catch (e) {
            console.error("Game Load Error:", e);
            loader.classList.add('hidden');
            if(errorMsg) {
                errorMsg.classList.remove('hidden');
                errorMsg.innerHTML = `<p>Error loading game cartridge.</p><p class="text-xs opacity-70 font-mono mt-2">${e.message}</p>`;
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
                <div id="error-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center text-red-400 z-10 p-8 text-center bg-black">
                </div>

                <iframe 
                    class="relative z-10 w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
                ></iframe>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => store.setModal(null); // Close completely
        this.querySelector('#btn-back').onclick = () => this.close(); // Back to library
    }
}
customElements.define('arbor-modal-game-player', ArborModalGamePlayer);
