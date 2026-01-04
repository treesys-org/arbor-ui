
import { store } from '../store.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.rootGroup = null;
    }

    connectedCallback() {
        this.innerHTML = `<div id="chart" class="w-full h-full bg-gradient-to-b from-sky-200 to-sky-50 dark:from-slate-900 dark:to-slate-800 overflow-hidden cursor-grab active:cursor-grabbing"></div>`;
        
        setTimeout(() => this.initGraph(), 0);
        
        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
            if (e.detail.loading) {
                this.innerHTML = `<div class="w-full h-full flex items-center justify-center text-slate-500">Loading...</div>`;
            } else if (this.querySelector('#chart')) {
                this.updateGraph();
            } else {
                this.connectedCallback(); // Re-init if overwritten
            }
        });
        
        window.addEventListener('resize', () => this.updateGraph());
    }

    initGraph() {
        const container = this.querySelector('#chart');
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.svg = d3.select(container).append("svg")
            .attr("viewBox", [0, 0, width, height])
            .style("width", "100%")
            .style("height", "100%");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => this.rootGroup.attr("transform", e.transform));

        this.svg.call(zoom);
        this.rootGroup = this.svg.append("g");
        
        this.updateGraph();
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const data = store.value.data;
        const width = this.querySelector('#chart').clientWidth;
        const height = this.querySelector('#chart').clientHeight;

        // Tree Layout
        const root = d3.hierarchy(data, d => d.expanded ? d.children : null);
        
        // Dynamic Width based on leaf count
        let leaves = 0;
        root.each(d => { if (!d.children) leaves++; });
        const treeW = Math.max(width, leaves * 100);
        
        const treeLayout = d3.tree().size([treeW, height - 200]);
        treeLayout(root);

        // Render Links
        const links = this.rootGroup.selectAll(".link")
            .data(root.links(), d => d.target.data.id);

        links.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63")
            .attr("stroke-width", 2)
            .merge(links)
            .attr("d", d3.linkVertical().x(d => d.x).y(d => height - d.y - 100)); // Inverted tree

        links.exit().remove();

        // Render Nodes
        const nodes = this.rootGroup.selectAll(".node")
            .data(root.descendants(), d => d.data.id);

        const nodeEnter = nodes.enter().append("g")
            .attr("class", "node")
            .style("cursor", "pointer")
            .on("click", (e, d) => {
                e.stopPropagation();
                store.toggleNode(d.data.id);
            });

        nodeEnter.append("circle")
            .attr("r", 20)
            .attr("fill", d => d.data.type === 'leaf' ? (store.value.completedNodes.has(d.data.id) ? '#22c55e' : '#fff') : '#8D6E63')
            .attr("stroke", "#5D4037")
            .attr("stroke-width", 2);

        nodeEnter.append("text")
            .attr("dy", 5)
            .attr("text-anchor", "middle")
            .text(d => d.data.icon || (d.data.type==='leaf'?'📄':'📁'));

        nodeEnter.append("text")
            .attr("dy", 35)
            .attr("text-anchor", "middle")
            .attr("class", "text-xs font-bold fill-slate-700 dark:fill-slate-200")
            .text(d => d.data.name);

        nodes.merge(nodeEnter)
            .transition().duration(500)
            .attr("transform", d => `translate(${d.x},${height - d.y - 100})`);

        nodes.exit().remove();
    }
}
customElements.define('arbor-graph', ArborGraph);
