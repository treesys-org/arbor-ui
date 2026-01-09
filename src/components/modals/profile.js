
import { store } from '../../store.js';

const EMOJI_DATA = {
    "General": ["👤", "🧑‍🏫", "🎓", "🧠", "💡", "✨", "🔥", "🚀", "⭐", "🎯"],
    "Nature": ["🌳", "🌲", "🌿", "🌱", "🍁", "🌸", "🌻", "🌍", "☀️", "🌙"],
    "Animals": ["🦉", "🦊", "🦋", "🐢", "🐘", "🦕", "🐝", "🦀", "🐠", "🐳"],
    "Science": ["🧬", "🔬", "⚗️", "⚛️", "🔭", "💊", "🦠", "🧪", "🧫", "🩺"],
    "Objects": ["📚", "📝", "💻", "🧭", "🔑", "💎", "⚙️", "🔔", "⏳", "🎨"]
};

class ArborModalProfile extends HTMLElement {
    constructor() {
        super();
        this.state = {
            showEmojiPicker: false,
            showRestoreInput: false
        };
    }

    connectedCallback() {
        this.render();
        // Close picker when clicking outside
        this.pickerListener = (e) => {
             if (this.state.showEmojiPicker && !e.target.closest('#emoji-picker') && !e.target.closest('#btn-avatar-picker')) {
                 this.state.showEmojiPicker = false;
                 this.render();
             }
        };
        document.addEventListener('click', this.pickerListener);
    }
    
    disconnectedCallback() {
        document.removeEventListener('click', this.pickerListener);
    }

    close() {
        store.setModal(null);
    }

