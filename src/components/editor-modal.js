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
            if (!this.node.sourcePath) throw new Error("No source path configured for this node.");
            const { content } = await github.getFileContent(this.node.sourcePath);
            this.originalContent = content;
            this.renderEditor();
        } catch (e) {
            console.error(e);
            store.update({ lastErrorMessage: "Error cargando contenido: " + e.message });
            store.setModal(null);
        }
    }

    renderLoading() {
        this.innerHTML = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="font-bold text-lg text-slate-600 dark:text-slate-300">Preparando editor visual...</p>
            </div>
        </div>`;
    }

    // ==================================================================================
    // 🧠 EL CEREBRO DE TRADUCCIÓN (MARKDOWN <-> VISUAL)
    // ==================================================================================

    /**
     * Convierte el Markdown crudo en HTML visual con inputs editables.
     * La "viejita" ve cajitas para rellenar, no texto con @arrobas.
     */
    markdownToVisual(md) {
        let html = '';
        const lines = md.split('\n');
        let inQuiz = false;
        
        lines.forEach(line => {
            const t = line.trim();
            
            // --- DETECTOR DE QUIZ ---
            if (t.startsWith('@quiz:')) {
                const qValue = t.substring(6).trim();
                // Abrimos el bloque visual del Quiz
                html += `
                <div class="arbor-visual-block quiz-block my-6 p-6 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-100 dark:border-purple-800 rounded-2xl select-none" contenteditable="false">
                    <div class="flex items-center justify-between mb-4 border-b border-purple-200 dark:border-purple-700 pb-2">
                        <div class="flex items-center gap-2 font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider text-xs">
                            <span class="text-lg">📝</span> Pregunta de Evaluación
                        </div>
                        <button class="text-red-400 hover:text-red-600 font-bold text-xs btn-delete-block">ELIMINAR</button>
                    </div>
                    
                    <label class="block text-xs font-bold text-slate-400 mb-1">Enunciado de la pregunta:</label>
                    <input type="text" class="quiz-question-input w-full p-3 text-lg font-bold border border-slate-200 dark:border-slate-700 rounded-xl mb-4 bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" value="${qValue}" placeholder="¿Qué preguntó el profesor?">
                    
                    <div class="options-container space-y-3">
                `;
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
                html += `</div> <!-- End options container -->
                         <div class="mt-4 p-2 bg-purple-100/50 dark:bg-purple-900/50 rounded text-center text-xs text-purple-600 dark:text-purple-300">
                            La opción con ✔ es la correcta.
                         </div>
                </div><p><br></p>`; // Cerramos el bloque visual y añadimos espacio para seguir escribiendo
                inQuiz = false;
            } 
            // --- DETECTOR DE IMAGEN ---
            else if (t.startsWith('@image:') || t.startsWith('@img:')) {
                const src = t.substring(t.indexOf(':')+1).trim();
                html += `
                <div class="arbor-visual-block image-block my-6 relative group" contenteditable="false">
                    <img src="${src}" class="w-full rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                    <div class="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                        <button class="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg btn-delete-block">Eliminar Imagen</button>
                    </div>
                    <p class="hidden src-data">${src}</p> <!-- Hidden storage for the URL -->
                </div><p><br></p>`;
            }
            // --- DETECTOR DE VIDEO ---
            else if (t.startsWith('@video:')) {
                 const src = t.substring(7).trim();
                 html += `
                 <div class="arbor-visual-block video-block my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl border-l-4 border-red-500" contenteditable="false">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-slate-600 dark:text-slate-300">🎬 Video de YouTube</span>
                        <button class="text-red-400 text-xs font-bold btn-delete-block">ELIMINAR</button>
                    </div>
                    <div class="text-xs text-slate-400 mt-1 font-mono">${src}</div>
                 </div><p><br></p>`;
            }
            // --- FORMATOS ESTÁNDAR ---
            else if (t.startsWith('# ')) {
                html += `<h1>${t.substring(2)}</h1>`;
            } else if (t.startsWith('## ')) {
                html += `<h2>${t.substring(3)}</h2>`;
            } else if (t.startsWith('- ')) {
                 html += `<li>${this.parseInline(t.substring(2))}</li>`;
            } else if (t.startsWith('@icon:') || t.startsWith('@title:') || t.startsWith('@description:') || t.startsWith('@order:') || t.startsWith('@exam')) {
                // Metadatos: Los ignoramos en el editor de texto porque se gestionan en la cabecera
            } else {
                if (t.length > 0) html += `<p>${this.parseInline(t)}</p>`;
            }
        });
        
        if(inQuiz) html += `</div></div><p><br></p>`; // Cerrar si el archivo terminaba en quiz
        return html;
    }

    parseInline(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>');
    }

    /**
     * Convierte el HTML visual (con inputs llenos) de vuelta a Markdown.
     * Aquí extraemos los valores que la "viejita" escribió.
     */
    visualToMarkdown(editorEl) {
        let md = '';
        
        // 1. Reconstruir Metadatos (Cabecera)
        const currentIcon = this.querySelector('#btn-emoji').textContent.trim();
        md += `@title: ${this.node.name}\n`; // Asumimos que el título es el nombre del nodo
        md += `@icon: ${currentIcon}\n`;
        // Si es examen, mantenemos la etiqueta
        if(this.originalContent.includes('@exam')) md += `@exam\n`; 
        md += `\n`; // Separador
        
        // 2. Recorrer el DOM Visual
        const nodes = editorEl.childNodes;
        nodes.forEach(node => {
            // Texto normal
            if (node.nodeType === 3) { 
                if(node.textContent.trim()) md += node.textContent.trim() + '\n\n';
            } 
            // Encabezados
            else if (node.tagName === 'H1') {
                md += `# ${node.textContent}\n\n`;
            } else if (node.tagName === 'H2') {
                md += `## ${node.textContent}\n\n`;
            } 
            // Párrafos (evitando bloques especiales)
            else if ((node.tagName === 'P' || node.tagName === 'DIV') && !node.classList.contains('arbor-visual-block')) {
                let text = node.innerHTML
                    .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
                    .replace(/<strong>/g, '**').replace(/<\/strong>/g, '**')
                    .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
                    .replace(/<br>/g, '\n');
                
                text = text.replace(/<[^>]*>/g, ''); // Limpiar tags HTML residuales
                if(text.trim()) md += text.trim() + '\n\n';
            } 
            // Listas
            else if (node.tagName === 'LI') {
                 md += `- ${node.textContent}\n`;
            } else if (node.tagName === 'UL') {
                 node.querySelectorAll('li').forEach(li => md += `- ${li.textContent}\n`);
                 md += '\n';
            }
            // --- BLOQUES ESPECIALES ---
            else if (node.classList && node.classList.contains('quiz-block')) {
                 // Extraemos valor del INPUT VISUAL
                 const qInput = node.querySelector('.quiz-question-input');
                 if(qInput) {
                     md += `@quiz: ${qInput.value}\n`;
                     node.querySelectorAll('.options-container input').forEach(optInput => {
                         const type = optInput.dataset.type; // correct o option
                         md += `@${type}: ${optInput.value}\n`;
                     });
                     md += '\n';
                 }
            } 
            else if (node.classList && node.classList.contains('image-block')) {
                 const srcData = node.querySelector('.src-data');
                 if(srcData) md += `@image: ${srcData.textContent}\n\n`;
            }
            else if (node.classList && node.classList.contains('video-block')) {
                 // Intentamos recuperar la URL del texto visual
                 const urlDiv = node.querySelector('.text-xs');
                 if(urlDiv) md += `@video: ${urlDiv.textContent}\n\n`;
            }
        });

        return md.trim();
    }

    // --- ACCIONES DE EDICIÓN ---

    execCmd(cmd, val = null) {
        document.execCommand(cmd, false, val);
        this.querySelector('#wysiwyg-editor').focus();
    }

    insertQuizBlock() {
        // Insertamos HTML puro con inputs. Nada de texto markdown.
        const html = `
        <div class="arbor-visual-block quiz-block my-6 p-6 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-100 dark:border-purple-800 rounded-2xl select-none" contenteditable="false">
            <div class="flex items-center justify-between mb-4 border-b border-purple-200 dark:border-purple-700 pb-2">
                <div class="flex items-center gap-2 font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider text-xs">
                    <span class="text-lg">📝</span> Nuevo Quiz
                </div>
                <button class="text-red-400 hover:text-red-600 font-bold text-xs btn-delete-block">ELIMINAR</button>
            </div>
            
            <label class="block text-xs font-bold text-slate-400 mb-1">Pregunta:</label>
            <input type="text" class="quiz-question-input w-full p-3 text-lg font-bold border border-slate-200 dark:border-slate-700 rounded-xl mb-4 bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" placeholder="Escribe aquí la pregunta...">
            
            <div class="options-container space-y-3">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-green-100 text-green-600">✔</div>
                    <input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" placeholder="Respuesta Correcta" data-type="correct">
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-red-50 text-red-400">✖</div>
                    <input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" placeholder="Respuesta Incorrecta" data-type="option">
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-red-50 text-red-400">✖</div>
                    <input type="text" class="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 dark:text-white text-sm" placeholder="Respuesta Incorrecta (Opcional)" data-type="option">
                </div>
            </div>
        </div><p><br></p>`;
        
        document.execCommand('insertHTML', false, html);
        this.bindDynamicEvents(); // Re-bind delete buttons
    }
    
    insertImage() {
        const url = prompt("Pega la URL de la imagen:");
        if(url) {
             const html = `
             <div class="arbor-visual-block image-block my-6 relative group" contenteditable="false">
                <img src="${url}" class="w-full rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div class="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                    <button class="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg btn-delete-block">Eliminar Imagen</button>
                </div>
                <p class="hidden src-data">${url}</p>
             </div><p><br></p>`;
             document.execCommand('insertHTML', false, html);
             this.bindDynamicEvents();
        }
    }

    // --- RENDER ---

    renderEditor() {
        const ui = store.ui;
        // Parsear icono actual
        const iconMatch = this.originalContent.match(/@icon:\s*(.+)/i);
        const currentIcon = iconMatch ? iconMatch[1].trim() : '📄';

        this.innerHTML = `
        <div class="fixed inset-0 z-[80] bg-slate-100 dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
            
            <!-- BARRA SUPERIOR (HEADER) -->
            <div class="h-16 bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-4 shadow-sm z-20 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <button id="btn-cancel" class="p-2 rounded-full hover:bg-slate-100 text-slate-500" title="Cancelar">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <!-- SELECTOR DE EMOJI -->
                    <div class="relative group">
                        <button id="btn-emoji" class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:border-sky-500 text-2xl flex items-center justify-center transition-colors">
                            ${currentIcon}
                        </button>
                        <div class="absolute top-12 left-0 w-64 bg-white shadow-2xl rounded-xl border border-slate-200 p-3 grid grid-cols-5 gap-2 hidden group-hover:grid z-50">
                            ${this.emojis.map(e => `<button class="btn-emoji-opt w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 rounded" data-emoji="${e}">${e}</button>`).join('')}
                        </div>
                    </div>
                    <div class="flex flex-col">
                        <h2 class="font-black text-lg text-slate-800 dark:text-white truncate max-w-[200px] md:max-w-md leading-tight">${this.node.name}</h2>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Modo Edición Visual</p>
                    </div>
                </div>
                
                <button id="btn-submit" class="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95">
                    <span>💾</span> <span class="hidden sm:inline">Guardar Cambios</span>
                </button>
            </div>

            <!-- BARRA DE HERRAMIENTAS (TOOLBAR) -->
            <div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-2 overflow-x-auto shadow-sm z-10 sticky top-0">
                <button class="tb-btn p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-bold w-10 text-center" data-cmd="bold" title="Negrita">B</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 italic w-10 text-center" data-cmd="italic" title="Cursiva">I</button>
                
                <div class="w-px h-6 bg-slate-300 mx-2"></div>
                
                <button class="tb-btn px-3 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm" data-cmd="formatBlock" data-val="h1">Título</button>
                <button class="tb-btn px-3 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm" data-cmd="formatBlock" data-val="h2">Subtítulo</button>
                <button class="tb-btn p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-cmd="insertUnorderedList" title="Lista">• Lista</button>
                
                <div class="w-px h-6 bg-slate-300 mx-2"></div>
                
                <button id="btn-add-img" class="px-3 py-1.5 rounded bg-blue-50 text-blue-600 font-bold text-sm hover:bg-blue-100 flex items-center gap-1">
                    🖼️ Imagen
                </button>
                <button id="btn-add-quiz" class="px-3 py-1.5 rounded bg-purple-100 text-purple-700 font-bold text-sm hover:bg-purple-200 flex items-center gap-1 border border-purple-200">
                    📝 Insertar Quiz
                </button>
            </div>

            <!-- AREA DE EDICIÓN (LA HOJA DE PAPEL) -->
            <div class="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 cursor-text p-4 md:p-8" onclick="document.getElementById('wysiwyg-editor').focus()">
                <div id="wysiwyg-editor" class="max-w-3xl mx-auto min-h-[500px] bg-white dark:bg-slate-900 shadow-xl rounded-xl p-8 md:p-12 outline-none prose prose-slate dark:prose-invert prose-lg" contenteditable="true">
                    ${this.markdownToVisual(this.originalContent)}
                </div>
                <div class="h-24"></div> <!-- Espacio extra al final -->
            </div>
            
            <!-- MODAL DE GUARDADO -->
            <dialog id="commit-dialog" class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-md w-full border border-slate-200">
                <h3 class="font-black text-xl mb-4 text-slate-800 dark:text-white">Confirmar Cambios</h3>
                <p class="text-sm text-slate-500 mb-2">Describe brevemente qué has cambiado para el historial:</p>
                <textarea id="commit-msg" class="w-full h-24 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4 border border-slate-200 outline-none text-sm dark:text-white font-medium" placeholder="Ej: Corregí la fecha de la batalla..."></textarea>
                <div class="flex justify-end gap-3">
                    <button id="btn-commit-cancel" class="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Volver</button>
                    <button id="btn-commit-confirm" class="px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-500 transition-colors">Publicar Cambios</button>
                </div>
            </dialog>
        </div>`;

        this.bindEvents();
    }

    bindEvents() {
        const editor = this.querySelector('#wysiwyg-editor');

        // Toolbar standard commands
        this.querySelectorAll('.tb-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                this.execCmd(btn.dataset.cmd, btn.dataset.val);
            };
        });

        // Insertar Bloques Especiales
        this.querySelector('#btn-add-quiz').onclick = (e) => { e.preventDefault(); this.insertQuizBlock(); };
        this.querySelector('#btn-add-img').onclick = (e) => { e.preventDefault(); this.insertImage(); };

        // Selector de Emoji
        this.querySelectorAll('.btn-emoji-opt').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.querySelector('#btn-emoji').textContent = e.target.dataset.emoji;
            };
        });

        // Eventos dinámicos (para botones de eliminar dentro de los bloques)
        this.bindDynamicEvents();

        // Cancelar y Salir
        this.querySelector('#btn-cancel').onclick = () => {
             if(confirm('¿Seguro que quieres salir? Se perderán los cambios no guardados.')) {
                 store.setModal(null);
             }
        };
        
        // Flujo de Guardado
        const dialog = this.querySelector('#commit-dialog');
        this.querySelector('#btn-submit').onclick = () => dialog.showModal();
        this.querySelector('#btn-commit-cancel').onclick = () => dialog.close();
        
        this.querySelector('#btn-commit-confirm').onclick = async () => {
            const msg = this.querySelector('#commit-msg').value.trim() || `Actualización de ${this.node.name}`;
            const btn = this.querySelector('#btn-commit-confirm');
            btn.disabled = true;
            btn.textContent = "Procesando...";
            
            // 1. Convertir Visual -> Markdown
            const finalMarkdown = this.visualToMarkdown(editor);

            // 2. Enviar a GitHub
            try {
                const prUrl = await github.createPullRequest(this.node.sourcePath, finalMarkdown, msg);
                alert("¡Cambios enviados con éxito! Se ha creado una propuesta de cambio.");
                window.open(prUrl, '_blank');
                dialog.close();
                store.setModal(null);
            } catch (e) {
                alert("Error al guardar: " + e.message);
                btn.disabled = false;
                btn.textContent = "Publicar Cambios";
            }
        };
    }

    bindDynamicEvents() {
        // Maneja los botones de eliminar dentro de los bloques generados
        this.querySelectorAll('.btn-delete-block').forEach(btn => {
            btn.onclick = (e) => {
                const block = e.target.closest('.arbor-visual-block');
                if(block) block.remove();
            };
        });
    }
}
customElements.define('arbor-editor', ArborEditor);
