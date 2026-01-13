
import { store } from '../../store.js';

class ArborModalPrivacy extends HTMLElement {
    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    close() {
        store.setModal(null);
    }

    openImpressum() {
        store.setModal('impressum');
    }

    render() {
        const ui = store.ui;
        
        let privacyHtml = ui.privacyText || "Legal text not loaded.";
        
        // REPLACEMENT LOGIC:
        // Instead of showing the full address here, we provide a link to the Impressum.
        // This satisfies GDPR (identifying the controller) via reference, without exposing
        // personal data visually in two places.
        const controllerReference = `
            <div class="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">
                    ${ui.impressumText || "The data controller is the publisher of this application."}
                </p>
                <button id="btn-link-impressum" class="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold flex items-center gap-2 transition-colors">
                    <span>👤</span> <span>${ui.showImpressumDetails || "View Publisher Details (Impressum)"}</span> ➜
                </button>
            </div>
        `;

        // Replace the placeholder {impressum} with the link button
        privacyHtml = privacyHtml.replace('{impressum}', controllerReference);

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                
                <!-- Header -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🛡️</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${ui.privacyTitle || "Privacy & Data Protection"}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <!-- Content -->
                <div class="p-8 overflow-y-auto custom-scrollbar">
                    <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose">
                            <p class="text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                                🇩🇪 <strong>Hinweis für Nutzer in Deutschland:</strong><br>
                                Diese Anwendung speichert standardmäßig alle Daten lokal in Ihrem Browser (LocalStorage). 
                                Eine Datenübertragung an Dritte (z.B. Puter.com) findet NUR statt, wenn Sie sich explizit verbinden.
                            </p>
                        </div>

                        ${privacyHtml}
                        
                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        
                        <h3>Technical Services (Processors)</h3>
                        <ul class="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-4 rounded-lg list-none space-y-2">
                            <li><strong>Hosting:</strong> GitHub Pages (USA)</li>
                            <li><strong>AI & Sync (Optional):</strong> Puter.com (USA)</li>
                            <li><strong>Fonts:</strong> Google Fonts (via CDN)</li>
                            <li><strong>Styles:</strong> TailwindCSS (via CDN)</li>
                        </ul>

                    </div>
                </div>
                
                <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center shrink-0">
                    <button class="btn-close w-full py-3 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
                        ${ui.close || "Close"}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.close());
        
        const btnLink = this.querySelector('#btn-link-impressum');
        if (btnLink) btnLink.onclick = () => this.openImpressum();
    }
}
customElements.define('arbor-modal-privacy', ArborModalPrivacy);
