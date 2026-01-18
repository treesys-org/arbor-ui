
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
        // The builder injects the Markdown content directly into data.json.
        // This is instant, offline-friendly, and version-perfect.
        if (rawData && rawData.readme) {
            this.readmeContent = rawData.readme;
            this.loading = false;
            this.renderContent();
            return;
        }

        // 2. FALLBACK: Sibling File Fetch (Dev / Legacy)
        // Only look for INTRO.md in the SAME folder as data.json.
        // No complex directory scanning.
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
                        // Clean Frontmatter
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
                    
                    ${repoUrl ? `
                        <button id="btn-view-repo" class="mt-3 w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                            <span>🐙</span> View Author/Source
                        </button>
                    ` : ''}

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
        
        const repoBtn = this.querySelector('#btn-view-repo');
        if (repoBtn && repoUrl) {
            repoBtn.onclick = () => window.open(repoUrl, '_blank', 'noopener,noreferrer');
        }
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
