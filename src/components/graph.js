
import { store } from '../store.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.g = null;
        this.width = 0;
        this.height = 0;
        this.nodePositions = new Map();
        this.zoom = null;
    }

    connectedCallback() {
        this.innerHTML = `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 transition-colors duration-500">
            <!-- Background Elements -->
             <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl text-white">☁️</div>
             <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl text-white">☁️</div>
        </div>`;

        setTimeout(() => this.initGraph(), 0);

        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('focus-node', (e) => this.focusNode(e.detail));
        
        window.addEventListener('resize', () => {
            if (this.querySelector('#chart')) {
                this.initGraph(); // Re-init to fit new size
            }
        });
    }

    initGraph() {
        const container = this.querySelector('#chart');
        if (!container) return;

        container.innerHTML = ''; // Clear previous SVG
        // Re-add background clouds
        container.insertAdjacentHTML('afterbegin', `
             <div class="absolute top-10 left-10 opacity-40 dark:opacity-10 pointer-events-none text-6xl text-white">☁️</div>
             <div class="absolute top-20 right-20 opacity-30 dark:opacity-5 pointer-events-none text-8xl text-white">☁️</div>
        `);

        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg = d3.select(container).append("svg")
            .attr("viewBox", [0, 0, this.width, this.height])
            .style("width", "100%")
            .style("height", "100%");

        // Definitions (Filters)
        const defs = this.svg.append("defs");
        // Drop Shadow
        const filter = defs.append("filter").attr("id", "drop-shadow");
        filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3);
        filter.append("feOffset").attr("dx", 0).attr("dy", 3);
        const merge = filter.append("feMerge");
        merge.append("feMergeNode");
        merge.append("feMergeNode").attr("in", "SourceGraphic");

        // Groups
        this.g = this.svg.append("g");
        this.groundGroup = this.g.append("g").attr("class", "ground");
        this.linkGroup = this.g.append("g").attr("class", "links");
        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.drawGround();

        // Zoom
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", (e) => this.g.attr("transform", e.transform));
        
        this.svg.call(this.zoom);

        // Initial Transform
        const k = 0.85;
        const tx = (this.width / 2) * (1 - k);
        const ty = (this.height * 0.85) - (this.height - 100) * k;
        this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));

        this.updateGraph();
    }

    drawGround() {
        this.groundGroup.selectAll("*").remove();
        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';

        this.groundGroup.append("path")
            .attr("d", `M-2000,${this.height} C${this.width * 0.2},${this.height - 180} ${this.width * 0.8},${this.height - 60} ${this.width + 2000},${this.height} L${this.width + 2000},${this.height+2000} L-2000,${this.height+2000} Z`)
            .attr("fill", backColor)
            .style("opacity", 0.7);

        this.groundGroup.append("path")
            .attr("d", `M-2000,${this.height} Q${this.width/2},${this.height - 120} ${this.width + 2000},${this.height} L${this.width+2000},${this.height+2000} L-2000,${this.height+2000} Z`)
            .attr("fill", color);
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        const dynamicWidth = Math.max(this.width, leaves * 120);

        const tree = d3.tree().size([dynamicWidth, this.height - 200]);
        tree(root);

        // Adjust Y to grow upwards
        root.descendants().forEach(d => {
            d.y = (this.height - 120) - (d.depth * 180);
            if (dynamicWidth < this.width) {
                d.x += (this.width - dynamicWidth) / 2;
            }
        });

        // --- Nodes ---
        const nodes = this.nodeGroup.selectAll(".node")
            .data(root.descendants(), d => d.data.id);

        const nodeEnter = nodes.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .style("cursor", "pointer")
            .on("click", (e, d) => {
                e.stopPropagation();
                store.toggleNode(d.data.id);
            });

        // Node Body (Circle or Shape)
        nodeEnter.append("path")
            .attr("class", "node-body")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3)
            .style("filter", "url(#drop-shadow)");

        // Icon
        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "24px")
            .style("user-select", "none");

        // Label
        const labelGroup = nodeEnter.append("g")
            .attr("transform", d => `translate(0, ${d.data.type === 'leaf' ? 55 : 45})`);
        
        labelGroup.append("rect")
            .attr("rx", 10).attr("ry", 10).attr("height", 22)
            .attr("fill", "rgba(255,255,255,0.9)");
        
        labelGroup.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", 15)
            .attr("fill", "#334155")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text(d => d.data.name)
            .each(function() {
                const bbox = this.getBBox();
                d3.select(this.parentNode).select("rect")
                    .attr("x", -bbox.width/2 - 8)
                    .attr("width", bbox.width + 16);
            });

        // Update Selection
        const nodeUpdate = nodes.merge(nodeEnter).transition().duration(500)
            .attr("transform", d => `translate(${d.x},${d.y})`);

        nodeUpdate.select(".node-body")
            .attr("fill", d => {
                if (d.data.type === 'root') return '#8D6E63';
                if (d.data.type === 'leaf') return store.isCompleted(d.data.id) ? '#22c55e' : '#fff';
                return '#8D6E63';
            })
            .attr("d", d => {
                const r = d.data.type === 'root' ? 40 : 30;
                if (d.data.type === 'leaf') return "M0,0 C-25,10 -35,35 0,65 C35,35 25,10 0,0";
                return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
            });
        
        nodeUpdate.select(".node-icon").text(d => d.data.type === 'leaf' && store.isCompleted(d.data.id) ? '✓' : (d.data.icon || '🌱'))
             .attr("fill", d => store.isCompleted(d.data.id) && d.data.type === 'leaf' ? '#fff' : '#000');

        nodes.exit().transition().duration(500).style("opacity", 0).remove();

        // --- Links ---
        const links = this.linkGroup.selectAll(".link")
            .data(root.links(), d => d.target.data.id);

        const linkEnter = links.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63")
            .attr("stroke-width", d => Math.max(2, 10 - d.target.depth))
            .attr("d", d => {
                const o = {x: d.source.x, y: d.source.y};
                return this.diagonal({source: o, target: o});
            });

        links.merge(linkEnter).transition().duration(500)
            .attr("d", d => this.diagonal(d));

        links.exit().transition().duration(500).style("opacity", 0).remove();
    }

    diagonal(d) {
        const s = d.source;
        const t = d.target;
        const midY = (s.y + t.y) / 2;
        return `M ${s.x} ${s.y} C ${s.x} ${midY}, ${t.x} ${midY}, ${t.x} ${t.y}`;
    }

    focusNode(nodeId) {
        // Simple zoom logic
        // In full version, calculate x/y of node
    }
}
customElements.define('arbor-graph', ArborGraph);
