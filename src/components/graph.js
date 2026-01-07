

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
        this.nodePositions = new Map();
        
        // Avatar State
        this.avatarPos = { x: 0, y: 0 };
    }

    connectedCallback() {
        this.innerHTML = `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-500" style="touch-action: none;">
             
             <!-- Decorative Background Elements (Fixed CSS) -->
             <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <div class="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-200/20 dark:bg-blue-900/10 rounded-full blur-3xl"></div>
                <div class="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-200/20 dark:bg-purple-900/10 rounded-full blur-3xl"></div>
             </div>

             <!-- Clouds (Parallax feel) -->
             <div class="absolute top-10 left-10 opacity-30 dark:opacity-5 pointer-events-none text-6xl select-none animate-pulse" style="animation-duration: 8s">☁️</div>
             <div class="absolute top-40 right-10 opacity-20 dark:opacity-5 pointer-events-none text-8xl select-none animate-pulse" style="animation-duration: 12s">☁️</div>
             
             <!-- Overlays Container -->
             <div id="overlays" class="absolute inset-0 pointer-events-none"></div>
        </div>`;

        // Wait for layout
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
             // Redraw if theme changes to update path colors
             if(this.g) this.updateGraph(); 
             this.renderOverlays();
        });
        
        store.addEventListener('focus-node', (e) => {
             // Delay slightly to let layout settle
             setTimeout(() => this.focusNode(e.detail), 100);
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

        // Error Toasts
        if (state.lastErrorMessage) {
            html += `
            <div class="absolute top-24 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded shadow-2xl animate-in fade-in slide-in-from-top-4 pointer-events-auto flex items-center gap-3 max-w-md w-[90%]">
                <span class="text-xl">⚠️</span>
                <div class="flex-1">
                    <p class="font-bold">Error</p>
                    <p class="text-sm">${state.lastErrorMessage}</p>
                </div>
            </div>`;
        }

        // Success Toasts
        if (state.lastActionMessage) {
            html += `
            <div class="absolute top-24 left-1/2 -translate-x-1/2 z-[60] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-xl animate-in fade-in zoom-in font-bold pointer-events-none flex items-center gap-2">
                <span>✨</span> ${state.lastActionMessage}
            </div>`;
        }

        // Loading / Big Error States
        if (state.loading) {
            html += `
            <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm pointer-events-auto">
              <div class="w-16 h-16 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin mb-4"></div>
              <p class="font-bold text-slate-600 dark:text-slate-300 animate-pulse tracking-wide font-comic text-xl">${ui.loading}</p>
            </div>`;
        } else if (state.error) {
             html += `
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center animate-in pointer-events-auto">
                 <div class="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-2xl relative max-w-md text-center">
                      <div class="text-6xl mb-4">🍂</div>
                      <h2 class="text-slate-800 dark:text-white font-black text-2xl mb-2">
                          ${ui.errorTitle}
                      </h2>
                      <p class="text-slate-500 dark:text-slate-400 text-sm mb-4">
                        ${state.error}
                      </p>
                      <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">
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
            .style("height", "100%")
            .style("display", "block");

        // DEFINITIONS (Glows, Shadows)
        const defs = this.svg.append("defs");
        
        // Node Shadow
        const filter = defs.append("filter").attr("id", "shadow-soft");
        filter.append("feDropShadow")
            .attr("dx", "0").attr("dy", "4").attr("stdDeviation", "4")
            .attr("flood-color", "#000").attr("flood-opacity", "0.15");

        // Leaf Glow
        const leafGlow = defs.append("filter").attr("id", "glow-gold");
        leafGlow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
        const feMerge = leafGlow.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Layers Order
        this.g = this.svg.append("g");
        
        // 1. Path/Links Layer
        this.linkGroup = this.g.append("g").attr("class", "links");
        
        // 2. Nodes Layer
        this.nodeGroup = this.g.append("g").attr("class", "nodes");
        
        // 3. Avatar Layer (On top of everything)
        this.avatarGroup = this.g.append("g").attr("class", "avatar-layer");
        this.initAvatar();

        // --- CAMERA LOGIC (THE RAIL) ---
        this.zoom = d3.zoom()
            .scaleExtent([0.5, 2.5]) // Limit zoom to avoid losing context
            .on("zoom", (e) => {
                const t = e.transform;
                const isMobile = this.width < 768;

                if (isMobile) {
                    // RAIL MODE: Force X to center
                    // We want the spine (this.width / 2) to always be at the screen center.
                    // formula: screen_center = world_x * k + tx
                    // We know world_x of spine is this.width/2.
                    // So: this.width/2 = (this.width/2 * t.k) + tx
                    // tx = this.width/2 * (1 - t.k)
                    t.x = (this.width / 2) * (1 - t.k);
                }
                
                this.g.attr("transform", t);
            });
        
        this.svg.call(this.zoom)
            .on("dblclick.zoom", null); // Disable double click zoom
    }

    initAvatar() {
        // The Owl Character
        this.avatar = this.avatarGroup.append("g")
            .attr("class", "avatar-owl")
            .attr("transform", `translate(${this.width/2}, ${this.height/2}) scale(0)`)
            .style("pointer-events", "none"); // Click through to nodes

        // Glow behind owl
        this.avatar.append("circle")
            .attr("r", 25)
            .attr("fill", "white")
            .attr("opacity", 0.6)
            .attr("filter", "url(#glow-gold)");

        // Owl Emoji (Simpler than SVG path for now, consistent with design)
        this.avatar.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("font-size", "40px")
            .text("🦉");
            
        // Initial position
        this.avatarPos = { x: this.width/2, y: this.height - 100 };
    }
    
    updateAvatarPosition(targetNode, duration = 1000) {
        if (!targetNode) return;
        
        // Offset slightly above the node
        const targetX = targetNode.x;
        const targetY = targetNode.y - 60; 

        this.avatar.transition().duration(duration)
            .attr("transform", `translate(${targetX}, ${targetY}) scale(1)`)
            .tween("path", () => {
                // Optional: We could make it follow the path exactly using path interpolation
                // For now, a direct flight is smoother visually
                return (t) => {
                    // Simple linear interpolation for internal state tracking if needed
                    this.avatarPos.x = targetX; 
                    this.avatarPos.y = targetY;
                };
            });
            
        // Make owl bounce slightly when arrived
        this.avatar.select("text")
            .transition().delay(duration).duration(500)
            .attr("dy", "-0.1em")
            .transition().duration(500)
            .attr("dy", "0.35em");
    }

    resetZoom(duration = 750) {
        if (!this.svg || !this.zoom) return;
        // Reset to view the bottom (start) of the tree
        const isMobile = this.width < 768;
        const k = isMobile ? 0.8 : 1;
        const tx = (this.width / 2) * (1 - k); 
        
        // Aim for bottom of tree
        // Note: Tree layout is inverted (root at top visually in data, but we might render bottom-up logic or top-down)
        // In our logic, Root is Y=0 usually? Let's check updateGraph logic.
        // Actually, we usually want to focus on the "Latest Active Node".
        
        this.svg.transition().duration(duration)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, 100).scale(k));
    }

    // --- LAYOUT ENGINE ---
    
    // Calculates a "Snake" layout for mobile to maximize vertical usage
    calculateMobileLayout(root) {
        const centerX = this.width / 2;
        const startY = 150; 
        const levelHeight = 180; 
        
        // 1. Flatten the active path (The Spine)
        const spine = [];
        let cursor = root;
        while(cursor) {
            spine.push(cursor);
            if (cursor.children && cursor.data.expanded) {
                // Follow the expanded path
                cursor = cursor.children.find(c => c.data.expanded) || cursor.children[0]; // Fallback to first if none explicitly expanded but parent is
            } else if (cursor.children && cursor.children.length > 0) {
                 // If not expanded, we stop here (children are hidden or condensed)
                 cursor = null;
            } else {
                cursor = null;
            }
        }

        // 2. Position the Spine vertically
        spine.forEach((node, index) => {
            node.x = centerX;
            node.y = startY + (index * levelHeight);
            node.isSpine = true;
        });

        // 3. Position Siblings (The "Branches" sticking out)
        spine.forEach((parent) => {
            if (!parent.children) return;
            
            // Siblings are children NOT in the spine
            const siblings = parent.children.filter(c => !spine.includes(c));
            
            if (siblings.length > 0) {
                // Fan them out around the parent
                // Alternating left/right based on depth for visual interest
                const direction = parent.depth % 2 === 0 ? 1 : -1;
                
                siblings.forEach((child, i) => {
                    const offset = (i + 1) * 100; // Distance from spine
                    // If multiple siblings, fan them: -100, +100, -200...
                    // Simple Logic: Stack them horizontally? No, too wide.
                    // Logic: Cluster them near parent.
                    
                    // Let's put them in a mini-grid below parent but above next spine node
                    const row = Math.floor(i / 2);
                    const col = i % 2 === 0 ? -1 : 1;
                    
                    child.x = centerX + (col * 110); 
                    child.y = parent.y + 80 + (row * 80);
                    child.isSpine = false;
                });
            }
        });
        
        // 4. Default for any uncalculated (shouldn't happen with filtered logic)
        root.descendants().forEach(d => {
            if (d.x === undefined) { d.x = centerX; d.y = startY; }
        });
    }

    calculateDesktopLayout(root) {
        // Standard Tree
        const treeLayout = d3.tree().size([this.width - 200, this.height - 200]);
        treeLayout(root);
        
        // Flip Y to go downwards? D3 tree is Top-Down by default (Y increases downwards).
        // Let's adjust spacing.
        const levelHeight = 180;
        root.descendants().forEach(d => {
            d.y = d.depth * levelHeight + 100;
            // Center horizontal
            // D3 tree computes X from 0 to width. We might need to center it if it's narrow.
            // But strict tree is fine for desktop.
        });
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const isMobile = this.width < 768;
        const harvestedFruits = store.value.gamification.fruits;
        const completedSet = store.value.completedNodes;
        const rootData = store.value.data;

        // Build Hierarchy
        // Note: We only visualize expanded nodes + direct children of expanded nodes.
        const root = d3.hierarchy(rootData, d => {
            return d.expanded ? d.children : null;
        });

        // --- LAYOUT ---
        if (isMobile) {
            this.calculateMobileLayout(root);
        } else {
            this.calculateDesktopLayout(root);
        }

        const nodes = root.descendants();
        const links = root.links();

        // --- CONSTRAINTS UPDATE ---
        // Calculate Y limits for the camera
        let minY = Infinity, maxY = -Infinity;
        nodes.forEach(d => {
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });

        const paddingY = this.height / 2;
        // Update Zoom Extent
        if (this.zoom) {
            // X is strictly locked to [0, width] basically, but handled in zoom event.
            // Y allows scrolling from top node to bottom node + padding.
            this.zoom.translateExtent([
                [-Infinity, -Infinity], // Infinite X allowed in theory (clamped by event)
                [Infinity, Infinity]    // Infinite Y allowed (clamped here?)
            ]);
            // Actually, better to limit Y translation range:
            this.zoom.translateExtent([
                [-Infinity, -500], // Allow some "overscroll" feeling
                [Infinity, maxY + 500]
            ]);
        }

        // --- RENDERING LINKS ---
        // We use a custom path generator for a curvy, organic look
        const linkGen = d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y);

        const linkSelection = this.linkGroup.selectAll(".link")
            .data(links, d => d.target.data.id);

        const linkEnter = linkSelection.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", store.value.theme === 'dark' ? "#334155" : "#cbd5e1")
            .attr("stroke-width", 6)
            .attr("stroke-linecap", "round")
            .attr("d", d => {
                const o = {x: d.source.x, y: d.source.y};
                return linkGen({source: o, target: o});
            })
            .style("opacity", 0);

        linkEnter.transition().duration(this.duration).style("opacity", 1);

        linkSelection.merge(linkEnter).transition().duration(this.duration)
            .attr("d", linkGen)
            .attr("stroke", d => {
                // If target is completed or active, color the path
                const isTargetDone = completedSet.has(d.target.data.id);
                return isTargetDone ? "#10b981" : (store.value.theme === 'dark' ? "#334155" : "#cbd5e1");
            });

        linkSelection.exit().transition().duration(this.duration / 2)
            .style("opacity", 0).remove();


        // --- RENDERING NODES ---
        const nodeSelection = this.nodeGroup.selectAll("g.node")
            .data(nodes, d => d.data.id);

        const nodeEnter = nodeSelection.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y}) scale(0)`)
            .style("cursor", "pointer")
            .on("click", (e, d) => this.handleNodeClick(e, d));

        // 1. Node Background (Circle)
        nodeEnter.append("circle")
            .attr("r", 35)
            .attr("class", "node-bg")
            .attr("fill", store.value.theme === 'dark' ? "#1e293b" : "#fff")
            .attr("stroke", "#cbd5e1")
            .attr("stroke-width", 4)
            .attr("filter", "url(#shadow-soft)");

        // 2. Icon
        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("font-size", "24px")
            .style("user-select", "none");

        // 3. Label (Pill below)
        const labelG = nodeEnter.append("g")
            .attr("transform", "translate(0, 50)");
        
        labelG.append("rect")
            .attr("rx", 8)
            .attr("ry", 8)
            .attr("height", 20)
            .attr("fill", store.value.theme === 'dark' ? "#0f172a" : "#fff")
            .attr("stroke", store.value.theme === 'dark' ? "#334155" : "#e2e8f0")
            .attr("stroke-width", 1)
            .style("opacity", 0.9);

        labelG.append("text")
            .attr("class", "label-text")
            .attr("dy", 14)
            .attr("text-anchor", "middle")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .attr("fill", store.value.theme === 'dark' ? "#94a3b8" : "#64748b")
            .text(d => d.data.name.substring(0, 15)); // Initial text for sizing

        // --- UPDATE NODES ---
        const nodeUpdate = nodeSelection.merge(nodeEnter).transition().duration(this.duration)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(1)`);

        // Style Update based on state
        nodeUpdate.select(".node-bg")
            .attr("stroke", d => {
                if (d.data.type === 'exam') return "#ef4444";
                if (completedSet.has(d.data.id)) return "#10b981"; // Green
                if (d.data.expanded) return "#3b82f6"; // Blue
                return store.value.theme === 'dark' ? "#334155" : "#cbd5e1";
            })
            .attr("fill", d => {
                if (completedSet.has(d.data.id)) return store.value.theme === 'dark' ? "#064e3b" : "#ecfdf5";
                if (d.data.expanded) return store.value.theme === 'dark' ? "#1e3a8a" : "#eff6ff";
                return store.value.theme === 'dark' ? "#1e293b" : "#fff";
            });

        nodeUpdate.select(".node-icon")
            .text(d => {
                if (completedSet.has(d.data.id) && (d.data.type === 'leaf' || d.data.type === 'exam')) return "✅";
                return d.data.icon || (d.data.type === 'branch' ? '📂' : '📄');
            });

        // Update Label Text & Rect Size
        nodeSelection.merge(nodeEnter).each(function(d) {
             const g = d3.select(this);
             const text = g.select(".label-text");
             const rect = g.select("rect");
             
             let label = d.data.name;
             if (label.length > 18) label = label.substring(0, 16) + '...';
             text.text(label);
             
             try {
                 const bbox = text.node().getBBox();
                 const w = Math.max(60, bbox.width + 16);
                 rect.attr("width", w).attr("x", -w/2);
             } catch(e) {}
        });

        nodeSelection.exit().transition().duration(this.duration / 2)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(0)`)
            .remove();
            
        // --- AVATAR LOGIC ---
        // Find the "Latest" relevant node to put the owl on.
        // Priority: Selected Node -> Last Completed Node -> Root
        let targetNode = null;
        if (store.value.selectedNode) {
            targetNode = nodes.find(n => n.data.id === store.value.selectedNode.id);
        }
        if (!targetNode) {
             // Find deepest completed node
             // This is a simple heuristic: last node in the list that is completed
             for (let i = nodes.length - 1; i >= 0; i--) {
                 if (completedSet.has(nodes[i].data.id)) {
                     targetNode = nodes[i];
                     break;
                 }
             }
        }
        if (!targetNode && nodes.length > 0) targetNode = nodes[0]; // Root

        if (targetNode) {
            this.updateAvatarPosition(targetNode);
        }
    }

    handleNodeClick(e, d) {
        e.stopPropagation();
        if (d.data.status === 'loading') return;
        
        // 1. Move Avatar immediately (visual feedback)
        this.updateAvatarPosition(d, 400);

        // 2. Logic
        store.toggleNode(d.data.id);
        
        // 3. Camera Follow
        this.focusNode(d.data.id);
    }

    focusNode(nodeId) {
        if (!this.svg || !this.zoom) return;
        
        // Find node position in current data
        // We need to re-select because D3 binds data to DOM
        let targetX = 0, targetY = 0;
        let found = false;
        
        this.nodeGroup.selectAll(".node").each(d => {
            if (d.data.id === nodeId) {
                targetX = d.x;
                targetY = d.y;
                found = true;
            }
        });
        
        if (!found) return;

        const isMobile = this.width < 768;
        const scale = isMobile ? 1.2 : 1.5;
        
        // Center the node
        // formula: translate = screen_center - node_pos * scale
        // For mobile rail: X is fixed to center, so targetX * scale should align with width/2?
        // Actually zoom transform is applied to the GROUP.
        // We want: (targetX * scale) + tx = width / 2
        // tx = width/2 - targetX * scale
        
        const tx = (this.width / 2) - (targetX * scale);
        const ty = (this.height / 2) - (targetY * scale);

        this.svg.transition().duration(1000)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
}
customElements.define('arbor-graph', ArborGraph);
