

import { store } from '../store.js';

// Paleta vibrante para las ramas principales
const BRANCH_COLORS = [
    '#FF5252', // Rojo Coral
    '#FFD740', // Amarillo Sol
    '#448AFF', // Azul Brillante
    '#69F0AE', // Verde Menta
    '#E040FB', // Violeta Eléctrico
    '#FF6E40', // Naranja
    '#00E5FF', // Cyan
];

class ArborGraph extends HTMLElement {
    constructor() {
        super();
        this.svg = null;
        this.g = null;
        this.width = 0;
        this.height = 0;
        this.zoom = null;
        this.duration = 800;
        this.nodePositions = new Map();
        
        // Avatar State
        this.avatarPos = { x: 0, y: 0 };
    }

    connectedCallback() {
        // Fondo "Cielo Celeste" estilo Teletubbies
        this.innerHTML = `
        <div id="chart" class="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden bg-gradient-to-b from-[#29b6f6] to-[#b3e5fc] dark:from-slate-900 dark:to-slate-800 transition-colors duration-500" style="touch-action: none;">
             
             <!-- Sol (Decorativo) -->
             <div class="absolute top-10 right-10 text-yellow-300 opacity-80 animate-pulse pointer-events-none text-9xl select-none" style="filter: drop-shadow(0 0 20px orange);">☀️</div>

             <!-- Nubes animadas -->
             <div class="absolute top-20 left-10 opacity-60 text-white pointer-events-none text-7xl select-none animate-bounce" style="animation-duration: 6s">☁️</div>
             <div class="absolute top-40 right-1/4 opacity-40 text-white pointer-events-none text-9xl select-none animate-pulse" style="animation-duration: 10s">☁️</div>
             
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
             if(this.g) this.updateGraph(); 
             this.renderOverlays();
        });
        
        store.addEventListener('focus-node', (e) => {
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

        if (state.lastActionMessage) {
            html += `
            <div class="absolute top-24 left-1/2 -translate-x-1/2 z-[60] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-xl animate-in fade-in zoom-in font-bold pointer-events-none flex items-center gap-2 border-2 border-white/30">
                <span>✨</span> ${state.lastActionMessage}
            </div>`;
        }

        if (state.loading) {
            html += `
            <div class="absolute inset-0 flex flex-col items-center justify-center z-10 bg-sky-100/80 dark:bg-slate-900/80 backdrop-blur-sm pointer-events-auto">
              <div class="w-20 h-20 border-8 border-white border-t-yellow-400 rounded-full animate-spin mb-4 shadow-xl"></div>
              <p class="font-black text-sky-600 dark:text-sky-300 tracking-wide text-2xl drop-shadow-sm">${ui.loading}</p>
            </div>`;
        } else if (state.error) {
             html += `
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center animate-in pointer-events-auto">
                 <div class="bg-white border-4 border-slate-200 rounded-3xl p-8 shadow-2xl relative max-w-md text-center">
                      <div class="text-6xl mb-4">🍂</div>
                      <h2 class="text-slate-800 font-black text-2xl mb-2">
                          ${ui.errorTitle}
                      </h2>
                      <p class="text-slate-500 text-sm mb-4">
                        ${state.error}
                      </p>
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

        const defs = this.svg.append("defs");
        
        // Sombra suave para nodos
        const filter = defs.append("filter").attr("id", "shadow-soft");
        filter.append("feDropShadow")
            .attr("dx", "0").attr("dy", "5").attr("stdDeviation", "3")
            .attr("flood-color", "#000").attr("flood-opacity", "0.2");

        // Brillo interno
        const glow = defs.append("filter").attr("id", "glow-soft");
        glow.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
        const feMerge = glow.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // Layers Order
        this.g = this.svg.append("g");
        
        // 0. Capa de Suelo (Hills)
        this.groundLayer = this.g.append("g").attr("class", "ground-layer");

        // 1. Path/Links Layer
        this.linkGroup = this.g.append("g").attr("class", "links");
        
        // 2. Nodes Layer
        this.nodeGroup = this.g.append("g").attr("class", "nodes");
        
        // 3. Avatar Layer
        this.avatarGroup = this.g.append("g").attr("class", "avatar-layer");
        this.initAvatar();

        // --- CAMERA LOGIC (THE RAIL) ---
        this.zoom = d3.zoom()
            .scaleExtent([0.4, 2]) 
            .on("zoom", (e) => {
                const t = e.transform;
                const isMobile = this.width < 768;

                if (isMobile) {
                    // RAIL MODE: Bloquear eje X al centro
                    t.x = (this.width / 2) * (1 - t.k);
                }
                
                this.g.attr("transform", t);
                
                // Mover nubes en paralaje inverso ligeramente si quisiéramos
            });
        
        this.svg.call(this.zoom).on("dblclick.zoom", null);
        
        // Dibujar el suelo inicial
        this.drawGround();
    }

