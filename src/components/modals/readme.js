
import { store } from '../../store.js';
import { markdownToVisualHTML } from '../../utils/editor-engine.js';

class ArborModalReadme extends HTMLElement {
    constructor() {
        super();
        this.sourceId = null;
        this.readmeContent = null;
        this.loading = true;
    }

    connectedCallback() {
        this.renderSkeleton();
        this.loadContent();
    }

    close(skipFuture = false) {
        if (skipFuture && this.sourceId) {
            localStorage.setItem(`arbor-skip-readme-${this.sourceId}`, 'true');
        }
        store.setModal(null);
    }

    async loadContent() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        
        if (!activeSource || !rootNode) return;

        // Base ID for preferences (strip version)
        this.sourceId = activeSource.id.split('-')[0];

        // 1. Default Content (Fallback)
        this.readmeContent = rootNode.description || "Welcome to this knowledge tree.";

        // 2. Fetch Logic (INTRO.md -> README.md)
        // Only if it's a remote URL (http/https)
        if (activeSource.url && activeSource.url.startsWith('http')) {
            try {
                let baseUrl = activeSource.url.substring(0, activeSource.url.lastIndexOf('/') + 1);
                
                // If we are in /data/, the root of the repo is one level up
                if (baseUrl.includes('/data/')) {
                    baseUrl = new URL('../', baseUrl).href;
                }

                // Priority: INTRO.md (Student facing) -> README.md (Technical fallback)
                const candidates = ['INTRO.md', 'intro.md', 'README.md', 'readme.md'];
                
                for (const filename of candidates) {
                    const targetUrl = new URL(filename, baseUrl).href;
                    const res = await fetch(targetUrl);
                    if (res.ok) {
                        const text = await res.text();
                        // Clean up potential Frontmatter if present
                        const cleanText = text.replace(/^---\n[\s\S]*?\n---\n/, '');
                        this.readmeContent = cleanText;
                        break; // Stop after finding the highest priority file
                    }
                }
            } catch (e) {
                console.warn("Could not load intro/readme for tree, using description.");
            }
        }

        this.loading = false;
        this.renderContent();
    }

    renderSkeleton() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        
        if (!activeSource || !rootNode) {
            this.close();
            return;
        }

        const title = activeSource.name;
        const icon = rootNode.icon || "🌳";

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-2xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300 max-h-[85vh]">
                
                <!-- Hero Image / Cover -->
                <div class="bg-gradient-to-br from-green-400 to-blue-500 h-32 shrink-0 relative flex items-center justify-center">
                    <button class="btn-close absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors backdrop-blur-md">✕</button>
                    <div class="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-5xl shadow-xl border-4 border-white dark:border-slate-800 absolute -bottom-12">
                        ${icon}
                    </div>
                </div>

                <div class="px-8 pt-16 pb-0 text-center shrink-0">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${title}</h2>
                    <div class="w-12 h-1 bg-slate-200 dark:bg-slate-700 mx-auto rounded-full mb-6"></div>
                </div>

                <div id="readme-body" class="px-8 pb-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div class="flex flex-col items-center justify-center h-32 space-y-4">
                        <div class="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Intro...</p>
                    </div>
                </div>

                <div class="p-6 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-950/50">
                    <button id="btn-start" class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-95 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 group">
                        <span>🚀</span> Start Exploring
                    </button>
                    
                    <div class="mt-4 flex justify-center">
                        <label class="flex items-center gap-2 cursor-pointer group text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors select-none">
                            <input type="checkbox" id="chk-skip" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer">
                            <span>Don't show again for this tree</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('#btn-start').onclick = () => {
            const skip = this.querySelector('#chk-skip').checked;
            this.close(skip);
        };
        
        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target === e.currentTarget) this.close(false);
        };
    }

    renderContent() {
        const bodyEl = this.querySelector('#readme-body');
        if (!bodyEl) return;

        // Convert Markdown to HTML using the existing engine
        // We wrap it in prose classes to make it look like a document
        const htmlContent = markdownToVisualHTML(this.readmeContent);

        bodyEl.innerHTML = `
            <div class="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none text-left">
                ${htmlContent}
            </div>
        `;
    }
}

customElements.define('arbor-modal-readme', ArborModalReadme);
