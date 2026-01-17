
import { store } from '../store.js';

// Sub-components
import './modals/search.js';
import './modals/profile.js';
import './modals/certificates.js';
import './modals/preview.js';
import './modals/welcome.js';
import './modals/sources.js';
import './modals/about.js';
import './modals/language.js';
import './modals/impressum.js';
import './modals/export-pdf.js';
import './modals/certificate-view.js';
import './modals/empty-module.js';
import './modals/privacy.js';
import './modals/arcade.js'; 
import './modals/game-player.js';
import './modals/security-warning.js';
import './modals/load-warning.js';
import './modals/releases.js'; 
import './modals/node-properties.js'; 
import './modals/dialog.js';
import './modals/manual.js';
import './modals/readme.js'; // NEW

// Admin Panel is essentially a modal
import './modals/admin.js';

class ArborModals extends HTMLElement {
    constructor() {
        super();
        this.lastRenderKey = null;
    }

    connectedCallback() {
        // Initial check in case store state was set before this component loaded
        this.checkRender();
        
        store.addEventListener('state-change', () => {
            this.checkRender();
        });
    }

    checkRender() {
        const { modal, viewMode, previewNode } = store.value;

        // 1. Delegated Modals (Handled by their own components outside this container)
        if (modal && (modal === 'sage' || modal.type === 'sage')) return; // Handled by <arbor-sage>
        if (modal && modal.type === 'editor') return; // Handled by <arbor-editor>

        // 2. View Modes that act like modals (Certificates Dashboard)
        if (viewMode === 'certificates' && modal?.type !== 'certificate') { 
             if (this.lastRenderKey !== 'certificates') {
                 this.innerHTML = `<arbor-modal-certificates></arbor-modal-certificates>`;
                 this.lastRenderKey = 'certificates';
                 this.setFocus();
             }
             return;
        }

        // 3. Cleanup if no modal
        if (!modal && !previewNode) { 
            if (this.innerHTML !== '') {
                this.innerHTML = ''; 
                this.lastRenderKey = null;
            }
            return; 
        }
        
        // 4. Preview Modal (Priority over others)
        if (previewNode) {
            const key = `preview-${previewNode.id}`;
            if (this.lastRenderKey !== key) {
                this.innerHTML = `<arbor-modal-preview></arbor-modal-preview>`;
                this.lastRenderKey = key;
                this.setFocus();
            }
            return;
        }

        // 5. Standard Modals Router
        const type = modal.type || modal; // Handle string vs object
        const currentKey = `${type}-${modal.node?.id || modal.url || ''}`;

        // Don't skip render for generic 'dialog' type as its content changes without changing 'type' key
        if (type !== 'dialog' && currentKey === this.lastRenderKey) return;
        this.lastRenderKey = currentKey;

        switch (type) {
            case 'dialog':
                this.innerHTML = `<arbor-modal-dialog></arbor-modal-dialog>`;
                break;
            case 'search':
                this.innerHTML = `<arbor-modal-search></arbor-modal-search>`;
                break;
            case 'profile':
                this.innerHTML = `<arbor-modal-profile></arbor-modal-profile>`;
                break;
            case 'contributor':
                this.innerHTML = `
                <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
                    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-[95vw] h-[90vh] max-w-6xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                        <arbor-admin-panel class="w-full h-full flex flex-col"></arbor-admin-panel>
                    </div>
                </div>`;
                break;
            case 'welcome': 
            case 'tutorial': 
                this.innerHTML = `<arbor-modal-welcome></arbor-modal-welcome>`; 
                break;
            case 'manual':
                this.innerHTML = `<arbor-modal-manual></arbor-modal-manual>`;
                break;
            case 'sources': 
                this.innerHTML = `<arbor-modal-sources></arbor-modal-sources>`; 
                break;
            case 'releases': 
                this.innerHTML = `<arbor-modal-releases></arbor-modal-releases>`; 
                break;
            case 'readme': 
                this.innerHTML = `<arbor-modal-readme></arbor-modal-readme>`; 
                break;
            case 'security-warning':
                this.innerHTML = `<arbor-modal-security-warning></arbor-modal-security-warning>`;
                break;
            case 'load-warning':
                this.innerHTML = `<arbor-modal-load-warning></arbor-modal-load-warning>`;
                break;
            case 'arcade': 
                this.innerHTML = `<arbor-modal-arcade></arbor-modal-arcade>`; 
                break;
            case 'game-player': 
                this.innerHTML = `<arbor-modal-game-player></arbor-modal-game-player>`; 
                break;
            case 'about': 
                this.innerHTML = `<arbor-modal-about></arbor-modal-about>`; 
                break;
            case 'language': 
                this.innerHTML = `<arbor-modal-language></arbor-modal-language>`; 
                break;
            case 'impressum': 
                this.innerHTML = `<arbor-modal-about></arbor-modal-about>`; 
                break;
            case 'privacy': 
                this.innerHTML = `<arbor-modal-about></arbor-modal-about>`; 
                break;
            case 'emptyModule': 
                this.innerHTML = `<arbor-modal-empty-module></arbor-modal-empty-module>`; 
                break;
            case 'certificate': 
                this.innerHTML = `<arbor-modal-certificate-view></arbor-modal-certificate-view>`; 
                break;
            case 'export-pdf': 
                this.innerHTML = `<arbor-modal-export-pdf></arbor-modal-export-pdf>`; 
                break;
            case 'node-properties': 
                this.innerHTML = `<arbor-modal-node-properties></arbor-modal-node-properties>`; 
                break;
            default: 
                this.innerHTML = `<div class="p-8 bg-white m-4 rounded">Unknown modal: ${type}</div>`;
        }
        this.setFocus();
    }

    setFocus() {
        setTimeout(() => {
            const focusable = this.querySelector('[autofocus], input, button, a[href]');
            if (focusable) {
                focusable.focus();
            }
        }, 50);
    }
}

customElements.define('arbor-modals', ArborModals);
