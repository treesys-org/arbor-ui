
import { store } from '../store.js';
import { github } from '../services/github.js';

// --- VISUAL BLOCK TEMPLATES ---
const BLOCKS = {
    quiz: (q = "", correct = "", options = []) => {
        let optsHtml = options.map(o => `
            <div class="option-row flex items-center gap-2 mb-2">
                <input type="radio" disabled class="w-4 h-4 text-green-600">
                <input type="text" class="quiz-input option-input flex-1 p-2 border border-slate-200 rounded text-sm" value="${o}" placeholder="Option">
            </div>
        `).join('');
        if (!correct) correct = "";
        
        return `
        <div class="edit-block-wrapper arbor-quiz-edit relative my-8 group select-none" contenteditable="false">
            <div class="remove-btn absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs">✕</div>
            <div class="quiz-edit-card bg-green-50 border border-green-200 rounded-xl p-6">
                <div class="quiz-header flex items-center gap-2 mb-3 text-green-800 font-bold text-xs uppercase tracking-wider">
                    <span>❓</span> Quiz Question
                </div>
                <input type="text" class="quiz-input question-input w-full p-2 border border-green-200 rounded mb-4 font-bold text-slate-700" value="${q}" placeholder="Question text...">
                
                <div class="quiz-header flex items-center gap-2 mb-2 text-green-800 font-bold text-xs uppercase tracking-wider">Correct Answer</div>
                <div class="option-row flex items-center gap-2 mb-4">
                    <input type="radio" checked disabled class="w-4 h-4 text-green-600">
                    <input type="text" class="quiz-input correct-input flex-1 p-2 border border-green-200 rounded font-bold text-green-700" value="${correct}" placeholder="The correct answer">
                </div>

                <div class="quiz-header flex items-center gap-2 mb-2 text-green-800 font-bold text-xs uppercase tracking-wider">Distractors (Wrong Options)</div>
                <div class="options-container">
                    ${optsHtml || `
                    <div class="option-row flex items-center gap-2 mb-2">
                        <input type="radio" disabled class="w-4 h-4 text-slate-300">
                        <input type="text" class="quiz-input option-input flex-1 p-2 border border-slate-200 rounded text-sm" placeholder="Wrong option 1">
                    </div>
                    `}
                </div>
                <button class="add-option-btn text-xs text-blue-600 font-bold mt-2 hover:underline flex items-center gap-1">+ Add Option</button>
            </div>
        </div>
        <p><br></p>`;
    },
    section: (title = "") => `
        <div class="edit-block-wrapper arbor-section-edit relative my-8 group select-none" contenteditable="false">
            <div class="remove-btn absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs">✕</div>
            <div class="section-edit-card bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r flex items-center gap-4">
                <span class="section-label text-blue-800 font-bold text-xs uppercase">SECTION</span>
                <input type="text" class="section-input flex-1 bg-transparent border-none text-xl font-bold text-slate-800 outline-none border-b-2 border-transparent focus:border-blue-500 transition-colors" value="${title}" placeholder="Section Title">
            </div>
        </div>
        <p><br></p>`,
    media: (type, url = "") => `
        <div class="edit-block-wrapper arbor-media-edit relative my-8 group select-none" data-type="${type}" contenteditable="false">
            <div class="remove-btn absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs">✕</div>
            <div class="media-edit-card bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center gap-3">
                <span class="section-label text-slate-400 font-bold text-xs uppercase tracking-wider">${type.toUpperCase()}</span>
                ${type === 'image' && url ? `<img src="${url}" class="media-preview max-h-48 rounded shadow-sm object-contain bg-white">` : ''}
                <div class="media-input-row w-full flex gap-2">
                    <span class="text-xl pt-1">${type === 'image' ? '🖼️' : (type === 'video' ? '🎥' : '🎵')}</span>
                    <input type="text" class="media-url-input flex-1 p-2 border border-slate-200 rounded text-sm text-slate-600 font-mono" value="${url}" placeholder="${type === 'image' ? 'Image URL' : 'Media URL'}">
                </div>
            </div>
        </div>
        <p><br></p>`
};

