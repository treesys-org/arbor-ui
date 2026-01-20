
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { aiService } from '../../services/ai.js';
import { BLOCKS, parseArborFile, visualHTMLToMarkdown, markdownToVisualHTML, reconstructArborFile } from '../../utils/editor-engine.js';

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
        this.currentSha = null;
        this.isMetaJson = false;
        this.returnTo = null;
        this.historyStack = [];
        
        // Internal UI State
        this.showAiPrompt = false;
        this.isGenerating = false;
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        if (modal && modal.type === 'editor' && modal.node) {
            if (this.node?.id !== modal.node.id) {
                this.node = modal.node;
                this.returnTo = modal.returnTo || null;
                this.historyStack = []; 
                this.showAiPrompt = false;
                this.loadContent();
            }
        } else {
            if (this.node) {
                this.node = null;
                this.returnTo = null;
                this.innerHTML = '';
                this.className = '';
            }
        }
    }
    
    getTargetPath() {
        let path = this.node.sourcePath;
        
        // Fix for missing path in older builds for Root Nodes
        if (!path && this.node.type === 'root') {
            const lang = store.value.lang || 'EN';
            path = `content/${lang}`; // Guess standard path
        }

        // If it's a container (Folder/Root), we edit the meta.json inside it
        if (this.node.type === 'branch' || this.node.type === 'root') {
            if (path && !path.endsWith('meta.json')) {
                // Ensure no double slash if path ends with /
                path = path.endsWith('/') ? path + 'meta.json' : path + '/meta.json';
            }
        }
        
        // Fallback for Local Nodes with missing sourcePath (Fix for "Cannot Save" error)
        if (!path && this.node.id && this.node.id.startsWith('local-')) {
            path = `${this.node.name}.md`;
        }
        
        return path;
    }

    async loadContent() {
        this.renderLoading();
        
        try {
            const sourcePath = this.getTargetPath();
            const fileData = await fileSystem.getFile(this.node.id, sourcePath);
            
            this.currentSha = fileData.sha;
            this.isMetaJson = fileData.isMeta;
            
            this.meta = {
                title: fileData.meta.title || fileData.meta.name || '',
                icon: fileData.meta.icon || '📄',
                description: fileData.meta.description || '',
                order: fileData.meta.order || '99',
                isExam: fileData.meta.isExam || false,
                extra: fileData.meta.extra || []
            };

            const visualHTML = fileData.isMeta ? '' : markdownToVisualHTML(fileData.body);
            this.renderEditor(visualHTML);

        } catch (e) {
            console.warn("[ArborEditor] Load error (Rescue Mode Active):", e);
            
            // ERROR CHECK: Rate Limit or Forbidden
            if (e.status === 403 || (e.message && e.message.includes('API rate limit'))) {
                store.notify("GitHub Rate Limit Exceeded. Try again later.", true);
                this.closeEditor();
                return;
            }
            
            // RESCUE MODE: If file is missing (404) or path is broken, allow creating it
            const isNotFound = e.message.toLowerCase().includes('not found') || e.message.includes('404');
            const isNew = this.node.id.startsWith('new-');
            
            if (isNew || isNotFound) {
                // 1. Initialize defaults from the Graph Node
                this.meta = {
                    title: this.node.name || 'New File',
                    icon: this.node.icon || '📄',
                    description: this.node.description || '',
                    order: this.node.order || '99',
                    isExam: this.node.type === 'exam',
                    extra: []
                };
                
                let recoveredBody = '';

                // 2. Try to recover content from memory (if graph loaded it)
                if (this.node.content) {
                    try {
                        const parsed = parseArborFile(this.node.content);
                        // Merge parsed meta over defaults
                        this.meta = { ...this.meta, ...parsed.meta };
                        // Ensure title sync
                        if(parsed.meta.title) this.meta.title = parsed.meta.title;
                        recoveredBody = parsed.body;
                    } catch(err) { 
                        console.log("Content recovery failed", err); 
                        recoveredBody = this.node.content; // Fallback to raw
                    }
                }

                // 3. Determine File Type
                const targetPath = this.getTargetPath();
                this.isMetaJson = false;
                if (targetPath && targetPath.endsWith('meta.json')) {
                    this.isMetaJson = true;
                } else if (this.node.type === 'branch' || this.node.type === 'root') {
                    // Fallback if path logic failed but we know it's a folder
                    this.isMetaJson = true;
                }

                // 4. Clear SHA to force creation/overwrite
                this.currentSha = null;
                
                // 5. Render Editor
                const visualHTML = this.isMetaJson ? '' : markdownToVisualHTML(recoveredBody);
                this.renderEditor(visualHTML);
                
                if (isNotFound && !isNew) {
                    store.notify("Rescue Mode: Saving will fix missing file.");
                }
            } else {
                store.notify("Critical Error: " + e.message, true);
                this.closeEditor();
            }
        }
    }
    
    closeEditor() {
        if (this.returnTo === 'contributor') {
            store.setModal('contributor');
        } else {
            store.setModal(null);
        }
    }

    generateFinalContent() {
        const title = this.querySelector('#meta-title').value.trim();
        const icon = this.querySelector('#btn-emoji').textContent.trim();
        const desc = this.querySelector('#meta-desc').value.trim();
        const order = this.querySelector('#meta-order').value.trim();
        
        const visualEditor = this.querySelector('#visual-editor');
        const bodyMarkdown = visualEditor ? visualHTMLToMarkdown(visualEditor) : '';

        if (this.isMetaJson) {
            const json = { name: title, icon: icon, description: desc, order: order };
            return JSON.stringify(json, null, 2);
        } else {
            this.meta.title = title;
            this.meta.icon = icon;
            this.meta.description = desc;
            this.meta.order = order;
            return reconstructArborFile(this.meta, bodyMarkdown);
        }
    }

    renderLoading() {
        // Simple loading state
        this.className = "fixed inset-0 z-[80] w-full h-full bg-slate-900/50 backdrop-blur-sm flex items-center justify-center pointer-events-none"; 
        this.innerHTML = `<div class="animate-spin text-4xl">⏳</div>`;
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
        editor.insertAdjacentHTML('beforeend', html);
        editor.scrollTop = editor.scrollHeight;
    }
    
    pushHistory() {
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        if (this.historyStack.length > 20) this.historyStack.shift();
        this.historyStack.push(editor.innerHTML);
        this.updateUndoButton();
    }

    undo() {
        if (this.historyStack.length === 0) return;
        const previousContent = this.historyStack.pop();
        const editor = this.querySelector('#visual-editor');
        if (editor) {
            editor.innerHTML = previousContent;
            this.updateUndoButton();
        }
    }

    updateUndoButton() {
        const btn = this.querySelector('#btn-undo');
        if (btn) {
            btn.disabled = this.historyStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    }

    toggleAiPrompt() {
        this.showAiPrompt = !this.showAiPrompt;
        const overlay = this.querySelector('#ai-prompt-overlay');
        if(overlay) {
            if(this.showAiPrompt) {
                overlay.classList.remove('hidden');
                this.querySelector('#inp-ai-prompt').focus();
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    async runDraft(topic) {
        const ui = store.ui;
        this.toggleAiPrompt(); // Close overlay
        
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        
        this.pushHistory();
        const originalText = editor.innerHTML;
        editor.innerHTML = `<div class="p-4 text-center animate-pulse text-purple-500">✨ ${ui.sageThinking || "Thinking..."}</div>`;
        
        this.isGenerating = true;
        
        try {
            const promptText = `Create a comprehensive educational lesson in Markdown about: "${topic}". Include Title, Intro, Subheadings, List, and Summary.`;
            const response = await aiService.chat([{role: 'user', content: promptText}]);
            const rawMarkdown = response.text.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');
            editor.innerHTML = markdownToVisualHTML(rawMarkdown);
            
            const titleMatch = rawMarkdown.match(/^# (.*$)/m);
            if (titleMatch && !this.querySelector('#meta-title').value) {
                this.querySelector('#meta-title').value = titleMatch[1].trim();
            }
        } catch(e) {
            store.notify("AI Error: " + e.message, true);
            editor.innerHTML = originalText;
        } finally {
            this.isGenerating = false;
        }
    }

    renderEditor(bodyHTML) {
        const ui = store.ui;
        const isConstruct = store.value.constructionMode;
        
        // Full screen focused overlay
        this.className = `fixed inset-0 z-[80] w-full h-full bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-6 transition-opacity duration-300 pointer-events-auto`;
        
        const bgClass = isConstruct 
            ? "bg-[#2c3e50] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" 
            : "bg-white dark:bg-slate-900";
            
        const textClass = isConstruct ? "text-slate-200 font-mono" : "text-slate-800 dark:text-white";
        const inputClass = isConstruct 
            ? "bg-[#34495e] border border-slate-600 text-yellow-400 font-mono focus:border-yellow-400" 
            : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500";
            
        const editorBg = isConstruct ? "bg-[#34495e]/50 border-2 border-dashed border-slate-600" : "bg-white dark:bg-slate-900 shadow-inner";
        const proseClass = isConstruct ? "prose-invert font-mono prose-headings:text-yellow-400 prose-p:text-slate-300" : "prose-slate dark:prose-invert mx-auto max-w-3xl";

        const pathDisplay = this.node.sourcePath || 'New File';
        
        const panelTitle = this.isMetaJson ? "Folder Properties" : (ui.editorTitle || 'Arbor Studio');
        const saveLabel = this.isMetaJson ? "Save Props" : (ui.editorLocalSave || "Save");

        const bodyContent = this.isMetaJson 
            ? `<div class="p-8 text-center text-slate-400 italic border-2 border-dashed border-slate-500 rounded-xl">
                 <span class="text-4xl block mb-2">📂</span>
                 FOLDER PROPERTIES<br><span class="text-xs">Edit metadata above</span>
               </div>`
            : bodyHTML;

        this.innerHTML = `
        <div class="flex flex-col w-full h-full md:rounded-2xl shadow-2xl overflow-hidden border border-slate-700 ${bgClass} ${textClass} relative">
            
            <!-- AI PROMPT OVERLAY (Internal) -->
            <div id="ai-prompt-overlay" class="hidden absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
                <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl w-full max-w-md border border-purple-500/50">
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2"><span class="text-2xl">✨</span> Magic Draft</h3>
                    <p class="text-sm text-slate-500 mb-4">What should this lesson be about?</p>
                    <input id="inp-ai-prompt" type="text" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold mb-4 focus:ring-2 focus:ring-purple-500 outline-none dark:text-white" placeholder="e.g. Introduction to Quantum Physics">
                    <div class="flex gap-3">
                        <button id="btn-cancel-ai" class="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-bold text-xs uppercase">Cancel</button>
                        <button id="btn-run-ai" class="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-purple-500">Draft</button>
                    </div>
                </div>
            </div>

            <!-- HEADER -->
            <div class="p-4 border-b border-slate-600/50 flex justify-between items-center shrink-0 bg-slate-900/10 backdrop-blur-md z-20">
                <div class="flex items-center gap-3 overflow-hidden">
                    <span class="text-2xl">${isConstruct ? '🏗️' : '✏️'}</span>
                    <div class="min-w-0">
                        <div class="text-[10px] uppercase font-bold opacity-50 tracking-widest">${panelTitle}</div>
                        <div class="text-xs font-bold truncate font-mono" title="${pathDisplay}">${pathDisplay}</div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <button id="btn-submit" class="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider shadow-lg flex items-center gap-2 transition-all active:scale-95">
                        <span>💾</span> <span class="hidden sm:inline">${saveLabel}</span>
                    </button>
                    <button id="btn-cancel" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">✕</button>
                </div>
            </div>

            <!-- TOOLBAR (Docked below header) -->
            ${!this.isMetaJson ? `
            <div class="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-slate-600/30 bg-slate-900/5 backdrop-blur-sm z-10 shrink-0">
                <button id="btn-undo" class="tool-btn w-8 h-8 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-50 transition-colors" disabled>↩</button>
                <div class="w-px h-6 bg-slate-400/30 mx-1"></div>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-bold text-sm transition-colors" data-cmd="bold">B</button>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 italic text-sm transition-colors" data-cmd="italic">I</button>
                
                <!-- Headers -->
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-black text-xs transition-colors" data-cmd="formatBlock" data-val="H1">H1</button>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-bold text-xs transition-colors" data-cmd="formatBlock" data-val="H2">H2</button>
                
                <div class="w-px h-6 bg-slate-400/30 mx-1"></div>
                
                <button class="block-btn px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 rounded text-xs font-bold uppercase hover:bg-green-500/20 transition-colors" data-type="quiz">+ Quiz</button>
                <button class="block-btn px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded text-xs font-bold uppercase hover:bg-blue-500/20 transition-colors" data-type="section">+ Sect</button>
                <button class="block-btn px-3 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 rounded text-xs font-bold uppercase hover:bg-orange-500/20 transition-colors" data-type="callout">+ Note</button>
                
                <button id="btn-magic-draft" class="ml-auto px-3 py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded text-xs font-bold uppercase hover:bg-purple-500/20 flex items-center gap-1 transition-colors">
                    <span>✨</span> AI
                </button>
            </div>` : ''}
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6">
                <!-- Inner Container to constrain content width -->
                <div class="max-w-5xl mx-auto w-full space-y-6">
                    
                    <!-- METADATA GRID -->
                    <div class="grid grid-cols-12 gap-3 p-4 rounded-xl border border-slate-600/20 bg-black/5">
                         <div class="col-span-2 relative">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">Icon</label>
                             <button id="btn-emoji" class="w-full h-10 rounded text-xl flex items-center justify-center hover:brightness-110 transition-colors ${inputClass}">${this.meta.icon}</button>
                             <div id="emoji-picker" class="hidden absolute top-12 left-0 w-64 bg-slate-800 shadow-2xl rounded border border-slate-600 z-50 p-2 h-48 overflow-y-auto custom-scrollbar">
                                ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                    <div class="text-[9px] font-bold text-slate-400 mt-1 mb-1 px-1 uppercase">${cat}</div>
                                    <div class="grid grid-cols-6 gap-1">
                                        ${emojis.map(e => `<button class="emoji-btn hover:bg-white/10 rounded p-1 text-lg">${e}</button>`).join('')}
                                    </div>
                                `).join('')}
                             </div>
                         </div>
                         <div class="col-span-10">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">Title</label>
                             <input id="meta-title" class="w-full h-10 px-3 rounded outline-none ${inputClass}" value="${this.meta.title}" placeholder="Lesson Title">
                         </div>
                         <div class="col-span-3">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">Order</label>
                             <input id="meta-order" type="number" class="w-full h-8 px-2 rounded text-xs outline-none ${inputClass}" value="${this.meta.order}">
                         </div>
                         <div class="col-span-9">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">Description</label>
                             <input id="meta-desc" class="w-full h-8 px-2 rounded text-xs outline-none ${inputClass}" value="${this.meta.description}" placeholder="...">
                         </div>
                    </div>
                    
                    <!-- VISUAL EDITOR -->
                    <div id="visual-editor" 
                         class="w-full min-h-[600px] p-8 outline-none ${editorBg} ${proseClass} rounded-xl text-base shadow-sm" 
                         contenteditable="${!this.isMetaJson}" 
                         spellcheck="false">
                         ${bodyContent}
                    </div>
                    
                    <div class="h-20"></div> <!-- Scroll Spacer -->
                </div>
            </div>
        </div>`;
        
        this.bindEvents();
        this.updateUndoButton();
    }

    bindEvents() {
        this.querySelector('#btn-cancel').onclick = () => this.closeEditor();
        this.querySelector('#btn-submit').onclick = () => this.submitChanges();
        
        const btnDraft = this.querySelector('#btn-magic-draft');
        if (btnDraft) btnDraft.onclick = () => this.toggleAiPrompt();
        
        const btnCancelAi = this.querySelector('#btn-cancel-ai');
        if (btnCancelAi) btnCancelAi.onclick = () => this.toggleAiPrompt();
        
        const btnRunAi = this.querySelector('#btn-run-ai');
        if (btnRunAi) btnRunAi.onclick = () => {
            const val = this.querySelector('#inp-ai-prompt').value;
            if(val) this.runDraft(val);
        };
        
        const btnUndo = this.querySelector('#btn-undo');
        if (btnUndo) btnUndo.onclick = () => this.undo();
        
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
        
        this.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = () => this.execCmd(btn.dataset.cmd, btn.dataset.val);
        });
        this.querySelectorAll('.block-btn').forEach(btn => {
            btn.onclick = () => this.insertBlock(btn.dataset.type);
        });
        
        // Hide emoji picker on outside click
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
        btn.innerHTML = '...';
        btn.disabled = true;
        
        const finalContent = this.generateFinalContent();
        const msg = `Update ${this.meta.title || 'File'}`;
        
        // Ensure we save to the corrected path (e.g. meta.json)
        const targetPath = this.getTargetPath();
        
        if (!targetPath) {
             store.notify("Error: Cannot determine save path.", true);
             btn.innerHTML = originalText;
             btn.disabled = false;
             return;
        }

        const nodePayload = { ...this.node, sourcePath: targetPath, sha: this.currentSha };

        try {
            const result = await fileSystem.saveFile(nodePayload, finalContent, this.meta, msg);
            
            if (result.success) {
                if (result.mode === 'instant') {
                    btn.innerHTML = '✔ SAVED';
                    setTimeout(() => this.closeEditor(), 500);
                } else {
                    store.notify(store.ui.editorSuccessPublish);
                    this.closeEditor();
                }
            } else {
                throw new Error("Save operation reported failure.");
            }
        } catch(e) {
            store.notify("Error: " + e.message, true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}
customElements.define('arbor-editor', ArborEditor);
