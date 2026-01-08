

import { store } from '../store.js';
import { github } from '../services/github.js';
import { BLOCKS, parseArborFile, visualHTMLToMarkdown, markdownToVisualHTML, reconstructArborFile } from '../utils/editor-engine.js';

const EMOJI_DATA = {
    "General": ["📄", "📁", "📂", "✨", "🔥", "💡", "🚀", "⭐", "📝", "📌"],
    "Science": ["🧬", "🔬", "⚗️", "⚛️", "🔭", "💊", "🦠", "🧪", "🧫", "🩺"],
    "Computing": ["💻", "🖥️", "⌨️", "🖱️", "💾", "📀", "🌐", "🔌", "🔋", "📱"],
    "Arts": ["🎨", "🎭", "🖌️", "✍️", "📖", "📚", "🗣️", "🎹", "🎸", "🎻"],
    "Society": ["⚖️", "💰", "🏛️", "🌍", "🧠", "🤝", "🎓", "🏘️", "🏙️", "🏭"]
};

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.meta = { title: '', icon: '📄', description: '', order: '99', isExam: false, extra: [] };
        this.hasWriteAccess = false;
        this.isMetaJson = false;
        this.currentSha = null;
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
            const path = this.node.sourcePath;
            if (!path) throw new Error("No sourcePath defined.");
            
            // Check Permissions
            this.hasWriteAccess = github.canEdit(path);
            this.isMetaJson = path.endsWith('meta.json');

            // New File
            if (this.node.id && this.node.id.startsWith('new-')) {
                 this.meta.title = this.node.name;
                 this.renderEditor('');
                 return;
            }

            const { content, sha } = await github.getFileContent(path);
            this.currentSha = sha;
            
            if (this.isMetaJson) {
                const json = JSON.parse(content);
                this.meta = {
                    title: json.name || '',
                    icon: json.icon || '📁',
                    description: json.description || '',
                    order: json.order || '99',
                    isExam: false,
                    extra: []
                };
                this.renderEditor(''); // Empty body for meta.json
            } else {
                const parsed = parseArborFile(content);
                this.meta = parsed.meta;
                const visualHTML = markdownToVisualHTML(parsed.body);
                this.renderEditor(visualHTML);
            }

        } catch (e) {
            alert("Error: " + e.message);
            store.setModal(null);
        }
    }

    generateFinalContent() {
        // Collect Meta
        const title = this.querySelector('#meta-title').value.trim();
        const icon = this.querySelector('#btn-emoji').textContent.trim();
        const desc = this.querySelector('#meta-desc').value.trim();
        const order = this.querySelector('#meta-order').value.trim();
        
        if (this.isMetaJson) {
            // JSON Output
            const json = {
                name: title,
                icon: icon,
                description: desc,
                order: order
            };
            return JSON.stringify(json, null, 2);
        } else {
            // Markdown Output
            this.meta.title = title;
            this.meta.icon = icon;
            this.meta.description = desc;
            this.meta.order = order;
            // Collect Body
            const visualEditor = this.querySelector('#visual-editor');
            const bodyMarkdown = visualHTMLToMarkdown(visualEditor);
            return reconstructArborFile(this.meta, bodyMarkdown);
        }
    }

    renderLoading() {
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
             <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl flex flex-col items-center">
                 <div class="animate-spin text-4xl mb-4">⏳</div>
                 <p class="text-slate-400 font-bold animate-pulse">Cargando...</p>
                 <button id="btn-cancel-loading" class="mt-4 text-xs text-red-500 hover:underline">Cancelar</button>
             </div>
        </div>`;
        this.querySelector('#btn-cancel-loading').onclick = () => store.setModal(null);
    }
    
    toggleEmojiPicker() {
        const picker = this.querySelector('#emoji-picker');
        if(picker) picker.classList.toggle('hidden');
    }
    
    selectEmoji(char) {
        const btn = this.querySelector('#btn-emoji');
        btn.textContent = char;
        this.toggleEmojiPicker();
    }

    execCmd(cmd, val = null) {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        editor.focus();
        document.execCommand(cmd, false, val);
    }

    insertBlock(type) {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        
        let html = '';
        if (type === 'section') html = BLOCKS.section();
        if (type === 'quiz') html = BLOCKS.quiz();
        if (type === 'callout') html = BLOCKS.callout();
        if (type === 'image') html = BLOCKS.media('image');
        if (type === 'video') html = BLOCKS.media('video');
        
        // Simple append for now to avoid selection complexity issues in shadow dom/custom elements
        editor.insertAdjacentHTML('beforeend', html);
        
        // Try to scroll to bottom
        editor.scrollTop = editor.scrollHeight;
    }

    renderEditor(bodyHTML) {
        const saveLabel = this.hasWriteAccess ? 'Publicar' : 'Proponer Cambio';
        const saveColor = this.hasWriteAccess ? 'bg-green-600' : 'bg-orange-500';
        
        // If meta.json, disable body editing
        const isMeta = this.isMetaJson;
        const bodyContent = isMeta 
            ? `<div class="p-8 text-center text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl">
                 <span class="text-4xl block mb-2">📂</span>
                 Estás editando las propiedades de una carpeta.<br>Usa el panel superior para cambiar Nombre, Icono y Orden.
               </div>`
            : bodyHTML;

        // NEW: Modal Layout Structure (Fixed Centered Box on Desktop, Full on Mobile)
        this.innerHTML = `
        <div id="editor-backdrop" class="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-6 animate-in fade-in">
            
            <!-- Main Modal Container -->
            <div id="editor-container" class="bg-[#f7f9fa] dark:bg-slate-900 w-full h-full md:w-[95vw] md:h-[90vh] md:max-w-6xl rounded-none md:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative border border-slate-200 dark:border-slate-800">
                
                <!-- Header -->
                <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center shadow-sm shrink-0">
                    <div class="flex items-center gap-4">
                        <button id="btn-cancel" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">✕</button>
                        <div>
                            <h2 class="font-black text-slate-800 dark:text-white leading-none text-lg truncate max-w-[200px] md:max-w-md">${this.meta.title || 'Nuevo Archivo'}</h2>
                            <span class="text-xs text-slate-400 font-mono hidden md:inline-block">${this.node.sourcePath}</span>
                        </div>
                    </div>
                    <button id="btn-submit" class="${saveColor} text-white px-6 py-2.5 rounded-lg font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-wide text-xs flex items-center gap-2">
                        <span>💾</span> <span class="hidden md:inline">${saveLabel}</span>
                    </button>
                </div>
                
                <!-- Metadata Form -->
                <div class="bg-slate-50 dark:bg-slate-950/50 p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-4 shrink-0 relative">
                     <div class="col-span-2 md:col-span-1 relative">
                         <label class="text-[10px] uppercase font-bold text-slate-400">Icono</label>
                         <button id="btn-emoji" class="w-full h-10 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xl flex items-center justify-center hover:bg-blue-50 transition-colors">${this.meta.icon}</button>
                         
                         <!-- Emoji Picker Popup -->
                         <div id="emoji-picker" class="hidden absolute top-12 left-0 w-72 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 z-50 p-2 h-64 overflow-y-auto custom-scrollbar">
                            ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                <div class="text-[10px] font-bold text-slate-400 mt-2 mb-1 px-1 uppercase">${cat}</div>
                                <div class="grid grid-cols-6 gap-1">
                                    ${emojis.map(e => `<button class="emoji-btn hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 text-lg">${e}</button>`).join('')}
                                </div>
                            `).join('')}
                         </div>
                     </div>
                     
                     <div class="col-span-8 md:col-span-9">
                         <label class="text-[10px] uppercase font-bold text-slate-400">Título</label>
                         <input id="meta-title" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg font-bold outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.title}">
                     </div>
                     
                     <div class="col-span-2 md:col-span-2">
                         <label class="text-[10px] uppercase font-bold text-slate-400">Orden</label>
                         <input id="meta-order" type="number" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.order}">
                     </div>
                     
                     <div class="col-span-12">
                         <label class="text-[10px] uppercase font-bold text-slate-400">Descripción</label>
                         <input id="meta-desc" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.description}">
                     </div>
                </div>
                
                <!-- Toolbar (Only for Markdown files) -->
                ${!isMeta ? `
                <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 flex gap-2 overflow-x-auto shrink-0 items-center justify-center sticky top-0 z-20 shadow-sm">
                    <div class="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 font-bold" data-cmd="bold">B</button>
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 italic" data-cmd="italic">I</button>
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 font-serif font-bold" data-cmd="formatBlock" data-val="H2">H2</button>
                    </div>
                    <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                    <div class="flex gap-2">
                        <button class="block-btn px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100" data-type="quiz">+ Quiz</button>
                        <button class="block-btn px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100" data-type="section">+ Sección</button>
                        <button class="block-btn px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-bold hover:bg-yellow-100" data-type="callout">+ Nota</button>
                        <button class="block-btn px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold hover:bg-purple-100" data-type="image">+ Imagen</button>
                    </div>
                </div>` : ''}

                <!-- Visual Editor Area (Paged Document Style) -->
                <div class="flex-1 relative bg-slate-200 dark:bg-slate-950 overflow-y-auto custom-scrollbar p-0 md:p-8 flex justify-center">
                     <div id="visual-editor" 
                          class="w-full max-w-4xl bg-white dark:bg-slate-900 shadow-none md:shadow-2xl min-h-[500px] md:min-h-[800px] p-6 md:p-12 prose prose-slate dark:prose-invert max-w-none focus:outline-none rounded-none md:rounded-lg" 
                          contenteditable="${!isMeta}" 
                          spellcheck="false">
                          ${bodyContent}
                     </div>
                </div>
            </div>
        </div>`;
        
        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        this.querySelector('#btn-submit').onclick = () => this.submitChanges();
        
        this.querySelector('#btn-emoji').onclick = (e) => {
            e.stopPropagation();
            this.toggleEmojiPicker();
        };
        
        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.selectEmoji(e.currentTarget.textContent);
            };
        });
        
        if (!isMeta) {
            this.querySelectorAll('.tool-btn').forEach(btn => {
                btn.onclick = () => this.execCmd(btn.dataset.cmd, btn.dataset.val);
            });
            this.querySelectorAll('.block-btn').forEach(btn => {
                btn.onclick = () => this.insertBlock(btn.dataset.type);
            });
        }
        
        this.onclick = (e) => {
            if(!e.target.closest('#emoji-picker') && !e.target.closest('#btn-emoji')) {
                const p = this.querySelector('#emoji-picker');
                if(p) p.classList.add('hidden');
            }
        };
    }

    async submitChanges() {
        const btn = this.querySelector('#btn-submit');
        const originalText = btn.innerHTML;
        btn.innerHTML = "Procesando...";
        btn.disabled = true;
        
        const finalContent = this.generateFinalContent();
        const msg = `Update ${this.meta.title || 'File'}`;
        
        try {
            if (this.hasWriteAccess) {
                await github.commitFile(this.node.sourcePath, finalContent, msg, this.currentSha);
                alert("✅ Guardado y Publicado en Main.");
            } else {
                const prUrl = await github.createPullRequest(this.node.sourcePath, finalContent, msg);
                alert("🚀 Solicitud enviada para revisión.\n" + prUrl);
            }
            store.setModal(null);
        } catch(e) {
            alert("Error: " + e.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}
customElements.define('arbor-editor', ArborEditor);
