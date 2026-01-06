



import { store } from '../store.js';
import { github } from '../services/github.js';
import { parseContent } from '../utils/parser.js';

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.originalContent = '';
        this.currentContent = '';
        this.isPreviewMode = false;
        
        // Emojis populares para educación
        this.emojis = ['📚', '🧬', '📐', '🎨', '🌍', '🏰', '💻', '🎵', '⚽', '🧠', '💡', '📝', '⚔️', '🛡️', '🚀', '🧪', '🌱', '🎓', '🔎', '⚙️'];
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        if (modal && modal.type === 'editor' && modal.node) {
            if (this.node?.id !== modal.node.id) {
                this.node = modal.node;
                this.loadContent();
            }
        } else {
            this.node = null;
            this.innerHTML = '';
        }
    }

    async loadContent() {
        this.renderLoading();
        try {
            if (!this.node.sourcePath) {
                 throw new Error("This node cannot be edited (Missing source path).");
            }
            const { content } = await github.getFileContent(this.node.sourcePath);
            this.originalContent = content;
            this.currentContent = content;
            this.renderEditor();
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error loading file from GitHub: " + e.message });
            store.setModal(null);
        }
    }

    renderLoading() {
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-lg text-slate-600 dark:text-slate-300">${store.ui.editorLoading}</p>
            </div>
        </div>`;
    }

    insertAtCursor(textToInsert) {
        const textarea = this.querySelector('textarea');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        this.currentContent = before + textToInsert + after;
        textarea.value = this.currentContent;
        
        // Restore cursor
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
        textarea.focus();
    }
    
    changeIcon(newIcon) {
        // Regex to replace @icon: ANY
        const regex = /@icon:\s*.+/;
        if (regex.test(this.currentContent)) {
            this.currentContent = this.currentContent.replace(regex, `@icon: ${newIcon}`);
        } else {
            // If missing, add to top
            this.currentContent = `@icon: ${newIcon}\n` + this.currentContent;
        }
        this.renderEditor();
    }

    renderEditor() {
        const ui = store.ui;
        // Extract current icon
        const iconMatch = this.currentContent.match(/@icon:\s*(.+)/i);
        const currentIcon = iconMatch ? iconMatch[1].trim() : '📄';

        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-100 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            
            <!-- HEADER -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shadow-sm z-20 flex-shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                    <button id="btn-cancel" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" title="${ui.editorCancel}">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    
                    <div class="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                    <!-- EMOJI SELECTOR -->
                    <div class="relative group">
                        <button id="btn-emoji" class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-500 text-2xl flex items-center justify-center transition-all">
                            ${currentIcon}
                        </button>
                        <!-- Dropdown -->
                        <div class="absolute top-12 left-0 w-64 bg-white dark:bg-slate-900 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-3 grid grid-cols-5 gap-2 hidden group-hover:grid group-focus-within:grid z-50 animate-in zoom-in duration-200">
                            ${this.emojis.map(e => `<button class="btn-emoji-opt w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" data-emoji="${e}">${e}</button>`).join('')}
                        </div>
                    </div>

                    <div class="min-w-0 flex flex-col">
                        <h2 class="font-black text-sm md:text-lg text-slate-800 dark:text-white truncate leading-tight">${this.node.name}</h2>
                        <p class="text-[10px] text-slate-400 font-mono truncate hidden md:block">${this.node.sourcePath}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                     <!-- VIEW TOGGLE -->
                    <div class="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                        <button id="tab-write" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${!this.isPreviewMode ? 'bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700'}">
                            <span>✏️</span> <span class="hidden sm:inline">Code</span>
                        </button>
                        <button id="tab-preview" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${this.isPreviewMode ? 'bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700'}">
                            <span>👁️</span> <span class="hidden sm:inline">Preview</span>
                        </button>
                    </div>

                    <button id="btn-submit" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg shadow-green-600/20 transform active:scale-95 transition-all text-sm flex items-center gap-2">
                        <span>${ui.editorChanges}</span>
                        <svg class="w-4 h-4 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    </button>
                </div>
            </div>

            <!-- TOOLBAR (Only in Write Mode) -->
            ${!this.isPreviewMode ? `
            <div class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar flex-shrink-0">
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs min-w-[30px]" data-ins="**Bold**" title="Bold">B</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 italic text-xs min-w-[30px]" data-ins="*Italic*" title="Italic">I</button>
                <div class="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1"></div>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs" data-ins="# ">H1</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs" data-ins="## ">H2</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs" data-ins="- ">List</button>
                <div class="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1"></div>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1" data-ins="@image: https://">
                    <span>🖼️</span> <span class="hidden sm:inline">Img</span>
                </button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1" data-ins="@video: https://">
                    <span>🎬</span> <span class="hidden sm:inline">Video</span>
                </button>
                <div class="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1"></div>
                <button class="tb-btn px-3 py-1.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 font-bold text-xs flex items-center gap-1" 
                    data-ins="\n@quiz: Question?\n@option: Wrong Answer\n@correct: Right Answer\n">
                    <span>📝</span> <span>Quiz</span>
                </button>
            </div>
            ` : ''}

            <!-- CONTENT AREA -->
            <div class="flex-1 overflow-hidden relative">
                ${!this.isPreviewMode ? `
                    <textarea id="editor-area" class="w-full h-full p-6 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-sm leading-relaxed resize-none outline-none" spellcheck="false">${this.currentContent}</textarea>
                ` : `
                    <div class="w-full h-full p-6 md:p-12 overflow-y-auto bg-white dark:bg-slate-900 prose prose-slate dark:prose-invert max-w-none">
                        ${parseContent(this.currentContent).map(b => this.renderPreviewBlock(b)).join('')}
                    </div>
                `}
            </div>

            <!-- COMMIT MODAL (Hidden by default) -->
            <dialog id="commit-dialog" class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-md w-full border border-slate-200 dark:border-slate-800">
                <h3 class="font-black text-xl mb-4 text-slate-800 dark:text-white">${ui.editorChanges}</h3>
                <textarea id="commit-msg" class="w-full h-24 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 border border-slate-200 dark:border-slate-700 outline-none text-sm dark:text-white" placeholder="${ui.editorCommitMsg}"></textarea>
                <div class="flex justify-end gap-3">
                    <button id="btn-commit-cancel" class="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">${ui.cancel}</button>
                    <button id="btn-commit-confirm" class="px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-500">${ui.editorCommitBtn}</button>
                </div>
            </dialog>

        </div>`;

        this.bindEvents();
    }

    // Helper for simple preview rendering without the full ArborContent complexity
    renderPreviewBlock(b) {
        if (b.type === 'h1') return `<h1>${b.text}</h1>`;
        if (b.type === 'h2') return `<h2>${b.text}</h2>`;
        if (b.type === 'p') return `<p>${b.text}</p>`;
        if (b.type === 'image') return `<img src="${b.src}" class="rounded-lg shadow my-4">`;
        if (b.type === 'list') return `<ul>${b.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
        if (b.type === 'quiz') return `<div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg my-4 border-l-4 border-purple-500"><p class="font-bold">Quiz: ${b.questions[0].question}</p></div>`;
        return '';
    }

    bindEvents() {
        const ta = this.querySelector('#editor-area');
        if (ta) {
            ta.addEventListener('input', (e) => {
                this.currentContent = e.target.value;
            });
        }

        // Toolbar Buttons
        this.querySelectorAll('.tb-btn').forEach(btn => {
            btn.onclick = () => this.insertAtCursor(btn.dataset.ins);
        });

        // Emoji Options
        this.querySelectorAll('.btn-emoji-opt').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent closing dropdown immediately if logic requires
                this.changeIcon(e.target.dataset.emoji);
            };
        });

        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        
        this.querySelector('#tab-write').onclick = () => {
            this.isPreviewMode = false;
            this.renderEditor();
        };
        this.querySelector('#tab-preview').onclick = () => {
            this.isPreviewMode = true;
            this.renderEditor();
        };

        const dialog = this.querySelector('#commit-dialog');
        
        this.querySelector('#btn-submit').onclick = () => {
             dialog.showModal();
             this.querySelector('#commit-msg').focus();
        };

        this.querySelector('#btn-commit-cancel').onclick = () => dialog.close();
        
        this.querySelector('#btn-commit-confirm').onclick = async () => {
            const msg = this.querySelector('#commit-msg').value.trim() || `Update ${this.node.name}`;
            const btn = this.querySelector('#btn-commit-confirm');
            btn.disabled = true;
            btn.textContent = "Processing...";
            
            try {
                const prUrl = await github.createPullRequest(this.node.sourcePath, this.currentContent, msg);
                alert(store.ui.prSuccessBody);
                window.open(prUrl, '_blank');
                dialog.close();
                store.setModal(null);
            } catch (e) {
                alert(store.ui.prError + ": " + e.message);
                btn.disabled = false;
                btn.textContent = store.ui.editorCommitBtn;
            }
        };
    }
}
customElements.define('arbor-editor', ArborEditor);
