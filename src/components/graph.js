
import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import { GraphEngine, ViewportSystem } from '../utils/graph-engine.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.engine = new GraphEngine();
        this.viewport = null;
        this.width = 0;
        this.height = 0;
        
        // State
        this.nodePositions = new Map(); // Store x,y for animation interpolation
        this.renderedNodes = new Map(); // DOM Cache for diffing & lookups
        this.renderedLinks = new Map();
        
        // Construction Mode
        this.isMoveMode = false;
        this.selectedNodeId = null;
        this.dragTargetId = null;
        this.isDraggingNode = false;
        this.dragStartPos = null;
        this.dragGhost = null; // Visual element for dragging
        
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    connectedCallback() {
        this.initDOM();
        this.initViewport();
        
        // Initial Render
        if (store.value.data) {
            requestAnimationFrame(() => this.updateGraph());
        }

        // Event Listeners
        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
            // If theme or mode changes, we might need to re-apply styles
            if (e.detail.theme || e.detail.constructionMode !== undefined) {
                if (e.detail.constructionMode !== undefined) {
                    this.selectedNodeId = null;
                    this.isMoveMode = false;
                    this.renderArchitectDock();
                }
                this.updateGraph();
                this.renderOverlays();
            }
        });
        
        store.addEventListener('focus-node', (e) => this.focusNode(e.detail));
        store.addEventListener('reset-zoom', () => this.resetZoom());
        
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('keydown', this.handleKeydown);
    }

    disconnectedCallback() {
        window.removeEventListener('resize', () => this.handleResize());
        window.removeEventListener('keydown', this.handleKeydown);
    }

    initDOM() {
        this.innerHTML = `
        <style>
            /* Visual Specs from VISUAL_SPEC.md */
            .graph-container { width: 100%; height: 100%; overflow: hidden; position: relative; touch-action: none; cursor: grab; }
            .graph-container:active { cursor: grabbing; }
            
            /* Backgrounds */
            .bg-sky { background: linear-gradient(to bottom, #bae6fd, #f0f9ff); }
            .dark .bg-sky { background: linear-gradient(to bottom, #0f172a, #1e293b); }
            .bg-blueprint { 
                background-color: #1e293b;
                background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                background-size: 40px 40px;
            }

            /* Node Transitions - Organic Growth Curve */
            /* Using a longer duration and a smoother ease-out curve to prevent "snapping" */
            .node-group { 
                transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.6s ease-out; 
                cursor: pointer; 
                will-change: transform, opacity;
            }
            .link-path { 
                transition: d 0.6s cubic-bezier(0.25, 0.8, 0.25, 1), stroke 0.3s; 
                fill: none; 
                will-change: d;
            }
            
            /* Hover Effects */
            .node-group:hover .node-body { filter: brightness(1.1); }
            .node-group:active .node-body { transform: scale(0.95); }
            
            /* Text Select Safety */
            text { user-select: none; pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif; }
            
            /* Architect Dock */
            .architect-dock {
                position: absolute; transform: translateX(-50%);
                background: rgba(15, 23, 42, 0.95); border: 1px solid #475569;
                backdrop-filter: blur(8px); padding: 6px 10px; border-radius: 12px;
                display: flex; gap: 6px; align-items: center; 
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6); z-index: 50; 
            }
            .architect-dock button {
                width: 32px; height: 32px; border-radius: 8px; border: 1px solid transparent;
                display: flex; align-items: center; justify-content: center; font-size: 16px;
                background: rgba(255,255,255,0.05); color: #94a3b8; transition: all 0.1s;
            }
            .architect-dock button:hover { background: rgba(255,255,255,0.15); color: #fff; transform: scale(1.05); }
            .architect-dock button.active-move { background: #f59e0b; color: #000; box-shadow: 0 0 10px rgba(245,158,11,0.4); }
            
            .vignette { position: absolute; inset: 0; pointer-events: none; z-index: 5; background: radial-gradient(circle, transparent 50%, rgba(255,255,255,0.6) 120%); mix-blend-mode: multiply; }
            .dark .vignette { background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.85) 100%); mix-blend-mode: normal; }
        </style>
        
        <div id="graph-container" class="graph-container bg-sky transition-colors duration-500">
            <div class="vignette"></div>
            
            <!-- SVG Layer -->
            <svg id="svg-canvas" width="100%" height="100%" style="display:block;">
                <defs>
                    <filter id="drop-shadow"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="3"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="leaf-glow"><feGaussianBlur stdDeviation="5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <g id="viewport">
                    <g id="ground-layer"></g>
                    <g id="links-layer"></g>
                    <g id="nodes-layer"></g>
                    <line id="drag-line" x1="0" y1="0" x2="0" y2="0" stroke="#f59e0b" stroke-width="3" stroke-dasharray="5,5" style="display:none; pointer-events:none;"></line>
                </g>
            </svg>

            <!-- UI Overlays -->
            <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
            <div id="architect-ui"></div>
            
            <!-- Zoom Controls -->
            <div class="absolute bottom-6 right-6 flex flex-col gap-2 z-20 pointer-events-auto group">
                <button id="btn-zoom-in" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xl active:scale-95">+</button>
                <button id="btn-zoom-out" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xl active:scale-95">-</button>
                <button id="btn-zoom-reset" class="w-12 h-12 bg-white/90 dark:bg-slate-800/90 rounded-full shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 p-2 active:scale-95">⟲</button>
            </div>
        </div>
        `;

        this.container = this.querySelector('#graph-container');
        this.svg = this.querySelector('#svg-canvas');
        this.viewportGroup = this.querySelector('#viewport');
        this.groundLayer = this.querySelector('#ground-layer');
        this.linksLayer = this.querySelector('#links-layer');
        this.nodesLayer = this.querySelector('#nodes-layer');
        this.dragLine = this.querySelector('#drag-line');

        // Bind Zoom Controls
        this.querySelector('#btn-zoom-in').onclick = (e) => { e.stopPropagation(); this.zoomBy(1.3); };
        this.querySelector('#btn-zoom-out').onclick = (e) => { e.stopPropagation(); this.zoomBy(1/1.3); };
        this.querySelector('#btn-zoom-reset').onclick = (e) => { e.stopPropagation(); this.resetZoom(); };
    }

    initViewport() {
        this.viewport = new ViewportSystem(this.svg, this.viewportGroup);
        
        // Sync dock position on zoom
        this.viewport.onZoom = () => {
            if (this.selectedNodeId && store.value.constructionMode) {
                this.renderArchitectDock();
            }
        };

        this.handleResize();
        this.resetZoom(0);
    }

    handleResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        if (store.value.data) this.updateGraph();
    }

    handleKeydown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        
        if (store.value.constructionMode && this.selectedNodeId && fileSystem.features.canWrite) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.handleDockAction('delete');
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
                this.isMoveMode = !this.isMoveMode;
                this.renderArchitectDock();
                this.updateGraph();
                return;
            }
        }

        switch(e.key) {
            case '+': case '=': this.zoomBy(1.3); break;
            case '-': case '_': this.zoomBy(1/1.3); break;
            case '0': case 'r': case 'R': this.resetZoom(); break;
        }
    }

    zoomBy(k) {
        const t = this.viewport.transform;
        this.viewport.zoomTo(t.x, t.y, t.k * k, 300);
    }

    resetZoom(duration = 750) {
        // Reset Zoom: Position root near bottom center
        const isMobile = this.width < 768;
        const k = isMobile ? 1.15 : 1.0; 
        
        const ty = (this.height - 80) - (this.height * k); 
        const tx = (this.width / 2) * (1 - k); 
        this.viewport.zoomTo(tx, ty, k, duration);
    }

    // --- RENDERING PIPELINE ---

    updateGraph() {
        const data = store.value.data;
        if (!data) return;

        const isConstruct = store.value.constructionMode;
        
        // 1. Update Styles (Mode Switch)
        if (isConstruct) {
            this.container.classList.add('bg-blueprint');
            this.container.classList.remove('bg-sky');
            this.querySelector('.vignette').style.display = 'none';
        } else {
            this.container.classList.remove('bg-blueprint');
            this.container.classList.add('bg-sky');
            this.querySelector('.vignette').style.display = 'block';
        }

        // 2. Compute Layout
        const layout = this.engine.computeLayout(data, this.width, this.height, {
            nodeGap: this.width < 768 ? 110 : 160,
            levelHeight: this.width < 768 ? 180 : 200,
            bottomOffset: 150
        });

        // 3. Draw Ground
        this.drawGround(layout.bounds);

        // 4. Render Nodes & Links (Diffing)
        // Pass entire layout node list to help with collapse animations
        this.renderLinks(layout.links, isConstruct, layout.nodes);
        this.renderNodes(layout.nodes, isConstruct);
        
        // 5. Update Viewport Bounds (Constraints)
        this.viewport.setBounds(layout.bounds, this.width, this.height);
        
        // 6. Update Dock
        if (isConstruct && this.selectedNodeId) {
            this.renderArchitectDock();
        }
        
        // 7. Update Overlays
        this.renderOverlays();
    }

    drawGround(bounds) {
        this.groundLayer.innerHTML = '';
        if (store.value.constructionMode) return;

        const theme = store.value.theme;
        const color = theme === 'dark' ? '#334155' : '#22c55e';
        
        const startY = bounds.maxY + 20; // The "valleys" of the hills
        const hillHeight = 60; // How high the peaks are from the valleys
        const hillWidth = 400; // How wide each hill is
        
        const startX = bounds.minX - 5000;
        const totalWidth = (bounds.maxX - bounds.minX) + 10000;
        const numHills = Math.ceil(totalWidth / hillWidth);

        // Start path at the far left, at the valley line
        let pathD = `M ${startX}, ${startY}`;

        // Create a series of hills using quadratic bezier curves
        for (let i = 0; i < numHills; i++) {
            const currentHillX = startX + i * hillWidth;
            
            // Control point is halfway across the hill and at the peak
            const controlX = currentHillX + hillWidth / 2;
            const controlY = startY - hillHeight;
            
            // End point is at the start of the next hill, back at the valley line
            const endX = currentHillX + hillWidth;
            const endY = startY;
            
            pathD += ` Q ${controlX},${controlY} ${endX},${endY}`;
        }

        // The path is now at the far right edge of the last hill.
        // We need to draw lines to close the shape at the bottom.
        const endX = startX + numHills * hillWidth;
        pathD += ` L ${endX}, ${startY + 10000}`;      // Line down to bottom-right
        pathD += ` L ${startX}, ${startY + 10000}`;    // Line across to bottom-left
        pathD += ` Z`;                               // Close path back to the start

        const path = this.engine.createSVG('path', {
            d: pathD,
            fill: color
        });
        this.groundLayer.appendChild(path);
    }

    renderLinks(links, isConstruct, allNodes) {
        const existing = new Map();
        const exitingLinks = []; // Collection for trajectory correction

        // Separate existing vs exiting for better management
        Array.from(this.linksLayer.children).forEach(el => {
            if (!el.classList.contains('exiting')) existing.set(el.dataset.id, el);
            else exitingLinks.push(el);
        });
        
        const touched = new Set();

        // 1. Enter / Update Links
        links.forEach(l => {
            const id = `${l.source.id}->${l.target.id}`;
            touched.add(id);
            
            const isCompleted = store.isCompleted(l.target.data.id);
            const color = isConstruct ? '#475569' : (isCompleted ? '#22c55e' : '#8D6E63');
            const d = this.engine.diagonal(l.source, l.target, isConstruct);
            const strokeWidth = Math.max(3, 16 - l.target.depth * 2.5);

            let path = existing.get(id);
            if (!path) {
                // New Link: Grow from parent
                path = this.engine.createSVG('path', {
                    class: 'link-path',
                    'data-id': id,
                    fill: 'none',
                    'stroke-linecap': 'round'
                });
                
                // Start Geometry: Collapsed at parent (Source to Source)
                const startX = l.source.x;
                const startY = l.source.y;
                const startD = this.engine.diagonal(
                    { x: startX, y: startY }, 
                    { x: startX, y: startY }, 
                    isConstruct
                );
                
                path.setAttribute('d', startD);
                path.style.transition = 'none'; // Disable transition for initial setup
                path.setAttribute('stroke', color);
                path.setAttribute('stroke-width', strokeWidth);
                
                this.linksLayer.appendChild(path);
                
                // Force Reflow
                path.getBoundingClientRect();
                
                path.style.transition = '';
            }
            
            // Final State
            path.setAttribute('d', d);
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', strokeWidth);
            if (isConstruct) path.setAttribute('stroke-dasharray', '4,4');
            else path.removeAttribute('stroke-dasharray');
        });

        // 2. Exit Links (Start collapse animation)
        existing.forEach((el, id) => {
            if (!touched.has(id)) {
                el.classList.add('exiting');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0'; // Fade out
                exitingLinks.push(el); // Add to list for trajectory update
                
                setTimeout(() => el.remove(), 600); // Match CSS duration
            }
        });

        // 3. Trajectory Correction for ALL exiting links (ensure they follow moving parents)
        exitingLinks.forEach(el => {
            const id = el.dataset.id;
            const [sourceId] = id.split('->');
            
            let targetX = 0, targetY = 0;
            let foundTarget = false;

            // A: Source is visible in new layout?
            const visibleSource = allNodes.find(n => n.id === sourceId);
            if (visibleSource) {
                targetX = visibleSource.x;
                targetY = visibleSource.y;
                foundTarget = true;
            } else {
                // B: Source is hidden/removed. Find source's nearest visible ancestor.
                // Try to find the DOM element for the source node to get lineage
                // Use a querySelector because it might be in 'exiting' state too.
                const sourceEl = this.nodesLayer.querySelector(`.node-group[data-id="${sourceId}"]`);
                
                if (sourceEl && sourceEl._layoutNode) {
                    let ancestor = sourceEl._layoutNode.parent;
                    while(ancestor) {
                        const vis = allNodes.find(n => n.id === ancestor.id);
                        if (vis) {
                            targetX = vis.x;
                            targetY = vis.y;
                            foundTarget = true;
                            break;
                        }
                        ancestor = ancestor.parent;
                    }
                }
            }
            
            if (foundTarget) {
                // Collapse into ancestor position
                const collapsedD = this.engine.diagonal({x: targetX, y: targetY}, {x: targetX, y: targetY}, isConstruct);
                el.setAttribute('d', collapsedD);
            }
        });
    }

    renderNodes(nodes, isConstruct) {
        const existing = new Map();
        const exitingNodes = [];

        // Separate existing vs exiting
        Array.from(this.nodesLayer.children).forEach(el => {
            if (!el.classList.contains('exiting')) {
                existing.set(el.dataset.id, el);
            } else {
                exitingNodes.push(el);
            }
        });

        // Clear active registry to only contain valid nodes for this frame
        this.renderedNodes.clear();

        const touched = new Set();
        const harvested = store.value.gamification.seeds || [];

        // 1. Enter / Update Nodes
        nodes.forEach(n => {
            touched.add(n.id);
            const isSelected = n.id === this.selectedNodeId;
            const isCompleted = store.isCompleted(n.id);
            const isHarvested = harvested.find(h => h.id === n.id);
            
            // Cache position for animation
            this.nodePositions.set(n.id, { x: n.x, y: n.y });

            let g = existing.get(n.id);
            if (!g) {
                g = this.createNodeElement(n);
                this.nodesLayer.appendChild(g);
                existing.set(n.id, g);
                
                // --- GROWTH ANIMATION ---
                // Start exactly at parent's current position to stay attached to the growing branch
                const parentPos = n.parent ? { x: n.parent.x, y: n.parent.y } : { x: n.x, y: n.y };
                
                g.style.transition = 'none'; 
                g.setAttribute('transform', `translate(${parentPos.x}, ${parentPos.y}) scale(0.1)`);
                g.style.opacity = '0';
                
                // Force Reflow
                g.getBoundingClientRect();
                
                // Animate to final position
                g.style.transition = ''; 
                g.style.opacity = '1';
                g.setAttribute('transform', `translate(${n.x}, ${n.y}) scale(1)`);
                
            } else {
                // Update parent pointer just in case hierarchy changed (drag/drop)
                if (n.parent) g.dataset.parentId = n.parent.id;
                
                // Existing node: smooth move to new position
                g.setAttribute('transform', `translate(${n.x}, ${n.y}) scale(1)`);
                g.style.opacity = '1';
            }
            
            // CRITICAL: Attach current layout data to DOM element for future lookups (ancestor traversal)
            g._layoutNode = n; 
            
            // Populate registry for Drag & Drop and Link rendering
            this.renderedNodes.set(n.id, g);
            
            // Update Visuals based on State
            this.updateNodeVisuals(g, n, isConstruct, isSelected, isCompleted, isHarvested);
        });

        // 2. Exit Nodes (Start Shrink Animation)
        existing.forEach((el, id) => {
            if (!touched.has(id)) {
                // Mark as exiting
                el.classList.add('exiting');
                el.style.pointerEvents = 'none'; // Disable interactions on exiting nodes
                el.style.opacity = '0';
                
                exitingNodes.push(el); // Add to list for trajectory update
                
                setTimeout(() => el.remove(), 600);
            }
        });

        // 3. Continuous Trajectory Correction for ALL Exiting Nodes
        // This ensures that even if the parent moves mid-animation, the shrinking node
        // updates its target to follow the parent, preventing "floating" nodes.
        exitingNodes.forEach(el => {
            let targetX = 0, targetY = 0;
            let foundTarget = false;
            
            const oldNode = el._layoutNode; // Layout data from PREVIOUS frame
            
            // A. Try immediate parent ID from dataset first (fast path)
            const parentId = el.dataset.parentId;
            const parentInNewLayout = nodes.find(n => n.id === parentId);
            
            if (parentInNewLayout) {
                targetX = parentInNewLayout.x;
                targetY = parentInNewLayout.y;
                foundTarget = true;
            } 
            // B. Deep collapse fallback: Traverse up using the old layout structure
            else if (oldNode && oldNode.parent) {
                let ancestor = oldNode.parent;
                // Keep going up until we find an ancestor that exists in the NEW layout
                while(ancestor) {
                    const visibleAncestor = nodes.find(n => n.id === ancestor.id);
                    if (visibleAncestor) {
                        targetX = visibleAncestor.x;
                        targetY = visibleAncestor.y;
                        foundTarget = true;
                        break;
                    }
                    ancestor = ancestor.parent;
                }
            }
            
            if (foundTarget) {
                // Update transformation to the NEW target coordinates
                // We preserve scale(0.1) to ensure the shrink effect continues
                el.setAttribute('transform', `translate(${targetX}, ${targetY}) scale(0.1)`);
            } else {
                // Parent also gone and no visible ancestor found? 
                // Just shrink in place (fallback to avoid jumping to 0,0)
                const currentTransform = el.getAttribute('transform');
                if (currentTransform && !currentTransform.includes('translate')) {
                     // Only if not already set, otherwise let it keep existing transform
                }
            }
        });
    }

    createNodeElement(n) {
        const g = this.engine.createSVG('g', { class: 'node-group', 'data-id': n.id });
        
        // Save parent ID for collapse animation logic
        if (n.parent) g.dataset.parentId = n.parent.id;
        
        // 1. Hit Area - Robust Invisible Circle
        const hit = this.engine.createSVG('circle', { 
            class: 'hit-area', 
            r: 60, 
            fill: 'rgba(0,0,0,0)', 
            'pointer-events': 'all'
        });
        g.appendChild(hit);

        // 2. Body (Path or Circle)
        const body = this.engine.createSVG('path', { class: 'node-body', stroke: '#fff', 'stroke-width': 3 });
        g.appendChild(body);

        // 3. Icon
        const icon = this.engine.createSVG('text', { 
            class: 'node-icon', 'text-anchor': 'middle', dy: '0.35em',
            style: 'font-size: 38px; pointer-events: none;'
        });
        g.appendChild(icon);

        // 4. Label
        const labelG = this.engine.createSVG('g', { class: 'label-group', transform: 'translate(0, 55)' });
        const labelRect = this.engine.createSVG('rect', { rx: 10, ry: 10, height: 24, fill: 'rgba(255,255,255,0.9)' });
        const labelText = this.engine.createSVG('text', { 
            class: 'label-text', dy: 17, 'text-anchor': 'middle', 
            'font-size': '12px', 'font-weight': 'bold', fill: '#334155' 
        });
        labelG.appendChild(labelRect);
        labelG.appendChild(labelText);
        g.appendChild(labelG);

        // 5. Expand Badge
        const badgeG = this.engine.createSVG('g', { class: 'badge', transform: 'translate(35, -35)', display: 'none' });
        badgeG.appendChild(this.engine.createSVG('circle', { r: 12, fill: '#22c55e', stroke: '#fff', 'stroke-width': 2 }));
        const badgeText = this.engine.createSVG('text', { dy: 5, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 'bold' });
        badgeText.textContent = '+';
        badgeG.appendChild(badgeText);
        g.appendChild(badgeG);

        // Events
        g.onclick = (e) => this.handleNodeClick(e, n.data);
        g.onpointerdown = (e) => this.handleNodeDragStart(e, n.data);

        return g;
    }

    updateNodeVisuals(g, layoutNode, isConstruct, isSelected, isCompleted, isHarvested) {
        const d = layoutNode.data;
        const body = g.querySelector('.node-body');
        const icon = g.querySelector('.node-icon');
        const labelText = g.querySelector('.label-text');
        const labelRect = g.querySelector('.label-group rect');
        const badge = g.querySelector('.badge');
        
        // -- Shape Logic --
        let shapeD = "";
        let radius = d.type === 'root' ? 60 : 45;
        
        if (d.type === 'leaf') {
            if (isConstruct) shapeD = `M${-radius},${-radius*0.6} h${radius*2} v${radius*1.2} h${-radius*2} Z`; // Box
            else shapeD = "M0,0 C-35,15 -45,45 0,85 C45,45 35,15 0,0"; // Teardrop
        } else if (d.type === 'exam') {
            shapeD = `M0,${-radius*1.2} L${radius*1.2},0 L0,${radius*1.2} L${-radius*1.2},0 Z`; // Diamond
        } else {
            shapeD = `M 0 0 m -${radius}, 0 a ${radius},${radius} 0 1,0 ${radius*2},0 a ${radius},${radius} 0 1,0 -${radius*2},0`; // Circle
        }
        body.setAttribute('d', shapeD);

        // -- Color Logic --
        let fill = '#F59E0B'; // Default Branch
        let stroke = '#fff';
        let filter = 'url(#drop-shadow)';

        if (isConstruct) {
            // Updated Construction Style for High Contrast / Transparency
            fill = isSelected ? '#dc2626' : 'rgba(15, 23, 42, 0.6)'; // Red if selected, Dark see-through if not
            stroke = isSelected ? '#fff' : '#f59e0b';
            filter = 'none';
            body.setAttribute('stroke-dasharray', isSelected ? '0' : '4,2');
        } else {
            body.removeAttribute('stroke-dasharray');
            if (d.type === 'root') fill = '#8D6E63';
            else if (d.type === 'leaf') fill = isCompleted ? '#22c55e' : '#a855f7';
            else if (d.type === 'exam') fill = isCompleted ? '#22c55e' : '#ef4444';
            
            if (d.isEmpty) fill = '#cbd5e1'; // Empty state
            if (isHarvested) { fill = '#D97706'; filter = 'url(#leaf-glow)'; }
        }
        
        body.setAttribute('fill', fill);
        body.setAttribute('stroke', stroke);
        body.style.filter = filter;

        // -- Icon --
        icon.textContent = d.icon || '📄';
        if (!isConstruct && d.type === 'exam' && isCompleted) icon.textContent = '✔';
        if (isConstruct && d.type === 'root') icon.textContent = '🏗️';
        if (isConstruct && d.type === 'branch' && !d.icon) icon.textContent = '📁';
        
        // Center icon adjustment for teardrop
        if (!isConstruct && d.type === 'leaf') icon.setAttribute('y', 42);
        else icon.setAttribute('y', 0);

        // -- Label (Premium & Dark Mode Compliance) --
        labelText.textContent = d.name.length > 20 ? d.name.substring(0, 18) + '...' : d.name;
        // Resize rect based on text length (Approximation: 8px per char)
        const textWidth = Math.max(60, d.name.length * 8);
        labelRect.setAttribute('width', textWidth + 20);
        labelRect.setAttribute('x', -(textWidth + 20)/2);
        
        // Theme-aware Label Styling
        const theme = store.value.theme;
        const labelBg = theme === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        const labelTextFill = theme === 'dark' ? '#e2e8f0' : '#334155';
        
        labelRect.setAttribute('fill', labelBg);
        labelText.setAttribute('fill', labelTextFill);
        
        // Label position
        const labelY = (!isConstruct && d.type === 'leaf') ? 90 : 55;
        g.querySelector('.label-group').setAttribute('transform', `translate(0, ${labelY})`);

        // -- Badge (Expand/Collapse) --
        if (!isConstruct && (d.type === 'branch' || d.type === 'root')) {
            badge.style.display = 'block';
            badge.querySelector('text').textContent = d.expanded ? '-' : '+';
            badge.querySelector('circle').setAttribute('fill', d.expanded ? '#ef4444' : '#22c55e');
        } else {
            badge.style.display = 'none';
        }
    }

    // --- INTERACTIONS ---

    handleNodeClick(e, nodeData) {
        e.stopPropagation();
        
        if (this.isDraggingNode) return; // Prevent click during drag

        if (store.value.constructionMode) {
            this.selectedNodeId = nodeData.id;
            // Reset move mode on new selection
            this.isMoveMode = false;
            this.updateGraph();
            this.renderArchitectDock();
        } else {
            store.toggleNode(nodeData.id);
            // Camera Pan logic
            if (nodeData.type === 'branch' || nodeData.type === 'root') {
                const pos = this.nodePositions.get(nodeData.id);
                if (pos) this.panTo(pos.x, pos.y);
            }
        }
    }
    
    // DRAG LOGIC (Construction Only)
    handleNodeDragStart(e, nodeData) {
        if (!store.value.constructionMode || !this.isMoveMode) return;
        if (this.selectedNodeId !== nodeData.id) return;
        if (nodeData.type === 'root') return; // Cannot move root

        e.stopPropagation();
        
        const startPoint = this.viewport.screenToWorld(e.clientX, e.clientY);
        this.isDraggingNode = true;
        this.dragTargetId = nodeData.id;
        
        this.svg.setPointerCapture(e.pointerId);
        
        // Show Drag Line
        const parentPos = this.nodePositions.get(nodeData.parentId);
        if (parentPos) {
            this.dragLine.setAttribute('x1', parentPos.x);
            this.dragLine.setAttribute('y1', parentPos.y);
            this.dragLine.setAttribute('x2', startPoint.x);
            this.dragLine.setAttribute('y2', startPoint.y);
            this.dragLine.style.display = 'block';
        }

        const onMove = (evt) => {
            const p = this.viewport.screenToWorld(evt.clientX, evt.clientY);
            // Move visual representation of node (ghost)
            const g = this.renderedNodes.get(nodeData.id);
            if(g) g.setAttribute('transform', `translate(${p.x}, ${p.y}) scale(1)`);
            
            // Update line
            this.dragLine.setAttribute('x2', p.x);
            this.dragLine.setAttribute('y2', p.y);
            
            // Highlight drop target?
            // Simple distance check against all visible nodes
            this.highlightDropTarget(p.x, p.y, nodeData.id);
        };

        const onUp = (evt) => {
            this.isDraggingNode = false;
            this.dragLine.style.display = 'none';
            this.svg.releasePointerCapture(evt.pointerId);
            this.svg.removeEventListener('pointermove', onMove);
            this.svg.removeEventListener('pointerup', onUp);
            
            const dropId = this.findDropTarget(nodeData.id);
            if (dropId && dropId !== nodeData.parentId) {
                store.moveNode(nodeData, dropId);
                this.isMoveMode = false;
            }
            
            // Reset visuals (Graph update will fix position)
            this.updateGraph();
        };

        this.svg.addEventListener('pointermove', onMove);
        this.svg.addEventListener('pointerup', onUp);
    }
    
    highlightDropTarget(x, y, selfId) {
        // Clear previous highlights
        this.nodesLayer.querySelectorAll('.node-body').forEach(el => el.classList.remove('drop-target'));
        
        let minDist = 80;
        let target = null;
        
        for (const [id, pos] of this.nodePositions) {
            if (id === selfId) continue;
            const dx = x - pos.x;
            const dy = y - pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < minDist) {
                minDist = dist;
                target = id;
            }
        }
        
        if (target) {
            const g = this.renderedNodes.get(target);
            if (g) {
                // We use a class or direct style. Let's use direct style for speed.
                g.querySelector('.node-body').setAttribute('stroke', '#22c55e');
                g.querySelector('.node-body').setAttribute('stroke-width', 5);
                this.dragGhost = target; // repurpose var
            }
        }
    }
    
    findDropTarget(selfId) {
        // Re-run logic or use cached from highlight
        // Since we are in the 'up' handler, dragGhost holds the last highlighted target
        return this.dragGhost; 
    }

    // --- HELPERS ---

    panTo(x, y) {
        // Center (x,y) on screen
        const k = this.viewport.transform.k;
        const tx = (this.width / 2) - (x * k);
        const ty = (this.height / 2) - (y * k);
        this.viewport.zoomTo(tx, ty, k, 500);
    }
    
    focusNode(nodeId) {
        const pos = this.nodePositions.get(nodeId);
        if (pos) {
            const isMobile = this.width < 768;
            const k = isMobile ? 1.6 : 1.3;
            const tx = (this.width / 2) - (pos.x * k);
            const ty = (this.height * 0.6) - (pos.y * k);
            this.viewport.zoomTo(tx, ty, k, 1200);
        }
    }

    renderArchitectDock() {
        const container = this.querySelector('#architect-ui');
        if (!container) return;
        
        if (!store.value.constructionMode || !this.selectedNodeId) {
            container.innerHTML = '';
            return;
        }
        
        const pos = this.nodePositions.get(this.selectedNodeId);
        if (!pos) return;
        
        // Project to screen
        const t = this.viewport.transform;
        const sx = pos.x * t.k + t.x;
        const sy = pos.y * t.k + t.y;
        
        const verticalOffset = (65 * t.k) + 15; 
        
        const node = store.findNode(this.selectedNodeId);
        if(!node) return;

        const isRoot = node.type === 'root';
        const isLeaf = node.type === 'leaf' || node.type === 'exam';
        const canWrite = fileSystem.features.canWrite;
        const ui = store.ui;

        let controls = '';
        if (!canWrite) {
            controls = `<div class="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><span>🔒</span> ${ui.graphReadOnly || 'Read Only'}</div>`;
        } else {
            controls = `
                <button class="${this.isMoveMode ? 'active-move' : ''}" id="dock-move" title="${ui.graphMove}">
                    ${this.isMoveMode ? '✋' : '✥'}
                </button>
                <div style="width:1px; height:20px; background:#475569; margin:0 4px"></div>
                <button id="dock-edit" title="${ui.graphEdit}">✏️</button>
                ${!isLeaf ? `
                    <button id="dock-add-folder" title="${ui.graphAddFolder}">📁+</button>
                    <button id="dock-add-file" title="${ui.graphAddLesson}">📄+</button>
                ` : ''}
                ${!isRoot ? `
                    <div style="width:1px; height:20px; background:#475569; margin:0 4px"></div>
                    <button id="dock-delete" title="${ui.graphDelete}" style="color:#ef4444">🗑️</button>
                ` : ''}
            `;
        }

        container.innerHTML = `
            <div class="architect-dock animate-in fade-in zoom-in duration-200" style="top: ${sy + verticalOffset}px; left: ${sx}px;">
                ${controls}
            </div>
        `;
        
        // Bind
        const bind = (id, fn) => {
            const b = container.querySelector(`#${id}`);
            if(b) b.onclick = (e) => { e.stopPropagation(); fn(); };
        };
        
        if (canWrite) {
            bind('dock-move', () => { 
                this.isMoveMode = !this.isMoveMode; 
                this.renderArchitectDock();
            });
            bind('dock-edit', () => {
                if (node.type === 'branch' || node.type === 'root') store.setModal({ type: 'node-properties', node: node });
                else store.openEditor(node);
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
            if (await store.confirm(`Delete '${node.name}'?`, 'Delete Node', true)) {
                try {
                    const type = (node.type === 'branch' || node.type === 'root') ? 'folder' : 'file';
                    await fileSystem.deleteNode(parentPath, type);
                    this.selectedNodeId = null;
                    this.isMoveMode = false;
                    store.loadData(store.value.activeSource, false);
                } catch(err) { store.alert("Error: " + err.message); }
            }
        }
        else if (action === 'new-file' || action === 'new-folder') {
            const label = action === 'new-folder' ? "Folder Name:" : "Lesson Name:";
            const name = await store.prompt(label, "Untitled", "New Node");
            if (name) {
                const type = action === 'new-folder' ? 'folder' : 'file';
                try {
                    await fileSystem.createNode(parentPath, name, type);
                    store.loadData(store.value.activeSource, false);
                } catch(err) { store.alert("Error: " + err.message); }
            }
        }
    }
    
    renderOverlays() {
        const overlayContainer = this.querySelector('#overlays');
        if(!overlayContainer) return;
        
        const state = store.value;
        const ui = store.ui;
        
        let html = '';
        if (state.constructionMode) {
            html += `<div class="absolute top-0 left-0 w-full h-8 bg-yellow-500 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 z-[60] shadow-md striped-bg"><span>🚧 ${ui.navConstruct || 'CONSTRUCTION MODE'} 🚧</span></div>`;
        }
        overlayContainer.innerHTML = html;
    }
}

customElements.define('arbor-graph', ArborGraph);
