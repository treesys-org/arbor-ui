
import { store } from '../store.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 0;
        this.transform = { x: 0, y: 0, k: 1 }; // Zoom/Pan state
        this.nodes = [];
        this.links = [];
        
        // Cache for interaction
        this.hoverNode = null;
        
        // Animation Loop
        this.isAnimating = false;
        this.render = this.render.bind(this);
        
        // Configuration
        this.config = {
            nodeRadius: 40,
            levelHeight: 250,
            colors: {
                link: '#8D6E63',
                linkDone: '#22c55e',
                leaf: '#a855f7',
                exam: '#ef4444',
                branch: '#F59E0B',
                root: '#8D6E63',
                fruit: '#FCD34D',
                textLight: '#ffffff',
                textDark: '#1e293b'
            }
        };
    }

    connectedCallback() {
        this.innerHTML = `
        <div id="graph-container" class="w-full h-full relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500 select-none">
             <!-- Clouds (CSS Animation is cheaper than Canvas for background static elements) -->
             <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl select-none animate-pulse" style="animation-duration: 10s">☁️</div>
             <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl select-none animate-pulse" style="animation-duration: 15s">☁️</div>
             
             <canvas id="main-canvas" class="block w-full h-full cursor-grab active:cursor-grabbing touch-none"></canvas>
             
             <!-- Overlays Container -->
             <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
        </div>`;

        this.canvas = this.querySelector('#main-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization

        // Resize Observer
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.querySelector('#graph-container'));

        // Events
        store.addEventListener('graph-update', () => this.calculateLayout());
        store.addEventListener('state-change', () => {
             this.renderOverlays();
             this.requestRender();
        });
        
        store.addEventListener('focus-node', (e) => {
             this.focusNode(e.detail);
        });

        this.initZoom();
        this.initInteraction();
        this.renderOverlays(); // Initial UI state
        
        // Initial Layout if data exists
        if(store.value.data) this.calculateLayout();
    }

    disconnectedCallback() {
        if(this.resizeObserver) this.resizeObserver.disconnect();
        this.isAnimating = false;
    }

    handleResize() {
        const container = this.querySelector('#graph-container');
        if (!container || !this.canvas) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        
        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr); // Normalize coordinate system
        
        this.requestRender();
    }

    initZoom() {
        // Use D3 Zoom behavior, but apply it to Canvas Context
        this.zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => {
                this.transform = e.transform;
                this.requestRender();
            });

        d3.select(this.canvas).call(this.zoomBehavior)
            .on("dblclick.zoom", null);
        
        // Initial Transform Center
        setTimeout(() => {
             const k = 0.85;
             const tx = (this.width / 2) * (1 - k);
             const ty = (this.height * 0.85) - (this.height - 100) * k;
             d3.select(this.canvas).call(this.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
        }, 100);
    }

    initInteraction() {
        // Hit Detection Logic
        const getMousePos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            // Handle touch or mouse
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            // Raw screen coords relative to canvas
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;

            // Invert Zoom Transform to get World Coords
            const worldX = (screenX - this.transform.x) / this.transform.k;
            const worldY = (screenY - this.transform.y) / this.transform.k;
            
            return { x: worldX, y: worldY };
        };

        const findNodeAt = (pos) => {
            // Reverse loop to catch top-most elements first
            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const n = this.nodes[i];
                // Simple circle collision
                const dx = pos.x - n.x;
                const dy = pos.y - n.y;
                // Hitbox slightly larger than visual radius (60px)
                if (dx*dx + dy*dy < 60*60) {
                    return n;
                }
            }
            return null;
        };

        // Pointer Move (Hover effect)
        this.canvas.addEventListener('mousemove', (e) => {
            const pos = getMousePos(e);
            const node = findNodeAt(pos);
            
            if (this.hoverNode !== node) {
                this.hoverNode = node;
                this.canvas.style.cursor = node ? 'pointer' : 'grab';
                this.requestRender();
            }
        });

        // Click / Tap
        this.canvas.addEventListener('click', (e) => {
            const pos = getMousePos(e);
            const node = findNodeAt(pos);
            
            if (node) {
                if (node.data.status === 'loading') return;
                store.toggleNode(node.data.id);
            }
        });
    }

    // --- LOGIC: Layout Calculation (D3) ---
    calculateLayout() {
        if (!store.value.data) return;

        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        
        // Calculate Width based on leaves
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        const dynamicWidth = Math.max(this.width, leaves * 180);

        const treeLayout = d3.tree().size([dynamicWidth, 1]);
        treeLayout(root);

        // Transform to Canvas Coordinates (Bottom-Up Tree)
        root.descendants().forEach(d => {
            d.y = (this.height - 150) - (d.depth * this.config.levelHeight);
            if (dynamicWidth < this.width) {
                d.x += (this.width - dynamicWidth) / 2;
            }
        });

        this.nodes = root.descendants();
        this.links = root.links();
        
        this.requestRender();
    }

    // --- RENDERING: The Loop ---
    requestRender() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            requestAnimationFrame(this.render);
        }
    }

    render() {
        this.isAnimating = false;
        if (!this.ctx || !this.width || !this.height) return;

        // 1. Clear
        // Use a solid color fill instead of clearRect to avoid transparency artifacts with the gradient background div
        // actually clearRect is fine because the canvas is transparent over the CSS gradient div.
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 2. Save Context & Apply Zoom
        this.ctx.save();
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.k, this.transform.k);

        // 3. Draw Scene
        this.drawGround();
        this.drawLinks();
        this.drawNodes();

        this.ctx.restore();
    }

    drawGround() {
        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';
        
        const cx = this.width / 2;
        const groundY = this.height;
        const width = Math.max(this.width * 2, 5000); // Infinite-ish ground
        const depth = 2000;

        // Back Hill
        this.ctx.beginPath();
        this.ctx.fillStyle = backColor;
        this.ctx.globalAlpha = 0.7;
        this.ctx.moveTo(cx - width, groundY);
        this.ctx.bezierCurveTo(cx - 500, groundY - 180, cx + 500, groundY - 60, cx + width, groundY);
        this.ctx.lineTo(cx + width, groundY + depth);
        this.ctx.lineTo(cx - width, groundY + depth);
        this.ctx.fill();

        // Front Hill
        this.ctx.beginPath();
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 1.0;
        this.ctx.moveTo(cx - width, groundY);
        this.ctx.quadraticCurveTo(cx, groundY - 120, cx + width, groundY);
        this.ctx.lineTo(cx + width, groundY + depth);
        this.ctx.lineTo(cx - width, groundY + depth);
        this.ctx.fill();
    }

    drawLinks() {
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';

        this.links.forEach(link => {
            const s = link.source;
            const t = link.target;
            const isDone = store.isCompleted(t.data.id);

            this.ctx.strokeStyle = isDone ? this.config.colors.linkDone : this.config.colors.link;
            // Adjust width based on depth
            this.ctx.lineWidth = Math.max(2, 12 - t.depth * 2);

            this.ctx.beginPath();
            const midY = (s.y + t.y) / 2;
            this.ctx.moveTo(s.x, s.y);
            this.ctx.bezierCurveTo(s.x, midY, t.x, midY, t.x, t.y);
            this.ctx.stroke();
        });
    }

    drawNodes() {
        const harvested = store.value.gamification.fruits;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Draw Shadows/Glows first (batching for performance)
        // Note: Canvas shadows are expensive, use sparingly or fake with extra draws
        
        this.nodes.forEach(node => {
            const d = node.data;
            const x = node.x;
            const y = node.y;
            const isHover = this.hoverNode === node;
            const isCompleted = store.isCompleted(d.id);
            const isHarvested = harvested.find(f => f.id === d.id);
            
            // --- Shape Logic ---
            let radius = d.type === 'root' ? 60 : 45;
            if (isHover) radius *= 1.1;

            this.ctx.fillStyle = this.getNodeColor(d, isCompleted, isHarvested);
            
            // Shadows
            if (isHover || isCompleted || isHarvested) {
                this.ctx.shadowColor = isCompleted ? this.config.colors.linkDone : 'rgba(0,0,0,0.3)';
                this.ctx.shadowBlur = 15;
            } else {
                this.ctx.shadowColor = 'rgba(0,0,0,0.2)';
                this.ctx.shadowBlur = 5;
            }
            this.ctx.shadowOffsetY = 4;

            this.ctx.beginPath();
            if (d.type === 'leaf') {
                // Leaf Shape approximation
                this.ctx.moveTo(x, y + radius);
                this.ctx.quadraticCurveTo(x - radius, y, x, y - radius);
                this.ctx.quadraticCurveTo(x + radius, y, x, y + radius);
            } else if (d.type === 'exam') {
                // Diamond
                const r = radius * 1.2;
                this.ctx.moveTo(x, y - r);
                this.ctx.lineTo(x + r, y);
                this.ctx.lineTo(x, y + r);
                this.ctx.lineTo(x - r, y);
            } else {
                // Circle (Branches/Root)
                this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            }
            this.ctx.fill();
            
            // Border
            this.ctx.shadowColor = 'transparent'; // Reset shadow for stroke
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.stroke();

            // --- Icon ---
            let icon = d.icon || (d.type === 'exam' ? '⚔️' : '🌱');
            if (isHarvested) icon = isHarvested.icon;
            else if ((d.type === 'leaf' || d.type === 'exam') && isCompleted) icon = '✓';

            this.ctx.font = `${isCompleted ? '900' : '400'} ${radius * 0.8}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            this.ctx.fillStyle = (d.type === 'leaf' || d.type === 'exam') && isCompleted ? '#ffffff' : '#1e293b';
            this.ctx.fillText(icon, x, y + (d.type === 'leaf' ? radius * 0.1 : 0)); // Visual adjustment

            // --- Loading Spinner ---
            if (d.status === 'loading') {
                this.drawSpinner(x, y, radius + 10);
            }

            // --- Badge (+/-) ---
            if (d.type === 'branch' || d.type === 'root') {
                const badgeX = x + radius * 0.7;
                const badgeY = y - radius * 0.7;
                const rBadge = 14;
                
                this.ctx.beginPath();
                this.ctx.arc(badgeX, badgeY, rBadge, 0, Math.PI * 2);
                this.ctx.fillStyle = d.expanded ? '#ef4444' : '#22c55e';
                this.ctx.fill();
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.stroke();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '700 16px Nunito, sans-serif';
                this.ctx.fillText(d.expanded ? '-' : '+', badgeX, badgeY + 1);
            }

            // --- Label ---
            this.drawLabel(x, y, d.name, d.type);
        });
    }

    drawLabel(x, y, text, type) {
        const yOffset = (type === 'leaf' || type === 'exam') ? 65 : 55;
        const labelY = y + yOffset;
        
        this.ctx.font = '800 16px Nunito, sans-serif';
        const metrics = this.ctx.measureText(text);
        const padding = 20;
        const w = metrics.width + padding;
        const h = 28;
        
        // Background Pill
        this.ctx.beginPath();
        this.ctx.roundRect(x - w/2, labelY, w, h, 10);
        this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
        this.ctx.fill();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.stroke();

        // Text
        this.ctx.fillStyle = '#334155';
        this.ctx.fillText(text, x, labelY + h/2 + 2);
    }

    drawSpinner(x, y, r) {
        // Simple rotating arc
        const time = Date.now() / 300;
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, time, time + 1.5); // Quarter circle
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
        this.requestRender(); // Keep animating if loading
    }

    getNodeColor(d, isCompleted, isHarvested) {
        if (isHarvested) return this.config.colors.fruit;
        if (d.type === 'root') return this.config.colors.root;
        if (isCompleted) return this.config.colors.linkDone;
        if (d.type === 'exam') return this.config.colors.exam;
        if (d.type === 'leaf') return this.config.colors.leaf;
        return this.config.colors.branch;
    }

    // --- Helpers ---
    focusNode(nodeId) {
        const node = this.nodes.find(n => n.data.id === nodeId);
        if (node) {
            // Smooth zoom to node logic via D3 transition, but applying to canvas
            const scale = 1.2;
            const t = d3.zoomIdentity
                .translate(this.width/2, this.height * 0.7)
                .scale(scale)
                .translate(-node.x, -node.y);
            
            d3.select(this.canvas).transition().duration(1200)
                .call(this.zoomBehavior.transform, t);
        }
    }

    renderOverlays() {
        const overlayContainer = this.querySelector('#overlays');
        if(!overlayContainer) return;
        
        const state = store.value;
        const ui = store.ui;
        
        let html = '';

        // Reuse existing overlay logic from previous graph implementation
        // Kept simple for brevity but essential for UX (Error messages, loading spinners)
        if (state.lastErrorMessage) {
            html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded shadow-2xl animate-in fade-in flex items-center gap-3 max-w-md w-[90%] pointer-events-auto">
                <div class="flex-1"><p class="font-bold">Error</p><p class="text-sm">${state.lastErrorMessage}</p></div>
                <button onclick="store.update({lastErrorMessage:null})" class="text-red-500">✕</button>
            </div>`;
        }

        if (state.lastActionMessage) {
            html += `<div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-green-500 text-white px-8 py-3 rounded-full shadow-2xl animate-in fade-in font-bold pointer-events-none">${state.lastActionMessage}</div>`;
        }

        if (state.loading) {
            html += `
            <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
              <div class="w-16 h-16 border-4 border-sky-200 border-t-green-500 rounded-full animate-spin mb-4"></div>
              <p class="font-bold text-sky-600 dark:text-sky-400 animate-pulse text-xl">${ui.loading}</p>
            </div>`;
        } else if (state.error) {
             html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[#8D6E63] border-4 border-[#5D4037] rounded-lg p-8 shadow-2xl text-center pointer-events-auto text-white">
                  <div class="text-5xl mb-4">🍂</div>
                  <h2 class="font-black text-2xl mb-2">${ui.errorTitle}</h2>
                  <p class="text-amber-100 font-mono text-sm">${state.error}</p>
            </div>`;
        }
        overlayContainer.innerHTML = html;
    }
}
customElements.define('arbor-graph', ArborGraph);
