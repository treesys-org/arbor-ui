
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

    getRepoUrl() {
        const sourceUrl = store.value.activeSource?.url;
        if (!sourceUrl || !sourceUrl.startsWith('http')) return null;

        try {
            if (sourceUrl.includes('raw.githubusercontent.com')) {
                const parts = new URL(sourceUrl).pathname.split('/');
                if (parts.length >= 3) {
                    return `https://github.com/${parts[1]}/${parts[2]}`;
                }
            } else if (sourceUrl.includes('github.io')) {
                const url = new URL(sourceUrl);
                const owner = url.hostname.split('.')[0];
                const repo = url.pathname.split('/')[1];
                if (owner && repo) {
                    return `https://github.com/${owner}/${repo}`;
                }
            }
        } catch (e) {
            console.warn("Could not parse repo URL", e);
            return null;
        }
        return null;
    }

    async loadContent() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        const rawData = store.value.rawGraphData;
        
        if (!activeSource || !rootNode) return;

        // Base ID for preferences (strip version)
        this.sourceId = activeSource.id.split('-')[0];

        // 1. PRIORITY: Embedded Intro (Standard V3.7+)
        if (rawData && rawData.readme) {
            this.readmeContent = rawData.readme;
            this.loading = false;
            this.renderContent();
            return;
        }

        // 2. FALLBACK: Sibling File Fetch (Dev / Legacy)
        if (activeSource.url && activeSource.url.startsWith('http')) {
            try {
                const currentFolder = activeSource.url.substring(0, activeSource.url.lastIndexOf('/') + 1);
                const candidates = ['INTRO.md', 'README.md', 'intro.md', 'readme.md'];

                for (const filename of candidates) {
                    const url = new URL(filename, currentFolder).href;
                    // Cache busting only for these manual fetches
                    const res = await fetch(`${url}?t=${Date.now()}`);
                    if (res.ok) {
                        const text = await res.text();
                        this.readmeContent = text.replace(/^---\n[\s\S]*?\n---\n/, '');
                        this.loading = false;
                        this.renderContent();
                        return;
                    }
                }
            } catch (e) {
                // Ignore network errors, fall to description
            }
        }

        // 3. FINAL FALLBACK: Node Description
        this.readmeContent = rootNode.description || "Welcome to Arbor.";
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
        const repoUrl = this.getRepoUrl();

        // INCREASED WIDTH to max-w-4xl and height to 700px
        this.innerHTML = `
        <div id="readme-backdrop" class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-4xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300" style="height: 700px; max-height: 90vh;">
                
                <!-- Hero Image / Cover (Scaled down) -->
                <div class="bg-gradient-to-br from-green-400 to-blue-500 h-20 md:h-24 shrink-0 relative flex items-center justify-center">
                    <!-- Adjusted position: top-5 right-5 -->
                    <button class="btn-close absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-md z-10 font-bold shadow-sm">✕</button>
                    <div class="w-16 h-16 md:w-20 md:h-20 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-3xl md:text-4xl shadow-xl border-4 border-white dark:border-slate-800 absolute -bottom-8 md:-bottom-10">
                        ${icon}
                    </div>
                </div>

                <!-- Header (Shrink-0) -->
                <div class="px-6 pt-12 md:pt-14 pb-0 text-center shrink-0">
                    <h2 class="text-lg md:text-2xl font-black text-slate-800 dark:text-white mb-1 leading-tight">${title}</h2>
                    <div class="w-12 h-1 bg-slate-200 dark:bg-slate-700 mx-auto rounded-full mb-3"></div>
                </div>

                <!-- Content Body (Flex-1 + Scroll) -->
                <div id="readme-body" class="px-6 pb-6 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div class="flex flex-col items-center justify-center h-full space-y-4 py-8">
                        <div class="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Intro...</p>
                    </div>
                </div>

                <!-- Footer (Shrink-0) -->
                <div class="p-5 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-950/50">
                    <button id="btn-start" class="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl shadow-lg hover:scale-[1.01] active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 group">
                        <span>🚀</span> Start Exploring
                    </button>
                    
                    ${repoUrl ? `
                        <button id="btn-view-repo" class="mt-2 w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                            <span>🐙</span> View Author/Source
                        </button>
                    ` : ''}

                    <div class="mt-3 flex justify-center">
                        <label class="flex items-center gap-2 cursor-pointer group text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors select-none font-bold">
                            <input type="checkbox" id="chk-skip" class="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer">
                            <span>Don't show again</span>
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
        
        this.querySelector('#readme-backdrop').onclick = (e) => {
            if (e.target === e.currentTarget) this.close(false);
        };
        
        const repoBtn = this.querySelector('#btn-view-repo');
        if (repoBtn && repoUrl) {
            repoBtn.onclick = () => window.open(repoUrl, '_blank', 'noopener,noreferrer');
        }
    }

    renderContent() {
        const bodyEl = this.querySelector('#readme-body');
        if (!bodyEl) return;

        const htmlContent = markdownToVisualHTML(this.readmeContent);

        bodyEl.innerHTML = `
            <div class="prose prose-sm prose-slate dark:prose-invert max-w-none text-left">
                ${htmlContent}
            </div>
        `;
    }
}

customElements.define('arbor-modal-readme', ArborModalReadme);