// --- PARSING HELPERS ---

function parseArborFile(content) {
    const lines = content.split('\n');
    const meta = { title: '', icon: '📄', description: '', order: '', isExam: false, extra: [] };
    const bodyLines = [];
    let readingMeta = true;

    for (let line of lines) {
        const trim = line.trim();
        if (readingMeta && trim.startsWith('@')) {
            if (trim.toLowerCase() === '@exam') { meta.isExam = true; continue; }
            const idx = trim.indexOf(':');
            if (idx > -1) {
                const key = trim.substring(1, idx).trim().toLowerCase();
                const val = trim.substring(idx + 1).trim();
                // Check if this tag is actually a body tag
                if (['quiz', 'image', 'img', 'video', 'audio', 'section', 'correct', 'option'].includes(key)) {
                    readingMeta = false; bodyLines.push(line);
                } else {
                    if (key in meta) meta[key] = val;
                    else meta.extra.push(line);
                }
            } else { meta.extra.push(line); }
        } else {
            if (trim !== '') readingMeta = false;
            if (!readingMeta || trim === '') bodyLines.push(line);
        }
    }
    // Trim leading empty lines
    while(bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
    return { meta, body: bodyLines.join('\n') };
}

function markdownToVisualHTML(md) {
    if (!md) return '<p><br></p>';
    const lines = md.split('\n');
    let html = '';
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if(!line) { html += '<p><br></p>'; continue; }

        if (line.startsWith('# ')) { html += `<h1>${line.substring(2)}</h1>`; continue; }
        if (line.startsWith('## ')) { html += `<h2>${line.substring(3)}</h2>`; continue; }
        if (line.startsWith('- ')) { 
            html += '<ul>';
            html += `<li>${line.substring(2)}</li>`;
            while(i+1 < lines.length && lines[i+1].trim().startsWith('- ')) {
                i++;
                html += `<li>${lines[i].trim().substring(2)}</li>`;
            }
            html += '</ul>';
            continue;
        }

        if (line.startsWith('@section:')) { html += BLOCKS.section(line.substring(9).trim()); continue; }
        if (line.startsWith('@image:') || line.startsWith('@img:')) { html += BLOCKS.media('image', line.substring(line.indexOf(':')+1).trim()); continue; }
        if (line.startsWith('@video:')) { html += BLOCKS.media('video', line.substring(7).trim()); continue; }
        if (line.startsWith('@audio:')) { html += BLOCKS.media('audio', line.substring(7).trim()); continue; }

        if (line.startsWith('@quiz:')) {
            const q = line.substring(6).trim();
            let correct = "";
            let options = [];
            while(i+1 < lines.length) {
                const next = lines[i+1].trim();
                if(next.startsWith('@correct:')) { correct = next.substring(9).trim(); i++; }
                else if(next.startsWith('@option:')) { options.push(next.substring(8).trim()); i++; }
                else if (next === '') { i++; if (i+1 < lines.length && !lines[i+1].trim().startsWith('@')) break; }
                else { break; }
            }
            html += BLOCKS.quiz(q, correct, options);
            continue;
        }

        // Basic Formatting
        let text = line
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
            
        html += `<p>${text}</p>`;
    }
    return html;
}

