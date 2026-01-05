

import { store } from '../store.js';
import { github } from '../services/github.js';
import { parseContent } from '../utils/parser.js';

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.originalContent = '';
        this.currentContent = '';
        this.isSubmitting = false;
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
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4">
                <div class="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-slate-600 dark:text-slate-300">${store.ui.editorLoading}</p>
            </div>
        </div>`;
    }

    renderEditor() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-100 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            <!-- Toolbar -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">📝</span>
                    <div>
                        <h2 class="font-black text-slate-800 dark:text-white leading-none">${ui.editorTitle}</h2>
                        <p class="text-xs text-slate-500 font-mono mt-1">${this.node.sourcePath}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <input type="file" id="img-upload" class="hidden" accept="image/*">
                    <button id="btn-img" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        📷 ${ui.editorUpload}
                    </button>
                    <div class="w-px h-8 bg-slate-200 dark:border-slate-700 mx-2"></div>
                    <button id="btn-cancel" class="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold">${ui.editorCancel}</button>
                    <button id="btn-submit" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg shadow-green-600/20">
                        ${ui.editorChanges}
                    </button>
                </div>
            </div>

            <!-- Main Area -->
            <div class="flex-1 flex overflow-hidden">
                <!-- Code Input -->
                <div class="flex-1 flex flex-col border-r border-slate-200 dark:border-slate-800 relative">
                     <div class="absolute top-2 right-2 text-xs font-bold text-slate-300 pointer-events-none">MARKDOWN</div>
                     <textarea id="editor-txt" class="flex-1 w-full h-full bg-slate-50 dark:bg-[#0d1117] text-slate-800 dark:text-slate-300 font-mono text-sm p-4 resize-none outline-none focus:bg-white dark:focus:bg-black transition-colors leading-relaxed" spellcheck="false">${this.currentContent}</textarea>
                </div>
                
                <!-- Preview -->
                <div class="flex-1 flex flex-col bg-white dark:bg-slate-900 relative hidden md:flex">
                     <div class="absolute top-2 right-2 text-xs font-bold text-slate-300 pointer-events-none">PREVIEW</div>
                     <div id="editor-preview" class="flex-1 overflow-y-auto p-8 prose prose-slate dark:prose-invert max-w-none">
                        <!-- Content rendered here -->
                     </div>
                </div>
            </div>
        </div>`;

        const textarea = this.querySelector('#editor-txt');
        const preview = this.querySelector('#editor-preview');
        
        // Initial Render
        this.updatePreview(textarea.value, preview);

        // Events
        textarea.oninput = (e) => {
            this.currentContent = e.target.value;
            this.updatePreview(this.currentContent, preview);
        };

        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        this.querySelector('#btn-submit').onclick = () => this.showCommitDialog();
        
        // Image Upload
        const fileInput = this.querySelector('#img-upload');
        const btnImg = this.querySelector('#btn-img');
        
        btnImg.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            if(e.target.files.length > 0) {
                const file = e.target.files[0];
                btnImg.textContent = ui.editorUploading;
                try {
                    const url = await github.uploadImage(file);
                    const tag = `\n@image: ${url}\n`;
                    this.insertTextAtCursor(textarea, tag);
                    this.currentContent = textarea.value;
                    this.updatePreview(this.currentContent, preview);
                } catch(err) {
                    alert('Upload failed: ' + err.message);
                } finally {
                    btnImg.innerHTML = `📷 ${ui.editorUpload}`;
                    fileInput.value = '';
                }
            }
        };
    }

    updatePreview(content, container) {
        // Mock a simple node structure to reuse ArborContent logic if possible, 
        // OR reuse parser directly. Reusing parser is safer here.
        const blocks = parseContent(content);
        // We need a temporary ArborContent instance to use its renderBlock method
        // Or we duplicate the render logic. Duplication is cleaner for this isolated component to avoid DOM issues.
        // Let's instantiate a dummy ArborContent to use its methods if strictly needed, 
        // but simpler: just copy the renderBlock logic since it's pure HTML string generation.
        
        const dummyContent = document.createElement('arbor-content');
        const html = blocks.map(b => dummyContent.renderBlock(b, store.ui)).join('');
        container.innerHTML = html;
    }

    insertTextAtCursor(textarea, text) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + text + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
    }

    showCommitDialog() {
        const ui = store.ui;
        // Simple overlay dialog
        const dialog = document.createElement('div');
        dialog.className = "fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4";
        dialog.innerHTML = `
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200">
                <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-4">${ui.editorChanges}</h3>
                <textarea id="commit-msg" class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-green-500 mb-4 h-24 resize-none" placeholder="${ui.editorCommitMsg}"></textarea>
                <div class="flex justify-end gap-2">
                    <button class="btn-dialog-cancel px-4 py-2 text-slate-500 font-bold">${ui.editorCancel}</button>
                    <button class="btn-dialog-ok px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg">${ui.editorCommitBtn}</button>
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
            btn.textContent = "Processing...";
            
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
            <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl text-center max-w-md border-4 border-green-500 animate-in zoom-in">
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">🚀</div>
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">${ui.prSuccessTitle}</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-8">${ui.prSuccessBody}</p>
                <a href="${url}" target="_blank" class="block w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg mb-3">${ui.prLink}</a>
                <button onclick="store.setModal(null)" class="block w-full py-3 text-slate-500 font-bold">${ui.close}</button>
            </div>
        </div>`;
    }
}

customElements.define('arbor-editor', ArborEditor);