    render() {
        const ui = store.ui;
        const g = store.value.gamification;
        const collectedItems = g.seeds || g.fruits || [];
        
        // Modal Wrapper
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>
                
                <div class="p-8 text-center h-full overflow-y-auto custom-scrollbar relative">
                    <div class="relative inline-block">
                        <button id="btn-avatar-picker" class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-4xl mb-2 relative group transition-transform hover:scale-105">
                            <span id="avatar-display">${g.avatar || '👤'}</span>
                            <div class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                EDIT
                            </div>
                        </button>
                        <div id="emoji-picker" class="${this.state.showEmojiPicker ? 'block' : 'hidden'} absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 z-50 p-2 h-64 overflow-y-auto custom-scrollbar">
                            ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                <div class="text-[10px] font-bold text-slate-400 mt-2 mb-1 px-1 uppercase">${cat}</div>
                                <div class="grid grid-cols-6 gap-1">
                                    ${emojis.map(e => `<button class="emoji-btn hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 text-lg">${e}</button>`).join('')}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <input id="inp-username" value="${g.username || ''}" placeholder="${ui.usernamePlaceholder}" class="text-2xl font-black mb-1 dark:text-white bg-transparent text-center w-full max-w-xs mx-auto outline-none focus:ring-2 focus:ring-sky-500 rounded-lg p-1 transition-all">
                    <p class="text-slate-500 dark:text-slate-400 mb-6">${g.xp} ${ui.xpUnit} • ${ui.streak}: ${g.streak} ${ui.days}</p>

                    <button id="btn-save-profile" class="mb-8 w-full max-w-xs mx-auto py-3 bg-sky-600 text-white font-bold rounded-xl shadow-lg hover:bg-sky-500 active:scale-95 transition-transform">${ui.saveProfile}</button>
                    
                    <div class="grid grid-cols-2 gap-4 mb-8">
                        <div class="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30">
                            <div class="text-2xl mb-1">🌰</div>
                            <div class="font-bold text-orange-800 dark:text-orange-400">${collectedItems.length} ${ui.seedsTitle || 'Seeds'}</div>
                        </div>
                         <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                            <div class="text-2xl mb-1">💧</div>
                            <div class="font-bold text-blue-800 dark:text-blue-400">${g.streak} ${ui.days}</div>
                        </div>
                    </div>

                    <!-- BACKPACK SECTION -->
                    <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 text-left mb-6 relative overflow-hidden">
                        <div class="absolute -right-6 -top-6 text-9xl opacity-5 pointer-events-none select-none">🎒</div>
                        
                        <h3 class="font-black text-slate-700 dark:text-slate-200 text-lg mb-2 relative z-10 flex items-center gap-2">
                            <span>🎒</span> ${ui.backpackTitle || 'BACKPACK'}
                        </h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 relative z-10 leading-relaxed">
                            ${ui.backpackDesc || 'Your progress lives in this browser. Download a file to back it up or move it to another device.'}
                        </p>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
                            <button id="btn-export-progress" class="py-3 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                                <span>📤</span> <span>${ui.backupBtn || 'Export File'}</span>
                            </button>
                            
                            <button id="btn-show-restore" class="py-3 px-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                <span>📥</span> <span>${ui.restoreBtn || 'Import File'}</span>
                            </button>
                        </div>

                        <!-- Hidden Restore Input -->
                        <div id="restore-area" class="${this.state.showRestoreInput ? 'block' : 'hidden'} mt-4 animate-in slide-in-from-top-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <input type="file" id="file-importer" class="hidden" accept=".json,application/json">
                            <button id="btn-select-file" class="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-sky-500 hover:text-sky-400 transition-colors">
                                <span>📂</span>
                                <span>${ui.selectFilePrompt || 'Click to select backup file'}</span>
                            </button>
                        </div>
                    </div>

                    <!-- SEEDS GRID -->
                    <div class="text-left">
                        <h3 class="font-bold text-xs uppercase text-slate-400 mb-4 tracking-widest">${ui.gardenTitle || 'My Seed Collection'}</h3>
                        ${collectedItems.length === 0 
                            ? `<div class="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center text-slate-400 text-sm">${ui.gardenEmpty}</div>`
                            : `<div class="grid grid-cols-5 sm:grid-cols-6 gap-2">
                                ${collectedItems.map(s => `
                                    <div class="aspect-square bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-2xl shadow-sm border border-slate-100 dark:border-slate-700" title="${s.id}">
                                        ${s.icon}
                                    </div>
                                `).join('')}
                               </div>`
                        }
                    </div>
                </div>
            </div>
        </div>`;
        
        this.bindEvents();
    }

    bindEvents() {
        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelector('#btn-avatar-picker').onclick = (e) => {
            e.stopPropagation();
            this.state.showEmojiPicker = !this.state.showEmojiPicker;
            this.render();
        };

        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const avatarDisplay = this.querySelector('#avatar-display');
                if (avatarDisplay) avatarDisplay.textContent = e.currentTarget.textContent;
                this.state.showEmojiPicker = false;
                this.render();
            };
        });

        const btnSave = this.querySelector('#btn-save-profile');
        if (btnSave) {
            btnSave.onclick = () => {
                const username = this.querySelector('#inp-username').value.trim();
                const avatar = this.querySelector('#avatar-display').textContent;
                store.updateUserProfile(username, avatar);
            };
        }

        const btnExport = this.querySelector('#btn-export-progress');
        if (btnExport) {
            btnExport.onclick = () => {
                store.downloadProgressFile();
            };
        }

        const btnShowRestore = this.querySelector('#btn-show-restore');
        if (btnShowRestore) {
            btnShowRestore.onclick = () => {
                this.state.showRestoreInput = !this.state.showRestoreInput;
                this.render();
            };
        }

        const btnSelectFile = this.querySelector('#btn-select-file');
        const fileInput = this.querySelector('#file-importer');
        if (btnSelectFile && fileInput) {
            btnSelectFile.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const fileContent = event.target.result;
                    if (fileContent) {
                        const success = store.importProgress(fileContent);
                        if (success) {
                            alert(store.ui.importSuccess);
                            this.close();
                        } else {
                            alert(store.ui.importError);
                        }
                    }
                };
                reader.readAsText(file);
            };
        }
    }
}
customElements.define('arbor-modal-profile', ArborModalProfile);
