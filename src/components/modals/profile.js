
import { store } from '../../store.js';

// Comprehensive Emoji Data
const EMOJI_DATA = {
    "Faces": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"],
    "People": ["👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲", "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳‍♂️", "🧕", "👮‍♀️", "👮‍♂️", "👷‍♀️", "👷‍♂️", "💂‍♀️", "💂‍♂️", "🕵️‍♀️", "🕵️‍♂️", "👩‍⚕️", "👨‍⚕️", "👩‍🌾", "👨‍🌾", "👩‍🍳", "👨‍🍳", "👩‍🎓", "👨‍🎓", "👩‍🎤", "👨‍🎤", "👩‍🏫", "👨‍🏫", "👩‍🏭", "👨‍🏭", "👩‍💻", "👨‍💻", "👩‍💼", "👨‍💼", "👩‍🔧", "👨‍🔧", "👩‍🔬", "👨‍🔬", "👩‍🎨", "👨‍🎨", "👩‍🚒", "👨‍🚒", "👩‍✈️", "👨‍✈️", "👩‍🚀", "👨‍🚀", "👩‍⚖️", "👨‍⚖️", "👰", "🤵", "👸", "🤴", "🦸‍♀️", "🦸‍♂️", "🦹‍♀️", "🦹‍♂️", "🤶", "🎅", "🧙‍♀️", "🧙‍♂️", "🧝‍♀️", "🧝‍♂️", "🧛‍♀️", "🧛‍♂️", "🧟‍♀️", "🧟‍♂️", "🧞‍♀️", "🧞‍♂️", "🧜‍♀️", "🧜‍♂️", "🧚‍♀️", "🧚‍♂️", "👼", "🤰", "🤱", "🙇‍♀️", "🙇‍♂️", "💁‍♀️", "💁‍♂️", "🙅‍♀️", "🙅‍♂️", "🙆‍♀️", "🙆‍♂️", "🙋‍♀️", "🙋‍♂️", "🧏‍♀️", "🧏‍♂️", "🤦‍♀️", "🤦‍♂️", "🤷‍♀️", "🤷‍♂️"],
    "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🐾", "🐉", "🐲"]
};

