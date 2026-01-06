
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

    renderEditor() {
        const ui = store.ui;
        // Check if currently is exam
        const isExam = this.currentContent.includes('@exam');

        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-200 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            
            <!-- 1. Header (Actions) -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 shadow-sm z-20">
                <div class="flex items-center gap-4">
                    <button id="btn-cancel" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" title="${ui.editorCancel}">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 class="font-black text-lg text-slate-800 dark:text-white leading-none flex items-center gap-2">
                            ${this.node.name}
                            <span id="badge-exam" class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200 ${isExam ? '' : 'hidden'}">EXAM</span>
                        </h2>
                        <p class="text-xs text-slate-500 font-mono mt-1 opacity-70">Editing via GitHub</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                     <!-- Mode Toggles (Tabs) -->
                    <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mr-2">
                        <button id="tab-write" class="px-4 py-1.5 rounded-md text-sm font-bold transition-all ${!this.isPreviewMode ? 'bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700'}">
                            Write
                        </button>
                        <button id="tab-preview" class="px-4 py-1.5 rounded-md text-sm font-bold transition-all ${this.isPreviewMode ? 'bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-700'}">
                            Preview
                        </button>
                    </div>

                    <button id="btn-submit" class="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg shadow-orange-600/20 transform active:scale-95 transition-all uppercase tracking-wide text-sm">
                        Publish Changes
                    </button>
                </div>
            </div>

            <!-- 2. Formatting Toolbar (Only visible in Write mode) -->
            <div id="toolbar" class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-2 flex items-center gap-2 overflow-x-auto ${this.isPreviewMode ? 'hidden' : ''}">
                
                <!-- Text Formatting -->
                <div class="flex items-center gap-1 border-r border-slate-300 dark:border-slate-700 pr-2 mr-1 flex-shrink-0">
                    <button class="tool-btn font-serif font-black text-xl w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-tag="**" title="Bold">B</button>
                    <button class="tool-btn italic font-serif text-xl w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-tag="*" title="Italic">I</button>
                </div>

                <!-- Headings -->
                <div class="flex items-center gap-1 border-r border-slate-300 dark:border-slate-700 pr-2 mr-1 flex-shrink-0">
                    <button class="tool-btn font-bold text-lg w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-prefix="# " title="Heading 1">H1</button>
                    <button class="tool-btn font-bold text-sm w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-prefix="## " title="Heading 2">H2</button>
                    <button class="tool-btn font-bold text-lg w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200" data-prefix="- " title="List">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>

                <!-- Media & Interactive -->
                <div class="flex items-center gap-2 flex-shrink-0">
                     <button id="btn-img" class="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 transition-colors" title="Upload Image">
                        <span>📷</span> <span class="hidden lg:inline">Image</span>
                     </button>
                     
                     <button class="tool-btn flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 transition-colors" data-template="@video: https://youtube.com/watch?v=...">
                        <span>🎥</span> <span class="hidden lg:inline">Video</span>
                     </button>

                     <button class="tool-btn flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 transition-colors" data-template="@audio: https://example.com/sound.mp3">
                        <span>🎵</span> <span class="hidden lg:inline">Audio</span>
                     </button>
                </div>

                <div class="w-px h-8 bg-slate-300 dark:bg-slate-700 mx-1 flex-shrink-0"></div>

                <!-- Structure -->
                <div class="flex items-center gap-2 flex-shrink-0">
                     <button class="tool-btn flex items-center gap-2 px-3 py-2 rounded hover:bg-purple-100 dark:hover:bg-purple-900/30 text-sm font-bold text-purple-600 dark:text-purple-400 transition-colors" 
                        data-template="\n@quiz: Question here?\n@option: Wrong Answer\n@correct: Correct Answer\n" title="Insert Quiz">
                        <span>❓</span> <span>Quiz</span>
                     </button>

                     <button class="tool-btn flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 transition-colors" data-template="\n@section: New Section Title\n">
                        <span>📑</span> <span class="hidden lg:inline">Section</span>
                     </button>

                     <button id="btn-exam-toggle" class="flex items-center gap-2 px-3 py-2 rounded border border-transparent hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-bold transition-colors ${isExam ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-500'}" title="Toggle Exam Mode (Marks this file as an Exam)">
                        <span>⚔️</span> <span>Exam Mode</span>
                     </button>
                </div>
                
                <input type="file" id="img-upload" class="hidden" accept="image/*">
            </div>

            <!-- 3. Main Document Area -->
            <div class="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center custom-scrollbar" id="scroll-container">
                
                <div class="w-full max-w-4xl bg-white dark:bg-[#0d1117] min-h-[1000px] shadow-xl md:my-4 p-8 md:p-12 relative transition-all duration-300">
                    
                    <!-- WRITE MODE: Textarea -->
                    <textarea id="editor-txt" 
                        class="w-full h-full min-h-[800px] resize-none outline-none text-lg leading-loose text-slate-800 dark:text-slate-200 font-sans bg-transparent placeholder:text-slate-300 ${this.isPreviewMode ? 'hidden' : 'block'}" 
                        placeholder="Start typing your lesson here..." 
                        spellcheck="false">${this.currentContent}</textarea>
                    
                    <!-- PREVIEW MODE: Rendered HTML -->
                    <div id="editor-preview" 
                        class="prose prose-lg prose-slate dark:prose-invert max-w-none ${!this.isPreviewMode ? 'hidden' : 'block'} animate-in fade-in">
                    </div>
                
                </div>

            </div>
        </div>`;

        // --- Logic Binding ---

        const textarea = this.querySelector('#editor-txt');
        const preview = this.querySelector('#editor-preview');
        const btnExam = this.querySelector('#btn-exam-toggle');
        const badgeExam = this.querySelector('#badge-exam');
        
        // 1. Tab Switching
        const setMode = (previewMode) => {
            this.isPreviewMode = previewMode;
            if (previewMode) {
                this.updatePreview(this.currentContent, preview);
                this.querySelector('#tab-preview').className = 'px-4 py-1.5 rounded-md text-sm font-bold transition-all bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400';
                this.querySelector('#tab-write').className = 'px-4 py-1.5 rounded-md text-sm font-bold transition-all text-slate-500 hover:text-slate-700';
                textarea.classList.add('hidden');
                preview.classList.remove('hidden');
                this.querySelector('#toolbar').classList.add('hidden');
            } else {
                this.querySelector('#tab-write').className = 'px-4 py-1.5 rounded-md text-sm font-bold transition-all bg-white dark:bg-slate-700 shadow text-sky-600 dark:text-sky-400';
                this.querySelector('#tab-preview').className = 'px-4 py-1.5 rounded-md text-sm font-bold transition-all text-slate-500 hover:text-slate-700';
                textarea.classList.remove('hidden');
                preview.classList.add('hidden');
                this.querySelector('#toolbar').classList.remove('hidden');
                textarea.focus();
            }
        };

        this.querySelector('#tab-write').onclick = () => setMode(false);
        this.querySelector('#tab-preview').onclick = () => setMode(true);

        // 2. Toolbar Actions
        this.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault(); 
                const tag = btn.dataset.tag;
                const prefix = btn.dataset.prefix;
                // Handle escaped newlines in template string
                const template = btn.dataset.template ? btn.dataset.template.replace(/\\n/g, '\n') : null;

                if (tag) this.wrapSelection(textarea, tag);
                else if (prefix) this.insertPrefix(textarea, prefix);
                else if (template) this.insertAtCursor(textarea, template);
                
                this.currentContent = textarea.value;
            };
        });

        // 3. Exam Toggle
        btnExam.onclick = () => {
             let val = textarea.value;
             const hasExam = val.includes('@exam');
             
             if (hasExam) {
                 // Remove it
                 val = val.replace(/^@exam\s*\n?/gm, '');
                 // Also handle case where it might beinline (unlikely but safe)
                 val = val.replace('@exam', '');
                 
                 btnExam.classList.remove('text-red-600', 'bg-red-50', 'border-red-200');
                 btnExam.classList.add('text-slate-500');
                 badgeExam.classList.add('hidden');
             } else {
                 // Add it at the top
                 val = '@exam\n' + val;
                 btnExam.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
                 btnExam.classList.remove('text-slate-500');
                 badgeExam.classList.remove('hidden');
             }
             
             textarea.value = val;
             this.currentContent = val;
             textarea.focus();
        };

        // 4. Image Upload
        const fileInput = this.querySelector('#img-upload');
        const btnImg = this.querySelector('#btn-img');
        
        btnImg.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            if(e.target.files.length > 0) {
                const file = e.target.files[0];
                const originalText = btnImg.innerHTML;
                btnImg.textContent = "Uploading...";
                btnImg.disabled = true;
                try {
                    const url = await github.uploadImage(file);
                    const tag = `\n@image: ${url}\n`;
                    this.insertAtCursor(textarea, tag);
                    this.currentContent = textarea.value;
                } catch(err) {
                    alert('Upload failed: ' + err.message);
                } finally {
                    btnImg.innerHTML = originalText;
                    btnImg.disabled = false;
                    fileInput.value = '';
                }
            }
        };

        // 5. Save / Cancel
        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        this.querySelector('#btn-submit').onclick = () => this.showCommitDialog();

        // 6. Input Handling
        textarea.oninput = (e) => {
            this.currentContent = e.target.value;
        };
    }

    // --- Helpers ---

    wrapSelection(field, wrapper) {
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const text = field.value;
        const selected = text.substring(start, end);
        const before = text.substring(0, start);
        const after = text.substring(end);
        
        field.value = before + wrapper + selected + wrapper + after;
        field.selectionStart = field.selectionEnd = end + (wrapper.length * 2);
        field.focus();
    }

    insertPrefix(field, prefix) {
        const start = field.selectionStart;
        const text = field.value;
        // Find beginning of current line
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const before = text.substring(0, lineStart);
        const after = text.substring(lineStart);
        
        field.value = before + prefix + after;
        field.focus();
    }

    insertAtCursor(field, text) {
        const start = field.selectionStart;
        const end = field.selectionEnd;
        const val = field.value;
        field.value = val.substring(0, start) + text + val.substring(end);
        field.selectionStart = field.selectionEnd = start + text.length;
        field.focus();
    }

    updatePreview(content, container) {
        const blocks = parseContent(content);
        // Reuse ArborContent logic via dummy element or copy logic
        const dummyContent = document.createElement('arbor-content');
        const html = blocks.map(b => dummyContent.renderBlock(b, store.ui)).join('');
        container.innerHTML = html;
    }

    showCommitDialog() {
        const ui = store.ui;
        const dialog = document.createElement('div');
        dialog.className = "fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4";
        dialog.innerHTML = `
            <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200 text-center">
                <div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">📢</div>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${ui.editorChanges}</h3>
                <p class="text-sm text-slate-500 mb-6">Briefly describe what you changed so the admins know.</p>
                
                <textarea id="commit-msg" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-base text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 mb-6 h-32 resize-none" placeholder="e.g. Fixed a typo in the second paragraph..."></textarea>
                
                <div class="flex gap-3">
                    <button class="btn-dialog-cancel flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-bold rounded-xl">${ui.editorCancel}</button>
                    <button class="btn-dialog-ok flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30">${ui.editorCommitBtn}</button>
                </div>
            </div>
        `;
        this.appendChild(dialog);

        dialog.querySelector('.btn-dialog-cancel').onclick = () => dialog.remove();
        dialog.querySelector('.btn-dialog-ok').onclick = async () => {
            const msg = dialog.querySelector('#commit-msg').value;
            if(!msg) return;
            
            const btn = dialog.querySelector('.btn-dialog-ok');
            btn.disabled = true;
            btn.textContent = "Publishing...";
            
            try {
                const prUrl = await github.createPullRequest(this.node.sourcePath, this.currentContent, msg);
                this.showSuccess(prUrl);
            } catch(e) {
                alert(ui.prError + ': ' + e.message);
                btn.disabled = false;
                btn.textContent = ui.editorCommitBtn;
            }
        };
    }

    showSuccess(url) {
        const ui = store.ui;
        this.innerHTML = `
        <div class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900 p-4">
            <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl text-center max-w-md border-t-8 border-green-500 animate-in zoom-in">
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm">🎉</div>
                <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">Submitted!</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">Your changes have been sent for review. Thank you for contributing to open knowledge.</p>
                <a href="${url}" target="_blank" class="block w-full py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-white font-bold rounded-xl mb-3 flex items-center justify-center gap-2">
                    <span>View on GitHub</span> 
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <button onclick="store.setModal(null)" class="block w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-500 transition-colors">Done</button>
            </div>
        </div>`;
    }
}

customElements.define('arbor-editor', ArborEditor);
