
import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.g = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;
        this.duration = 400; 
        this.nodePositions = new Map();
        
        // Construction State
        this.dragLine = null;
        this.selectedNodeId = null; 
        this.hoveredNodeId = null;
        this.isMoveMode = false; // Controls if drag is enabled
        
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    connectedCallback() {
        // BLUEPRINT & INTERACTION CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .blueprint-grid {
                background-color: #1e293b; /* Slate 800 */
                background-image: 
                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                background-size: 40px 40px;
            }
            .blueprint-node circle { stroke: #f59e0b; stroke-width: 2px; stroke-dasharray: 4,2; transition: all 0.2s; }
            .blueprint-node text { fill: #cbd5e1; font-family: monospace; }
            .blueprint-link { stroke: #475569 !important; stroke-dasharray: 4,4; }
            
            /* Dragging Visuals */
            .drag-line { stroke: #f59e0b; stroke-width: 3px; stroke-dasharray: 5,5; pointer-events: none; }
            .drop-target circle { fill: rgba(34, 197, 94, 0.2) !important; stroke: #22c55e !important; stroke-width: 4px; stroke-dasharray: 0; }
            
            /* Selection State */
            .node.selected .node-body { 
                /* Note: Fill color is handled in JS for transition smoothness, 
                   but we add stroke/filter here for extra emphasis */
                stroke-width: 4px; 
                filter: drop-shadow(0 0 15px rgba(239, 68, 68, 0.4)); /* Red glow */
                stroke-dasharray: 0;
            }
            .node.selected text { font-weight: bold; fill: #fff; }
            
            /* Architect Dock - Contextual Position */
            .architect-dock {
                position: absolute; 
                /* Top/Left set via JS */
                transform: translateX(-50%); /* Center horizontally relative to node */
                background: rgba(15, 23, 42, 0.95); 
                border: 1px solid #475569;
                backdrop-filter: blur(8px); 
                padding: 6px 10px; 
                border-radius: 12px;
                display: flex; gap: 6px; align-items: center; 
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
                z-index: 50; 
                pointer-events: auto;
                transition: opacity 0.2s;
            }
            
            /* Little arrow pointing up to the node */
            .architect-dock::before {
                content: ''; position: absolute; top: -6px; left: 50%; margin-left: -6px;
                border-width: 0 6px 6px 6px; border-style: solid;
                border-color: transparent transparent #475569 transparent;
            }

            .architect-dock button {
                width: 32px; height: 32px; border-radius: 8px; border: 1px solid transparent;
                display: flex; align-items: center; justify-content: center; font-size: 16px;
                background: rgba(255,255,255,0.05); color: #94a3b8; transition: all 0.1s;
                position: relative;
            }
            .architect-dock button:hover { background: rgba(255,255,255,0.15); color: #fff; transform: scale(1.05); }
            .architect-dock button:active { transform: scale(0.95); }
            
            /* Button Variants */
            .architect-dock button.active-move { background: #f59e0b; color: #000; border-color: #d97706; box-shadow: 0 0 10px rgba(245,158,11,0.4); animation: pulse-orange 2s infinite; }
            .architect-dock button.danger:hover { background: #ef4444; color: white; }
            
            @keyframes pulse-orange { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }

            /* Tooltip */
            .architect-dock button::after {
                content: attr(data-tooltip);
                position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%) translateY(-8px);
                background: #000; color: white; padding: 4px 8px; border-radius: 4px; font-size: 10px;
                white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-weight: bold;
                z-index: 60;
            }
            .architect-dock button:hover::after { opacity: 1; }
        `;
        this.appendChild(style);

        this.innerHTML += `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500" style="touch-action: none;">
             <!-- Clouds -->
             <div class="clouds-layer">
                 <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl select-none animate-pulse" style="animation-duration: 10s">☁️</div>
                 <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl select-none animate-pulse" style="animation-duration: 15s">☁️</div>
             </div>
             
             <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
             
             <!-- Architect Dock Container (Injected via JS) -->
             <div id="architect-ui"></div>

             <!-- Zoom Controls -->
             <div id="zoom-controls" class="absolute bottom-6 right-6 flex flex-col gap-2 z-20 pointer-events-auto transition-opacity duration-300 md:bottom-8 md:right-8 group">
                <button id="btn-zoom-in" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xl active:scale-95">+</button>
                <button id="btn-zoom-out" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xl active:scale-95">-</button>
                <button id="btn-zoom-reset" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 p-2 active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                </button>
             </div>
        </div>`;

        requestAnimationFrame(() => {
             this.initGraph();
             this.bindControls();
             this.renderOverlays();
        });

        if (document.fonts) {
            document.fonts.ready.then(() => {
                if(store.value.data) this.updateGraph();
            });
        }

        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
             if(this.g) this.drawGround(); 
             if(e.detail.theme && this.svg) this.updateGraph();
             
             // Handle Construction Mode Toggle
             if(e.detail.constructionMode !== undefined) {
                 this.selectedNodeId = null; // Clear selection on mode switch
                 this.isMoveMode = false;
                 this.updateGraph();
                 this.renderArchitectDock();
             }
             this.renderOverlays();
        });
        
        store.addEventListener('focus-node', (e) => {
             setTimeout(() => this.focusNode(e.detail), 250);
        });
        
        store.addEventListener('reset-zoom', () => this.resetZoom());
        
        window.addEventListener('resize', () => {
            const container = this.querySelector('#chart');
            if (container) {
                this.width = container.clientWidth;
                this.height = container.clientHeight;
                if(this.svg) {
                    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
                    this.drawGround();
                    this.updateGraph();
                }
            }
        });

        window.addEventListener('keydown', this.handleKeydown);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this.handleKeydown);
    }

    handleKeydown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
        
        // Construction Shortcuts
        if (store.value.constructionMode && this.selectedNodeId) {
            // Only allow shortcuts if we have write access
            if (fileSystem.features.canWrite) {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    this.handleDockAction('delete');
                    return;
                }
                if (e.key === 'm' || e.key === 'M') {
                    this.isMoveMode = !this.isMoveMode;
                    this.renderArchitectDock();
                    return;
                }
            }
        }

        const isCtrl = e.ctrlKey || e.metaKey;
        switch(e.key) {
            case '+': case '=': if(this.svg && this.zoom) { e.preventDefault(); this.svg.transition().duration(200).call(this.zoom.scaleBy, 1.3); } return;
            case '-': case '_': if(this.svg && this.zoom) { e.preventDefault(); this.svg.transition().duration(200).call(this.zoom.scaleBy, 1/1.3); } return;
            case '0': case 'r': case 'R': this.resetZoom(); return;
        }
    }

    bindControls() {
        const btnIn = this.querySelector('#btn-zoom-in');
        const btnOut = this.querySelector('#btn-zoom-out');
        const btnReset = this.querySelector('#btn-zoom-reset');

        if (btnIn) btnIn.onclick = (e) => { e.stopPropagation(); if(this.svg && this.zoom) this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3); };
        if (btnOut) btnOut.onclick = (e) => { e.stopPropagation(); if(this.svg && this.zoom) this.svg.transition().duration(300).call(this.zoom.scaleBy, 1/1.3); };
        if (btnReset) btnReset.onclick = (e) => { e.stopPropagation(); this.resetZoom(); };
    }
    
    renderOverlays() {
        const overlayContainer = this.querySelector('#overlays');
        if(!overlayContainer) return;
        
        const state = store.value;
        const ui = store.ui;
        
        let html = '';

        if (state.constructionMode) {
            html += `
            <div class="absolute top-0 left-0 w-full h-8 bg-yellow-500 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 z-[60] shadow-md striped-bg animate-in slide-in-from-top-full pointer-events-none">
                <span>🚧 CONSTRUCTION MODE 🚧</span>
            </div>
            <style>.striped-bg { background-image: repeating-linear-gradient(45deg, #f59e0b, #f59e0b 10px, #fbbf24 10px, #fbbf24 20px); }</style>
            `;
        }

        if (state.lastErrorMessage) {
            html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded shadow-2xl animate-in fade-in slide-in-from-top-4 pointer-events-auto flex items-center gap-3 max-w-md w-[90%]">
                <div class="flex-1"><p class="font-bold">Error</p><p class="text-sm">${state.lastErrorMessage}</p></div>
                <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-800">✕</button>
            </div>`;
        }

        if (state.lastActionMessage) {
            const bgClass = state.lastActionMessage === ui.moduleEmpty ? 'bg-slate-700/90 text-slate-100 backdrop-blur-md' : 'bg-green-500 text-white';
            const icon = state.lastActionMessage === ui.moduleEmpty ? '🍂' : '';
            html += `<div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] ${bgClass} px-8 py-3 rounded-full shadow-2xl animate-in fade-in zoom-in font-bold pointer-events-none flex items-center gap-3">${icon} ${state.lastActionMessage}</div>`;
        }

        if (state.loading) {
            html += `<div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm pointer-events-auto"><div class="w-16 h-16 border-4 border-sky-200 border-t-green-500 rounded-full animate-spin mb-4"></div><p class="font-bold text-sky-600 dark:text-sky-400 animate-pulse tracking-wide font-comic text-xl">${ui.loading}</p></div>`;
        }
        overlayContainer.innerHTML = html;
    }
    
    // --- ARCHITECT DOCK RENDERER ---
    renderArchitectDock() {
        const container = this.querySelector('#architect-ui');
        if (!container) return;
        
        // Only show dock if a node is selected AND we are in construction mode
        if (!store.value.constructionMode || !this.selectedNodeId) {
            container.innerHTML = '';
            return;
        }
        
        const node = store.findNode(this.selectedNodeId);
        if (!node) {
            container.innerHTML = '';
            return;
        }
        
        // POSITION CALCULATION
        // Find the D3 node visual element to get coordinates
        const d3Node = this.nodeGroup.selectAll(".node").data().find(d => d.data.id === this.selectedNodeId);
        if (!d3Node) return;

        const t = d3.zoomTransform(this.svg.node());
        const screenX = t.applyX(d3Node.x);
        const screenY = t.applyY(d3Node.y);
        
        // Calculate offset (node radius ~60px unscaled, multiplied by zoom k)
        // We place it slightly below the node
        const verticalOffset = (65 * t.k) + 15; 
        
        const style = `top: ${screenY + verticalOffset}px; left: ${screenX}px;`;

        const isRoot = node.type === 'root';
        const isLeaf = node.type === 'leaf' || node.type === 'exam';
        const canWrite = fileSystem.features.canWrite;
        
        let controls = '';
        
        if (!canWrite) {
            // READ ONLY STATE
            controls = `
                <div class="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <span>🔒</span> Read Only
                </div>
            `;
        } else {
            // EDITABLE STATE
            controls = `
                <button class="${this.isMoveMode ? 'active-move' : ''}" id="dock-move" data-tooltip="${this.isMoveMode ? 'Stop Moving' : 'Move Node (M)'}">
                    ${this.isMoveMode ? '✋' : '✥'}
                </button>
                <div style="width:1px; height:20px; background:#475569; margin:0 4px"></div>
                
                <button id="dock-edit" data-tooltip="Edit">✏️</button>
                
                ${!isLeaf ? `
                    <button id="dock-add-folder" data-tooltip="Add Folder">📁+</button>
                    <button id="dock-add-file" data-tooltip="Add Lesson">📄+</button>
                ` : ''}
                
                ${!isRoot ? `
                    <div style="width:1px; height:20px; background:#475569; margin:0 4px"></div>
                    <button class="danger" id="dock-delete" data-tooltip="Delete">🗑️</button>
                ` : ''}
            `;
        }

        container.innerHTML = `
            <div class="architect-dock animate-in fade-in zoom-in duration-200" style="${style}">
                ${controls}
            </div>
        `;
        
        // Bind Dock Events
        const bind = (id, fn) => {
            const btn = container.querySelector(`#${id}`);
            if(btn) btn.onclick = (e) => { e.stopPropagation(); fn(); };
        };
        
        if (canWrite) {
            bind('dock-move', () => {
                this.isMoveMode = !this.isMoveMode;
                this.renderArchitectDock();
            });
            
            bind('dock-edit', () => {
                if (node.type === 'branch' || node.type === 'root') {
                    store.setModal({ type: 'node-properties', node: node });
                } else {
                    store.openEditor(node);
                }
            });

            bind('dock-delete', () => this.handleDockAction('delete'));
            bind('dock-add-folder', () => this.handleDockAction('new-folder'));
            bind('dock-add-file', () => this.handleDockAction('new-file'));
        }
    }
    
    async handleDockAction(action) {
        const node = store.findNode(this.selectedNodeId);
        if (!node) return;
        
        const parentPath = node.sourcePath || node.path;

        if (action === 'delete') {
            const confirmDel = await store.confirm(
                `Are you sure you want to delete '${node.name}' and all its children? This cannot be undone.`,
                'Delete Node',
                true // Danger style
            );
            
            if(confirmDel) {
                const type = (node.type === 'branch' || node.type === 'root') ? 'folder' : 'file';
                try {
                    await fileSystem.deleteNode(parentPath, type);
                    this.selectedNodeId = null; 
                    this.isMoveMode = false;
                    store.loadData(store.value.activeSource, false);
                } catch(err) {
                    store.alert("Error: " + err.message);
                }
            }
        }
        else if (action === 'new-file' || action === 'new-folder') {
            const label = action === 'new-folder' ? "Folder Name:" : "Lesson Name:";
            const name = await store.prompt(label, "Untitled", "New Node");
            
            if(name) {
                const type = action === 'new-folder' ? 'folder' : 'file';
                try {
                    await fileSystem.createNode(parentPath, name, type);
                    store.loadData(store.value.activeSource, false);
                } catch(err) {
                    store.alert("Error: " + err.message);
                }
            }
        }
    }

    initGraph() {
        const container = this.querySelector('#chart');
        if (!container) return;

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg = d3.select(container).append("svg")
            .attr("viewBox", [0, 0, this.width, this.height])
            .style("width", "100%")
            .style("height", "100%");

        // Definitions (Shadows, Glows)
        const defs = this.svg.append("defs");
        const filter = defs.append("filter").attr("id", "drop-shadow");
        filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3);
        filter.append("feOffset").attr("dx", 0).attr("dy", 3);
        filter.append("feComponentTransfer").append("feFuncA").attr("type","linear").attr("slope",0.3);
        const merge = filter.append("feMerge");
        merge.append("feMergeNode");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

        const leafGlow = defs.append("filter").attr("id", "leaf-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
        leafGlow.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "coloredBlur");
        const lgMerge = leafGlow.append("feMerge");
        lgMerge.append("feMergeNode").attr("in", "coloredBlur");
        lgMerge.append("feMergeNode").attr("in", "SourceGraphic");

        this.g = this.svg.append("g");
        this.groundGroup = this.g.append("g").attr("class", "ground");
        this.linkGroup = this.g.append("g").attr("class", "links");
        
        // Crane Line (for drag feedback)
        this.dragLine = this.g.append("line").attr("class", "drag-line").style("visibility", "hidden");

        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.drawGround();

        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => {
                this.g.attr("transform", e.transform);
                // Sync Dock Position during zoom/pan
                if (this.selectedNodeId) this.renderArchitectDock();
            });
        
        this.svg.call(this.zoom).on("dblclick.zoom", null);
        this.zoom.translateExtent([[-5000, -5000], [5000, 5000]]);
        this.resetZoom(0);
        
        if(store.value.data) this.updateGraph();
        
        // Click on background deselects
        this.svg.on("click", (e) => {
            if (e.target.tagName === 'svg' || e.target.classList.contains('ground')) {
                if (store.value.constructionMode && this.selectedNodeId) {
                    this.selectedNodeId = null;
                    this.isMoveMode = false;
                    this.updateGraph();
                    this.renderArchitectDock();
                }
            }
        });
    }
    
    resetZoom(duration = 750) {
        if (!this.svg || !this.zoom) return;
        const isMobile = this.width < 768;
        const k = isMobile ? 1.15 : 1.0; 
        const ty = (this.height - 80) - (this.height * k); 
        const tx = (this.width / 2) * (1 - k); 
        this.svg.transition().duration(duration).call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    }

    drawGround() {
        this.groundGroup.selectAll("*").remove();
        if (store.value.constructionMode) return;

        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';
        const cx = this.width / 2;
        const groundY = this.height;
        const groundWidth = 10000; 
        const groundDepth = 4000;

        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} C${cx - 500},${groundY - 180} ${cx + 500},${groundY - 60} ${cx + groundWidth},${groundY} L${cx + groundWidth},${groundY + groundDepth} L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", backColor).style("opacity", 0.7);

        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} Q${cx},${groundY - 120} ${cx + groundWidth},${groundY} L${cx + groundWidth},${groundY + groundDepth} L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", color);
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const isMobile = this.width < 768;
        const harvestedSeeds = store.value.gamification.seeds;
        const isDark = store.value.theme === 'dark';
        const isConstruct = store.value.constructionMode;

        // Toggle Blueprint CSS
        const chartDiv = this.querySelector('#chart');
        if (isConstruct) {
            chartDiv.classList.add('blueprint-grid');
            chartDiv.classList.remove('bg-gradient-to-b');
            this.querySelector('.clouds-layer').style.display = 'none';
        } else {
            chartDiv.classList.remove('blueprint-grid');
            chartDiv.classList.add('bg-gradient-to-b');
            this.querySelector('.clouds-layer').style.display = 'block';
        }
        this.drawGround();

        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        
        const nodeGap = isMobile ? 110 : 160; 
        const treeWidth = Math.max(this.width, leaves * nodeGap);
        const treeLayout = d3.tree().size([treeWidth, 1]); 
        treeLayout(root);

        const levelHeight = isMobile ? 180 : 200; 
        const bottomOffset = 150;
        
        // --- LAYOUT CALCULATION ---
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        root.descendants().forEach(d => {
            d.y = (this.height - bottomOffset) - (d.depth * levelHeight);
            if (treeWidth < this.width) d.x += (this.width - treeWidth) / 2;
            else d.x = d.x - (treeWidth / 2) + (this.width / 2);
            if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y; if (d.y > maxY) maxY = d.y;
        });

        // --- NODES ---
        const nodes = root.descendants();
        const links = root.links();

        // Origin Logic for Animation
        const findOrigin = (d) => {
            if (d.parent && this.nodePositions.has(d.parent.data.id)) return this.nodePositions.get(d.parent.data.id);
            return { x: this.width / 2, y: this.height };
        };
        const findDest = (d) => {
            let ancestor = d.parent;
            while (ancestor) {
                const anc = nodes.find(n => n.data.id === ancestor.data.id);
                if (anc) return { x: anc.x, y: anc.y };
                ancestor = ancestor.parent;
            }
            return { x: this.width / 2, y: this.height };
        };

        const nodeSelection = this.nodeGroup.selectAll("g.node").data(nodes, d => d.data.id);

        // ENTER
        const nodeEnter = nodeSelection.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${findOrigin(d).x},${findOrigin(d).y}) scale(0)`)
            .style("cursor", "pointer")
            .attr("role", "button")
            .attr("tabindex", "0");

        // 1. Hit Area
        nodeEnter.append("circle")
            .attr("class", "hit-area")
            .attr("r", isMobile ? 50 : 80)
            .attr("cy", d => d.data.type === 'leaf' || d.data.type === 'exam' ? (isMobile ? 0 : 30) : 0)
            .attr("fill", "transparent");

        // 2. Visuals
        nodeEnter.append("path").attr("class", "node-body").attr("stroke", "#fff").attr("stroke-width", 3);
        nodeEnter.append("text").attr("class", "node-icon").attr("text-anchor", "middle").attr("dy", "0.35em")
            .style("font-size", isMobile ? "28px" : "38px").style("user-select", "none").style("pointer-events", "none");

        // 3. Labels
        const labelGroup = nodeEnter.append("g").attr("class", "label-group");
        labelGroup.append("rect").attr("rx", 10).attr("ry", 10).attr("height", 24).attr("fill", "rgba(255,255,255,0.9)").attr("stroke", "#e2e8f0");
        labelGroup.append("text").attr("class", "label-text").attr("dy", 17).attr("fill", "#334155").attr("font-size", "12px").attr("font-weight", "800").style("pointer-events", "none");

        // 4. Badges (Expand/Collapse)
        const badge = nodeEnter.append("g").attr("class", "badge-group").style("display", "none");
        badge.append("circle").attr("r", 12).attr("stroke", "#fff").attr("stroke-width", 2).style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))");
        badge.append("text").attr("dy", "0.35em").attr("text-anchor", "middle").attr("font-weight", "900").attr("font-size", "16px").attr("fill", "#ffffff");

        // 5. Loading Spinner
        nodeEnter.append("path").attr("class", "spinner").attr("d", "M-14,0 a14,14 0 0,1 28,0")
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 4).style("display", "none")
            .append("animateTransform").attr("attributeName", "transform").attr("type", "rotate").attr("from", "0 0 0").attr("to", "360 0 0").attr("dur", "1s").attr("repeatCount", "indefinite");
            
        // 6. Memory Decay Icon (Water Droplet) - NEW
        nodeEnter.append("text").attr("class", "memory-badge").attr("text-anchor", "middle")
            .text("💧").attr("dy", "-2em")
            .style("font-size", "20px").style("display", "none");

        // UPDATE MERGE
        const nodeMerged = nodeSelection.merge(nodeEnter);

        // --- DYNAMIC INTERACTION LOGIC ---
        if (isConstruct) {
            const self = this;
            
            nodeMerged.classed("blueprint-node", true);
            nodeMerged.classed("selected", d => d.data.id === this.selectedNodeId);

            // DRAG LOGIC (Architect Mode)
            // Note: Filter ensures we can only drag if Move Mode is ACTIVE
            const dragBehavior = d3.drag()
                .filter(event => !event.button && self.isMoveMode) 
                .on("start", function(e, d) {
                    // Only allow drag if node is ALREADY selected
                    if (self.selectedNodeId !== d.data.id) return;
                    if (d.data.type === 'root') return;

                    self.isDraggingNode = true;
                    d3.select(this).raise().classed("dragging", true);
                    self.dragLine.attr("x1", d.parent.x).attr("y1", d.parent.y).attr("x2", d.x).attr("y2", d.y).style("visibility", "visible");
                })
                .on("drag", function(e, d) {
                    if (!self.isDraggingNode) return;

                    // Move Node Visual
                    d3.select(this).attr("transform", `translate(${e.x},${e.y}) scale(1)`);
                    self.dragLine.attr("x2", e.x).attr("y2", e.y);
                    
                    // Detect Target (Drop zone)
                    let minDist = 100; 
                    let targetId = null;
                    self.nodeGroup.selectAll(".node").each(function(n) {
                        if (n !== d && n.data.type !== 'leaf' && n.data.type !== 'exam') { 
                            const dx = e.x - n.x; const dy = e.y - n.y;
                            if (Math.sqrt(dx*dx + dy*dy) < minDist) { minDist = Math.sqrt(dx*dx + dy*dy); targetId = n.data.id; }
                        }
                    });
                    self.nodeGroup.selectAll(".node").classed("drop-target", n => n.data.id === targetId);
                    self.hoveredNodeId = targetId;
                    
                    // SYNC DOCK POSITION while dragging
                    // We temporarily update data x/y purely for the visual calculation of the dock
                    d.x = e.x; d.y = e.y;
                    self.renderArchitectDock();
                })
                .on("end", function(e, d) {
                    if (!self.isDraggingNode) return;
                    
                    self.isDraggingNode = false;
                    d3.select(this).classed("dragging", false);
                    self.dragLine.style("visibility", "hidden");
                    self.nodeGroup.selectAll(".node").classed("drop-target", false);
                    
                    if (self.hoveredNodeId && self.hoveredNodeId !== d.parent.data.id) {
                        store.moveNode(d.data, self.hoveredNodeId);
                        self.isMoveMode = false; // Reset move mode after action
                    } else {
                        // Snap back visual
                        // We rely on the next updateGraph to reset positions correctly from D3 tree layout
                        store.dispatchEvent(new CustomEvent('graph-update'));
                    }
                    self.hoveredNodeId = null;
                });

            nodeMerged.call(dragBehavior);
            
            // Override Click for Selection
            nodeMerged.on("click", (e, d) => {
                e.stopPropagation();
                if (this.selectedNodeId === d.data.id) {
                    if (d.data.type === 'branch') store.toggleNode(d.data.id);
                } else {
                    this.selectedNodeId = d.data.id;
                    this.isMoveMode = false; // Reset move mode when changing selection
                    this.updateGraph();
                    this.renderArchitectDock();
                }
            });
            
            // Cursor Logic
            nodeMerged.style("cursor", d => {
               if (d.data.id === this.selectedNodeId && this.isMoveMode) return "move";
               return "pointer"; 
            });
            
        } else {
            // EXPLORE MODE
            nodeMerged.on(".drag", null);
            nodeMerged.classed("blueprint-node", false);
            nodeMerged.classed("selected", false);
            nodeMerged.on("click", (e, d) => this.handleNodeClick(e, d));
            nodeMerged.style("cursor", "pointer");
        }

        const nodeUpdate = nodeMerged.transition().duration(this.duration)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(1)`);

        // --- NODE STYLING (Colors & Shapes) ---
        nodeUpdate.select(".node-body")
            .attr("fill", d => {
                if (isConstruct) {
                    // CONSTRUCTION MODE: High Contrast Selection
                    if (d.data.id === this.selectedNodeId) return '#dc2626'; // ACTIVE RED
                    return '#34495e'; // INACTIVE BLUEPRINT
                }
                const isHarvested = harvestedSeeds.find(f => f.id === d.data.id);
                if (isHarvested) return '#D97706'; 
                if (d.data.type === 'root') return '#8D6E63';
                
                // MEMORY HEALTH CHECK (SRS)
                if ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id)) {
                    const memory = store.userStore.getMemoryStatus(d.data.id);
                    if (memory.isDue) {
                        return '#eab308'; // WITHERED YELLOW/BROWN
                    }
                    return '#22c55e'; // FRESH GREEN
                }
                
                if (d.data.type === 'exam') return '#ef4444'; 
                if (d.data.type === 'leaf') return '#a855f7'; 
                return '#F59E0B'; 
            })
            .attr("stroke", d => {
                if (isConstruct) {
                    if (d.data.id === this.selectedNodeId) return "#fff"; // White stroke for selected
                    return "#f59e0b"; // Orange dashed for inactive
                }
                return "#fff";
            }) 
            .attr("d", d => {
                const isHarvested = harvestedSeeds.find(f => f.id === d.data.id);
                let r = d.data.type === 'root' ? 60 : (isHarvested ? 50 : 45); 
                if (isConstruct) {
                    if (d.data.type === 'leaf') return `M${-r},${-r*0.6} h${r*2} v${r*1.2} h${-r*2} Z`; 
                    return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`; 
                }
                if (d.data.type === 'leaf') return "M0,0 C-35,15 -45,45 0,85 C45,45 35,15 0,0"; 
                if (d.data.type === 'exam') return `M0,${-r*1.2} L${r*1.2},0 L0,${r*1.2} L${-r*1.2},0 Z`;
                return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
            })
            .style("filter", d => {
                if (isConstruct) return "none";
                const isHarvested = harvestedSeeds.find(f => f.id === d.data.id);
                if (isHarvested || ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id))) return "url(#leaf-glow)";
                return "url(#drop-shadow)";
            });

        nodeUpdate.select(".node-icon")
            .text(d => {
                if (isConstruct) {
                    if (d.data.type === 'branch') return '📁';
                    if (d.data.type === 'root') return '🏗️';
                    return '📄';
                }
                const seed = harvestedSeeds.find(f => f.id === d.data.id);
                if (seed) return seed.icon;
                if ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id)) return '✓';
                return d.data.icon || (d.data.type === 'exam' ? '⚔️' : '🌱');
            })
            .attr("fill", d => {
                 // Ensure white text on red background for selected node in construct mode
                 if (isConstruct && d.data.id === this.selectedNodeId) return "#fff";
                 return null; // Fallback to CSS
            });
        
        // LABEL POSITIONING
        nodeMerged.select(".label-group").attr("transform", d => `translate(0, ${isMobile ? 55 : (d.data.type === 'leaf' || d.data.type === 'exam') ? 65 : 55})`);
        
        // LABEL COLORS
        nodeMerged.select(".label-group rect")
            .attr("fill", isConstruct ? "#1e293b" : (isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255,255,255,0.9)"))
            .attr("stroke", isConstruct ? "#64748b" : (isDark ? "#334155" : "#e2e8f0"));
        nodeMerged.select(".label-group text")
            .attr("fill", isConstruct ? "#94a3b8" : (isDark ? "#f1f5f9" : "#334155"))
            .style("font-family", isConstruct ? "monospace" : "inherit");

        // LABEL TEXT RE-RENDERING (Standardized)
        nodeMerged.select(".label-text").attr("text-anchor", "middle");
        nodeMerged.select(".label-group text").each(function(d) {
            const text = d3.select(this); text.text(null); 
            const name = d.data.name; const words = name.split(/\s+/);
            const maxWidth = isMobile ? 100 : 150;
            let line1 = [], line2 = [], onLine2 = false;
            const tempTspan = text.append('tspan').text(' '); 
            for(const word of words) {
                if(onLine2) { line2.push(word); } else {
                    const testLine = [...line1, word];
                    tempTspan.text(testLine.join(' '));
                    if (tempTspan.node().getComputedTextLength() > maxWidth && line1.length > 0) { onLine2 = true; line2.push(word); } else { line1.push(word); }
                }
            }
            tempTspan.remove();
            text.append('tspan').attr('x', 0).text(line1.join(' '));
            if (line2.length > 0) {
                const tspan2 = text.append('tspan').attr('x', 0).attr('dy', '1.2em').text(line2.join(' '));
                while (tspan2.node().getComputedTextLength() > maxWidth && tspan2.text().length > 3) { tspan2.text(tspan2.text().slice(0, -4) + '...'); }
            }
        });
        nodeMerged.select(".label-group").each(function() {
            const group = d3.select(this); const text = group.select("text"); const rect = group.select("rect");
            const numLines = text.selectAll("tspan").size();
            text.attr('dy', numLines > 1 ? 10 : 17);
            const textBBox = text.node().getBBox();
            rect.attr('height', numLines > 1 ? 40 : 24).attr('width', textBBox.width + 24).attr('x', -(textBBox.width / 2) - 12).attr('y', numLines > 1 ? -8 : 0);
        });

        // BADGE & SPINNER & MEMORY DROPS
        nodeUpdate.select(".badge-group").style("display", d => (d.data.type === 'leaf' || d.data.type === 'exam') ? 'none' : 'block').attr("transform", d => `translate(${isMobile ? 25 : 35}, -${isMobile ? 25 : 35})`);
        nodeUpdate.select(".badge-group circle").attr("fill", d => d.data.expanded ? "#ef4444" : "#22c55e");
        nodeUpdate.select(".badge-group text").text(d => d.data.expanded ? '-' : '+');
        nodeUpdate.select(".spinner").style("display", d => d.data.status === 'loading' ? 'block' : 'none');
        
        // Show Memory Droplet if Due (and completed)
        nodeUpdate.select(".memory-badge").style("display", d => {
            if (isConstruct) return "none";
            if ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id)) {
                const mem = store.userStore.getMemoryStatus(d.data.id);
                return mem.isDue ? "block" : "none";
            }
            return "none";
        }).attr("dy", isMobile ? "-2.5em" : "-2em"); // Adjust position for mobile

        // EXIT
        nodeSelection.exit().transition().duration(this.duration).attr("transform", d => `translate(${findDest(d).x},${findDest(d).y}) scale(0)`).remove();

        // LINKS
        const linkSelection = this.linkGroup.selectAll(".link").data(links, d => d.target.data.id);
        const linkEnter = linkSelection.enter().append("path").attr("class", "link").attr("fill", "none").attr("stroke", "#8D6E63").attr("stroke-width", d => Math.max(3, 16 - d.target.depth * 2.5)).attr("d", d => this.diagonal({source: findOrigin(d.target), target: findOrigin(d.target)}));
        const linkMerged = linkSelection.merge(linkEnter);
        
        if (isConstruct) linkMerged.classed("blueprint-link", true).attr("stroke", "#475569");
        else linkMerged.classed("blueprint-link", false);

        linkMerged.transition().duration(this.duration).attr("d", d => this.diagonal(d))
            .attr("stroke", d => {
                if (isConstruct) return "#475569";
                return store.isCompleted(d.target.data.id) ? "#22c55e" : "#8D6E63";
            });

        linkSelection.exit().transition().duration(this.duration).attr("d", d => this.diagonal({source: findDest(d.target), target: findDest(d.target)})).remove();

        // CACHE
        this.nodePositions.clear();
        nodes.forEach(d => { this.nodePositions.set(d.data.id, {x: d.x, y: d.y}); });
        
        // Re-render dock if a node is selected to ensure position is correct after layout update
        if (isConstruct && this.selectedNodeId) {
            setTimeout(() => this.renderArchitectDock(), this.duration + 10);
        }
    }

    diagonal(d) {
        if (store.value.constructionMode) return `M ${d.source.x} ${d.source.y} L ${d.source.x} ${(d.source.y + d.target.y) / 2} L ${d.target.x} ${(d.source.y + d.target.y) / 2} L ${d.target.x} ${d.target.y}`;
        return `M ${d.source.x} ${d.source.y} C ${d.source.x} ${(d.source.y + d.target.y) / 2}, ${d.target.x} ${(d.source.y + d.target.y) / 2}, ${d.target.x} ${d.target.y}`;
    }

    handleNodeClick(e, d) {
        if(e) e.stopPropagation();
        if (d.data.status === 'loading') return;
        store.toggleNode(d.data.id);
        if (d.data.type === 'branch' || d.data.type === 'root') this.adjustCameraToActiveNode(d);
    }

    adjustCameraToActiveNode(d) {
        if (!this.svg || !this.zoom) return;
        const t = d3.zoomTransform(this.svg.node());
        const currentY = t.applyY(d.y); const currentX = t.applyX(d.x);
        const isMobile = this.width < 768;
        let targetY;
        if (d.data.expanded) targetY = this.height * (isMobile ? 0.75 : 0.70);
        else targetY = this.height * 0.5;
        const safeMargin = 80;
        if (targetY < safeMargin) targetY = safeMargin;
        if (targetY > this.height - safeMargin) targetY = this.height - safeMargin;
        const targetX = this.width / 2; 
        const dy = targetY - currentY; const dx = targetX - currentX;
        this.svg.transition().duration(this.duration + 200).call(this.zoom.transform, t.translate(dx / t.k, dy / t.k));
    }

    focusNode(nodeId) {
        let target = null;
        this.nodeGroup.selectAll(".node").each(d => { if(d.data.id === nodeId) target = d; });
        if(target && this.zoom) {
             const isMobile = this.width < 768;
             const targetScale = isMobile ? 1.6 : 1.3;
             const transform = d3.zoomIdentity.translate(this.width/2, this.height * 0.6).scale(targetScale).translate(-target.x, -target.y);
             this.svg.transition().duration(1200).call(this.zoom.transform, transform);
        }
    }
}
customElements.define('arbor-graph', ArborGraph);
