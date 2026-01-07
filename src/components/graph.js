

import { store } from '../store.js';

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.g = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;
        this.duration = 600; 
        // Cache to store where nodes are, so we can animate FROM there or TO there
        this.nodePositions = new Map();
        this.activePathIds = new Set();
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

        if (document.fonts) {
            document.fonts.ready.then(() => {
                if(store.value.data) this.updateGraph();
            });
        }

        store.addEventListener('graph-update', () => this.updateGraph());
        store.addEventListener('state-change', (e) => {
             if(this.g) this.drawGround(); 
             this.renderOverlays();
        });
        
        store.addEventListener('focus-node', (e) => {
             setTimeout(() => this.focusNode(e.detail), 250);
        });
        
        store.addEventListener('reset-zoom', () => {
             this.resetZoom();
        });
        
        window.addEventListener('resize', () => {
            const container = this.querySelector('#chart');
            if (container) {
                this.width = container.clientWidth;
                this.height = container.clientHeight;
                if(this.svg) {
                    this.svg.attr("viewBox", [0, 0, this.width, this.height]);
                    // Extent updates happen inside updateGraph now
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

        if (state.lastActionMessage) {
            html += `
            <div class="absolute top-20 left-1/2 -translate-x-1/2 z-[60] bg-green-500 text-white px-8 py-3 rounded-full shadow-2xl animate-in fade-in zoom-in font-bold pointer-events-none">
                ${state.lastActionMessage}
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

        const defs = this.svg.append("defs");
        
        // 1. Drop Shadow
        const filter = defs.append("filter").attr("id", "drop-shadow");
        filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3);
        filter.append("feOffset").attr("dx", 0).attr("dy", 3);
        filter.append("feComponentTransfer").append("feFuncA").attr("type","linear").attr("slope",0.3);
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

        this.g = this.svg.append("g");
        this.groundGroup = this.g.append("g").attr("class", "ground");
        
        // New: Separator Lines Layer (Behind links)
        this.separatorGroup = this.g.append("g").attr("class", "separators");
        
        this.linkGroup = this.g.append("g").attr("class", "links");
        this.nodeGroup = this.g.append("g").attr("class", "nodes");

        this.drawGround();

        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => {
                this.g.attr("transform", e.transform);
            });
        
        this.svg.call(this.zoom).on("dblclick.zoom", null);
        
        // Initial generic extent, updated later in updateGraph
        this.zoom.translateExtent([[-4000, -4000], [4000, 4000]]);

        this.resetZoom(0);
        
        if(store.value.data) this.updateGraph();
    }
    
    resetZoom(duration = 750) {
        if (!this.svg || !this.zoom) return;
        const k = 0.85;
        const tx = (this.width / 2) * (1 - k); 
        const ty = (this.height * 0.85) - (this.height - 100) * k;
        
        this.svg.transition().duration(duration)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    }

    drawGround() {
        this.groundGroup.selectAll("*").remove();
        const theme = store.value.theme;
        const color = theme === 'dark' ? '#1e293b' : '#22c55e';
        const backColor = theme === 'dark' ? '#0f172a' : '#4ade80';

        const cx = this.width / 2;
        const groundY = this.height;
        const groundWidth = Math.max(this.width * 1.5, 3000); 
        const groundDepth = 4000;

        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} 
                        C${cx - 500},${groundY - 180} ${cx + 500},${groundY - 60} ${cx + groundWidth},${groundY} 
                        L${cx + groundWidth},${groundY + groundDepth} 
                        L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", backColor)
            .style("opacity", 0.7);

        this.groundGroup.append("path")
            .attr("d", `M${cx - groundWidth},${groundY} 
                        Q${cx},${groundY - 120} ${cx + groundWidth},${groundY} 
                        L${cx + groundWidth},${groundY + groundDepth} 
                        L${cx - groundWidth},${groundY + groundDepth} Z`)
            .attr("fill", color);
    }

    // --- ALGORITMO ESTRATOS (STRATUM) ---
    calculateMobileLayout(root) {
        const centerX = this.width / 2;
        const startY = this.height - 150;
        const levelHeight = 220; // Height between floors
        
        const spine = [];
        let cursor = root;
        while(cursor) {
            spine.push(cursor);
            if (cursor.children && cursor.data.expanded) {
                const nextActive = cursor.children.find(c => c.data.expanded);
                cursor = nextActive;
            } else {
                cursor = null;
            }
        }

        spine.forEach((node, levelIndex) => {
            node.x = centerX;
            node.y = startY - (levelIndex * levelHeight);
            node.isSpine = true;
            node.floorY = node.y - (levelHeight * 0.4); 
        });

        spine.forEach((parent) => {
            if (!parent.children) return;

            const siblings = parent.children.filter(c => !spine.includes(c));
            if (siblings.length === 0) return;

            const cloudCenterY = parent.floorY - 60; 
            const count = siblings.length;
            const spread = Math.min(this.width * 0.4, 160); 
            
            siblings.forEach((child, i) => {
                const angle = i * 2.4; 
                const dist = 60 + (Math.sqrt(i) * 35); 
                
                let tx = centerX + Math.cos(angle) * dist;
                let ty = cloudCenterY - Math.sin(angle) * (dist * 0.8); 

                const padding = 50;
                tx = Math.max(padding, Math.min(this.width - padding, tx));
                
                child.x = tx;
                child.y = ty;
                child.isSpine = false;
            });
        });
        
        root.descendants().forEach(d => {
             if (!d.x) { 
                 d.x = centerX; 
                 d.y = startY; 
             }
        });
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const isMobile = this.width < 768;
        const harvestedFruits = store.value.gamification.fruits;

        const root = d3.hierarchy(store.value.data, d => d.expanded ? d.children : null);
        
        // --- LAYOUT CALCULATION ---
        if (isMobile) {
            this.calculateMobileLayout(root);
        } else {
            // Desktop Fan
            let leaves = 0;
            root.each(d => { if (!d.children) leaves++; });
            const dynamicWidth = Math.max(this.width, leaves * 160); 

            const treeLayout = d3.tree().size([dynamicWidth, 1]);
            treeLayout(root);

            const levelHeight = 200; 
            root.descendants().forEach(d => {
                d.y = (this.height - 150) - (d.depth * levelHeight);
                d.side = 'center'; 
                if (dynamicWidth < this.width) {
                    d.x += (this.width - dynamicWidth) / 2;
                }
            });
        }

        const nodes = root.descendants();
        const links = root.links();

        // --- DYNAMIC BOUNDING BOX & CONSTRAINT ---
        // Calculate the extent of the visible tree
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });

        // Add generous padding so nodes aren't stuck to the edge
        const padX = Math.max(this.width * 0.5, 300);
        const padY = Math.max(this.height * 0.5, 400);

        // Update the zoom constraint strictly to the tree area
        if (this.zoom && nodes.length > 0) {
            this.zoom.translateExtent([
                [minX - padX, minY - padY], 
                [maxX + padX, maxY + padY]
            ]);
        }

        // --- RENDER VISUALS ---

        // Separator Lines (Visual Floors for Mobile)
        const spineNodes = nodes.filter(n => n.isSpine && n.children && isMobile);
        
        const sepSelection = this.separatorGroup.selectAll(".floor-line")
            .data(spineNodes, d => d.data.id);

        sepSelection.enter().append("line")
            .attr("class", "floor-line")
            .attr("x1", 20)
            .attr("x2", this.width - 20)
            .attr("y1", d => d.floorY)
            .attr("y2", d => d.floorY)
            .attr("stroke", d => store.isCompleted(d.data.id) ? "#22c55e" : "#8D6E63")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5,5")
            .attr("opacity", 0)
            .transition().duration(this.duration)
            .attr("opacity", 0.6);

        sepSelection.transition().duration(this.duration)
            .attr("y1", d => d.floorY)
            .attr("y2", d => d.floorY)
            .attr("x2", this.width - 20)
            .attr("stroke", d => store.isCompleted(d.data.id) ? "#22c55e" : "#8D6E63");

        sepSelection.exit().transition().duration(this.duration).attr("opacity", 0).remove();

        const findOrigin = (d) => {
            if (d.parent && this.nodePositions.has(d.parent.data.id)) {
                return this.nodePositions.get(d.parent.data.id);
            }
            return { x: this.width / 2, y: this.height };
        };

        const findDest = (d) => {
            let ancestor = d.parent;
            while (ancestor) {
                const ancestorInNewLayout = nodes.find(n => n.data.id === ancestor.data.id);
                if (ancestorInNewLayout) {
                    return { x: ancestorInNewLayout.x, y: ancestorInNewLayout.y };
                }
                ancestor = ancestor.parent;
            }
            return { x: this.width / 2, y: this.height };
        };

        // --- NODES ---
        const nodeSelection = this.nodeGroup.selectAll("g.node")
            .data(nodes, d => d.data.id);

        const nodeEnter = nodeSelection.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => {
                const o = findOrigin(d);
                return `translate(${o.x},${o.y}) scale(0)`;
            })
            .style("cursor", "pointer")
            .on("click", (e, d) => this.handleNodeClick(e, d))
            .on("mousedown", (e) => e.stopPropagation());

        nodeEnter.append("circle")
            .attr("r", isMobile ? 50 : 80)
            .attr("cy", d => d.data.type === 'leaf' || d.data.type === 'exam' ? (isMobile ? 0 : 30) : 0)
            .attr("fill", "transparent"); // Hit area

        nodeEnter.append("path")
            .attr("class", "node-body")
            .attr("stroke", "#fff")
            .attr("stroke-width", 3);

        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", isMobile ? "28px" : "38px")
            .style("user-select", "none")
            .style("pointer-events", "none");

        // Labels
        const labelGroup = nodeEnter.append("g").attr("class", "label-group");
            
        labelGroup.append("rect")
            .attr("rx", 10).attr("ry", 10).attr("height", 24) 
            .attr("fill", "rgba(255,255,255,0.9)")
            .attr("stroke", "#e2e8f0");
        
        labelGroup.append("text")
            .attr("class", "label-text")
            .attr("dy", 17)
            .attr("fill", "#334155")
            .attr("font-size", "12px") 
            .attr("font-weight", "800")
            .style("pointer-events", "none");

        // Badges
        const badge = nodeEnter.append("g").attr("class", "badge-group").style("display", "none");
        badge.append("circle").attr("r", 12).attr("stroke", "#fff").attr("stroke-width", 2).style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))");
        badge.append("text").attr("dy", "0.35em").attr("text-anchor", "middle").attr("font-weight", "900").attr("font-size", "16px").attr("fill", "#ffffff");

        // Spinner
        nodeEnter.append("path")
            .attr("class", "spinner")
            .attr("d", "M-14,0 a14,14 0 0,1 28,0")
            .attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 4)
            .style("display", "none")
            .append("animateTransform").attr("attributeName", "transform").attr("type", "rotate").attr("from", "0 0 0").attr("to", "360 0 0").attr("dur", "1s").attr("repeatCount", "indefinite");

        // UPDATE
        const nodeMerged = nodeSelection.merge(nodeEnter);
        
        const nodeUpdate = nodeMerged.transition().duration(this.duration)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(1)`);

        nodeUpdate.select(".node-body")
            .attr("fill", d => {
                const isHarvested = harvestedFruits.find(f => f.id === d.data.id);
                if (isHarvested) return '#FCD34D'; 
                if (d.data.type === 'root') return '#8D6E63';
                if (store.isCompleted(d.data.id)) return '#22c55e'; 
                if (d.data.type === 'exam') return '#ef4444'; 
                if (d.data.type === 'leaf') return '#a855f7'; 
                return '#F59E0B'; 
            })
            .attr("d", d => {
                const isHarvested = harvestedFruits.find(f => f.id === d.data.id);
                let r = d.data.type === 'root' ? 60 : (isHarvested ? 50 : 45); 
                if (isMobile && !d.isSpine) r = r * 0.8; 

                if (d.data.type === 'leaf') return "M0,0 C-35,15 -45,45 0,85 C45,45 35,15 0,0"; 
                if (d.data.type === 'exam') return `M0,${-r*1.2} L${r*1.2},0 L0,${r*1.2} L${-r*1.2},0 Z`;
                return `M${-r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 ${-r*2},0`;
            })
            .style("filter", d => {
                const isHarvested = harvestedFruits.find(f => f.id === d.data.id);
                if (isHarvested || ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id))) {
                    return "url(#leaf-glow)";
                }
                return "url(#drop-shadow)";
            });

        nodeUpdate.select(".node-icon")
            .text(d => {
                const fruit = harvestedFruits.find(f => f.id === d.data.id);
                if (fruit) return fruit.icon;
                if ((d.data.type === 'leaf' || d.data.type === 'exam') && store.isCompleted(d.data.id)) return '✓';
                return d.data.icon || (d.data.type === 'exam' ? '⚔️' : '🌱');
            })
            .attr("dy", d => d.data.type === 'leaf' || d.data.type === 'exam' ? (d.data.type === 'exam' ? "0.35em" : "48px") : "0.35em");
        
        nodeMerged.select(".label-group")
            .attr("transform", d => {
                if (isMobile) {
                    return `translate(0, 45)`;
                } else {
                    return `translate(0, ${d.data.type === 'leaf' || d.data.type === 'exam' ? 65 : 55})`;
                }
            });

        nodeMerged.select(".label-text").attr("text-anchor", "middle");

        nodeMerged.select(".label-group text")
            .text(d => {
                if (isMobile && !d.isSpine && d.data.name.length > 15) return d.data.name.substring(0, 12) + '...';
                return d.data.name;
            })
            .each(function(d) {
                const rectNode = d3.select(this.parentNode).select("rect");
                const computed = this.getComputedTextLength();
                const w = Math.max(40, computed + 20);
                rectNode.attr("width", w).attr("x", -w/2);
            });

        nodeUpdate.select(".badge-group")
            .style("display", d => (d.data.type === 'leaf' || d.data.type === 'exam') ? 'none' : 'block')
            .attr("transform", d => `translate(${isMobile ? 25 : 35}, -${isMobile ? 25 : 35})`);
        
        nodeUpdate.select(".badge-group circle")
            .attr("fill", d => d.data.expanded ? "#ef4444" : "#22c55e");
        nodeUpdate.select(".badge-group text")
            .text(d => d.data.expanded ? '-' : '+');

        nodeUpdate.select(".spinner")
            .style("display", d => d.data.status === 'loading' ? 'block' : 'none');

        nodeSelection.exit().transition().duration(this.duration)
            .attr("transform", d => {
                 const dest = findDest(d); 
                 return `translate(${dest.x},${dest.y}) scale(0)`;
            })
            .remove();

        // --- LINKS ---
        const linkSelection = this.linkGroup.selectAll(".link")
            .data(links, d => d.target.data.id);

        const linkEnter = linkSelection.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63")
            .attr("stroke-width", d => Math.max(3, 16 - d.target.depth * 2.5)) 
            .attr("d", d => {
                const o = findOrigin(d.target);
                return this.diagonal({source: o, target: o});
            });

        linkSelection.merge(linkEnter).transition().duration(this.duration)
            .attr("d", d => this.diagonal(d))
            .attr("stroke", d => store.isCompleted(d.target.data.id) ? "#22c55e" : "#8D6E63"); 

        linkSelection.exit().transition().duration(this.duration)
            .attr("d", d => {
                const dest = findDest(d.target); 
                const o = {x: dest.x, y: dest.y};
                return this.diagonal({source: o, target: o});
            })
            .remove();

        // --- Cache ---
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
        
        store.toggleNode(d.data.id);
        
        // Auto-scroll vertical logic
        if (d.data.type === 'branch' || d.data.type === 'root') {
             this.adjustCameraToActiveNode(d);
        }
    }

    // Auto-scrolls the camera to maintain context
    adjustCameraToActiveNode(d) {
        if (!this.svg || !this.zoom) return;
        
        // Use current transform to calculate absolute position
        const t = d3.zoomTransform(this.svg.node());
        const currentY = t.applyY(d.y);
        
        let targetY;

        if (!d.data.expanded) {
             // EXPANDING: Move camera DOWN (node moves up) to reveal children below
             // Target position for the node: Top 20% of screen
             targetY = this.height * 0.2;
        } else {
             // COLLAPSING: Move camera UP (node moves down) to recenter parent
             // Target position for the node: Center or Bottom-Third
             targetY = this.height * 0.6;
        }

        const dy = targetY - currentY;

        this.svg.transition().duration(this.duration + 200)
            .call(this.zoom.transform, t.translate(0, dy / t.k));
    }

    focusNode(nodeId) {
        let target = null;
        this.nodeGroup.selectAll(".node").each(d => {
            if(d.data.id === nodeId) target = d;
        });

        if(target && this.zoom) {
             const transform = d3.zoomIdentity
                .translate(this.width/2, this.height * 0.5)
                .scale(1.2)
                .translate(-target.x, -target.y);
             
             this.svg.transition().duration(1200).call(this.zoom.transform, transform);
        }
    }
}
customElements.define('arbor-graph', ArborGraph);