    drawGround() {
        // Dibujar colinas verdes infinitas en el fondo
        // Las colinas deben estar siempre "abajo" relative a los nodos, pero como los nodos crecen hacia arriba,
        // el suelo debe estar cerca de Y=Start.
        
        // Nota: Como usamos coordenadas negativas para ir hacia arriba, el suelo está en Y ~ height.
        // Haremos el suelo ancho para cubrir el paneo.
        
        const w = 5000;
        const h = 2000;
        // Ajuste: El layout empieza en this.height - 100. Pondremos el suelo ahí.
        const horizonY = this.height - 50; 
        
        this.groundLayer.selectAll("*").remove();

        // Colina trasera (más oscura)
        this.groundLayer.append("path")
            .attr("d", `M-${w},${horizonY} C-${w/3},${horizonY - 150} ${w/3},${horizonY - 50} ${w},${horizonY} L${w},${horizonY+h} L-${w},${horizonY+h} Z`)
            .attr("fill", "#66BB6A") // Verde medio
            .style("opacity", 0.8);

        // Colina frontal (más brillante, teletubbie style)
        this.groundLayer.append("path")
            .attr("d", `M-${w},${horizonY + 50} Q0,${horizonY - 80} ${w},${horizonY + 50} L${w},${horizonY+h} L-${w},${horizonY+h} Z`)
            .attr("fill", "#81C784"); // Verde claro
    }

    initAvatar() {
        this.avatar = this.avatarGroup.append("g")
            .attr("class", "avatar-owl")
            .attr("transform", `translate(${this.width/2}, ${this.height - 100}) scale(0)`)
            .style("pointer-events", "none"); 

        // Sombra del búho (para dar efecto de flotar al saltar)
        this.avatar.append("ellipse")
            .attr("cx", 0).attr("cy", 25)
            .attr("rx", 15).attr("ry", 5)
            .attr("fill", "black")
            .attr("opacity", 0.3)
            .attr("class", "avatar-shadow");

        // Búho Emoji
        this.avatar.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("font-size", "50px")
            .text("🦉");
            
        this.avatarPos = { x: this.width/2, y: this.height - 100 };
    }
    
    updateAvatarPosition(targetNode, duration = 800) {
        if (!targetNode) return;
        
        const targetX = targetNode.x;
        const targetY = targetNode.y - 60; // Posarse encima del nodo

        // Determinar dirección para girar el búho (Flip X)
        const isMovingRight = targetX > this.avatarPos.x;
        const scaleX = isMovingRight ? -1 : 1; // Emojis suelen mirar a la izquierda por defecto, a veces. El buho mira al frente. 
        // Vamos a asumir rotación leve.
        const rotation = isMovingRight ? 10 : -10;

        // Animar salto
        this.avatar.transition()
            .duration(duration)
            .ease(d3.easeCubicOut)
            .attrTween("transform", () => {
                const iX = d3.interpolateNumber(this.avatarPos.x, targetX);
                const iY = d3.interpolateNumber(this.avatarPos.y, targetY);
                
                return (t) => {
                    const currX = iX(t);
                    const currY = iY(t);
                    
                    // Salto parabólico: Seno de 0 a PI
                    const jumpHeight = 80;
                    const jumpY = Math.sin(t * Math.PI) * jumpHeight;
                    
                    // Actualizar posición interna
                    this.avatarPos.x = currX;
                    this.avatarPos.y = currY;

                    return `translate(${currX}, ${currY - jumpY}) scale(${scaleX}, 1) rotate(${rotation * t})`;
                };
            })
            .on("end", () => {
                // Aterrizaje: Squashing effect
                this.avatar.transition().duration(150).attr("transform", `translate(${targetX}, ${targetY}) scale(${scaleX * 1.2}, 0.8)`)
                    .transition().duration(150).attr("transform", `translate(${targetX}, ${targetY}) scale(${scaleX}, 1)`);
            });
            
        // Animar sombra (se hace pequeña al saltar)
        this.avatar.select(".avatar-shadow")
            .transition().duration(duration/2).attr("rx", 5).attr("opacity", 0.1)
            .transition().duration(duration/2).attr("rx", 15).attr("opacity", 0.3);
    }