class ArborModalProfile extends HTMLElement {
    constructor() {
        super();
        this.state = {
            showEmojiPicker: false,
            showRestoreInput: false,
            showLoginWarning: false,
            tempAvatar: store.value.gamification.avatar || '👤',
            tempUsername: store.value.gamification.username || ''
        };
        this.lastRenderKey = null;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
        
        this.pickerListener = (e) => {
             if (this.state.showEmojiPicker && !e.target.closest('#emoji-picker') && !e.target.closest('#btn-avatar-picker')) {
                 this.state.showEmojiPicker = false;
                 this.updateView();
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

    updateView() {
        const picker = this.querySelector('#emoji-picker');
        if (picker) {
             if (this.state.showEmojiPicker) picker.classList.remove('hidden');
             else picker.classList.add('hidden');
        }

        const restoreArea = this.querySelector('#restore-area');
        if (restoreArea) {
             if (this.state.showRestoreInput) restoreArea.classList.remove('hidden');
             else restoreArea.classList.add('hidden');
        }

        const warningOverlay = this.querySelector('#login-warning-overlay');
        if (warningOverlay) {
            if (this.state.showLoginWarning) warningOverlay.classList.remove('hidden');
            else warningOverlay.classList.add('hidden');
        }

        const avatarDisplay = this.querySelector('#avatar-display');
        if (avatarDisplay) avatarDisplay.textContent = this.state.tempAvatar;
    }

    render() {
        const ui = store.ui;
        const g = store.value.gamification;
        const collectedItems = g.seeds || g.fruits || [];
        const puterUser = store.value.puterUser;
        const isSyncing = store.value.isSyncing;
        const lang = store.value.lang;
        const theme = store.value.theme;
        
        // Anti-Flicker Key
        const renderKey = JSON.stringify({
            lang, theme,
            username: g.username,
            avatar: g.avatar,
            xp: g.xp,
            streak: g.streak,
            seeds: collectedItems.length,
            puterUser: puterUser ? puterUser.username : null,
            isSyncing,
            localAvatar: this.state.tempAvatar,
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const focusedId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <!-- Increased width to max-w-2xl AND height to 700px -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto" style="height: 700px; max-height: 90vh;">
                <button class="btn-close absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors z-50 backdrop-blur-sm">✕</button>
                
                <div class="p-6 md:p-8 text-center h-full overflow-y-auto custom-scrollbar relative flex flex-col">
                    
                    <!-- IDENTITY SECTION -->
                    <div class="mb-8">
                        <div class="relative inline-block mb-4">
                            <button id="btn-avatar-picker" class="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl relative group transition-transform hover:scale-105 shadow-sm border-2 border-slate-100 dark:border-slate-700">
                                <span id="avatar-display">${this.state.tempAvatar}</span>
                                <div class="absolute inset-0 bg-black/10 dark:bg-black/40 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                    ✏️
                                </div>
                            </button>
                            <!-- Picker -->
                            <div id="emoji-picker" class="hidden absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 md:w-80 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 z-50 p-0 h-72 overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200 text-left">
                                ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                    <div class="text-xs font-bold text-slate-400 px-3 py-2 uppercase tracking-wider text-left sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-700 z-10">${cat}</div>
                                    <div class="grid grid-cols-6 gap-1 p-2">
                                        ${emojis.map(e => `<button class="emoji-btn hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-2 text-xl transition-colors">${e}</button>`).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <input id="inp-username" value="${this.state.tempUsername}" placeholder="${ui.usernamePlaceholder}" class="text-2xl font-black text-slate-800 dark:text-white bg-transparent text-center w-full max-w-xs mx-auto outline-none focus:ring-0 border-b-2 border-transparent focus:border-sky-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600">
                        
                        <div class="flex items-center justify-center gap-2 mt-3">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold">
                                💧 ${g.streak} ${ui.days}
                            </span>
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold">
                                ☀️ ${g.xp} XP
                            </span>
                        </div>

                        <button id="btn-save-profile" class="mt-4 text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline opacity-80 hover:opacity-100">
                            ${ui.saveProfile}
                        </button>
                    </div>

                    <!-- CLOUD SYNC CARD -->
                    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl mb-6 relative overflow-hidden shadow-sm text-left">
                        
                        <!-- Login Warning Overlay -->
                        <div id="login-warning-overlay" class="hidden absolute inset-0 z-20 bg-white/95 dark:bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                            <h4 class="font-black text-slate-800 dark:text-white mb-2 text-sm">${ui.syncLoginWarningTitle || "Cloud Sync"}</h4>
                            <p class="text-xs text-slate-500 mb-4 leading-relaxed">${ui.syncLoginWarningBody || "Your local progress will be synced."}</p>
                            <div class="flex gap-2 w-full">
                                <button id="btn-cancel-login" class="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">${ui.cancel}</button>
                                <button id="btn-confirm-login" class="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-colors shadow-md">${ui.syncLoginConfirm || "Log In"}</button>
                            </div>
                        </div>

                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">
                                    ☁️
                                </div>
                                <div>
                                    <h3 class="font-bold text-slate-800 dark:text-white text-sm">Cloud Sync</h3>
                                    ${puterUser 
                                        ? `<p class="text-xs text-indigo-500 font-medium">@${puterUser.username}</p>` 
                                        : `<p class="text-xs text-slate-400">Offline</p>`
                                    }
                                </div>
                            </div>

                            ${puterUser ? `
                                <button id="btn-disconnect-puter" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-600 dark:text-slate-300 hover:text-red-500 rounded-lg text-xs font-bold transition-colors">
                                    Sign Out
                                </button>
                            ` : `
                                <button id="btn-show-login-warning" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-md active:scale-95 transition-transform">
                                    Connect
                                </button>
                            `}
                        </div>
                        ${isSyncing ? '<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 animate-pulse"></div>' : ''}
                    </div>

                    <!-- DATA MANAGEMENT (Backpack) -->
                    <div class="mb-8">
                        <div class="grid grid-cols-2 gap-3">
                            <button id="btn-export-progress" class="py-3 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-1 group">
                                <span class="text-xl group-hover:-translate-y-0.5 transition-transform">📤</span> 
                                <span class="text-xs">${ui.backupBtn || 'Export'}</span>
                            </button>
                            
                            <button id="btn-show-restore" class="py-3 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-1 group">
                                <span class="text-xl group-hover:-translate-y-0.5 transition-transform">📥</span> 
                                <span class="text-xs">${ui.restoreBtn || 'Import'}</span>
                            </button>
                        </div>

                        <!-- Hidden Restore Input -->
                        <div id="restore-area" class="hidden mt-3">
                            <input type="file" id="file-importer" class="hidden" accept=".json,application/json">
                            <button id="btn-select-file" class="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-sky-500 hover:text-sky-500 transition-colors text-xs font-bold">
                                <span>📂</span> ${ui.selectFilePrompt || 'Select file...'}
                            </button>
                        </div>
                    </div>

                    <!-- SEEDS GRID -->
                    <div class="text-left flex-1">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-bold text-xs uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                🌰 ${ui.gardenTitle || 'Seeds'}
                            </h3>
                            <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">${collectedItems.length}</span>
                        </div>
                        
                        ${collectedItems.length === 0 
                            ? `<div class="p-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl text-center text-slate-400 text-xs italic">${ui.gardenEmpty}</div>`
                            : `<div class="grid grid-cols-5 sm:grid-cols-6 gap-2">
                                ${collectedItems.map(s => `
                                    <div class="aspect-square bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:scale-110 transition-transform cursor-help" title="${s.id}">
                                        ${s.icon}
                                    </div>
                                `).join('')}
                               </div>`
                        }
                    </div>
                    
                    <div class="mt-8 text-center">
                        <button id="btn-open-privacy" class="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline transition-colors">${ui.syncPrivacyNote}</button>
                    </div>
                </div>
            </div>
        </div>`;
        
        this.bindEvents();
        this.updateView();

        if (focusedId) {
            const el = document.getElementById(focusedId);
            if (el) {
                el.focus();
                if (selectionStart !== null && el.setSelectionRange) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }
    
    bindEvents() {
        this.querySelector('.btn-close').onclick = () => this.close();
        
        const btnShowWarning = this.querySelector('#btn-show-login-warning');
        if (btnShowWarning) {
            btnShowWarning.onclick = () => {
                this.state.showLoginWarning = true;
                this.updateView();
            };
        }

        const btnConfirm = this.querySelector('#btn-confirm-login');
        if (btnConfirm) {
            btnConfirm.onclick = () => {
                this.state.showLoginWarning = false;
                this.updateView();
                store.connectPuter();
            };
        }

        const btnCancelLogin = this.querySelector('#btn-cancel-login');
        if (btnCancelLogin) {
            btnCancelLogin.onclick = () => {
                this.state.showLoginWarning = false;
                this.updateView();
            };
        }

        const btnDisconnect = this.querySelector('#btn-disconnect-puter');
        if(btnDisconnect) btnDisconnect.onclick = () => store.disconnectPuter();
        
        const btnPrivacy = this.querySelector('#btn-open-privacy');
        if (btnPrivacy) btnPrivacy.onclick = () => store.setModal('privacy');

        this.querySelector('#btn-avatar-picker').onclick = (e) => {
            e.stopPropagation();
            this.state.showEmojiPicker = !this.state.showEmojiPicker;
            this.updateView();
        };

        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.state.tempAvatar = e.currentTarget.textContent;
                this.state.showEmojiPicker = false;
                this.updateView();
                this.render(); 
            };
        });
        
        const inpUsername = this.querySelector('#inp-username');
        if (inpUsername) {
            inpUsername.oninput = (e) => {
                this.state.tempUsername = e.target.value;
            };
        }

        const btnSave = this.querySelector('#btn-save-profile');
        if (btnSave) {
            btnSave.onclick = () => {
                const username = this.state.tempUsername.trim();
                const avatar = this.state.tempAvatar;
                store.updateUserProfile(username, avatar);
            };
        }

        const btnExport = this.querySelector('#btn-export-progress');
        if (btnExport) btnExport.onclick = () => store.downloadProgressFile();

        const btnShowRestore = this.querySelector('#btn-show-restore');
        if (btnShowRestore) {
            btnShowRestore.onclick = () => {
                this.state.showRestoreInput = !this.state.showRestoreInput;
                this.updateView();
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
                    if (store.importProgress(event.target.result)) {
                        alert(store.ui.importSuccess);
                        this.close();
                    } else {
                        alert(store.ui.importError);
                    }
                };
                reader.readAsText(file);
            };
        }
    }
}
customElements.define('arbor-modal-profile', ArborModalProfile);
