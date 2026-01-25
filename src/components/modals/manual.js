
import { store } from '../../store.js';

class ArborModalManual extends HTMLElement {
    constructor() {
        super();
        this.activeSection = 'intro';
    }

    connectedCallback() {
        this.render();
    }

    close() {
        store.setModal(null);
    }

    scrollToSection(id) {
        this.activeSection = id;
        
        // 1. Update Sidebar UI (Partial Update)
        this.updateSidebarUI();

        // 2. Scroll to Content
        const el = this.querySelector(`#sec-${id}`);
        const container = this.querySelector('#manual-content');
        if (el && container) {
            // Calculate position to scroll smoothly
            const topPos = el.offsetTop - container.offsetTop;
            container.scrollTo({
                top: topPos,
                behavior: 'smooth'
            });
        }
    }

    updateSidebarUI() {
        const buttons = this.querySelectorAll('.sidebar-btn');
        buttons.forEach(btn => {
            const section = btn.dataset.section;
            const isActive = this.activeSection === section;
            
            // Toggle Classes
            if (isActive) {
                btn.classList.add('bg-white', 'shadow-sm', 'border', 'border-slate-200', 'dark:bg-slate-800', 'dark:border-slate-700');
                btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-800/50', 'text-slate-500', 'dark:text-slate-400');
                
                const span = btn.querySelector('.btn-text');
                if(span) span.classList.add('text-slate-800', 'dark:text-white');
            } else {
                btn.classList.remove('bg-white', 'shadow-sm', 'border', 'border-slate-200', 'dark:bg-slate-800', 'dark:border-slate-700');
                btn.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-800/50', 'text-slate-500', 'dark:text-slate-400');
                
                const span = btn.querySelector('.btn-text');
                if(span) span.classList.remove('text-slate-800', 'dark:text-white');
            }
        });
    }

