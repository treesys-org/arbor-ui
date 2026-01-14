
import { store } from '../../store.js';
import { github } from '../../services/github.js';
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
        this.hasWriteAccess = false;
        this.isMetaJson = false;
        this.currentSha = null;
        this.returnTo = null;
        this.isLocalTree = false;
        
        // History for Undo
        this.historyStack = [];
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
                this.historyStack = []; // Reset history on new file
                this.loadContent();
            }
        } else {
            if (this.node) {
                this.node = null;
                this.returnTo = null;
                this.innerHTML = '';
            }
        }
    }

    async loadContent() {
        this.renderLoading();
        
        // CHECK SOURCE TYPE (LOCAL vs REMOTE)
        const sourceUrl = store.value.activeSource?.url || '';
        this.isLocalTree = sourceUrl.startsWith('local://');

        try {
            // --- LOCAL MODE (PHASE 1) ---
            if (this.isLocalTree) {
                this.hasWriteAccess = true; // Always write access to local
                this.isMetaJson = false; // Local storage nodes are objects, not files

                // Load content directly from the in-memory graph
                const freshNode = store.findNode(this.node.id);
                
                if (freshNode) {
                    this.meta = {
                        title: freshNode.name || '',
                        icon: freshNode.icon || '📄',
                        description: freshNode.description || '',
                        order: freshNode.order || '99',
                        isExam: freshNode.type === 'exam',
                        extra: []
                    };
                    
                    const rawContent = freshNode.content || "";
                    const parsed = parseArborFile(rawContent);
                    
                    // If content has headers, they override the node properties
                    if (parsed.meta.title) this.meta.title = parsed.meta.title;
                    if (parsed.meta.icon) this.meta.icon = parsed.meta.icon;
                    if (parsed.meta.description) this.meta.description = parsed.meta.description;
                    
                    const visualHTML = markdownToVisualHTML(parsed.body);
                    this.renderEditor(visualHTML);
                } else {
                    // It might be a new file creation request
                    if (this.node.id.startsWith('new-')) {
                        this.meta.title = this.node.name;
                        this.renderEditor('');
                        return;
                    }
                    throw new Error("Node not found in local tree.");
                }
                return;
            }

            // --- REMOTE MODE (GITHUB) ---
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
            this.closeEditor();
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
        // Collect Meta
        const title = this.querySelector('#meta-title').value.trim();
        const icon = this.querySelector('#btn-emoji').textContent.trim();
        const desc = this.querySelector('#meta-desc').value.trim();
        const order = this.querySelector('#meta-order').value.trim();
        
        // Collect Body
        const visualEditor = this.querySelector('#visual-editor');
        const bodyMarkdown = visualEditor ? visualHTMLToMarkdown(visualEditor) : '';

        if (this.isMetaJson) {
            // JSON Output (Remote folders)
            const json = {
                name: title,
                icon: icon,
                description: desc,
                order: order
            };
            return JSON.stringify(json, null, 2);
        } else {
            // Markdown Output (Remote files AND Local nodes)
            this.meta.title = title;
            this.meta.icon = icon;
            this.meta.description = desc;
            this.meta.order = order;
            
            return reconstructArborFile(this.meta, bodyMarkdown);
        }
    }

    renderLoading() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
             <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl flex flex-col items-center">
                 <div class="animate-spin text-4xl mb-4">⏳</div>
                 <p class="text-slate-400 font-bold animate-pulse">${ui.editorLoading}</p>
                 <button id="btn-cancel-loading" class="mt-4 text-xs text-red-500 hover:underline">${ui.editorCancelLoading}</button>
             </div>
        </div>`;
        this.querySelector('#btn-cancel-loading').onclick = () => this.closeEditor();
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
    
    // --- HISTORY / UNDO SYSTEM ---
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
            if (this.historyStack.length > 0) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

    async draftWithAI() {
        const ui = store.ui;
        const topic = prompt(ui.editorMagicDraftPrompt || "What should this lesson be about?");
        if (!topic) return;
        
        const editor = this.querySelector('#visual-editor');
        if (!editor) return;
        
        this.pushHistory();
        const originalText = editor.innerHTML;
        editor.innerHTML = `<div class="p-4 text-center animate-pulse text-purple-500">✨ ${ui.sageThinking || "Thinking..."}</div>`;
        
        try {
            const promptText = `Create a comprehensive educational lesson in Markdown about: "${topic}". 
            It MUST include:
            1. A clear Title (#)
            2. An Introduction
            3. Key Concepts with subheadings (##)
            4. A bulleted list of facts
            5. A summary.
            Do not include any other text, just the lesson content.`;
            
            const response = await aiService.chat([{role: 'user', content: promptText}]);
            const rawMarkdown = response.text;
            const cleanMarkdown = rawMarkdown.replace(/^```markdown\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');
            const visualHTML = markdownToVisualHTML(cleanMarkdown);
            editor.innerHTML = visualHTML;
            
            const titleMatch = cleanMarkdown.match(/^# (.*$)/m);
            if (titleMatch && !this.querySelector('#meta-title').value) {
                this.querySelector('#meta-title').value = titleMatch[1].trim();
            }
            
        } catch(e) {
            alert("AI Error: " + e.message);
            editor.innerHTML = originalText;
        }
    }

    renderEditor(bodyHTML) {
        const ui = store.ui;
        
        // --- ADAPTIVE UI STATE ---
        const modeTitle = this.isLocalTree ? "Garden Mode" : "Contributor Mode";
        const modeBadgeClass = this.isLocalTree 
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" 
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
        
        const headerBorderClass = this.isLocalTree ? "border-green-500" : "border-slate-200 dark:border-slate-800";
        
        const saveLabel = this.isLocalTree ? (ui.editorLocalSave || "Save") : (this.hasWriteAccess ? ui.editorBtnPublish : ui.editorBtnPropose);
        const saveColor = this.isLocalTree ? "bg-green-600 hover:bg-green-500" : (this.hasWriteAccess ? "bg-blue-600 hover:bg-blue-500" : "bg-orange-500 hover:bg-orange-400");
        const saveIcon = this.isLocalTree ? "💾" : (this.hasWriteAccess ? "🚀" : "📫");

        const pathDisplay = this.isLocalTree 
            ? `My Garden > ${this.meta.title || 'New Lesson'}` 
            : this.node.sourcePath;

        const isMeta = this.isMetaJson;
        const bodyContent = isMeta 
            ? `<div class="p-8 text-center text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl">
                 <span class="text-4xl block mb-2">📂</span>
                 ${ui.editorMetaWarning.replace('\n', '<br>')}
               </div>`
            : bodyHTML;

        this.innerHTML = `
        <div id="editor-backdrop" class="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-0 animate-in fade-in">
            
            <div id="editor-container" class="bg-[#f7f9fa] dark:bg-slate-900 w-full h-full rounded-none shadow-2xl flex flex-col overflow-hidden relative">
                
                <!-- CONTEXT HEADER -->
                <div class="bg-white dark:bg-slate-900 border-b ${headerBorderClass} p-3 flex justify-between items-center shadow-sm shrink-0 border-b-2">
                    <div class="flex items-center gap-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-black uppercase px-2 py-0.5 rounded ${modeBadgeClass}">${modeTitle}</span>
                                <span class="text-xs text-slate-400 font-mono hidden md:inline-block">${pathDisplay}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <button id="btn-submit" class="${saveColor} text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-wide text-xs flex items-center gap-2">
                            <span>${saveIcon}</span> <span class="hidden md:inline">${saveLabel}</span>
                        </button>
                        <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                        <button id="btn-cancel" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors font-bold text-lg">✕</button>
                    </div>
                </div>
                
                <!-- METADATA FORM -->
                <div class="bg-slate-50 dark:bg-slate-950/50 p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-4 shrink-0 relative">
                     <div class="col-span-2 md:col-span-1 relative">
                         <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${ui.editorLabelIcon}</label>
                         <button id="btn-emoji" class="w-full h-10 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xl flex items-center justify-center hover:bg-blue-50 transition-colors">${this.meta.icon}</button>
                         
                         <div id="emoji-picker" class="hidden absolute top-12 left-0 w-72 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 z-50 p-2 h-64 overflow-y-auto custom-scrollbar">
                            ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                <div class="text-[10px] font-bold text-slate-400 mt-2 mb-1 px-1 uppercase">${cat}</div>
                                <div class="grid grid-cols-6 gap-1">
                                    ${emojis.map(e => `<button class="emoji-btn hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 text-lg">${e}</button>`).join('')}
                                </div>
                            `).join('')}
                         </div>
                     </div>
                     
                     <div class="col-span-10 md:col-span-9">
                         <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${ui.editorLabelTitle}</label>
                         <input id="meta-title" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg font-bold outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.title}" placeholder="Lesson Title">
                     </div>
                     
                     <div class="hidden md:block md:col-span-2">
                         <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${ui.editorLabelOrder}</label>
                         <input id="meta-order" type="number" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.order}">
                     </div>
                     
                     <div class="col-span-12">
                         <label class="text-[10px] uppercase font-bold text-slate-400 block mb-1">${ui.editorLabelDesc}</label>
                         <input id="meta-desc" class="w-full h-10 px-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value="${this.meta.description}" placeholder="Short description...">
                     </div>
                </div>
                
                <!-- TOOLBAR -->
                ${!isMeta ? `
                <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 flex gap-2 overflow-x-auto shrink-0 items-center justify-center sticky top-0 z-20 shadow-sm">
                    <button id="btn-undo" class="tool-btn w-8 h-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed" disabled title="Undo">↩</button>
                    <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                    
                    <div class="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 font-bold" data-cmd="bold">B</button>
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 italic" data-cmd="italic">I</button>
                        <button class="tool-btn w-8 h-8 rounded hover:bg-white dark:hover:bg-slate-700 font-serif font-bold" data-cmd="formatBlock" data-val="H2">H2</button>
                    </div>
                    <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                    
                    <div class="flex gap-2">
                        <button class="block-btn px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100" data-type="quiz">+ Quiz</button>
                        <button class="block-btn px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100" data-type="section">+ Section</button>
                        <button class="block-btn px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-bold hover:bg-yellow-100" data-type="callout">+ Note</button>
                    </div>
                    
                    <div class="ml-auto">
                        <button id="btn-magic-draft" class="bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors border border-purple-200 dark:border-purple-800">
                            ✨ ${ui.editorMagicDraft || "AI Draft"}
                        </button>
                    </div>
                </div>` : ''}

                <!-- VISUAL EDITOR -->
                <div class="flex-1 relative bg-slate-200 dark:bg-slate-950 overflow-y-auto custom-scrollbar p-0 flex justify-center">
                     <div id="visual-editor" 
                          class="w-full max-w-4xl bg-white dark:bg-slate-900 shadow-xl min-h-[150vh] my-4 md:my-8 p-8 md:p-16 pb-[80vh] prose prose-slate dark:prose-invert max-w-none focus:outline-none rounded-none md:rounded-lg" 
                          contenteditable="${!isMeta}" 
                          spellcheck="false">
                          ${bodyContent}
                     </div>
                </div>
            </div>
        </div>`;
        
        this.querySelector('#btn-cancel').onclick = () => this.closeEditor();
        this.querySelector('#btn-submit').onclick = () => this.submitChanges();
        
        const btnDraft = this.querySelector('#btn-magic-draft');
        if (btnDraft) btnDraft.onclick = () => this.draftWithAI();
        
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
        
        this.updateUndoButton();
    }

    async submitChanges() {
        const btn = this.querySelector('#btn-submit');
        const originalText = btn.innerHTML;
        btn.innerHTML = store.ui.editorProcessing;
        btn.disabled = true;
        
        const finalContent = this.generateFinalContent();
        
        try {
            // --- LOCAL SAVE STRATEGY ---
            if (this.isLocalTree) {
                // Get Tree ID from source URL (local://uuid)
                const sourceUrl = store.value.activeSource.url;
                const treeId = sourceUrl.split('://')[1];
                
                const metaUpdates = {
                    title: this.meta.title,
                    icon: this.meta.icon,
                    description: this.meta.description,
                    order: this.meta.order
                };

                const success = store.userStore.updateLocalNode(treeId, this.node.id, finalContent, metaUpdates);
                
                if (success) {
                    // Update Active Source Name in UI instantly
                    if (store.value.activeSource.name !== metaUpdates.title && this.node.type === 'root') {
                        store.update({ activeSource: { ...store.value.activeSource, name: metaUpdates.title } });
                    }
                    
                    alert(store.ui.editorLocalSaveSuccess || "Changes saved to your garden!");
                    // Force refresh graph logic by reloading from storage
                    const updatedSource = store.userStore.getLocalTreeData(treeId);
                    store.processLoadedData(updatedSource);
                } else {
                    throw new Error("Could not update local node. Node ID not found.");
                }
            } 
            // --- REMOTE SAVE STRATEGY ---
            else {
                const msg = `Update ${this.meta.title || 'File'}`;
                if (this.hasWriteAccess) {
                    await github.commitFile(this.node.sourcePath, finalContent, msg, this.currentSha);
                    alert(store.ui.editorSuccessPublish);
                } else {
                    const prUrl = await github.createPullRequest(this.node.sourcePath, finalContent, msg);
                    alert(store.ui.editorSuccessProposal + prUrl);
                }
            }
            this.closeEditor();
        } catch(e) {
            alert("Error: " + e.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}
customElements.define('arbor-editor', ArborEditor);
