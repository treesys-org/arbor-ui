
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
        const el = this.querySelector(`#sec-${id}`);
        if(el) el.scrollIntoView({ behavior: 'smooth' });
    }

    render() {
        const ui = store.ui;
        
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

        const sidebarItems = sections.map(s => `
            <button class="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group ${this.activeSection === s.id ? 'bg-white shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400'}"
                data-section="${s.id}">
                <span class="text-lg">${s.icon}</span>
                <span class="font-bold text-sm ${this.activeSection === s.id ? 'text-slate-800 dark:text-white' : ''}">${s.title}</span>
            </button>
        `).join('');

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
            <div class="bg-slate-50 dark:bg-slate-900 rounded-[24px] shadow-2xl w-full max-w-6xl h-[85vh] relative overflow-hidden flex flex-col md:flex-row border border-slate-200 dark:border-slate-800 transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-800/50 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors backdrop-blur-sm">✕</button>

                <!-- SIDEBAR -->
                <div class="hidden md:flex w-64 bg-slate-50/50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800 flex-col p-4">
                    <div class="mb-6 px-2">
                        <h2 class="font-black text-xl text-slate-800 dark:text-white tracking-tight uppercase">Field Guide</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manual v3.0</p>
                    </div>
                    <div class="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                        ${sidebarItems}
                    </div>
                </div>

                <!-- CONTENT -->
                <div class="flex-1 bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar p-8 md:p-12 scroll-smooth" id="manual-content">
                    
                    <div class="prose prose-slate dark:prose-invert max-w-3xl mx-auto">
                        
                        <section id="sec-intro" class="mb-16">
                            <h1>The Arbor Grimoire</h1>
                            <p class="lead">Arbor is not just a website; it is a <strong>Visual Knowledge Browser</strong>. It treats information like a living forest that you can explore, prune, and grow.</p>
                            <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                                <strong>Core Philosophy:</strong> Knowledge is decentralized. There is no central server holding the "truth". You can load any tree (JSON file) from the internet, or plant your own local garden.
                            </div>
                        </section>

                        <hr>

                        <section id="sec-nav" class="mb-16">
                            <h2>🗺️ Navigation</h2>
                            <p>The interface is designed to be spatial. You don't scroll through lists; you travel through branches.</p>
                            <ul>
                                <li><strong>Pan:</strong> Click and drag the background to move the camera.</li>
                                <li><strong>Zoom:</strong> Use the mouse wheel or the +/- buttons in the corner.</li>
                                <li><strong>Expand:</strong> Click on a circle node to reveal its children.</li>
                                <li><strong>Focus:</strong> Double-click a node to center the camera on it.</li>
                            </ul>
                        </section>

                        <section id="sec-learn" class="mb-16">
                            <h2>📝 Learning</h2>
                            <p>Content is organized into a hierarchy:</p>
                            <ul>
                                <li><strong>Roots (🌳):</strong> The main topics or subjects.</li>
                                <li><strong>Modules (📁):</strong> Containers for related lessons.</li>
                                <li><strong>Lessons (📄):</strong> The actual educational content. Click "Enter Lesson" to read.</li>
                                <li><strong>Exams (⚔️):</strong> Special nodes that test your knowledge of an entire branch. Passing an exam marks the branch as "Mastered".</li>
                            </ul>
                            <p><strong>Bookmarks:</strong> Arbor automatically remembers where you scrolled in every lesson.</p>
                        </section>

                        <section id="sec-garden" class="mb-16">
                            <h2>🎒 The Garden (Gamification)</h2>
                            <p>Your progress is visualized as a collection of seeds.</p>
                            <ul>
                                <li><strong>Seeds:</strong> When you complete a module, you collect a unique seed based on the module's name hash.</li>
                                <li><strong>Streak:</strong> Days in a row you have visited Arbor.</li>
                                <li><strong>Photosynthesis (XP):</strong> Points earned by reading lessons and passing quizzes.</li>
                                <li><strong>Memory:</strong> Completed lessons may turn yellow (wither) over time. This indicates you should review them (Spaced Repetition).</li>
                            </ul>
                        </section>

                        <section id="sec-arcade" class="mb-16">
                            <h2>🎮 Arcade</h2>
                            <p>The Arcade allows you to play educational games that <strong>adapt</strong> to what you are currently studying.</p>
                            <ul>
                                <li><strong>Context Injection:</strong> When you launch a game, Arbor sends the content of the current lesson to the game engine.</li>
                                <li><strong>AI Generation:</strong> The game uses AI (Sage) to generate levels, questions, or enemies based on that text.</li>
                                <li><strong>Watering:</strong> You can "water" withered lessons by playing games related to them.</li>
                            </ul>
                        </section>

                        <section id="sec-sage" class="mb-16">
                            <h2>🦉 The Sage (AI)</h2>
                            <p>The Sage is your AI companion. It can explain complex topics, summarize lessons, or create quizzes.</p>
                            <h3>Providers</h3>
                            <ul>
                                <li><strong>Cloud (Default):</strong> Uses Puter.com to provide free access to LLMs. Requires internet.</li>
                                <li><strong>Local (Advanced):</strong> Connects to a local <strong>Ollama</strong> instance running on your machine. Private and offline capable.</li>
                            </ul>
                            <div class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800 text-sm">
                                <strong>Privacy Note:</strong> In Local mode, no data leaves your computer. In Cloud mode, prompts are sent to Puter.com.
                            </div>
                        </section>

                        <section id="sec-construct" class="mb-16">
                            <h2>🏗️ Construction Mode</h2>
                            <p>Arbor includes a full visual editor to create your own courses.</p>
                            <ol>
                                <li>Click the <strong>Construction Hat</strong> (🏗️) in the sidebar.</li>
                                <li><strong>Create:</strong> Click the floating buttons to add Folders or Lessons.</li>
                                <li><strong>Edit:</strong> Click the Pencil icon on any node to open the <strong>Arbor Studio</strong>.</li>
                                <li><strong>Drag & Drop:</strong> In Construction Mode, you can drag nodes to rearrange them.</li>
                            </ol>
                            <p><strong>Saving:</strong> If you are editing a Local Tree, changes save to your browser storage. If you are connected to GitHub, changes create a Commit or Pull Request.</p>
                        </section>

                        <section id="sec-data" class="mb-16">
                            <h2>💾 Data & Sync</h2>
                            <p>Arbor is a "Local-First" application.</p>
                            <ul>
                                <li><strong>Export:</strong> Go to Profile -> Export to download a `.json` backup of your progress.</li>
                                <li><strong>Import:</strong> Load a backup file to restore your progress on another device.</li>
                                <li><strong>Cloud Sync:</strong> Optionally connect a Puter.com account to sync progress between devices automatically.</li>
                            </ul>
                        </section>

                    </div>
                    
                    <div class="h-20"></div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelectorAll('button[data-section]').forEach(btn => {
            btn.onclick = () => {
                this.activeSection = btn.dataset.section;
                // Update sidebar visual state manually to avoid full re-render
                this.querySelectorAll('button[data-section]').forEach(b => {
                    b.className = b.className.replace('bg-white shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700', 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400');
                    b.querySelector('.font-bold').classList.remove('text-slate-800', 'dark:text-white');
                });
                btn.className = btn.className.replace('hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400', 'bg-white shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700');
                btn.querySelector('.font-bold').classList.add('text-slate-800', 'dark:text-white');
                
                this.scrollToSection(btn.dataset.section);
            };
        });
    }
}
customElements.define('arbor-modal-manual', ArborModalManual);