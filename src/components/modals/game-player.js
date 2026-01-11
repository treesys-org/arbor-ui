
import { store } from '../../store.js';

class ArborModalGamePlayer extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        // Return to Arcade menu instead of closing completely for better flow
        store.setModal('arcade'); 
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
                <!-- Loader behind iframe -->
                <div class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                    <p class="text-xs font-mono uppercase tracking-widest">Loading Cartridge...</p>
                </div>

                <iframe 
                    src="${url}" 
                    class="relative z-10 w-full h-full border-none bg-white" 
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
