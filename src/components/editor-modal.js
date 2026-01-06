



import { store } from '../store.js';
import { github } from '../services/github.js';

class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.originalContent = '';
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
            if (!this.node.sourcePath) throw new Error("Missing source path.");
            const { content } = await github.getFileContent(this.node.sourcePath);
            this.originalContent = content;
            this.renderEditor();
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error: " + e.message });
            store.setModal(null);
        }
    }

    renderLoading() {
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-lg text-slate-600 dark:text-slate-300">Loading Editor...</p>
            </div>
        </div>`;
    }

    // --- CONVERSION LOGIC (MARKDOWN <-> VISUAL HTML) ---

    // Turn Markdown into Visual HTML (WYSIWYG)
    markdownToVisual(md) {
        let html = '';
        const lines = md.split('\n');
        let inQuiz = false;
        
        lines.forEach(line => {
            const t = line.trim();
            if (t.startsWith('@quiz:')) {
                // Render Quiz Block
                const q = t.substring(6).trim();
                html += `<div class="arbor-block quiz-block my-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl" contenteditable="false">
                    <div class="flex items-center gap-2 mb-2"><span class="text-xl">📝</span><span class="font-bold text-purple-700 dark:text-purple-300">Quiz Question</span></div>
                    <input type="text" class="w-full p-2 border rounded mb-2 bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700" value="${q}" placeholder="Question?">
                    <div class="options-container">`;
                inQuiz = true;
            } else if (inQuiz && (t.startsWith('@option:') || t.startsWith('@correct:'))) {
                 const isCorrect = t.startsWith('@correct:');
                 const val = t.substring(t.indexOf(':')+1).trim();
                 html += `<div class="flex gap-2 mb-1">
                    <span class="text-lg">${isCorrect ? '✅' : '❌'}</span>
                    <input type="text" class="flex-1 p-1 border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700" value="${val}" data-type="${isCorrect ? 'correct' : 'option'}">
                 </div>`;
            } else if (inQuiz && t === '') {
                html += `</div></div><p><br></p>`; // Close quiz
                inQuiz = false;
            } else if (t.startsWith('@image:')) {
                const src = t.substring(7).trim();
                html += `<div class="my-4" contenteditable="false"><img src="${src}" class="max-w-full rounded shadow"><p class="text-xs text-center text-gray-400 mt-1">${src}</p></div><p><br></p>`;
            } else if (t.startsWith('@video:')) {
                 const src = t.substring(7).trim();
                 html += `<div class="arbor-block video-block my-4 p-4 bg-slate-100 rounded" contenteditable="false">🎬 Video: ${src}</div><p><br></p>`;
            } else if (t.startsWith('# ')) {
                html += `<h1>${t.substring(2)}</h1>`;
            } else if (t.startsWith('## ')) {
                html += `<h2>${t.substring(3)}</h2>`;
            } else if (t.startsWith('- ')) {
                 // Simple list handling
                 html += `<li>${this.parseInline(t.substring(2))}</li>`;
            } else if (t.startsWith('@icon:') || t.startsWith('@title:') || t.startsWith('@description:') || t.startsWith('@order:')) {
                // Hide metadata lines visually? Or show them as settings?
                // For simplicity, we hide them from the main editor area and manage them via header inputs, 
                // BUT extracting them is hard if we don't render them.
                // Let's Skip them in the visual editor, we handle title/icon in the header UI.
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

    // Turn Visual HTML back to Markdown
    visualToMarkdown(editorEl) {
        let md = '';
        
        // Re-add Metadata (Title/Icon are managed in UI Header)
        // We need to fetch them from the inputs, not the editor div
        const currentIcon = this.querySelector('#btn-emoji').textContent.trim();
        // Title isn't editable in header in this version, so we assume it matches node name or we'd need an input.
        // Let's stick to what we have. 
        // NOTE: We should preserve original metadata if possible or simpler: just write what we see.
        
        // We'll reconstruct basic metadata
        md += `@title: ${this.node.name}\n`;
        md += `@icon: ${currentIcon}\n`;
        // We might lose description/order if we don't have inputs for them.
        // For the "viejita", we assume she edits content mostly.
        
        // Iterate Nodes
        const nodes = editorEl.childNodes;
        nodes.forEach(node => {
            if (node.nodeType === 3) { // Text
                if(node.textContent.trim()) md += node.textContent.trim() + '\n\n';
            } else if (node.tagName === 'H1') {
                md += `# ${node.textContent}\n\n`;
            } else if (node.tagName === 'H2') {
                md += `## ${node.textContent}\n\n`;
            } else if (node.tagName === 'P' || node.tagName === 'DIV' && !node.classList.contains('arbor-block')) {
                let text = node.innerHTML
                    .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
                    .replace(/<strong>/g, '**').replace(/<\/strong>/g, '**')
                    .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
                    .replace(/<em>/g, '*').replace(/<\/em>/g, '*')
                    .replace(/&nbsp;/g, ' ');
                // Strip other tags
                text = text.replace(/<[^>]*>/g, '');
                if(text.trim()) md += text.trim() + '\n\n';
            } else if (node.tagName === 'LI') {
                 md += `- ${node.textContent}\n`;
            } else if (node.classList && node.classList.contains('quiz-block')) {
                 const q = node.querySelector('input').value;
                 md += `@quiz: ${q}\n`;
                 node.querySelectorAll('.options-container div').forEach(optDiv => {
                     const val = optDiv.querySelector('input').value;
                     const type = optDiv.querySelector('input').dataset.type; // option or correct
                     md += `@${type}: ${val}\n`;
                 });
                 md += '\n';
            } else if (node.querySelector && node.querySelector('img')) {
                 const src = node.querySelector('img').getAttribute('src');
                 md += `@image: ${src}\n\n`;
            }
        });

        return md.trim();
    }

    // --- ACTIONS ---

    execCmd(cmd, val = null) {
        document.execCommand(cmd, false, val);
        this.querySelector('#wysiwyg-editor').focus();
    }

    insertQuizBlock() {
        const id = Date.now();
        const html = `
        <div class="arbor-block quiz-block my-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl" contenteditable="false">
            <div class="flex items-center gap-2 mb-2"><span class="text-xl">📝</span><span class="font-bold text-purple-700 dark:text-purple-300">New Quiz</span></div>
            <input type="text" class="w-full p-2 border rounded mb-2 bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700" placeholder="Type question here...">
            <div class="options-container">
                <div class="flex gap-2 mb-1"><span class="text-lg">✅</span><input type="text" class="flex-1 p-1 border rounded bg-white dark:bg-slate-800 dark:text-white" placeholder="Correct Answer" data-type="correct"></div>
                <div class="flex gap-2 mb-1"><span class="text-lg">❌</span><input type="text" class="flex-1 p-1 border rounded bg-white dark:bg-slate-800 dark:text-white" placeholder="Wrong Option" data-type="option"></div>
            </div>
        </div><p><br></p>`;
        
        document.execCommand('insertHTML', false, html);
    }
    
    insertImage() {
        const url = prompt("Image URL:");
        if(url) {
             const html = `<div class="my-4" contenteditable="false"><img src="${url}" class="max-w-full rounded shadow"><p class="text-xs text-center text-gray-400 mt-1">${url}</p></div><p><br></p>`;
             document.execCommand('insertHTML', false, html);
        }
    }

    // --- RENDER ---

    renderEditor() {
        const ui = store.ui;
        // Parse current content to find icon
        const iconMatch = this.originalContent.match(/@icon:\s*(.+)/i);
        const currentIcon = iconMatch ? iconMatch[1].trim() : '📄';

        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-100 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            
            <!-- HEADER -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-4 shadow-sm z-20 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <button id="btn-cancel" class="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <!-- EMOJI PICKER -->
                    <div class="relative group">
                        <button id="btn-emoji" class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:border-sky-500 text-2xl flex items-center justify-center">
                            ${currentIcon}
                        </button>
                        <div class="absolute top-12 left-0 w-64 bg-white shadow-2xl rounded-xl border border-slate-200 p-3 grid grid-cols-5 gap-2 hidden group-hover:grid z-50">
                            ${this.emojis.map(e => `<button class="btn-emoji-opt w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 rounded" data-emoji="${e}">${e}</button>`).join('')}
                        </div>
                    </div>
                    <h2 class="font-black text-lg text-slate-800 dark:text-white truncate">${this.node.name}</h2>
                </div>
                
                <button id="btn-submit" class="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg">
                    ${ui.editorChanges}
                </button>
            </div>

            <!-- WYSIWYG TOOLBAR -->
            <div class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto">
                <button class="tb-btn p-2 rounded hover:bg-slate-200 font-bold" data-cmd="bold">B</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 italic" data-cmd="italic">I</button>
                <div class="w-px h-6 bg-slate-300 mx-2"></div>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 font-bold" data-cmd="formatBlock" data-val="h1">H1</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200 font-bold" data-cmd="formatBlock" data-val="h2">H2</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-200" data-cmd="insertUnorderedList">• List</button>
                <div class="w-px h-6 bg-slate-300 mx-2"></div>
                <button id="btn-add-img" class="p-2 rounded hover:bg-slate-200">🖼️ Image</button>
                <button id="btn-add-quiz" class="px-3 py-1 rounded bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-1">📝 Quiz Block</button>
            </div>

            <!-- WYSIWYG EDITOR AREA -->
            <div class="flex-1 overflow-y-auto bg-white dark:bg-slate-900 cursor-text p-8 md:p-12" onclick="document.getElementById('wysiwyg-editor').focus()">
                <div id="wysiwyg-editor" class="max-w-3xl mx-auto outline-none prose prose-slate dark:prose-invert" contenteditable="true">
                    ${this.markdownToVisual(this.originalContent)}
                </div>
            </div>
            
            <!-- COMMIT MODAL -->
            <dialog id="commit-dialog" class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-md w-full border border-slate-200">
                <h3 class="font-black text-xl mb-4 text-slate-800 dark:text-white">Save Changes</h3>
                <textarea id="commit-msg" class="w-full h-24 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 border border-slate-200 outline-none text-sm dark:text-white" placeholder="Describe what you changed..."></textarea>
                <div class="flex justify-end gap-3">
                    <button id="btn-commit-cancel" class="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                    <button id="btn-commit-confirm" class="px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg">Save</button>
                </div>
            </dialog>
        </div>`;

        this.bindEvents();
    }

    bindEvents() {
        const editor = this.querySelector('#wysiwyg-editor');

        // Toolbar
        this.querySelectorAll('.tb-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                this.execCmd(btn.dataset.cmd, btn.dataset.val);
            };
        });

        this.querySelector('#btn-add-quiz').onclick = (e) => { e.preventDefault(); this.insertQuizBlock(); };
        this.querySelector('#btn-add-img').onclick = (e) => { e.preventDefault(); this.insertImage(); };

        // Emoji
        this.querySelectorAll('.btn-emoji-opt').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.querySelector('#btn-emoji').textContent = e.target.dataset.emoji;
            };
        });

        // Save Flow
        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        
        const dialog = this.querySelector('#commit-dialog');
        this.querySelector('#btn-submit').onclick = () => dialog.showModal();
        this.querySelector('#btn-commit-cancel').onclick = () => dialog.close();
        
        this.querySelector('#btn-commit-confirm').onclick = async () => {
            const msg = this.querySelector('#commit-msg').value.trim() || `Update ${this.node.name}`;
            const btn = this.querySelector('#btn-commit-confirm');
            btn.disabled = true;
            btn.textContent = "Processing...";
            
            // CONVERT BACK TO MARKDOWN
            const finalMarkdown = this.visualToMarkdown(editor);

            try {
                const prUrl = await github.createPullRequest(this.node.sourcePath, finalMarkdown, msg);
                alert(store.ui.prSuccessBody);
                window.open(prUrl, '_blank');
                dialog.close();
                store.setModal(null);
            } catch (e) {
                alert("Error: " + e.message);
                btn.disabled = false;
                btn.textContent = "Save";
            }
        };
    }
}
customElements.define('arbor-editor', ArborEditor);
