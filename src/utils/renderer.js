

import { BLOCKS } from './editor-engine.js';

export const ContentRenderer = {
    renderBlock(b, ui, context) {
        const { getQuizState, isCompleted } = context;

        if (b.type === 'h1') return `<h1 id="${b.id}" class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-6 md:mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 tracking-tight">${b.text}</h1>`;
        if (b.type === 'h2') return `<h2 id="${b.id}" class="text-2xl md:text-3xl font-bold text-slate-800 dark:text-sky-100 mt-10 md:mt-12 mb-6 group flex items-center gap-3">${b.text}</h2>`;
        if (b.type === 'h3') return `<h3 id="${b.id}" class="text-xl font-bold text-slate-700 dark:text-slate-200 mt-8 mb-4 flex items-center gap-2"><span class="w-2 h-2 bg-sky-500 rounded-full"></span><span>${b.text}</span></h3>`;
        if (b.type === 'p') return `<p class="mb-6 text-slate-600 dark:text-slate-300 leading-8 text-base md:text-lg">${b.text}</p>`;
        
        if (b.type === 'blockquote') return `<blockquote class="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-400 p-6 my-8 rounded-r-xl italic text-slate-700 dark:text-yellow-100/80">"${b.text}"</blockquote>`;

        if (b.type === 'code') return `
            <div class="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                    <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-red-500/20"></div><div class="w-3 h-3 rounded-full bg-yellow-500/20"></div><div class="w-3 h-3 rounded-full bg-green-500/20"></div></div>
                    <span class="text-xs text-slate-500 font-mono uppercase">TERMINAL</span>
                </div><pre class="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">${b.text}</pre>
            </div>
        `;

        if (b.type === 'image') return `
            <figure class="my-10">
                <img src="${b.src}" class="rounded-xl shadow-lg w-full h-auto" loading="lazy">
                ${b.caption ? `<figcaption class="text-center text-sm text-slate-500 mt-2">${b.caption}</figcaption>` : ''}
            </figure>`;
            
        if (b.type === 'video') return `
            <div class="my-10">
                <div class="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
                    <iframe src="${b.src}" class="absolute top-0 left-0 w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            </div>`;
            
        if (b.type === 'audio') return `
            <div class="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm">
                <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full flex items-center justify-center text-xl">🎵</div>
                <audio controls class="w-full" src="${b.src}"></audio>
            </div>`;
        
        if (b.type === 'quiz') {
            const state = getQuizState(b.id);
            const total = b.questions.length;
            
            if (state.finished) {
                 const isExam = context.isExam;
                 const passingScore = isExam ? Math.ceil(total * 0.8) : total;
                 const didPass = state.score >= passingScore;

                 const icon = didPass ? '🏆' : '😔';
                 const bgColor = didPass ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';
                 const masteryMessage = isExam && didPass ? `<p class="text-green-600 font-bold mt-2">${ui.congrats} ${ui.branchMastered || 'BRANCH MASTERED!'}</p>` : '';
                 
                 let actionButtons = '';
                 if (isExam && didPass) {
                     actionButtons = `
                        <button id="btn-view-certificate" class="mt-4 w-full md:w-auto px-6 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ${ui.viewCert}
                        </button>
                     `;
                 } else {
                     actionButtons = `<button class="btn-quiz-retry mt-4 w-full md:w-auto px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold rounded-lg text-sm transition-colors" data-id="${b.id}">${ui.quizRetry}</button>`;
                 }

                 return `
                 <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 text-center py-4 animate-in fade-in zoom-in duration-300">
                        <div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl mb-4 shadow-xl ${bgColor}">
                            ${icon}
                        </div>
                        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-1">${ui.quizCompleted}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6">${ui.quizScore} <strong class="text-slate-900 dark:text-white">${state.score} / ${total}</strong></p>
                        ${masteryMessage}
                        ${actionButtons}
                    </div>
                 </div>`;
            }

            if (!state.started) {
                return `
                <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all text-center">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 py-4">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">${ui.quizTitle}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">${total} ${ui.quizIntro}</p>
                        <button class="btn-quiz-start w-full md:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-transform hover:scale-105 active:scale-95" data-id="${b.id}">${ui.quizStart}</button>
                    </div>
                </div>`;
            }
            
            const q = b.questions[state.currentIdx];
            return `
            <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                <div class="animate-in slide-in-from-right-8 duration-300 relative z-10">
                    <!-- Progress Bar -->
                    <div class="flex gap-1 mb-6">
                        ${Array(total).fill(0).map((_, i) => `<div class="h-1.5 flex-1 rounded-full transition-colors ${i <= state.currentIdx ? 'bg-purple-500' : 'bg-slate-200 dark:bg-slate-700'}"></div>`).join('')}
                    </div>

                    <span class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">${ui.quizQuestionPrefix} ${state.currentIdx + 1}</span>
                    <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 leading-snug">${q.question}</h3>
                    
                    <div class="space-y-3">
                        ${q.options.map((opt, i) => `
                            <button class="btn-quiz-ans w-full text-left p-4 rounded-xl border-2 font-bold transition-all duration-200 flex items-center gap-3 group bg-white dark:bg-slate-900/50 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
                             data-id="${b.id}" data-correct="${opt.correct}" data-total="${total}">
                                <span class="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-500 flex items-center justify-center text-[10px] group-hover:border-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors flex-shrink-0">${['A','B','C','D'][i]}</span>
                                <span>${opt.text}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }
        if (b.type === 'list') {
            return `<ul class="space-y-2 my-6 pl-4">${b.items.map(i => `<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300 leading-relaxed"><span class="mt-2 w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0"></span><span>${i}</span></li>`).join('')}</ul>`;
        }
        return '';
    }
}

