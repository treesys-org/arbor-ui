
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
    }

    connectedCallback() {
        this.innerHTML = `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500">
             <!-- Clouds -->
             <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl select-none">☁️</div>
             <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl select-none">☁️</div>
             
             <!-- Overlays Container -->
             <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
        </div>`;

        // Defer init to ensure container has size
        requestAnimationFrame(() => {
             this.initGraph();
             this.renderOverlays();
        });

        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
             if(this.g) this.drawGround(); 
             this.renderOverlays();
        });
        store.addEventListener('focus-node', (e) => this.focusNode(e.detail));
        
        window.addEventListener('resize', () => {
            if (this.querySelector('#chart')) {
                this.width = this.offsetWidth;
                this.height = this.offsetHeight;
                if(this.svg) {
                    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
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
        
        if (state.loading) {
            overlayContainer.innerHTML = `
            <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
              <div class="w-16 h-16 border-4 border-sky-200 border-t-green-500 rounded-full animate-spin mb-4"></div>
              <p class="font-bold text-sky-600 dark:text-sky-400 animate-pulse tracking-wide font-comic text-xl">${ui.loading}</p>
            </div>`;
        } else if (state.error) {
             overlayContainer.innerHTML = `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-in pointer-events-auto">
                 <div class="w-full flex justify-between px-8 absolute -top-16 h-20 z-0">
                     <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
                     <div class="w-1 h-full bg-amber-900/40 dark:bg-amber-900/20"></div>
                 </div>
                 <div class="bg-[#8D6E63] border-4 border-[#5D4037] rounded-lg p-8 shadow-2xl relative max-w-md text-center transform rotate-1 z-10 flex flex-col items-center">
                      <div class="absolute top-2 left-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                      <div class="absolute top-2 right-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                      <div class="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
                      <div class="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#3E2723] shadow-inner"></div>
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
        } else {
            overlayContainer.innerHTML = '';
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

        // Filters
        const defs = this.svg.append("defs");
        
        // 1. Drop Shadow
        const filter = defs.append("filter").attr("id", "drop-shadow");
        filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3);
        filter.append("feOffset").attr("dx", 0).attr("dy", 3);
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

        // Groups
        this.g = this.svg.append("g");
        this.groundGroup = this.g.append("g").attr("class", "ground");
        this.linkGroup = this.g.append("g").attr("class", "links");
        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.drawGround();

        // Zoom logic
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (e) => {
                this.g.attr("transform", e.transform);
                // Parallax ground
                this.groundGroup.attr("transform", `translate(${e.transform.x}, ${e.transform.y}) scale(${e.transform.k})`);
            });
        
        this.svg.call(this.zoom);

        // Initial Position (Bottom Center)
        const k = 0.85;
        const tx = (this.width / 2) * (1 - k);
        const ty = (this.height * 0.85) - (this.height - 100) * k;
        this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));

        if(store.value.data) this.updateGraph();
    }

    drawGround() {
        this.groundGroup.selectAll("*").remove();
        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';

        const bottom = this.height + 4000;
        
        // Back Hill
        this.groundGroup.append("path")
            .attr("d", `M-2000,${this.height} C${this.width * 0.2},${this.height - 180} ${this.width * 0.8},${this.height - 60} ${this.width + 2000},${this.height} L${this.width + 2000},${bottom} L-2000,${bottom} Z`)
            .attr("fill", backColor)
            .style("opacity", 0.7);

        // Front Hill
        this.groundGroup.append("path")
            .attr("d", `M-2000,${this.height} Q${this.width/2},${this.height - 120} ${this.width + 2000},${this.height} L${this.width+2000},${bottom} L-2000,${bottom} Z`)
            .attr("fill", color);
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        // Construct D3 Hierarchy
        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        
        // Calculate dynamic width based on leaves to prevent overlap
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        const dynamicWidth = Math.max(this.width, leaves * 140);

        const treeLayout = d3.tree().size([dynamicWidth, 1]);
        treeLayout(root);

        // Invert Y to grow Upwards
        root.descendants().forEach(d => {
            d.y = (this.height - 150) - (d.depth * 180);
            // Center if tree is smaller than screen
            if (dynamicWidth < this.width) {
                d.x += (this.width - dynamicWidth) / 2;
            }
        });

        // --- NODES ---
        const nodes = this.nodeGroup.selectAll("g.node")
            .data(root.descendants(), d => d.data.id);

        const nodeEnter = nodes.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => {
                // Animate from parent position if available, else center
                const origin = d.parent ? {x: d.parent.x, y: d.parent.y} : {x: this.width/2, y: this.height};
                return `translate(${origin.x},${origin.y}) scale(0)`;
            })
            .style("cursor", "pointer")
            .on("click", (e, d) => {
                e.stopPropagation();
                store.toggleNode(d.data.id);
            });

        // 1. Body
        nodeEnter.append("path")
            .attr("class", "node-body")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3);

        // 2. Icon
        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "24px")
            .style("user-select", "none")
            .style("pointer-events", "none");

        // 3. Label
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
                const bbox = this.getBBox();
                d3.select(this.parentNode).select("rect")
                    .attr("x", -bbox.width/2 - 8)
                    .attr("width", bbox.width + 16);
            });

        // 4. Status Badge (+/-)
        const badge = nodeEnter.append("g")
            .attr("class", "badge-group")
            .attr("transform", d => `translate(${d.data.type === 'root' ? 30 : 22}, -${d.data.type === 'root' ? 30 : 22})`)
            .style("display", "none"); // Hidden by default

        badge.append("circle")
            .attr("r", 14)
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))");

        badge.append("text")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("font-weight", "900")
            .attr("font-size", "18px")
            .attr("fill", "#ffffff")
            .style("pointer-events", "none");

        // UPDATE
        const nodeUpdate = nodes.merge(nodeEnter).transition().duration(this.duration)
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
        
        // Update Badges
        nodeUpdate.select(".badge-group")
            .style("display", d => d.data.type === 'leaf' ? 'none' : 'block');
        
        nodeUpdate.select(".badge-group circle")
            .attr("fill", d => d.data.expanded ? "#ef4444" : "#22c55e");

        nodeUpdate.select(".badge-group text")
            .text(d => d.data.expanded ? '-' : '+');

        // EXIT
        nodes.exit().transition().duration(this.duration)
            .attr("transform", d => {
                 const dest = d.parent || d;
                 return `translate(${dest.x},${dest.y}) scale(0)`;
            })
            .remove();

        // --- LINKS ---
        const links = this.linkGroup.selectAll(".link")
            .data(root.links(), d => d.target.data.id);

        const linkEnter = links.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63")
            .attr("stroke-width", d => Math.max(2, 12 - d.target.depth * 2))
            .attr("d", d => {
                const o = {x: d.source.x, y: d.source.y};
                return this.diagonal({source: o, target: o});
            });

        links.merge(linkEnter).transition().duration(this.duration)
            .attr("d", d => this.diagonal(d));

        links.exit().transition().duration(this.duration)
            .attr("d", d => {
                const o = {x: d.source.x, y: d.source.y};
                return this.diagonal({source: o, target: o});
            })
            .remove();
    }

    diagonal(d) {
        const s = d.source;
        const t = d.target;
        // Simple Bezier
        const midY = (s.y + t.y) / 2;
        return `M ${s.x} ${s.y} C ${s.x} ${midY}, ${t.x} ${midY}, ${t.x} ${t.y}`;
    }

    focusNode(nodeId) {
        // Find node position (d3 data is bound to DOM)
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
