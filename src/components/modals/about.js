
import { store } from '../../store.js';

class ArborModalAbout extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'manifesto'; // 'manifesto' | 'roadmap' | 'privacy' | 'legal'
        this.showImpressumDetails = false;
    }

    connectedCallback() {
        // Handle direct linking to specific tabs (e.g. from Privacy modal)
        const modalState = store.value.modal;
        if (modalState && modalState.tab) {
            this.activeTab = modalState.tab;
        }
        
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    close() {
        store.setModal(null);
    }

    setTab(tab) {
        this.activeTab = tab;
        this.render();
    }

    toggleDetails() {
        this.showImpressumDetails = !this.showImpressumDetails;
        this.render();
    }

    getContent(ui) {
        if (this.activeTab === 'manifesto') {
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="text-center mb-8">
                    <div class="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl mb-4 shadow-sm">ℹ️</div>
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white">${ui.missionTitle}</h2>
                </div>
                
                <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-left mb-6 border border-slate-100 dark:border-slate-800">
                    <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium text-sm md:text-base">${ui.missionText}</p>
                    
                    <a href="https://github.com/treesys-org/arbor-ui" target="_blank" class="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg active:scale-95 group text-sm">
                        <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.322-3.369-1.322-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.597 1.028 2.688 0 3.848-2.339 4.685-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                        ${ui.viewOnGithub}
                    </a>
                </div>
                
                <div class="pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                    <h3 class="font-bold text-slate-400 dark:text-slate-500 mb-2 text-xs uppercase tracking-widest">${ui.metaphorTitle}</h3>
                    <blockquote class="text-slate-500 dark:text-slate-400 italic text-sm font-serif">"${ui.metaphorText}"</blockquote>
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'roadmap') {
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2 pl-4">
                <div class="flex items-center gap-3 mb-8">
                    <span class="text-3xl">🗺️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.roadmapTitle || 'The Roadmap'}</h2>
                </div>

                <div class="relative space-y-8 border-l-2 border-slate-200 dark:border-slate-700 ml-3">
                    
                    <!-- Phase 1: Current -->
                    <div class="relative pl-8">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white dark:border-slate-900 shadow-sm animate-pulse"></div>
                        <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-900/30">
                            <span class="text-[10px] font-black uppercase text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded mb-2 inline-block">${ui.roadmapCurrent || "Current Phase"}</span>
                            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1">🌱 ${ui.roadmapPhase1 || "Phase 1: The Seed"}</h3>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${ui.roadmapPhase1Desc || "Foundation & Content Growth"}</p>
                        </div>
                    </div>

                    <!-- Phase 2 -->
                    <div class="relative pl-8 opacity-80">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900"></div>
                        <h3 class="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">🌿 ${ui.roadmapPhase2 || "Phase 2: The Sapling"}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${ui.roadmapPhase2Desc || "Community & Collaboration"}</p>
                    </div>

                    <!-- Phase 3 -->
                    <div class="relative pl-8 opacity-60">
                        <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900"></div>
                        <h3 class="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">🌳 ${ui.roadmapPhase3 || "Phase 3: The Forest"}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${ui.roadmapPhase3Desc || "Decentralized Ecosystem"}</p>
                    </div>
                </div>

                <!-- Link to Live Repo -->
                <div class="mt-12 text-center pl-4 pr-8">
                    <a href="https://github.com/treesys-org/arbor-ui/blob/main/ROADMAP.md" target="_blank" class="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span>🚧</span>
                        <span>View Live Technical Roadmap</span>
                        <span class="text-[10px]">➜</span>
                    </a>
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'privacy') {
            const privacyText = (ui.privacyText || "").replace('{impressum}', `<span class="text-slate-400 italic">[See Legal Tab]</span>`);
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="flex items-center gap-3 mb-6">
                    <span class="text-3xl">🛡️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.privacyTitle || "Privacy"}</h2>
                </div>
                <div class="prose prose-sm prose-slate dark:prose-invert max-w-none text-left">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose">
                        <p class="text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                            <strong>Note:</strong> Data is stored locally (LocalStorage) by default. Cloud transfer only occurs if you explicitly connect to optional services.
                        </p>
                    </div>
                    ${privacyText}
                </div>
            </div>`;
        } 
        else if (this.activeTab === 'legal') {
            return `
            <div class="animate-in fade-in slide-in-from-bottom-2">
                <div class="flex items-center gap-3 mb-6">
                    <span class="text-3xl">⚖️</span>
                    <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.impressumTitle}</h2>
                </div>
                
                <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                    <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed text-sm">${ui.impressumText}</p>
                    
                    ${!this.showImpressumDetails ? `
                        <div class="mt-4 text-center">
                            <button id="btn-show-imp" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4">
                                ${ui.showImpressumDetails}
                            </button>
                        </div>
                    ` : `
                        <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in">
                             <div class="flex flex-col items-center mb-4">
                                 <div class="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-xl border border-slate-100 dark:border-slate-800 mb-2">🌲</div>
                                 <p class="font-black text-slate-800 dark:text-white text-sm">treesys.org</p>
                             </div>
                             <pre class="whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 select-all">${ui.impressumDetails}</pre>
                        </div>
                    `}
                </div>
            </div>`;
        }
    }

    render() {
        const ui = store.ui;
        const contentHtml = this.getContent(ui);

        // PARTIAL UPDATE STRATEGY
        // If container exists, just update content and tab states to avoid re-animation jumping
        const contentContainer = this.querySelector('#about-content-scroll');
        if (contentContainer) {
            contentContainer.innerHTML = contentHtml;
            
            // Update Tab Classes
            this.querySelectorAll('.tab-btn').forEach(btn => {
                const isActive = btn.dataset.tab === this.activeTab;
                // Classes to Add/Remove based on state
                const activeClasses = ['border-slate-800', 'text-slate-800', 'dark:border-white', 'dark:text-white'];
                const inactiveClasses = ['border-transparent', 'text-slate-400', 'hover:text-slate-600', 'dark:hover:text-slate-300'];
                
                if (isActive) {
                    btn.classList.add(...activeClasses);
                    btn.classList.remove(...inactiveClasses);
                } else {
                    btn.classList.remove(...activeClasses);
                    btn.classList.add(...inactiveClasses);
                }
            });
            
            // Rebind content events
            this.bindContentEvents();
            return;
        }

        // FULL RENDER (Initial)
        const tabBtnClass = (isActive) => `tab-btn flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${isActive ? 'border-slate-800 text-slate-800 dark:border-white dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <!-- Increased width to max-w-4xl -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto" style="height: 700px; max-height: 85vh;">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <!-- Navigation Tabs -->
                <div class="flex px-6 pt-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                    <button class="${tabBtnClass(this.activeTab === 'manifesto')}" data-tab="manifesto">${ui.tabManifesto || 'Manifesto'}</button>
                    <button class="${tabBtnClass(this.activeTab === 'roadmap')}" data-tab="roadmap">${ui.tabRoadmap || 'Roadmap'}</button>
                    <button class="${tabBtnClass(this.activeTab === 'privacy')}" data-tab="privacy">${ui.tabPrivacy || 'Privacy'}</button>
                    <button class="${tabBtnClass(this.activeTab === 'legal')}" data-tab="legal">${ui.tabLegal || 'Legal'}</button>
                </div>

                <!-- Content Area -->
                <div id="about-content-scroll" class="p-8 overflow-y-auto custom-scrollbar flex-1 min-h-0 pb-12">
                    ${contentHtml}
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => this.setTab(btn.dataset.tab);
        });

        this.bindContentEvents();
    }

    bindContentEvents() {
        const btnShow = this.querySelector('#btn-show-imp');
        if (btnShow) {
            btnShow.onclick = () => this.toggleDetails();
        }
    }
}
customElements.define('arbor-modal-about', ArborModalAbout);