    resetZoom(duration = 750) {
        if (!this.svg || !this.zoom) return;
        // Resetear vista a la base (Suelo)
        const isMobile = this.width < 768;
        const k = isMobile ? 0.8 : 1;
        const tx = (this.width / 2) * (1 - k); 
        
        // Queremos ver la parte inferior (donde empieza el árbol)
        // El árbol empieza en this.height - 150.
        // Centrar Y alrededor de this.height - 200
        const ty = 100; // Ajuste fino

        this.svg.transition().duration(duration)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    }

    // --- COLOR LOGIC ---
    getNodeColor(node) {
        // Encontrar el ancestro raíz (Módulo principal) para determinar el color de familia
        let cursor = node;
        let depth = node.depth;
        
        // Si es Root
        if (depth === 0) return '#FFFFFF'; 

        // Subir hasta encontrar el hijo directo del root (depth 1)
        while (cursor.depth > 1) {
            cursor = cursor.parent;
        }

        // Usar el índice del hijo para escoger color de la paleta
        // Necesitamos saber qué índice tiene este cursor entre los hijos del root
        if (cursor && cursor.parent) {
            const index = cursor.parent.children.indexOf(cursor);
            const color = BRANCH_COLORS[index % BRANCH_COLORS.length];
            return color;
        }
        
        return '#FFC107'; // Fallback
    }

    // --- LAYOUT ENGINE (Bottom-Up) ---
    
    calculateMobileLayout(root) {
        const centerX = this.width / 2;
        // BOTTOM-UP: Empezamos abajo
        const startY = this.height - 150; 
        const levelHeight = 180; 
        
        const spine = [];
        let cursor = root;
        while(cursor) {
            spine.push(cursor);
            if (cursor.children && cursor.data.expanded) {
                cursor = cursor.children.find(c => c.data.expanded) || cursor.children[0]; 
            } else if (cursor.children && cursor.children.length > 0) {
                 cursor = null;
            } else {
                cursor = null;
            }
        }

        // Posicionar Columna Vertebral (Spine) hacia ARRIBA
        spine.forEach((node, index) => {
            node.x = centerX;
            node.y = startY - (index * levelHeight); // Restar Y para subir
            node.isSpine = true;
        });

        // Posicionar Hijos (Branches)
        spine.forEach((parent) => {
            if (!parent.children) return;
            const siblings = parent.children.filter(c => !spine.includes(c));
            
            if (siblings.length > 0) {
                // Alternar izquierda / derecha
                // Usar grid simple alrededor del padre
                siblings.forEach((child, i) => {
                    const row = Math.floor(i / 2);
                    const col = i % 2 === 0 ? -1 : 1;
                    
                    child.x = centerX + (col * 130); 
                    // Ponerlos un poco más arriba que el padre para que se vea crecimiento
                    child.y = parent.y - 80 - (row * 90); 
                    child.isSpine = false;
                });
            }
        });
        
        root.descendants().forEach(d => {
            if (d.x === undefined) { d.x = centerX; d.y = startY; }
        });
    }

    calculateDesktopLayout(root) {
        const treeLayout = d3.tree().size([this.width - 200, this.height - 200]);
        treeLayout(root);
        
        // Invertir Y para Desktop también (Bottom-Up)
        const startY = this.height - 100;
        const levelHeight = 180;
        
        root.descendants().forEach(d => {
            d.y = startY - (d.depth * levelHeight);
        });
    }

