

import { store } from '../store.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.g = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;
        this.duration = 750;
        // Cache to store where nodes are, so we can animate FROM there or TO there
        this.nodePositions = new Map();
    }

    connectedCallback() {
        this.innerHTML = `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500" style="touch-action: none;">
             <!-- Clouds -->
             <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl select-none animate-pulse" style="animation-duration: 10s">☁️</div>
             <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl select-none animate-pulse" style="animation-duration: 15s">☁️</div>
             
             <!-- Overlays Container -->
             <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
        </div>`;

        requestAnimationFrame(() => {
             this.initGraph();
             this.renderOverlays();
        });

        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
             if(this.g) this.drawGround(); 
             this.renderOverlays();
        });
        
        // External focus request (search, deep link)
        store.addEventListener('focus-node', (e) => this.focusNode(e.detail));
        
        window.addEventListener('resize', () => {
            const container = this.querySelector('#chart');
            if (container) {
                this.width = container.clientWidth;
                this.height = container.clientHeight;
                if(this.svg) {
                    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
                    this.updateZoomExtent();
                    this.drawGround();
                    this.updateGraph();
                }
            }
        });
    }
    
    renderOverlays() {
        const overlayContainer = this.querySelector('#overlays');
        if(!overlayContainer) return;
        
        const state = store.value;
        const ui = store.ui;
        
        let html = '';

        if (state.lastErrorMessage) {
            html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded shadow-2xl animate-in fade-in slide-in-from-top-4 pointer-events-auto flex items-center gap-3 max-w-md w-[90%]">
                <svg class="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div class="flex-1">
                    <p class="font-bold">Error</p>
                    <p class="text-sm">${state.lastErrorMessage}</p>
                </div>
                <button onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-800">✕</button>
            </div>`;
        }

        if (state.loading) {
            html += `
            <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
              <div class="w-16 h-16 border-4 border-sky-200 border-t-green-500 rounded-full animate-spin mb-4"></div>
              <p class="font-bold text-sky-600 dark:text-sky-400 animate-pulse tracking-wide font-comic text-xl">${ui.loading}</p>
            </div>`;
        } else if (state.error) {
             html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-in pointer-events-auto">
                 <div class="w-full flex justify-between px-8 absolute -top-16 h-20 z-0">
                     <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
                     <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
                 </div>
                 <div class="bg-[#8D6E63] border-4 border-[#5D4037] rounded-lg p-8 shadow-2xl relative max-w-md text-center transform rotate-1 z-10 flex flex-col items-center">
                      <div class="text-5xl mb-4 drop-shadow-lg">🍂</div>
                      <h2 class="text-white font-black text-2xl mb-2 drop-shadow-md uppercase tracking-widest border-b-2 border-white/20 pb-2 w-full">
                          ${ui.errorTitle}
                      </h2>
                      <p class="text-amber-100 font-bold font-mono text-sm leading-relaxed mb-4">
                        ${state.error}
                      </p>
                      <div class="text-amber-200/60 text-xs font-bold uppercase tracking-widest border-t border-white/10 pt-2 w-full">
                          ${ui.errorNoTrees}
                      </div>
                 </div>
            </div>`;
        }
        overlayContainer.innerHTML = html;
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

        // --- Filters ---
        const defs = this.svg.append("defs");
        
        // 1. Drop Shadow
        const filter = defs.append("filter").attr("id", "drop-shadow");
        filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3);
        filter.append("feOffset").attr("dx", 0).attr("dy", 3);
        filter.append("feComponentTransfer").append("feFuncA").attr("type","linear").attr("slope",0.3); // Softer shadow
        const merge = filter.append("feMerge");
        merge.append("feMergeNode");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

        // 2. Leaf Glow
        const leafGlow = defs.append("filter")
            .attr("id", "leaf-glow")
            .attr("x", "-50%").attr("y", "-50%")
            .attr("width", "200%").attr("height", "200%");
        leafGlow.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "coloredBlur");
        const lgMerge = leafGlow.append("feMerge");
        lgMerge.append("feMergeNode").attr("in", "coloredBlur");
        lgMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // --- Layers ---
        this.g = this.svg.append("g");
        this.groundGroup = this.g.append("g").attr("class", "ground");
        this.linkGroup = this.g.append("g").attr("class", "links");
        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.drawGround();

        // --- Zoom Behavior ---
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => {
                this.g.attr("transform", e.transform);
                // Parallax could go here, but kept simple for stability
            });
        
        this.svg.call(this.zoom).on("dblclick.zoom", null);
        this.updateZoomExtent();

        // Initial Position (Bottom Center)
        const k = 0.85;
        const tx = (this.width / 2) * (1 - k);
        const ty = (this.height * 0.85) - (this.height - 100) * k;
        this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));

        if(store.value.data) this.updateGraph();
    }

    updateZoomExtent() {
        if (!this.zoom) return;
        
        // Moderate bounds - enough to pan but not get lost
        const horizontalPadding = this.width * 2;
        const topPadding = this.height * 10;
        
        // Prevent panning below the ground (the +150 allows just a little bounce)
        const bottomPadding = this.height + 150;

        this.zoom.translateExtent([
            [-horizontalPadding, -topPadding], 
            [horizontalPadding * 2, bottomPadding]
        ]);
    }

    drawGround() {
        this.groundGroup.selectAll("*").remove();
        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';

        const cx = this.width / 2;
        const groundY = this.height;
        // Finite width: wider than screen but not infinite
        const groundWidth = Math.max(this.width * 1.5, 3000); 
        const groundDepth = 4000;

        // Back Hill (Parallax-ish background layer)
        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} 
                        C${cx - 500},${groundY - 180} ${cx + 500},${groundY - 60} ${cx + groundWidth},${groundY} 
                        L${cx + groundWidth},${groundY + groundDepth} 
                        L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", backColor)
            .style("opacity", 0.7);

        // Front Hill (Main Ground)
        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} 
                        Q${cx},${groundY - 120} ${cx + groundWidth},${groundY} 
                        L${cx + groundWidth},${groundY + groundDepth} 
                        L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", color);
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        // 1. Construct Hierarchy
        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        
        // 2. Tree Layout
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        const dynamicWidth = Math.max(this.width, leaves * 140);

        const treeLayout = d3.tree().size([dynamicWidth, 1]);
        treeLayout(root);

        // 3. Coordinate Transformation (Invert Y for growing Up)
        const levelHeight = 180;
        root.descendants().forEach(d => {
            d.y = (this.height - 150) - (d.depth * levelHeight);
            if (dynamicWidth < this.width) {
                d.x += (this.width - dynamicWidth) / 2;
            }
        });

        const nodes = root.descendants();
        const links = root.links();

        // 4. Animation Origin Logic (The key fix for "collapsing poorly")
        // We use cached positions to determine where nodes should fly FROM or TO.
        
        const findOrigin = (d) => {
            // New node entering? Start from parent's OLD position if possible
            if (d.parent && this.nodePositions.has(d.parent.data.id)) {
                return this.nodePositions.get(d.parent.data.id);
            }
            // Fallback
            return { x: this.width / 2, y: this.height };
        };

        const findDest = (d) => {
            // Node leaving? Fly to parent's NEW position
            if (d.parent) {
                const parentInNewLayout = nodes.find(n => n.data.id === d.parent.data.id);
                if (parentInNewLayout) return { x: parentInNewLayout.x, y: parentInNewLayout.y };
            }
            return { x: this.width/2, y: this.height };
        };

        // --- NODES RENDER ---
        const nodeSelection = this.nodeGroup.selectAll("g.node")
            .data(nodes, d => d.data.id);

        // ENTER
        const nodeEnter = nodeSelection.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => {
                const o = findOrigin(d);
                return `translate(${o.x},${o.y}) scale(0)`;
            })
            .style("cursor", "pointer")
            .on("click", (e, d) => this.handleNodeClick(e, d));

        // Visuals
        nodeEnter.append("path")
            .attr("class", "node-body")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3);

        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "24px")
            .style("user-select", "none")
            .style("pointer-events", "none");

        // Labels
        const labelGroup = nodeEnter.append("g")
            .attr("transform", d => `translate(0, ${d.data.type === 'leaf' ? 55 : 45})`);
        
        labelGroup.append("rect")
            .attr("rx", 10).attr("ry", 10).attr("height", 22)
            .attr("fill", "rgba(255,255,255,0.95)")
            .attr("stroke", "#e2e8f0");
        
        labelGroup.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", 15)
            .attr("fill", "#334155")
            .attr("font-size", "12px")
            .attr("font-weight", "800")
            .style("pointer-events", "none")
            .text(d => d.data.name)
            .each(function() {
                try {
                    const bbox = this.getBBox();
                    d3.select(this.parentNode).select("rect")
                        .attr("x", -bbox.width/2 - 8)
                        .attr("width", bbox.width + 16);
                } catch(e){}
            });

        // Badges (+/-)
        const badge = nodeEnter.append("g")
            .attr("class", "badge-group")
            .attr("transform", d => `translate(${d.data.type === 'root' ? 30 : 22}, -${d.data.type === 'root' ? 30 : 22})`)
            .style("display", "none");

        badge.append("circle")
            .attr("r", 14).attr("stroke", "#fff").attr("stroke-width", 2)
            .style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))");

        badge.append("text")
            .attr("dy", "0.35em").attr("text-anchor", "middle")
            .attr("font-weight", "900").attr("font-size", "18px").attr("fill", "#ffffff");

        // Spinner
        nodeEnter.append("path")
            .attr("class", "spinner")
            .attr("d", "M-10,0 a10,10 0 0,1 20,0")
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 3)
            .style("display", "none")
            .append("animateTransform")
            .attr("attributeName", "transform").attr("type", "rotate")
            .attr("from", "0 0 0").attr("to", "360 0 0").attr("dur", "1s").attr("repeatCount", "indefinite");

        // UPDATE
        const nodeUpdate = nodeSelection.merge(nodeEnter).transition().duration(this.duration)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(1)`);

        nodeUpdate.select(".node-body")
            .attr("fill", d => {
                if (d.data.type === 'root') return '#8D6E63';
                if (d.data.type === 'leaf') return store.isCompleted(d.data.id) ? '#22c55e' : '#a855f7'; 
                return '#F59E0B'; 
            })
            .attr("d", d => {
                const r = d.data.type === 'root' ? 45 : 32;
                if (d.data.type === 'leaf') return "M0,0 C-25,10 -35,35 0,65 C35,35 25,10 0,0";
                return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
            })
            .style("filter", d => d.data.type === 'leaf' && store.isCompleted(d.data.id) ? "url(#leaf-glow)" : "url(#drop-shadow)");

        nodeUpdate.select(".node-icon")
            .text(d => d.data.type === 'leaf' && store.isCompleted(d.data.id) ? '✓' : (d.data.icon || '🌱'))
            .attr("fill", d => d.data.type === 'leaf' && store.isCompleted(d.data.id) ? '#fff' : '#1e293b')
            .attr("dy", d => d.data.type === 'leaf' ? "38px" : "0.35em")
            .attr("font-weight", d => d.data.type === 'leaf' && store.isCompleted(d.data.id) ? "900" : "normal");
        
        nodeUpdate.select(".badge-group")
            .style("display", d => d.data.type === 'leaf' ? 'none' : 'block');
        
        nodeUpdate.select(".badge-group circle")
            .attr("fill", d => d.data.expanded ? "#ef4444" : "#22c55e");

        nodeUpdate.select(".badge-group text")
            .text(d => d.data.expanded ? '-' : '+');

        nodeUpdate.select(".spinner")
            .style("display", d => d.data.status === 'loading' ? 'block' : 'none');

        // EXIT
        nodeSelection.exit().transition().duration(this.duration)
            .attr("transform", d => {
                 const dest = findDest(d); // Fly to parent's new position
                 return `translate(${dest.x},${dest.y}) scale(0)`;
            })
            .remove();

        // --- LINKS RENDER ---
        const linkSelection = this.linkGroup.selectAll(".link")
            .data(links, d => d.target.data.id);

        const linkEnter = linkSelection.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63")
            .attr("stroke-width", d => Math.max(2, 12 - d.target.depth * 2))
            .attr("d", d => {
                const o = findOrigin(d.target); // Start link from parent's old pos
                return this.diagonal({source: o, target: o});
            });

        linkSelection.merge(linkEnter).transition().duration(this.duration)
            .attr("d", d => this.diagonal(d));

        linkSelection.exit().transition().duration(this.duration)
            .attr("d", d => {
                const dest = findDest(d.target); // Shrink link to parent's new pos
                const o = {x: dest.x, y: dest.y};
                return this.diagonal({source: o, target: o});
            })
            .remove();

        // --- Cache Positions for Next Render ---
        this.nodePositions.clear();
        nodes.forEach(d => {
            this.nodePositions.set(d.data.id, {x: d.x, y: d.y});
        });
    }

    diagonal(d) {
        const s = d.source;
        const t = d.target;
        const midY = (s.y + t.y) / 2;
        return `M ${s.x} ${s.y} C ${s.x} ${midY}, ${t.x} ${midY}, ${t.x} ${t.y}`;
    }

    handleNodeClick(e, d) {
        e.stopPropagation();
        if (d.data.status === 'loading') return;
        
        // 1. Toggle State
        store.toggleNode(d.data.id);
        
        // 2. Adjust Camera Verticality (Auto-Pan)
        // If expanding, shift view slightly down so the new branches (which grow up) are visible
        if (!d.data.expanded) { 
            this.adjustVerticalView(d);
        }
    }

    adjustVerticalView(d) {
        if (!this.svg || !this.zoom) return;
        
        // Logic: Try to keep the clicked node in the lower 3/4 of the screen
        // to leave room for the tree growing upwards.
        
        const transform = d3.zoomTransform(this.svg.node());
        const currentScreenY = transform.apply([d.x, d.y])[1];
        const targetScreenY = this.height * 0.75; 
        const dy = targetScreenY - currentScreenY;
        
        // Only move if significantly far off
        if (Math.abs(dy) > 50) {
            this.svg.transition().duration(1000)
                .call(this.zoom.transform, transform.translate(0, dy / transform.k));
        }
    }

    focusNode(nodeId) {
        // Search in rendered nodes
        let target = null;
        this.nodeGroup.selectAll(".node").each(d => {
            if(d.data.id === nodeId) target = d;
        });

        if(target && this.zoom) {
             const transform = d3.zoomIdentity
                .translate(this.width/2, this.height * 0.7)
                .scale(1.2)
                .translate(-target.x, -target.y);
             
             this.svg.transition().duration(1200).call(this.zoom.transform, transform);
        }
    }
}
customElements.define('arbor-graph', ArborGraph);