function visualHTMLToMarkdown(root) {
    let md = "";
    for (const node of root.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.trim()) md += node.textContent.trim() + "\n\n";
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.tagName === 'H1') { md += `# ${node.innerText}\n\n`; continue; }
        if (node.tagName === 'H2') { md += `## ${node.innerText}\n\n`; continue; }
        if (node.tagName === 'P') { 
            let text = node.innerHTML
                .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
                .replace(/<strong>/g, '**').replace(/<\/strong>/g, '**')
                .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
                .replace(/<em>/g, '*').replace(/<\/em>/g, '*')
                .replace(/&nbsp;/g, ' ');
            
            // Strip HTML tags for safety/cleanliness, mostly
            const tmp = document.createElement("DIV");
            tmp.innerHTML = text;
            text = tmp.innerText;
            if (text.trim()) md += `${text}\n\n`; 
            continue; 
        }
        if (node.tagName === 'UL') {
            for (const li of node.children) md += `- ${li.innerText}\n`;
            md += "\n";
            continue;
        }

        if (node.classList.contains('arbor-section-edit')) { 
            const val = node.querySelector('input').value;
            if(val) md += `@section: ${val}\n\n`; 
            continue; 
        }
        if (node.classList.contains('arbor-media-edit')) {
            const type = node.dataset.type;
            const val = node.querySelector('input').value;
            if(val) {
                if (type === 'image') md += `@image: ${val}\n\n`;
                else if (type === 'video') md += `@video: ${val}\n\n`;
                else if (type === 'audio') md += `@audio: ${val}\n\n`;
            }
            continue;
        }
        if (node.classList.contains('arbor-quiz-edit')) {
            const q = node.querySelector('.question-input').value;
            const correct = node.querySelector('.correct-input').value;
            const options = Array.from(node.querySelectorAll('.option-input')).map(i => i.value).filter(v => v);
            
            if(q && correct) {
                md += `@quiz: ${q}\n@correct: ${correct}\n`;
                options.forEach(o => md += `@option: ${o}\n`);
                md += "\n";
            }
            continue;
        }
    }
    return md.trim();
}

function reconstructArborFile(meta, bodyMD) {
    let out = '';
    if (meta.title) out += `@title: ${meta.title}\n`;
    if (meta.icon) out += `@icon: ${meta.icon}\n`;
    if (meta.description) out += `@description: ${meta.description}\n`;
    if (meta.order) out += `@order: ${meta.order}\n`;
    if (meta.isExam) out += `@exam\n`;
    // Add extra meta if preserved
    if (meta.extra && meta.extra.length) {
        meta.extra.forEach(l => out += l + '\n');
    }
    out += '\n' + bodyMD;
    return out;
}