    render() {
        // If already rendered, don't rebuild DOM
        if (this.querySelector('#manual-content')) {
            this.updateSidebarUI();
            return;
        }

        const ui = store.ui;
        const titleText = ui.navManual || "Field Guide";

        const sections = [
            { id: 'intro', title: ui.manualPhilosophyTitle || 'Philosophy', icon: '🌱' },
            { id: 'nav', title: ui.manualNavigationTitle || 'Navigation', icon: '🗺️' },
            { id: 'learn', title: ui.manualLearningTitle || 'Learning', icon: '📝' },
            { id: 'garden', title: ui.manualGardenTitle || 'The Garden', icon: '🎒' },
            { id: 'arcade', title: ui.manualArcadeTitle || 'Arcade', icon: '🎮' },
            { id: 'sage', title: ui.manualSageTitle || 'Sage (AI)', icon: '🦉' },
            { id: 'construct', title: ui.manualConstructTitle || 'Construction', icon: '🏗️' },
            { id: 'data', title: ui.manualDataTitle || 'Data & Sync', icon: '💾' }
        ];

        const sidebarHtml = sections.map(s => `
            <button class="sidebar-btn w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                data-section="${s.id}">
                <span class="text-lg">${s.icon}</span>
                <span class="btn-text font-bold text-sm">${s.title}</span>
            </button>`
        ).join('');

        const contentHtml = `
        <div class="prose prose-slate dark:prose-invert max-w-3xl mx-auto pb-20 pt-2">
            <section id="sec-intro" class="mb-20 scroll-mt-6">
                <h1>${ui.manualHeader || 'The Arbor Grimoire'}</h1>
                <p class="lead text-xl">${ui.manualIntroText}</p>
                <div class="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 my-6">
                    <strong class="text-blue-700 dark:text-blue-300 block mb-2">${ui.manualPhilosophyCore}</strong>
                    ${ui.manualPhilosophyDesc}
                </div>
            </section>

            <hr class="border-slate-200 dark:border-slate-800 my-12">

            <section id="sec-nav" class="mb-20 scroll-mt-6">
                <h2>${ui.manualNavigationTitle}</h2>
                <p>${ui.manualNavDesc}</p>
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-4 list-none pl-0">
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavPan}</strong><br>${ui.manualNavPanDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavZoom}</strong><br>${ui.manualNavZoomDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavExpand}</strong><br>${ui.manualNavExpandDesc}
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>${ui.manualNavFocus}</strong><br>${ui.manualNavFocusDesc}
                    </li>
                </ul>
            </section>

            <section id="sec-learn" class="mb-20 scroll-mt-6">
                <h2>${ui.manualLearningTitle}</h2>
                <p>${ui.manualLearnDesc}</p>
                <ul class="space-y-2">
                    <li><strong>${ui.manualLearnRoots} (🌳):</strong> The main topics or subjects.</li>
                    <li><strong>${ui.manualLearnModules} (📁):</strong> Containers for related lessons.</li>
                    <li><strong>${ui.manualLearnLessons} (📄):</strong> The actual educational content. Click "Enter Lesson" to read.</li>
                    <li><strong>${ui.manualLearnExams} (⚔️):</strong> Special nodes that test your knowledge of an entire branch. Passing an exam marks the branch as "Mastered".</li>
                </ul>
            </section>

            <section id="sec-garden" class="mb-20 scroll-mt-6">
                <h2>${ui.manualGardenTitle}</h2>
                <p>${ui.manualGardenDesc}</p>
                <ul>
                    <li><strong>${ui.manualGardenSeeds}</strong></li>
                    <li><strong>${ui.manualGardenStreak}</strong></li>
                    <li><strong>${ui.manualGardenXP}</strong></li>
                    <li><strong>${ui.manualGardenMemory}</strong></li>
                </ul>
            </section>

            <section id="sec-arcade" class="mb-20 scroll-mt-6">
                <h2>${ui.manualArcadeTitle}</h2>
                <p>${ui.manualArcadeDesc}</p>
                <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800 text-sm">
                    <strong>Context Injection:</strong> When you launch a game, Arbor sends the content of the current lesson to the game engine. The game uses AI (Sage) to generate levels, questions, or enemies based on that text.
                </div>
            </section>

            <section id="sec-sage" class="mb-20 scroll-mt-6">
                <h2>${ui.manualSageTitle}</h2>
                <p>The Sage is your AI companion. It can explain complex topics, summarize lessons, or create quizzes.</p>
                <h3>Providers</h3>
                <ul>
                    <li><strong>${ui.sageModeCloud}:</strong> Uses Puter.com to provide free access to LLMs. Requires internet.</li>
                    <li><strong>${ui.sageModeLocal}:</strong> Connects to a local <strong>Ollama</strong> instance running on your machine. Private and offline capable.</li>
                </ul>
            </section>

            <section id="sec-construct" class="mb-20 scroll-mt-6">
                <h2>${ui.manualConstructTitle}</h2>
                <p>${ui.manualConstructDesc}</p>
                <ol>
                    <li>Click the <strong>Construction Hat</strong> (🏗️) in the sidebar.</li>
                    <li><strong>Create:</strong> Click the floating buttons on the selected node to add Folders or Lessons.</li>
                    <li><strong>Edit:</strong> Click the Pencil icon to open the <strong>Arbor Studio</strong>.</li>
                    <li><strong>Drag & Drop:</strong> In Construction Mode, click a node to select it, press 'M' to enable move mode, then drag it to a new parent.</li>
                </ol>
            </section>

            <section id="sec-data" class="mb-20 scroll-mt-6">
                <h2>${ui.manualDataTitle}</h2>
                <p>${ui.manualDataDesc}</p>
                <ul>
                    <li><strong>Export:</strong> Go to Profile -> Export to download a <code>.json</code> backup of your progress.</li>
                    <li><strong>Import:</strong> Load a backup file to restore your progress on another device.</li>
                    <li><strong>Cloud Sync:</strong> Optionally connect a Puter.com account to sync progress between devices automatically.</li>
                </ul>
            </section>
        </div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in">
            <div class="bg-slate-50 dark:bg-slate-900 rounded-[24px] shadow-2xl w-full max-w-5xl relative overflow-hidden flex flex-col md:flex-row border border-slate-200 dark:border-slate-800 transition-all duration-300" style="height: 600px; max-height: 85vh;">
                
                <!-- Close Button -->
                <button class="btn-close absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors backdrop-blur-sm shadow-sm font-bold text-lg">✕</button>

                <!-- SIDEBAR (Desktop) -->
                <div class="hidden md:flex w-64 bg-slate-50/50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800 flex-col p-4 shrink-0 h-full">
                    <div class="mb-6 px-2 pt-2">
                        <h2 class="font-black text-xl text-slate-800 dark:text-white tracking-tight uppercase">${titleText}</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manual v3.0</p>
                    </div>
                    <!-- Sidebar list needs flex-1 and min-h-0 to scroll independently if needed -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1 min-h-0">
                        ${sidebarHtml}
                    </div>
                </div>

                <!-- CONTENT -->
                <div id="manual-content" class="flex-1 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar p-6 md:p-12 scroll-smooth min-h-0 h-full">
                    
                    <!-- Mobile Title -->
                    <div class="md:hidden mb-8 pr-12">
                        <h2 class="font-black text-2xl text-slate-800 dark:text-white">${titleText}</h2>
                    </div>

                    ${contentHtml}
                </div>
            </div>
        </div>`;

        // Update UI state for initial load
        this.updateSidebarUI();

        // Bind events
        const btnClose = this.querySelector('.btn-close');
        if (btnClose) btnClose.onclick = () => this.close();

        this.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.onclick = () => this.scrollToSection(btn.dataset.section);
        });
    }
}
customElements.define('arbor-modal-manual', ArborModalManual);
