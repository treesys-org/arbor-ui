

import { store } from '../store.js';
import { aiService } from '../services/ai.js';

class ArborSage extends HTMLElement {
    constructor() {
        super();
        this.isVisible = false;
        this.mode = 'chat'; // 'chat' | 'settings'
        
        // Historial de chat local (efímero, se borra al recargar)
        this.localMessages = []; 
        this.currentModalRef = null;
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.checkState());
    }

    checkState() {
        const modal = store.value.modal;
        
        // Check if this is a NEW request via reference equality
        const isNewRequest = modal !== this.currentModalRef;
        this.currentModalRef = modal;

        // El modal ahora puede ser un objeto { type: 'sage', mode: 'settings' }
        if (modal && (modal === 'sage' || modal.type === 'sage')) {
            const requestedMode = modal.mode || 'chat';
            
            if (isNewRequest) {
                // If the same mode is requested while visible, toggle close
                if (this.isVisible && this.mode === requestedMode) {
                    this.close();
                } else {
                    // Open or switch mode
                    this.isVisible = true;
                    this.mode = requestedMode;
                    
                    // Si piden chat y no hay key, forzar settings
                    if (this.mode === 'chat' && !aiService.isSmartMode()) {
                        this.mode = 'settings';
                        this.localMessages.push({ role: 'assistant', content: "🦉 Para chatear conmigo sobre las lecciones, necesito que configures tu llave de Gemini primero." });
                    }

                    // NOTE: Do NOT clear global state here, or it will cause recursive closing issues.
                    this.render();
                }
            }
            // If it's not a new request (unrelated state change), do nothing, keep current state
        } else if (this.isVisible) {
             // Si el modal global cambió a otra cosa (null o otro tipo), cerrar Sage
             this.close();
        }
    }
    
    close() {
        this.isVisible = false;
        this.innerHTML = '';
        this.className = ''; // IMPORTANT: Clear backdrop/position classes
        // Explicitly clear global state on close
        store.setModal(null);
    }

    saveApiKey() {
        const inp = this.querySelector('#inp-api-key');
        if (inp && inp.value.trim()) {
            aiService.setApiKey(inp.value.trim());
            store.initSage();
            // Ir al chat tras guardar
            this.mode = 'chat';
            this.render();
        }
    }

    clearApiKey() {
        aiService.setApiKey(null);
        this.mode = 'settings';
        this.render();
    }
    
    async runQuickAction(action) {
        if (!aiService.isSmartMode()) return;
        
        let prompt = '';
        if (action === 'summarize') prompt = "Summarize this lesson in 3 bullet points.";
        if (action === 'explain') prompt = "Explain the main concept simply.";
        if (action === 'quiz') prompt = "Give me a test question about this.";
        if (prompt) store.chatWithSage(prompt);
    }

    render() {
        if (!this.isVisible) {
            this.innerHTML = '';
            this.className = '';
            return;
        }

        const isSmart = aiService.isSmartMode();

        if (this.mode === 'settings') {
            this.renderSettings(isSmart);
        } else {
            this.renderChat(isSmart);
        }
    }

    renderSettings(isSmart) {
        // Modal centrado para configuración
        this.className = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4";
        
        this.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">⚙️</span>
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white">Configuración del Sabio</h3>
                            <p class="text-xs text-slate-500">Conecta tu propia inteligencia</p>
                        </div>
                    </div>
                    <button class="btn-close text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">✕</button>
                </div>
                
                <div class="p-8 space-y-6">
                    <div class="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-800/30">
                        <p class="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2">Google Gemini API Key</p>
                        <input id="inp-api-key" type="password" placeholder="Pegar API Key aquí..." class="w-full text-sm p-3 border-2 border-purple-200 dark:border-purple-800 rounded-xl bg-white dark:bg-slate-900 focus:ring-4 focus:ring-purple-200 outline-none transition-all font-mono text-slate-800 dark:text-white" value="${isSmart ? '****************' : ''}">
                        <p class="text-[10px] text-slate-500 mt-2">
                           La llave se guarda en tu navegador. Arbor no tiene servidores.
                        </p>
                    </div>

                    <div class="space-y-3">
                        <button id="btn-save-key" class="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                            <span>💾</span> GUARDAR Y ACTIVAR
                        </button>
                        
                        ${isSmart ? `
                        <button id="btn-clear-key" class="w-full py-3 border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold rounded-xl transition-transform active:scale-95 text-xs">
                            BORRAR LLAVE
                        </button>` : `
                        <div class="text-center pt-2">
                             <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-xs text-blue-500 hover:underline font-bold">Obtener API Key gratis en Google AI Studio ↗</a>
                        </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-save-key').onclick = () => this.saveApiKey();
        const btnClear = this.querySelector('#btn-clear-key');
        if(btnClear) btnClear.onclick = () => this.clearApiKey();
    }

    renderChat(isSmart) {
        // Chat flotante estilo widget
        this.className = "fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none";

        const aiState = store.value.ai;
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ role: 'assistant', content: "🦉 Hola. Hazme preguntas sobre esta lección." }];
        const displayStatus = aiState.status;

        this.innerHTML = `
            <div class="pointer-events-auto transition-all duration-300 origin-bottom md:origin-bottom-right shadow-2xl md:rounded-2xl w-full md:w-[380px] h-[85vh] md:h-[600px] bg-white dark:bg-slate-900 flex flex-col border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-10 fade-in">
                
                <!-- Header -->
                <div class="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center shadow-md z-10 shrink-0 rounded-t-2xl">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm shadow-inner">🦉</div>
                        <div>
                            <h3 class="font-black text-sm leading-none">Sabio de Arbor</h3>
                            <div class="flex items-center gap-1 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                <p class="text-[10px] opacity-80 font-medium">Gemini Online</p>
                            </div>
                        </div>
                    </div>
                    <button class="btn-close w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">✕</button>
                </div>
                
                <!-- Messages -->
                <div id="sage-chat-area" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/30 custom-scrollbar scroll-smooth">
                     ${displayMessages.map(m => `
                        <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                            <div class="max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm relative group text-left
                                ${m.role === 'user' 
                                    ? 'bg-purple-600 text-white rounded-br-none' 
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'
                                }">
                                ${this.formatMessage(m.content)}
                            </div>
                        </div>
                     `).join('')}
                     
                     ${displayStatus === 'thinking' ? `
                        <div class="flex justify-start">
                            <div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 w-16 justify-center">
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.1s"></div>
                                <div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div>
                            </div>
                        </div>
                     ` : ''}
                </div>

                <!-- Quick Actions -->
                <div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-100 dark:border-purple-800" data-action="summarize">📝 Resumir Lección</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 Explicar Concepto</button>
                    <button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors border border-green-100 dark:border-green-800" data-action="quiz">❓ Quiz Rápido</button>
                </div>

                <!-- Input -->
                <form id="sage-form" class="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0">
                    <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder:text-slate-400" placeholder="Pregunta sobre la lección..." autocomplete="off">
                    <button type="submit" class="w-11 h-11 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-all flex items-center justify-center shadow-lg active:scale-95">
                        <svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    </button>
                </form>
            </div>
        `;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        const area = this.querySelector('#sage-chat-area');
        if(area) area.scrollTop = area.scrollHeight;

        const form = this.querySelector('#sage-form');
        form.onsubmit = (e) => {
             e.preventDefault();
             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 store.chatWithSage(inp.value.trim());
                 inp.value = '';
             }
        };

        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });
    }

    formatMessage(text) {
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        
        formatted = formatted.replace(
            /\[(.*?)\]\((.*?)\)/g, 
            '<a href="$2" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1 font-bold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>$1</a>'
        );
        return formatted;
    }
}
customElements.define('arbor-sage', ArborSage);