export const AdminRenderer = {
    renderRecursiveTree(nodes, depth, context) {
        const { filter, expandedPaths, canEdit, ui, getCustomIcon } = context;
        
        const folders = nodes.filter(n => n.type === 'tree').sort((a,b) => a.path.localeCompare(b.path));
        const files = nodes.filter(n => n.type === 'blob').sort((a,b) => a.path.localeCompare(b.path));
        
        let html = '';
        
        folders.forEach(node => {
             const name = node.path.split('/').pop().replace(/_/g, ' ');
             
             let hasMatchingChildren = false;
             let childrenHtml = '';
             
             if (node.children && node.children.length > 0) {
                 childrenHtml = AdminRenderer.renderRecursiveTree(node.children, depth + 1, context);
                 hasMatchingChildren = childrenHtml.length > 0;
             }
             
             const selfMatch = filter ? name.toLowerCase().includes(filter) : true;
             
             if (!selfMatch && !hasMatchingChildren && filter) return; 

             const isExpanded = expandedPaths.has(node.path) || (filter && hasMatchingChildren);
             const canWrite = canEdit(node.path);
             const padding = depth * 12 + 10;
             const customIcon = getCustomIcon ? getCustomIcon(node.path) : null;

             html += `
             <div>
                <div class="flex items-center justify-between py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded text-sm group transition-colors ${!canWrite ? 'opacity-75' : ''}"
                     style="padding-left: ${padding}px"
                     onclick="window.toggleFolder('${node.path}')"
                     ondragover="window.handleDragOver(event)"
                     ondragleave="window.handleDragLeave(event)"
                     ondrop="window.handleDrop(event, '${node.path}', 'folder')"
                     data-path="${node.path}">
                    <div class="flex items-center gap-2 overflow-hidden">
                        <span class="text-slate-400 text-xs">${isExpanded ? '📂' : '📁'}</span>
                        ${customIcon ? `<span class="text-xs">${customIcon}</span>` : ''}
                        <span class="font-bold text-slate-700 dark:text-slate-300 truncate select-none">${name}</span>
                        ${!canWrite ? '<span class="text-[10px] ml-auto text-slate-400">🔒</span>' : ''}
                    </div>
                    
                    ${canWrite ? `
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="p-1 text-slate-400 hover:text-blue-500 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30" title="${ui.editorEdit}" onclick="event.stopPropagation(); window.editFile('${node.path}/meta.json')">⚙️</button>
                        <button class="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50 dark:hover:bg-orange-900/30" title="${ui.adminRename}" onclick="event.stopPropagation(); window.renameNode('${node.path}', 'folder')">✏️</button>
                        <button class="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/30" title="${ui.adminDelete}" onclick="event.stopPropagation(); window.deleteFileAction('${node.path}', 'folder')">🗑️</button>
                    </div>` : ''}
                </div>
                ${isExpanded ? `<div class="border-l border-slate-200 dark:border-slate-800 ml-4">${childrenHtml}</div>` : ''}
             </div>`;
        });

        files.forEach(node => {
            if (node.path.endsWith('meta.json')) return; 
            const name = node.path.split('/').pop().replace('.md', '').replace(/_/g, ' ');
            
            if (filter && !name.toLowerCase().includes(filter)) return;

            const padding = depth * 12 + 10;
            const canWrite = canEdit(node.path);
            
            html += `
            <div class="flex items-center justify-between py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded text-sm group file-item transition-colors"
                 style="padding-left: ${padding}px"
                 draggable="${canWrite}"
                 ondragstart="window.handleDragStart(event, '${node.path}', 'file')"
                 ondragover="window.handleDragOver(event)"
                 ondragleave="window.handleDragLeave(event)"
                 ondrop="window.handleDrop(event, '${node.path}', 'file')"
                 onclick="window.editFile('${node.path}')"
                 data-path="${node.path}">
                 
                <div class="flex items-center gap-2 overflow-hidden">
                    <span class="text-slate-400 text-xs">📄</span>
                    <span class="text-slate-600 dark:text-slate-400 truncate select-none">${name}</span>
                    ${!canWrite ? '<span class="text-[10px] ml-auto text-slate-400">🔒</span>' : ''}
                </div>

                ${canWrite ? `
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50 dark:hover:bg-orange-900/30" title="${ui.adminRename}" onclick="event.stopPropagation(); window.renameNode('${node.path}', 'file')">✏️</button>
                    <button class="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/30" title="${ui.adminDelete}" onclick="event.stopPropagation(); window.deleteFileAction('${node.path}', 'file')">🗑️</button>
                </div>` : ''}
            </div>`;
        });

        return html;
    },

    // New specialized renderer for Governance Mode
    renderGovernanceTree(nodes, depth, context) {
        const { getOwner, selectedPath, expandedPaths } = context;
        
        // Filter only Folders for Governance View
        const folders = nodes.filter(n => n.type === 'tree').sort((a,b) => a.path.localeCompare(b.path));
        
        let html = '';
        
        folders.forEach(node => {
             const name = node.path.split('/').pop().replace(/_/g, ' ');
             const isSelected = selectedPath === node.path;
             const isExpanded = expandedPaths.has(node.path);
             const owner = getOwner(node.path);
             
             // Use consistent indentation relative to nesting
             const padding = depth * 12 + 10;
             
             let childrenHtml = '';
             let hasChildren = node.children && node.children.some(c => c.type === 'tree');

             if (hasChildren && isExpanded) {
                 childrenHtml = AdminRenderer.renderGovernanceTree(node.children, depth + 1, context);
             }
             
             // Owner Badge Logic
             let ownerBadge = '';
             if (owner) {
                 ownerBadge = `<div class="flex items-center gap-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                    👤 ${owner.replace('@', '')}
                 </div>`;
             }
             
             const icon = hasChildren ? (isExpanded ? '📂' : '📁') : '📁';

             html += `
             <div>
                <div class="flex items-center justify-between py-2 px-2 cursor-pointer rounded-lg text-sm transition-all duration-200 border border-transparent 
                     ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}"
                     style="padding-left: ${padding}px"
                     onclick="window.selectGovNode('${node.path}')">
                    
                    <div class="flex items-center gap-2 overflow-hidden min-w-0">
                        <button class="text-slate-400 text-lg hover:text-slate-600 p-1 -ml-1 transition-transform" onclick="event.stopPropagation(); window.toggleFolder('${node.path}')">
                            ${icon}
                        </button>
                        <span class="font-bold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'} truncate select-none">${name}</span>
                    </div>
                    
                    <div class="flex-shrink-0 ml-2">
                        ${ownerBadge}
                    </div>
                </div>
                ${childrenHtml ? `<div class="border-l border-slate-100 dark:border-slate-800 ml-4">${childrenHtml}</div>` : ''}
             </div>`;
        });

        return html;
    }
};