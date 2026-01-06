import { store } from '../store.js';
import { github } from '../services/github.js';

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.originalContent = '';
        // State for metadata fields
        this.meta = {
            title: '',
            icon: '📄',
            description: '',
            order: '99',
            isExam: false,
            // Store other unknown meta to preserve it
            extra: {}
        };
        this.bodyContent = '';
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
            if (!this.node.sourcePath) throw new Error("No source path configured for this node.");
            const { content } = await github.getFileContent(this.node.sourcePath);
            this.originalContent = content;
            this.parseFullContent(content); // <-- Populates this.meta and this.bodyContent
            this.renderEditor();
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error al cargar contenido: " + e.message });
            store.setModal(null);
        }
    }

    renderLoading() {
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-lg text-slate-600 dark:text-slate-300">Cargando Editor Visual...</p>
            </div>
        </div>`;
    }

    // ==================================================================================
    // 🧠 PARSER (METADATOS + CUERPO)
    // ==================================================================================

    parseFullContent(md) {
        const lines = md.split('\n');
        const bodyLines = [];
        let parsingMeta = true;

        // Reset meta state
        this.meta = { title: this.node.name, icon: '📄', description: '', order: '99', isExam: false, extra: {} };
        
        const knownMeta = ['title', 'icon', 'description', 'order', 'discussion'];

        for (const line of lines) {
            const t = line.trim();
            if (parsingMeta && t.startsWith('@')) {
                if (t.toLowerCase() === '@exam') {
                    this.meta.isExam = true;
                    continue;
                }
                const [key, ...valParts] = t.substring(1).split(':');
                const value = valParts.join(':').trim();
                const cleanKey = key.trim().toLowerCase();
                
                if(knownMeta.includes(cleanKey)) {
                    this.meta[cleanKey] = value;
                } else if (value) {
                    this.meta.extra[cleanKey] = value; // Preserve unknown tags
                } else {
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

    markdownToVisual(md) {
        let html = '';
        const lines = md.split('\n');
        let inQuiz = false;
        
        lines.forEach(line => {
            const t = line.trim();
            if (t.startsWith('@quiz:')) {
                const qValue = t.substring(6).trim();
                html += `
                <div class="arbor-visual-block quiz-block my-6 p-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-100 dark:border-green-800 rounded-2xl select-none" contenteditable="false">
                    <div class="flex items-center justify-between mb-4 border-b border-green-200 dark:border-green-700 pb-2">
                        <div class="flex items-center gap-2 font-bold text-green-700 dark:text-green-300 uppercase tracking-wider text-xs">
                            <span class="text-lg">❓</span> Pregunta de Evaluación
                        </div>
                        <button class="text-red-400 hover:text-red-600 font-bold text-xs btn-delete-block">ELIMINAR</button>
                    </div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Pregunta:</label>
                    <input type="text" class="quiz-question-input w-full p-3 text-lg font-bold border border-slate-200 dark:border-slate-700 rounded-xl mb-4 bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-green-500 outline-none" value="${qValue}" placeholder="Escribe la pregunta...">
                    <div class="options-container space-y-3">`;
                inQuiz = true;
            } 
            else if (inQuiz && (t.startsWith('@option:') || t.startsWith('@correct:'))) {
                 const isCorrect = t.startsWith('@correct:');
                 const val = t.substring(t.indexOf(':')+1).trim();
                 html += `
                 <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-lg ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-400'}">
                        ${isCorrect ? '✔' : '✖'}
                    </div>
                    <input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" value="${val}" data-type="${isCorrect ? 'correct' : 'option'}" placeholder="Opción de respuesta...">
                 </div>`;
            } 
            else if (inQuiz && t === '') {
                html += `</div></div><p><br></p>`;
                inQuiz = false;
            } 
            else if (t.startsWith('@image:') || t.startsWith('@img:')) {
                const src = t.substring(t.indexOf(':')+1).trim();
                html += `<div class="arbor-visual-block image-block my-6 relative group" contenteditable="false"><img src="${src}" class="w-full rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700"><div class="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl"><button class="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg btn-delete-block">Eliminar</button></div><p class="hidden src-data">${src}</p></div><p><br></p>`;
            }
            else if (t.startsWith('# ')) {
                html += `<h1>${t.substring(2)}</h1>`;
            } else if (t.startsWith('## ')) {
                html += `<h2>${t.substring(3)}</h2>`;
            } else if (t.startsWith('- ')) {
                 html += `<li>${this.parseInline(t.substring(2))}</li>`;
            } else {
                if (t.length > 0) html += `<p>${this.parseInline(t)}</p>`;
            }
        });
        if(inQuiz) html += `</div></div><p><br></p>`;
        return html;
    }

    parseInline(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>');
    }

    visualToMarkdown() {
        let md = '';
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
        
        const editorEl = this.querySelector('#wysiwyg-editor');
        const nodes = editorEl.childNodes;
        nodes.forEach(node => {
            if (node.nodeType === 3) { 
                if(node.textContent.trim()) md += node.textContent.trim() + '\n\n';
            } 
            else if (node.tagName === 'H1') md += `# ${node.textContent}\n\n`;
            else if (node.tagName === 'H2') md += `## ${node.textContent}\n\n`;
            else if ((node.tagName === 'P' || node.tagName === 'DIV') && !node.classList.contains('arbor-visual-block')) {
                let text = node.innerHTML.replace(/<b>/g, '**').replace(/<\/b>/g, '**').replace(/<i>/g, '*').replace(/<\/i>/g, '*').replace(/<br>/g, '\n');
                text = text.replace(/<[^>]*>/g, '');
                if(text.trim()) md += text.trim() + '\n\n';
            } 
            else if (node.tagName === 'UL') {
                 node.querySelectorAll('li').forEach(li => md += `- ${li.textContent}\n`);
                 md += '\n';
            }
            else if (node.classList?.contains('quiz-block')) {
                 const qInput = node.querySelector('.quiz-question-input');
                 if(qInput && qInput.value) {
                     md += `@quiz: ${qInput.value}\n`;
                     node.querySelectorAll('.options-container input').forEach(optInput => {
                         if (optInput.value) md += `@${optInput.dataset.type}: ${optInput.value}\n`;
                     });
                     md += '\n';
                 }
            } 
            else if (node.classList?.contains('image-block')) {
                 const srcData = node.querySelector('.src-data');
                 if(srcData) md += `@image: ${srcData.textContent}\n\n`;
            }
        });
        return md.trim();
    }

    execCmd(cmd, val = null) {
        document.execCommand(cmd, false, val);
        this.querySelector('#wysiwyg-editor').focus();
    }

    insertBlock(type) {
        let html = '';
        if (type === 'quiz') {
            html = `<div class="arbor-visual-block quiz-block my-6 p-6 bg-green-50 dark:bg-green-900/20 border-2 border-green-100 dark:border-green-800 rounded-2xl select-none" contenteditable="false"><div class="flex items-center justify-between mb-4 border-b border-green-200 dark:border-green-700 pb-2"><div class="flex items-center gap-2 font-bold text-green-700 dark:text-green-300 uppercase tracking-wider text-xs"><span class="text-lg">❓</span> Nuevo Quiz</div><button class="text-red-400 hover:text-red-600 font-bold text-xs btn-delete-block">ELIMINAR</button></div><label class="block text-xs font-bold text-slate-400 mb-1">Pregunta:</label><input type="text" class="quiz-question-input w-full p-3 text-lg font-bold border border-slate-200 dark:border-slate-700 rounded-xl mb-4 bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-green-500" placeholder="Escribe aquí la pregunta..."><div class="options-container space-y-3"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-green-100 text-green-600">✔</div><input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" placeholder="Respuesta Correcta" data-type="correct"></div><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-red-50 text-red-400">✖</div><input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" placeholder="Respuesta Incorrecta" data-type="option"></div></div></div><p><br></p>`;
        }
        else if (type === 'image') {
            const url = prompt("Pega la URL de la imagen:");
            if(url) html = `<div class="arbor-visual-block image-block my-6 relative group" contenteditable="false"><img src="${url}" class="w-full rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700"><div class="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl"><button class="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg btn-delete-block">Eliminar</button></div><p class="hidden src-data">${url}</p></div><p><br></p>`;
        }
        if(html) {
            document.execCommand('insertHTML', false, html);
            this.bindDynamicEvents();
        }
    }

    renderEditor() {
        const ui = store.ui;
        this.innerHTML = `
        <div id="editor-overlay" class="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200">
            <div class="bg-[#f7f9fa] dark:bg-slate-950 rounded-2xl shadow-2xl max-w-7xl w-full h-[95vh] flex flex-col border border-slate-300 dark:border-slate-700">
                
                <!-- HEADER (Como en la imagen) -->
                <div class="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20 rounded-t-2xl">
                    <div class="p-4 flex justify-between items-center">
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">${this.node.sourcePath}</p>
                        <div class="flex items-center gap-3">
                             <button id="btn-cancel" class="px-4 py-2 text-sm text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">${ui.editorCancel}</button>
                             <button id="btn-submit" class="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95">
                                <span class="hidden sm:inline">${ui.editorChanges}</span>
                             </button>
                        </div>
                    </div>
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800">
                        <div class="flex items-start gap-3">
                            <div class="relative group">
                                <button id="btn-emoji" class="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-500 text-3xl flex items-center justify-center transition-colors">${this.meta.icon}</button>
                                <div class="absolute top-16 left-0 w-64 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-5 gap-2 hidden group-hover:grid z-50">${this.emojis.map(e => `<button class="btn-emoji-opt w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded" data-emoji="${e}">${e}</button>`).join('')}</div>
                            </div>
                            <div class="flex-1">
                                <label class="text-xs font-bold text-slate-400">TÍTULO DE LECCIÓN</label>
                                <input id="editor-title" type="text" class="w-full bg-transparent text-lg font-black text-slate-800 dark:text-white outline-none" value="${this.meta.title}">
                            </div>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-400">DESCRIPCIÓN BREVE</label>
                            <input id="editor-description" type="text" class="w-full bg-transparent text-sm font-medium text-slate-600 dark:text-slate-300 outline-none" value="${this.meta.description}" placeholder="La historia de...">
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

                <!-- TOOLBAR -->
                <div class="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto z-10 sticky top-0">
                    <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 font-bold" data-cmd="bold">B</button>
                    <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 italic" data-cmd="italic">I</button>
                    <div class="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-2"></div>
                    <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 font-bold" data-cmd="formatBlock" data-val="h1">H1</button>
                    <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700 font-bold" data-cmd="formatBlock" data-val="h2">H2</button>
                    <button class="tb-btn p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700" data-cmd="insertUnorderedList">• Lista</button>
                    <div class="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-2"></div>
                    <button id="btn-add-img" class="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700">🖼️ Imagen</button>
                    <button id="btn-add-quiz" class="px-3 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-bold text-xs flex items-center gap-1">❓ Quiz</button>
                </div>

                <!-- ÁREA DE EDICIÓN -->
                <div class="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-800/50 cursor-text p-4 md:p-8 custom-scrollbar" onclick="this.querySelector('#wysiwyg-editor').focus()">
                    <div id="wysiwyg-editor" class="max-w-3xl mx-auto min-h-full bg-white dark:bg-slate-900 shadow-lg rounded-xl p-8 md:p-12 outline-none prose prose-slate dark:prose-invert prose-lg" contenteditable="true">
                        ${this.markdownToVisual(this.bodyContent)}
                    </div>
                    <div class="h-24"></div>
                </div>

            </div>
        </div>
            
        <!-- MODAL DE GUARDADO -->
        <dialog id="commit-dialog" class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-md w-full border border-slate-200 dark:border-slate-700">
            <h3 class="font-black text-xl mb-4 text-slate-800 dark:text-white">Confirmar Cambios</h3>
            <p class="text-sm text-slate-500 mb-2">Describe brevemente qué has cambiado:</p>
            <textarea id="commit-msg" class="w-full h-24 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 border border-slate-200 dark:border-slate-700 outline-none text-sm dark:text-white" placeholder="Ej: Corregí la fecha de la batalla..."></textarea>
            <div class="flex justify-end gap-3">
                <button id="btn-commit-cancel" class="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Volver</button>
                <button id="btn-commit-confirm" class="px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg">Publicar Cambios</button>
            </div>
        </dialog>
        `;

        this.bindEvents();
    }

    bindEvents() {
        this.querySelector('#editor-overlay').onclick = (e) => {
             if(e.target.id === 'editor-overlay' && confirm('¿Descartar cambios no guardados?')) store.setModal(null);
        };
        this.querySelectorAll('.tb-btn').forEach(b => b.onclick = (e) => { e.preventDefault(); this.execCmd(b.dataset.cmd, b.dataset.val); });
        this.querySelector('#btn-add-quiz').onclick = (e) => { e.preventDefault(); this.insertBlock('quiz'); };
        this.querySelector('#btn-add-img').onclick = (e) => { e.preventDefault(); this.insertBlock('image'); };
        this.querySelectorAll('.btn-emoji-opt').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.querySelector('#btn-emoji').textContent = e.target.dataset.emoji; });
        this.bindDynamicEvents();

        this.querySelector('#btn-cancel').onclick = () => { if(confirm('¿Descartar cambios no guardados?')) store.setModal(null); };
        
        const dialog = this.querySelector('#commit-dialog');
        this.querySelector('#btn-submit').onclick = () => dialog.showModal();
        this.querySelector('#btn-commit-cancel').onclick = () => dialog.close();
        
        this.querySelector('#btn-commit-confirm').onclick = async () => {
            const msg = this.querySelector('#commit-msg').value.trim() || `Update ${this.querySelector('#editor-title').value.trim()}`;
            const btn = this.querySelector('#btn-commit-confirm');
            btn.disabled = true;
            btn.textContent = "Procesando...";
            
            const finalMarkdown = this.visualToMarkdown();

            try {
                const prUrl = await github.createPullRequest(this.node.sourcePath, finalMarkdown, msg);
                alert(store.ui.prSuccessBody);
                window.open(prUrl, '_blank');
                dialog.close();
                store.setModal(null);
            } catch (e) {
                alert("Error: " + e.message);
                btn.disabled = false;
                btn.textContent = "Publicar Cambios";
            }
        };
    }

    bindDynamicEvents() {
        this.querySelectorAll('.btn-delete-block').forEach(btn => btn.onclick = (e) => e.target.closest('.arbor-visual-block')?.remove());
    }
}
customElements.define('arbor-editor', ArborEditor);
