
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
        this.render();
        setTimeout(() => {
            const el = this.querySelector(`#sec-${id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    render() {
        const ui = store.ui;
        const titleText = ui.navManual || "Field Guide";

        const sections = [
            { id: 'intro', title: 'Philosophy', icon: '🌱' },
            { id: 'nav', title: 'Navigation', icon: '🗺️' },
            { id: 'learn', title: 'Learning', icon: '📝' },
            { id: 'garden', title: 'The Garden', icon: '🎒' },
            { id: 'arcade', title: 'Arcade', icon: '🎮' },
            { id: 'sage', title: 'Sage (AI)', icon: '🦉' },
            { id: 'construct', title: 'Construction', icon: '🏗️' },
            { id: 'data', title: 'Data & Sync', icon: '💾' }
        ];

        const sidebarHtml = sections.map(s => {
            const isActive = this.activeSection === s.id;
            const activeClass = isActive 
                ? 'bg-white shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400';
            const textClass = isActive ? 'text-slate-800 dark:text-white' : '';
            
            return `
            <button class="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${activeClass}"
                data-section="${s.id}">
                <span class="text-lg">${s.icon}</span>
                <span class="font-bold text-sm ${textClass}">${s.title}</span>
            </button>`;
        }).join('');

        // Use standard HTML tags instead of backticks inside the template to prevent parsing errors
        const contentHtml = `
        <div class="prose prose-slate dark:prose-invert max-w-3xl mx-auto pb-20">
            <section id="sec-intro" class="mb-20">
                <h1>The Arbor Grimoire</h1>
                <p class="lead text-xl">Arbor is not just a website; it is a <strong>Visual Knowledge Browser</strong>. It treats information like a living forest that you can explore, prune, and grow.</p>
                <div class="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800 my-6">
                    <strong class="text-blue-700 dark:text-blue-300 block mb-2">Core Philosophy</strong>
                    Knowledge is decentralized. There is no central server holding the "truth". You can load any tree (JSON file) from the internet, or plant your own local garden right in your browser.
                </div>
            </section>

            <hr class="border-slate-200 dark:border-slate-800 my-12">

            <section id="sec-nav" class="mb-20">
                <h2>🗺️ Navigation</h2>
                <p>The interface is designed to be spatial. You don't scroll through lists; you travel through branches.</p>
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-4 list-none pl-0">
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>Pan</strong><br>Click and drag the background to move the camera.
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>Zoom</strong><br>Use the mouse wheel or the +/- buttons in the corner.
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>Expand</strong><br>Click on a circle node to reveal its children.
                    </li>
                    <li class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <strong>Focus</strong><br>Double-click a node to center the camera on it.
                    </li>
                </ul>
            </section>

            <section id="sec-learn" class="mb-20">
                <h2>📝 Learning</h2>
                <p>Content is organized into a hierarchy:</p>
                <ul class="space-y-2">
                    <li><strong>Roots (🌳):</strong> The main topics or subjects.</li>
                    <li><strong>Modules (📁):</strong> Containers for related lessons.</li>
                    <li><strong>Lessons (📄):</strong> The actual educational content. Click "Enter Lesson" to read.</li>
                    <li><strong>Exams (⚔️):</strong> Special nodes that test your knowledge of an entire branch. Passing an exam marks the branch as "Mastered".</li>
                </ul>
                <p><strong>Bookmarks:</strong> Arbor automatically remembers where you scrolled in every lesson.</p>
            </section>

            <section id="sec-garden" class="mb-20">
                <h2>🎒 The Garden (Gamification)</h2>
                <p>Your progress is visualized as a collection of seeds.</p>
                <ul>
                    <li><strong>Seeds:</strong> When you complete a module, you collect a unique seed based on the module's name hash.</li>
                    <li><strong>Streak:</strong> Days in a row you have visited Arbor.</li>
                    <li><strong>Photosynthesis (XP):</strong> Points earned by reading lessons and passing quizzes.</li>
                    <li><strong>Memory:</strong> Completed lessons may turn yellow (wither) over time. This indicates you should review them (Spaced Repetition).</li>
                </ul>
            </section>

            <section id="sec-arcade" class="mb-20">
                <h2>🎮 Arcade</h2>
                <p>The Arcade allows you to play educational games that <strong>adapt</strong> to what you are currently studying.</p>
                <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800 text-sm">
                    <strong>Context Injection:</strong> When you launch a game, Arbor sends the content of the current lesson to the game engine. The game uses AI (Sage) to generate levels, questions, or enemies based on that text.
                </div>
            </section>

            <section id="sec-sage" class="mb-20">
                <h2>🦉 The Sage (AI)</h2>
                <p>The Sage is your AI companion. It can explain complex topics, summarize lessons, or create quizzes.</p>
                <h3>Providers</h3>
                <ul>
                    <li><strong>Cloud (Default):</strong> Uses Puter.com to provide free access to LLMs. Requires internet.</li>
                    <li><strong>Local (Advanced):</strong> Connects to a local <strong>Ollama</strong> instance running on your machine. Private and offline capable.</li>
                </ul>
            </section>

            <section id="sec-construct" class="mb-20">
                <h2>🏗️ Construction Mode</h2>
                <p>Arbor includes a full visual editor to create your own courses.</p>
                <ol>
                    <li>Click the <strong>Construction Hat</strong> (🏗️) in the sidebar.</li>
                    <li><strong>Create:</strong> Click the floating buttons on the selected node to add Folders or Lessons.</li>
                    <li><strong>Edit:</strong> Click the Pencil icon to open the <strong>Arbor Studio</strong>.</li>
                    <li><strong>Drag & Drop:</strong> In Construction Mode, click a node to select it, press 'M' to enable move mode, then drag it to a new parent.</li>
                </ol>
            </section>

            <section id="sec-data" class="mb-20">
                <h2>💾 Data & Sync</h2>
                <p>Arbor is a "Local-First" application.</p>
                <ul>
                    <li><strong>Export:</strong> Go to Profile -> Export to download a <code>.json</code> backup of your progress.</li>
                    <li><strong>Import:</strong> Load a backup file to restore your progress on another device.</li>
                    <li><strong>Cloud Sync:</strong> Optionally connect a Puter.com account to sync progress between devices automatically.</li>
                </ul>
            </section>
        </div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in">
            <div class="bg-slate-50 dark:bg-slate-900 rounded-[24px] shadow-2xl w-full max-w-4xl h-[85vh] relative overflow-hidden flex flex-col md:flex-row border border-slate-200 dark:border-slate-800 transition-all duration-300">
                
                <!-- Close Button -->
                <button class="btn-close absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors backdrop-blur-sm shadow-sm font-bold text-lg">✕</button>

                <!-- SIDEBAR (Desktop) -->
                <div class="hidden md:flex w-64 bg-slate-50/50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800 flex-col p-4 shrink-0">
                    <div class="mb-6 px-2 pt-2">
                        <h2 class="font-black text-xl text-slate-800 dark:text-white tracking-tight uppercase">${titleText}</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manual v3.0</p>
                    </div>
                    <div class="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                        ${sidebarHtml}
                    </div>
                </div>

                <!-- CONTENT -->
                <div class="flex-1 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar p-6 md:p-12 scroll-smooth relative" id="manual-content">
                    
                    <!-- Mobile Title -->
                    <div class="md:hidden mb-8 pr-12">
                        <h2 class="font-black text-2xl text-slate-800 dark:text-white">${titleText}</h2>
                    </div>

                    ${contentHtml}
                </div>
            </div>
        </div>`;

        // Bind events
        const btnClose = this.querySelector('.btn-close');
        if (btnClose) btnClose.onclick = () => this.close();

        this.querySelectorAll('button[data-section]').forEach(btn => {
            btn.onclick = () => this.scrollToSection(btn.dataset.section);
        });
    }
}
customElements.define('arbor-modal-manual', ArborModalManual);
