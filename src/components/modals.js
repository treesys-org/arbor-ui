
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

// Admin Panel is essentially a modal
import './modals/admin.js';

class ArborModals extends HTMLElement {
    constructor() {
        super();
        this.lastRenderKey = null;
    }

    connectedCallback() {
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
            }
            return;
        }

        // 5. Standard Modals Router
        const type = modal.type || modal;
        const currentKey = `${type}-${modal.node?.id || ''}`;

        if (currentKey === this.lastRenderKey) return;
        this.lastRenderKey = currentKey;

        switch (type) {
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
            case 'sources': 
                this.innerHTML = `<arbor-modal-sources></arbor-modal-sources>`; 
                break;
            case 'about': 
                this.innerHTML = `<arbor-modal-about></arbor-modal-about>`; 
                break;
            case 'language': 
                this.innerHTML = `<arbor-modal-language></arbor-modal-language>`; 
                break;
            case 'impressum': 
                this.innerHTML = `<arbor-modal-impressum></arbor-modal-impressum>`; 
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
            default: 
                this.innerHTML = `<div class="p-8 bg-white m-4 rounded">Unknown modal: ${type}</div>`;
        }
    }
}

customElements.define('arbor-modals', ArborModals);
