import { store } from '../store.js';
import { github } from '../services/github.js';

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.originalContent = '';
        this.isUploading = false;

        // Default state for metadata
        this.meta = {
            title: '',
            icon: '📄',
            description: '',
            order: '99',
            isExam: false,
            extra: {} // Preserve unknown meta fields
        };

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
            if (this.node) {
                this.node = null;
                this.innerHTML = '';
            }
        }
    }

    async loadContent() {
        this.renderLoading();
        try {
            if (!this.node.sourcePath) throw new Error("No source path configured for this node.");
            const { content } = await github.getFileContent(this.node.sourcePath);
            this.originalContent = content;
            this.parseFullContent(content);
            this.renderEditor();
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error loading content: " + e.message });
            store.setModal(null);
        }
    }

    // --- Data Parsing & Generation ---

    parseFullContent(md) {
        const lines = md.split('\n');
        const bodyLines = [];
        let parsingMeta = true;

        // Reset meta state with defaults from the node
        this.meta = {
            title: this.node.name,
            icon: this.node.icon || '📄',
            description: this.node.description || '',
            order: '99',
            isExam: false,
            extra: {}
        };
        
        const knownMeta = ['title', 'icon', 'description', 'order', 'discussion'];

        for (const line of lines) {
            const t = line.trim();
            if (parsingMeta && t.startsWith('@')) {
                if (t.toLowerCase() === '@exam') {
                    this.meta.isExam = true;
                    continue;
                }

                const parts = t.substring(1).split(':');
                const key = parts.shift().trim().toLowerCase();
                const value = parts.join(':').trim();
                
                if (knownMeta.includes(key)) {
                    this.meta[key] = value;
                } else if (value) {
                    this.meta.extra[key] = value;
                } else {
                    // It's a tag without a value that we don't recognize, treat as content
                    parsingMeta = false;
                    bodyLines.push(line);
                }
            } else {
                if (t !== '') parsingMeta = false;
                bodyLines.push(line);
            }
        }
        this.bodyContent = bodyLines.join('\n');
    }

    generateFinalMarkdown() {
        let md = '';
        // 1. Metadata from inputs
        md += `@title: ${this.querySelector('#editor-title').value.trim()}\n`;
        md += `@icon: ${this.querySelector('#btn-emoji').textContent.trim()}\n`;
        md += `@description: ${this.querySelector('#editor-description').value.trim()}\n`;
        md += `@order: ${this.querySelector('#editor-order').value.trim()}\n`;
        if (this.querySelector('#editor-type-exam').checked) {
            md += `@exam\n`;
        }
        Object.entries(this.meta.extra).forEach(([key, value]) => {
            md += `@${key}: ${value}\n`;
        });
        md += `\n`;

        // 2. Body from visual editor blocks
        const editorEl = this.querySelector('#wysiwyg-editor');
        editorEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                md += node.textContent + '\n\n';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'H1') md += `# ${node.textContent}\n\n`;
                else if (node.tagName === 'H2') md += `## ${node.textContent}\n\n`;
                else if (node.tagName === 'P' && node.innerHTML.trim() && node.innerHTML !== '<br>') {
                    const parsedHtml = node.innerHTML.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '*$1*').replace(/<br>/g, '\n');
                    md += parsedHtml + '\n\n';
                } else if (node.classList?.contains('image-block')) {
                    const src = node.querySelector('img')?.src;
                    if (src) md += `@image: ${src}\n\n`;
                } else if (node.classList?.contains('quiz-block')) {
                    const question = node.querySelector('.quiz-question-input')?.value.trim();
                    if(question) {
                        md += `@quiz: ${question}\n`;
                        node.querySelectorAll('.options-container .option-item').forEach(opt => {
                            const val = opt.querySelector('input')?.value.trim();
                            if (val) {
                                const type = opt.dataset.type === 'correct' ? '@correct' : '@option';
                                md += `${type}: ${val}\n`;
                            }
                        });
                        md += `\n`;
                    }
                }
            }
        });

        return md.trim();
    }

    // --- Rendering ---

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
        this.innerHTML = `
        <style>
            #wysiwyg-editor:focus { outline: none; }
            .arbor-block {
                padding: 1rem;
                margin: 1.5rem 0;
                border-radius: 1rem;
                background: #f1f5f9;
                border: 2px solid #e2e8f0;
            }
            .dark .arbor-block {
                background: #1e293b;
                border-color: #334155;
            }
            .arbor-block[contenteditable="false"] { user-select: none; }
            .arbor-block input {
                background: white;
                border: 1px solid #cbd5e1;
                border-radius: 0.5rem;
                padding: 0.5rem 0.75rem;
                width: 100%;
                font-size: 1rem;
            }
            .dark .arbor-block input {
                background: #0f172a;
                border-color: #475569;
                color: #e2e8f0;
            }
        </style>
        <div id="editor-overlay" class="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200">
            <div class="bg-[#f7f9fa] dark:bg-slate-950 rounded-2xl shadow-2xl max-w-7xl w-full h-[95vh] flex flex-col border border-slate-300 dark:border-slate-700">
                
                <!-- HEADER -->
                <div class="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20 rounded-t-2xl p-4">
                    <div class="flex justify-between items-center mb-4">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">${this.node.sourcePath}</p>
                        <div class="flex items-center gap-3">
                             <button id="btn-cancel" class="px-4 py-2 text-sm text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">${ui.editorCancel}</button>
                             <button id="btn-submit" class="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95">${ui.editorChanges}</button>
                        </div>
                    </div>
                    <!-- Metadata Fields -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                        <div class="flex items-start gap-3">
                            <div class="relative group">
                                <button id="btn-emoji" class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-500 text-3xl flex items-center justify-center transition-colors">${this.meta.icon}</button>
                                <div class="absolute top-16 left-0 w-64 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-5 gap-2 hidden group-hover:grid z-50">${this.emojis.map(e => `<button class="btn-emoji-opt w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded" data-emoji="${e}">${e}</button>`).join('')}</div>
                            </div>
                            <div class="flex-1">
                                <label class="text-xs font-bold text-slate-400">${ui.lessonTopics}</label>
                                <input id="editor-title" type="text" class="w-full bg-transparent text-lg font-black text-slate-800 dark:text-white outline-none" value="${this.meta.title}">
                            </div>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-400">${ui.appSubtitle}</label>
                            <input id="editor-description" type="text" class="w-full bg-transparent text-sm font-medium text-slate-600 dark:text-slate-300 outline-none" value="${this.meta.description}" placeholder="${ui.noDescription}">
                        </div>
                        <div class="flex items-center gap-4 col-span-1 md:col-span-2">
                            <div>
                                <label class="text-xs font-bold text-slate-400">ORDEN</label>
                                <input id="editor-order" type="number" class="w-20 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg font-bold text-center" value="${this.meta.order}">
                            </div>
                            <div class="flex items-center gap-4">
                                <label class="text-xs font-bold text-slate-400">TIPO</label>
                                <div class="flex items-center gap-2 text-sm font-bold">
                                    <input type="radio" id="editor-type-lesson" name="type" ${!this.meta.isExam ? 'checked' : ''}><label for="editor-type-lesson">🌱 Lección</label>
                                    <input type="radio" id="editor-type-exam" name="type" ${this.meta.isExam ? 'checked' : ''}><label for="editor-type-exam">⚔️ Examen</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- EDITOR AREA -->
                <div class="flex-1 flex overflow-hidden relative">
                    <!-- Toolbar -->
                    <div class="absolute top-0 right-full mr-4 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full flex flex-col gap-2 shadow-lg">
                         <button class="tb-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 font-bold" data-cmd="bold">B</button>
                         <button class="tb-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 italic" data-cmd="italic">I</button>
                         <div class="w-full h-px bg-slate-200 dark:bg-slate-700"></div>
                         <button class="tb-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs" data-cmd="formatBlock" data-val="h1">H1</button>
                         <button class="tb-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs" data-cmd="formatBlock" data-val="h2">H2</button>
                         <div class="w-full h-px bg-slate-200 dark:bg-slate-700"></div>
                         <button id="btn-add-img" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">🖼️</button>
                         <button id="btn-add-quiz" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">❓</button>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-800/50 p-4 md:p-8 custom-scrollbar">
                        <div id="wysiwyg-editor" class="max-w-3xl mx-auto min-h-full bg-white dark:bg-slate-900 shadow-lg rounded-xl p-8 md:p-12 outline-none prose prose-slate dark:prose-invert prose-lg" contenteditable="true">
                            ${this.bodyToHtml(this.bodyContent)}
                        </div>
                    </div>
                </div>
            </div>
            <input type="file" id="image-upload" class="hidden" accept="image/*">
        </div>
            
        <!-- MODAL DE GUARDADO -->
        <dialog id="commit-dialog" class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-md w-full border border-slate-200 dark:border-slate-700">
            <h3 class="font-black text-xl mb-4 text-slate-800 dark:text-white">${ui.editorChanges}</h3>
            <p class="text-sm text-slate-500 mb-2">${ui.editorCommitMsg}</p>
            <textarea id="commit-msg" class="w-full h-24 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 border border-slate-200 dark:border-slate-700 outline-none text-sm dark:text-white" placeholder="Ej: Corregí la fecha de la batalla..."></textarea>
            <div class="flex justify-end gap-3">
                <button id="btn-commit-cancel" class="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">${ui.editorCancel}</button>
                <button id="btn-commit-confirm" class="px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg">${ui.editorCommitBtn}</button>
            </div>
        </dialog>
        `;
        this.bindEvents();
    }

    bodyToHtml(md) {
        const lines = md.split('\n');
        let html = '';
        let currentQuiz = null;

        const closeQuiz = () => {
            if (currentQuiz) {
                const optionsHtml = currentQuiz.options.map(opt => `
                    <div class="option-item flex items-center gap-3" data-type="${opt.correct ? 'correct' : 'option'}">
                        <span class="w-8 h-8 rounded-full flex items-center justify-center text-lg ${opt.correct ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-400'}">${opt.correct ? '✔' : '✖'}</span>
                        <input type="text" class="flex-1" value="${opt.text}" placeholder="Texto de la opción...">
                    </div>
                `).join('');
                html += `<div class="arbor-block quiz-block" contenteditable="false">
                    <h4 class="font-bold text-green-700 dark:text-green-300 uppercase text-xs mb-2">Pregunta de Evaluación</h4>
                    <input type="text" class="quiz-question-input mb-4 font-bold text-lg" value="${currentQuiz.question}" placeholder="Escribe la pregunta...">
                    <div class="options-container space-y-3">${optionsHtml}</div>
                </div>`;
                currentQuiz = null;
            }
        };

        for (const line of lines) {
            const t = line.trim();
            if (t.startsWith('@quiz:')) {
                closeQuiz();
                currentQuiz = { question: t.substring(6).trim(), options: [] };
            } else if (currentQuiz && (t.startsWith('@option:') || t.startsWith('@correct:'))) {
                currentQuiz.options.push({
                    text: t.substring(t.indexOf(':') + 1).trim(),
                    correct: t.startsWith('@correct:')
                });
            } else if (t.startsWith('@image:')) {
                closeQuiz();
                html += `<div class="arbor-block image-block" contenteditable="false">
                    <img src="${t.substring(7).trim()}" class="w-full rounded-lg shadow">
                </div>`;
            } else if (t.startsWith('# ')) {
                closeQuiz(); html += `<h1>${t.substring(2)}</h1>`;
            } else if (t.startsWith('## ')) {
                closeQuiz(); html += `<h2>${t.substring(3)}</h2>`;
            } else if (t.trim()) {
                closeQuiz();
                const inlineParsed = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
                html += `<p>${inlineParsed}</p>`;
            }
        }
        closeQuiz(); // Close any pending quiz at the end
        return html;
    }
    
    // --- Event Handling & DOM Manipulation ---

    bindEvents() {
        const ui = store.ui;
        // Main overlay
        this.querySelector('#editor-overlay').onclick = (e) => {
             if(e.target.id === 'editor-overlay' && confirm(ui.editorCancel + '?')) store.setModal(null);
        };
        this.querySelector('#btn-cancel').onclick = () => { if(confirm(ui.editorCancel + '?')) store.setModal(null); };

        // Toolbar
        this.querySelectorAll('.tb-btn').forEach(b => b.onclick = (e) => {
            e.preventDefault();
            this.formatText(b.dataset.cmd, b.dataset.val);
        });

        // Insert blocks
        this.querySelector('#btn-add-quiz').onclick = (e) => { e.preventDefault(); this.insertBlock('quiz'); };
        this.querySelector('#btn-add-img').onclick = (e) => { e.preventDefault(); this.querySelector('#image-upload').click(); };
        
        // Image upload handling
        this.querySelector('#image-upload').onchange = (e) => this.handleImageUpload(e);

        // Emoji picker
        this.querySelectorAll('.btn-emoji-opt').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            this.querySelector('#btn-emoji').textContent = e.target.dataset.emoji;
        });

        // Commit dialog
        const dialog = this.querySelector('#commit-dialog');
        this.querySelector('#btn-submit').onclick = () => dialog.showModal();
        this.querySelector('#btn-commit-cancel').onclick = () => dialog.close();
        this.querySelector('#btn-commit-confirm').onclick = () => this.submitChanges();
    }
    
    formatText(cmd, value = null) {
        if (cmd === 'formatBlock') {
            document.execCommand('formatBlock', false, `<${value}>`);
        } else {
            document.execCommand(cmd, false, null);
        }
        this.querySelector('#wysiwyg-editor').focus();
    }
    
    insertBlock(type) {
        const editor = this.querySelector('#wysiwyg-editor');
        let blockHtml = '';

        if (type === 'quiz') {
            blockHtml = `<div class="arbor-block quiz-block" contenteditable="false">
                <h4 class="font-bold text-green-700 dark:text-green-300 uppercase text-xs mb-2">Pregunta de Evaluación</h4>
                <input type="text" class="quiz-question-input mb-4 font-bold text-lg" placeholder="Escribe la pregunta...">
                <div class="options-container space-y-3">
                    <div class="option-item flex items-center gap-3" data-type="correct"><span class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-green-100 text-green-600">✔</span><input type="text" class="flex-1" placeholder="Respuesta Correcta"></div>
                    <div class="option-item flex items-center gap-3" data-type="option"><span class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-red-50 text-red-400">✖</span><input type="text" class="flex-1" placeholder="Respuesta Incorrecta"></div>
                </div>
            </div><p><br></p>`;
        }
        document.execCommand('insertHTML', false, blockHtml);
    }

    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.isUploading = true;
        this.render(); // Re-render to show loading state maybe
        
        try {
            const url = await github.uploadImage(file);
            const imgBlock = `<div class="arbor-block image-block" contenteditable="false"><img src="${url}" class="w-full rounded-lg shadow"></div><p><br></p>`;
            document.execCommand('insertHTML', false, imgBlock);
        } catch (err) {
            alert('Error al subir imagen: ' + err.message);
        } finally {
            this.isUploading = false;
            // Re-render to hide loading
        }
    }

    async submitChanges() {
        const ui = store.ui;
        const msg = this.querySelector('#commit-msg').value.trim() || `Update ${this.querySelector('#editor-title').value.trim()}`;
        const btn = this.querySelector('#btn-commit-confirm');
        
        btn.disabled = true;
        btn.innerHTML = `<div class="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>`;

        const finalMarkdown = this.generateFinalMarkdown();

        // Check if content has actually changed
        if (finalMarkdown.trim() === this.originalContent.trim()) {
            alert("No changes detected.");
            this.querySelector('#commit-dialog').close();
            btn.disabled = false;
            btn.textContent = ui.editorCommitBtn;
            return;
        }

        try {
            const prUrl = await github.createPullRequest(this.node.sourcePath, finalMarkdown, msg);
            store.setModal({ type: 'prSuccess', url: prUrl });
        } catch (e) {
            alert(ui.prError + ": " + e.message);
            btn.disabled = false;
            btn.textContent = ui.editorCommitBtn;
        }
    }
}

customElements.define('arbor-editor', ArborEditor);