    updateGraph() {
        if (!this.svg || !store.value.data) return;

        const isMobile = this.width < 768;
        const harvestedFruits = store.value.gamification.fruits;
        const completedSet = store.value.completedNodes;
        const rootData = store.value.data;

        // Actualizar suelo si cambia el tamaño
        this.drawGround();

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

        // --- CAMERA CONSTRAINTS (Bottom-Up Logic) ---
        // Y crece hacia arriba (negativo). 
        // MaxY (suelo) es ~height. MinY (cielo) es muy negativo.
        
        let minY = Infinity;
        nodes.forEach(d => { if (d.y < minY) minY = d.y; });
        
        // Permitir scroll hasta la copa más alta + padding
        const topLimit = minY - 500;
        const bottomLimit = this.height + 200;

        if (this.zoom) {
            this.zoom.translateExtent([
                [-Infinity, topLimit], 
                [Infinity, bottomLimit]
            ]);
        }

        // --- LINKS (Troncos Marrones) ---
        const linkGen = d3.linkVertical().x(d => d.x).y(d => d.y);

        const linkSelection = this.linkGroup.selectAll(".link")
            .data(links, d => d.target.data.id);

        const linkEnter = linkSelection.enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", "#8D6E63") // Marrón Madera
            .attr("stroke-width", 12)
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
                // Si completado, quizás ponerlo verde? No, dejémoslo madera para que parezca árbol.
                // O quizás dorado si todo está completo.
                // Usemos marrón madera siempre para la metáfora del árbol.
                return "#8D6E63"; 
            });

        linkSelection.exit().transition().duration(this.duration / 2)
            .style("opacity", 0).remove();


        // --- NODES ---
        const nodeSelection = this.nodeGroup.selectAll("g.node")
            .data(nodes, d => d.data.id);

        const nodeEnter = nodeSelection.enter().append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y}) scale(0)`)
            .style("cursor", "pointer")
            .on("click", (e, d) => this.handleNodeClick(e, d));

        // 1. Círculo Fondo (Color dinámico)
        nodeEnter.append("circle")
            .attr("r", 40)
            .attr("class", "node-bg")
            .attr("stroke", "#fff")
            .attr("stroke-width", 4)
            .attr("filter", "url(#shadow-soft)");

        // 2. Icono
        nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("font-size", "28px")
            .style("user-select", "none");

        // 3. Etiqueta (Pill)
        const labelG = nodeEnter.append("g")
            .attr("transform", "translate(0, 55)");
        
        labelG.append("rect")
            .attr("rx", 8).attr("ry", 8).attr("height", 24)
            .attr("fill", "rgba(255,255,255,0.9)")
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 1);

        labelG.append("text")
            .attr("class", "label-text")
            .attr("dy", 16)
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "800")
            .attr("fill", "#334155")
            .text(d => d.data.name.substring(0, 15));

        // --- UPDATE NODES ---
        const nodeUpdate = nodeSelection.merge(nodeEnter).transition().duration(this.duration)
            .attr("transform", d => `translate(${d.x},${d.y}) scale(1)`);

        nodeUpdate.select(".node-bg")
            .attr("fill", d => {
                if (d.data.type === 'root') return "#fff";
                return this.getNodeColor(d);
            })
            .attr("stroke", d => {
                const isComplete = completedSet.has(d.data.id);
                if (isComplete) return "#4CAF50"; // Borde verde si completado
                if (d.data.expanded) return "#2196F3"; // Borde azul si activo
                return "#fff";
            });

        nodeUpdate.select(".node-icon")
            .text(d => {
                if (completedSet.has(d.data.id) && (d.data.type === 'leaf' || d.data.type === 'exam')) return "🌟";
                return d.data.icon || (d.data.type === 'branch' ? '🍎' : '🍃');
            });

        // Ajustar ancho etiqueta
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
        let targetNode = null;
        if (store.value.selectedNode) {
            targetNode = nodes.find(n => n.data.id === store.value.selectedNode.id);
        }
        if (!targetNode) {
             // Find Highest completed node (Highest Y means lowest numeric value since Y goes up negative)
             // But actually we want the "latest" in terms of progression.
             // Progression is bottom-up.
             // We look for the "deepest" node in tree structure that is complete.
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
        
        this.updateAvatarPosition(d, 500);
        store.toggleNode(d.data.id);
        this.focusNode(d.data.id);
    }

    focusNode(nodeId) {
        if (!this.svg || !this.zoom) return;
        
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
        
        // Centrar
        const tx = (this.width / 2) - (targetX * scale);
        // Queremos que el nodo esté un poco más abajo del centro (para ver lo que crece arriba)
        const ty = (this.height * 0.7) - (targetY * scale);

        this.svg.transition().duration(1000)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
}
customElements.define('arbor-graph', ArborGraph);