class ArborEditor extends HTMLElement {
    constructor() {
        super();
        this.node = null;
        this.currentSha = null;
        this.metadata = {};
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
            const { content, sha } = await github.getFileContent(this.node.sourcePath);
            this.currentSha = sha;
            
            const parsed = parseArborFile(content);
            this.metadata = parsed.meta;
            const visualHtml = markdownToVisualHTML(parsed.body);
            
            this.renderEditor(visualHtml);
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error loading file from GitHub: " + e.message });
            store.setModal(null);
        }
    }

    renderLoading() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-lg text-slate-600 dark:text-slate-300">${ui.editorLoading}</p>
            </div>
        </div>`;
    }

    renderEditor(initialHtml) {
        const ui = store.ui;
        
        // CSS specific to the editor
        const styles = `
        <style>
            .cm-editor { font-family: 'JetBrains Mono', monospace; }
            #visual-editor h1 { font-size: 2em; font-weight: 800; margin: 0.8em 0 0.5em 0; color: #1e293b; line-height: 1.2; }
            #visual-editor h2 { font-size: 1.5em; font-weight: 700; margin: 1.5em 0 0.8em 0; color: #334155; line-height: 1.3; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
            #visual-editor p { margin-bottom: 1.2em; line-height: 1.7; color: #334155; }
            #visual-editor ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1.5em; color: #334155; }
            #visual-editor li { margin-bottom: 0.4em; }
            #visual-editor { outline: none; min-height: 600px; }
            
            /* Light styling for the page */
            .paged-document {
                background-color: white;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
                min-height: 800px;
            }
            .dark .paged-document {
                background-color: #0f172a;
                box-shadow: none;
                border: 1px solid #1e293b;
            }
            .dark #visual-editor h1, .dark #visual-editor h2, .dark #visual-editor p, .dark #visual-editor ul { color: #e2e8f0; }
        </style>
        `;

        this.innerHTML = `
        ${styles}
        <div class="fixed inset-0 z-[80] bg-slate-200 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            
            <!-- 1. Header -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 shadow-sm z-20">
                <div class="flex items-center gap-4">
                    <button id="btn-cancel" class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors" title="${ui.editorCancel}">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 class="font-black text-lg text-slate-800 dark:text-white leading-none flex items-center gap-2">
                            ${this.node.name}
                        </h2>
                        <p class="text-xs text-slate-500 font-mono mt-1 opacity-70">Editing via GitHub</p>
                    </div>
                </div>
                <button id="btn-submit" class="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg shadow-orange-600/20 transform active:scale-95 transition-all uppercase tracking-wide text-sm">
                    ${ui.editorCommitBtn}
                </button>
            </div>

            <!-- 2. Metadata Form -->
            <div class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-4 grid grid-cols-12 gap-4 flex-shrink-0">
                <div class="col-span-2 md:col-span-1 relative">
                    <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Icon</label>
                    <input type="text" id="meta-icon" class="w-full text-center text-2xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-colors" value="${this.metadata.icon || '📄'}">
                </div>
                <div class="col-span-10 md:col-span-7">
                    <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Lesson Title</label>
                    <input type="text" id="meta-title" class="w-full font-bold text-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-white" value="${this.metadata.title || ''}">
                </div>
                <div class="col-span-6 md:col-span-2">
                     <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Order</label>
                     <input type="number" id="meta-order" class="w-full font-mono text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-white" value="${this.metadata.order || ''}">
                </div>
                 <div class="col-span-6 md:col-span-2 flex items-end">
                    <button id="btn-exam-toggle" class="w-full py-3 px-3 rounded-lg border-2 font-bold text-xs text-center select-none uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${this.metadata.isExam ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white dark:bg-slate-800 text-slate-400'}">
                       <span>${this.metadata.isExam ? '⚔️' : '🌱'}</span> <span>${this.metadata.isExam ? 'EXAM' : 'LESSON'}</span>
                    </button>
                </div>
                <div class="col-span-12">
                    <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Brief Description</label>
                    <input type="text" id="meta-desc" class="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-white" value="${this.metadata.description || ''}">
                </div>
            </div>

            <!-- 3. Toolbar -->
            <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-2 flex items-center gap-2 overflow-x-auto disabled-overlay flex-shrink-0 sticky top-0 z-30 shadow-sm">
                <!-- Text Formatting -->
                <div class="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700 pr-2 mr-1 flex-shrink-0">
                    <button class="tool-btn font-serif font-black text-xl w-9 h-9 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-cmd="bold" title="Bold">B</button>
                    <button class="tool-btn italic font-serif text-xl w-9 h-9 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-cmd="italic" title="Italic">I</button>
                </div>
                <!-- Headers -->
                <div class="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700 pr-2 mr-1 flex-shrink-0">
                    <button class="tool-btn font-bold text-lg w-9 h-9 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-cmd="formatBlock" data-val="H1" title="H1">H1</button>
                    <button class="tool-btn font-bold text-sm w-9 h-9 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-cmd="formatBlock" data-val="H2" title="H2">H2</button>
                    <button class="tool-btn flex items-center justify-center w-9 h-9 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" data-cmd="insertUnorderedList" title="List">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>
                <!-- Media -->
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button class="tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 transition-colors" data-action="insert-media" data-type="image">
                        <span>📷</span> Img
                    </button>
                    <button class="tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 transition-colors" data-action="insert-media" data-type="video">
                        <span>🎥</span> Vid
                    </button>
                    <button class="tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 transition-colors" data-action="insert-media" data-type="audio">
                        <span>🎵</span> Aud
                    </button>
                </div>
                <div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1 flex-shrink-0"></div>
                <!-- Interactive -->
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button class="tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-xs font-bold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900 transition-colors" data-action="insert-quiz">
                        <span>❓</span> Quiz
                    </button>
                    <button class="tool-btn flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors" data-action="insert-section">
                        <span>📑</span> Sect
                    </button>
                </div>
            </div>

            <!-- 4. Visual Editor -->
            <div class="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center custom-scrollbar bg-slate-200 dark:bg-black" id="scroll-container">
                <div class="w-full max-w-4xl paged-document p-8 md:p-16 relative transition-all duration-300 pb-32 rounded-lg">
                    <div id="visual-editor" 
                         contenteditable="true" 
                         class="prose prose-lg prose-slate dark:prose-invert max-w-none outline-none"
                         spellcheck="false">
                         ${initialHtml}
                    </div>
                </div>
            </div>
        </div>`;

        this.bindEvents();
    }

    bindEvents() {
        // Toolbar
        this.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const cmd = btn.dataset.cmd;
                const action = btn.dataset.action;
                
                const editor = this.querySelector('#visual-editor');
                editor.focus();

                if (cmd) {
                    document.execCommand(cmd, false, btn.dataset.val || null);
                } else if (action) {
                    let htmlToInsert = '';
                    if (action === 'insert-section') htmlToInsert = BLOCKS.section();
                    if (action === 'insert-quiz') htmlToInsert = BLOCKS.quiz();
                    if (action === 'insert-media') htmlToInsert = BLOCKS.media(btn.dataset.type);

                    document.execCommand('insertHTML', false, htmlToInsert);
                }
            };
        });

        // Exam Toggle
        const btnExam = this.querySelector('#btn-exam-toggle');
        btnExam.onclick = () => {
            this.metadata.isExam = !this.metadata.isExam;
            btnExam.className = `w-full py-3 px-3 rounded-lg border-2 font-bold text-xs text-center select-none uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${this.metadata.isExam ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white dark:bg-slate-800 text-slate-400'}`;
            btnExam.innerHTML = `<span>${this.metadata.isExam ? '⚔️' : '🌱'}</span> <span>${this.metadata.isExam ? 'EXAM' : 'LESSON'}</span>`;
        };

        // Editor Interactions (Delegated)
        const editor = this.querySelector('#visual-editor');
        editor.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                e.target.parentElement.remove();
            }
            if (e.target.classList.contains('add-option-btn')) {
                const container = e.target.previousElementSibling;
                const div = document.createElement('div');
                div.className = 'option-row flex items-center gap-2 mb-2';
                div.innerHTML = `<input type="radio" disabled class="w-4 h-4 text-slate-300"><input type="text" class="quiz-input option-input flex-1 p-2 border border-slate-200 rounded text-sm" placeholder="Option">`;
                container.appendChild(div);
            }
        });

        // Save
        this.querySelector('#btn-cancel').onclick = () => store.setModal(null);
        this.querySelector('#btn-submit').onclick = () => this.showCommitDialog();
    }

    showCommitDialog() {
        const ui = store.ui;
        // Collect Metadata
        this.metadata.title = this.querySelector('#meta-title').value;
        this.metadata.icon = this.querySelector('#meta-icon').value;
        this.metadata.description = this.querySelector('#meta-desc').value;
        this.metadata.order = this.querySelector('#meta-order').value;

        // Collect Body
        const visualEditor = this.querySelector('#visual-editor');
        const bodyMarkdown = visualHTMLToMarkdown(visualEditor);
        const fullContent = reconstructArborFile(this.metadata, bodyMarkdown);

        const dialog = document.createElement('div');
        dialog.className = "fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4";
        dialog.innerHTML = `
            <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200 text-center">
                <div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">📢</div>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${ui.editorChanges}</h3>
                <p class="text-sm text-slate-500 mb-6">Briefly describe what you changed so the admins know.</p>
                
                <textarea id="commit-msg" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-base text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 mb-6 h-32 resize-none" placeholder="e.g. Added a new quiz..."></textarea>
                
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
                const prUrl = await github.createPullRequest(this.node.sourcePath, fullContent, msg);
                this.showSuccess(prUrl);
            } catch(e) {
                alert(ui.prError + ': ' + e.message);
                btn.disabled = false;
                btn.textContent = ui.editorCommitBtn;
            }
        };
    }

    showSuccess(url) {
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
