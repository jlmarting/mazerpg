
/**
 * Structor - Sprite Mapping Tool Logic
 */
import { GameSpriteContract } from '../core/SpriteConfig';

class Structor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gridCanvas: HTMLCanvasElement;
    private gridCtx: CanvasRenderingContext2D;
    private previewCanvas: HTMLCanvasElement;
    private previewCtx: CanvasRenderingContext2D;
    private largePreviewCanvas: HTMLCanvasElement;
    private largePreviewCtx: CanvasRenderingContext2D;

    private image: HTMLImageElement | null = null;
    private imageName: string = "unknown_sheet";

    private zoom: number = 1;
    private isDragging: boolean = false;
    private isMovingBox: boolean = false;
    private gridVisible: boolean = true;

    // Lista de selecciones múltiples
    private selections: { x: number, y: number, w: number, h: number }[] = [{ x: 0, y: 0, w: 32, h: 32 }];
    private activeIndex: number = 0;

    private config: any = { imagen: "", mapeo: {} };

    private isPlaying: boolean = false;
    private currentFrameIndex: number = 0;
    private animInterval: any = null;

    constructor() {
        this.canvas = document.getElementById('spriteCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.gridCanvas = document.getElementById('gridOverlay') as HTMLCanvasElement;
        this.gridCtx = this.gridCanvas.getContext('2d')!;
        this.previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
        this.previewCtx = this.previewCanvas.getContext('2d')!;
        this.largePreviewCanvas = document.getElementById('largePreviewCanvas') as HTMLCanvasElement;
        this.largePreviewCtx = this.largePreviewCanvas.getContext('2d')!;

        this.setupEventListeners();
    }

    private setupEventListeners() {
        document.getElementById('fileInput')?.addEventListener('change', (e) => this.handleFile(e));
        document.getElementById('btnLoadDemo')?.addEventListener('click', () => this.loadDemo());

        const viewer = document.getElementById('viewer')!;
        viewer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        viewer.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent standard context menu
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        // Contract UI
        this.initContractUI();

        // Zoom controls
        document.getElementById('btnZoomIn')?.addEventListener('click', () => this.setZoom(this.zoom * 1.2));
        document.getElementById('btnZoomOut')?.addEventListener('click', () => this.setZoom(this.zoom / 1.2));
        document.getElementById('btnResetZoom')?.addEventListener('click', () => this.setZoom(1));
        document.getElementById('btnToggleGrid')?.addEventListener('click', () => {
            this.gridVisible = !this.gridVisible;
            this.gridCanvas.style.display = this.gridVisible ? 'block' : 'none';
        });

        // Coordinate inputs
        ['boxX', 'boxY', 'boxW', 'boxH'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.updateSelectionFromInputs());
        });

        document.getElementById('btnExport')?.addEventListener('click', () => this.addFrameToConfig());
        document.getElementById('btnClearAnim')?.addEventListener('click', () => this.clearCurrentAction());

        // Animation controls
        document.getElementById('btnPlayAnim')?.addEventListener('click', () => this.togglePlay());
        document.getElementById('animSpeed')?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            document.getElementById('speedVal')!.textContent = `${val}ms`;
            if (this.isPlaying) {
                this.stopAnim();
                this.startAnim();
            }
        });

        // Large Preview
        document.getElementById('btnOpenLargePreview')?.addEventListener('click', () => this.openLargePreview());
        document.getElementById('btnCloseLargePreview')?.addEventListener('click', () => this.closeLargePreview());
        document.getElementById('modalAnimSpeed')?.addEventListener('input', (e) => {
            const val = (e.target as HTMLInputElement).value;
            document.getElementById('modalSpeedVal')!.textContent = `${val}ms`;
            (document.getElementById('animSpeed') as HTMLInputElement).value = val;
            document.getElementById('speedVal')!.textContent = `${val}ms`;
            if (this.isPlaying) {
                this.stopAnim();
                this.startAnim();
            }
        });

        window.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    private initContractUI() {
        const catSelect = document.getElementById('catSelect') as HTMLSelectElement;
        const claseSelect = document.getElementById('claseSelect') as HTMLSelectElement;
        const accionSelect = document.getElementById('accionSelect') as HTMLSelectElement;

        const contract: any = GameSpriteContract.categorias;

        Object.keys(contract).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat.toUpperCase();
            catSelect.appendChild(opt);
        });

        const updateClases = () => {
            claseSelect.innerHTML = "";
            const cat = catSelect.value;
            contract[cat].clases.forEach((clase: string) => {
                const opt = document.createElement('option');
                opt.value = clase;
                opt.textContent = clase.toUpperCase();
                claseSelect.appendChild(opt);
            });
            updateAcciones();
        };

        const updateAcciones = () => {
            accionSelect.innerHTML = "";
            const cat = catSelect.value;
            contract[cat].acciones.forEach((accion: string) => {
                const opt = document.createElement('option');
                opt.value = accion;
                opt.textContent = accion.toUpperCase();
                accionSelect.appendChild(opt);
            });
            this.updateFrameInfo();
        };

        catSelect.addEventListener('change', updateClases);
        claseSelect.addEventListener('change', updateAcciones);
        accionSelect.addEventListener('change', () => this.updateFrameInfo());

        updateClases();
    }

    private handleKeyboard(e: KeyboardEvent) {
        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const step = e.shiftKey ? 1 : 32;
            if (e.key === 'ArrowUp') sel.y -= step;
            if (e.key === 'ArrowDown') sel.y += step;
            if (e.key === 'ArrowLeft') sel.x -= step;
            if (e.key === 'ArrowRight') sel.x += step;

            this.updateInputsFromSelection();
            this.updateSelectionBoxes();
            this.updatePreview();
            e.preventDefault();
        }
    }

    private handleFile(e: any) {
        const file = e.target.files[0];
        if (!file) return;
        this.imageName = file.name;
        this.config.imagen = this.imageName;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.loadImage(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }

    private loadDemo() {
        this.imageName = "demo_sheet.png";
        this.config.imagen = this.imageName;
        const demoSheet = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAM0lEQVRYR+3VwQkAMAgEMKv779S7hyCId8ALEn6vSREIECBAgAABAgQIECBAgMAtfOAAESofvzwAAAAASUVORK5CYII=';
        this.loadImage(demoSheet);
    }

    private loadImage(src: string) {
        this.image = new Image();
        this.image.onload = () => {
            this.canvas.width = this.image!.width;
            this.canvas.height = this.image!.height;
            this.gridCanvas.width = this.image!.width;
            this.gridCanvas.height = this.image!.height;
            this.draw();
            this.drawGrid();
            this.updateSelectionBoxes();
        };
        this.image.src = src;
    }

    private drawGrid() {
        this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        this.gridCtx.strokeStyle = '#fff';
        this.gridCtx.lineWidth = 0.5;
        this.gridCtx.beginPath();
        for (let x = 0; x <= this.gridCanvas.width; x += 32) {
            this.gridCtx.moveTo(x, 0);
            this.gridCtx.lineTo(x, this.gridCanvas.height);
        }
        for (let y = 0; y <= this.gridCanvas.height; y += 32) {
            this.gridCtx.moveTo(0, y);
            this.gridCtx.lineTo(this.gridCanvas.width, y);
        }
        this.gridCtx.stroke();
    }

    private setZoom(z: number) {
        this.zoom = Math.max(0.1, Math.min(10, z));
        const container = document.getElementById('canvasContainer')!;
        container.style.transform = `scale(${this.zoom})`;
    }

    private handleMouseDown(e: MouseEvent) {
        if (!this.image) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom;
        const y = (e.clientY - rect.top) / this.zoom;

        const clickedIndex = this.getSelectionIndexAt(x, y);

        // Deletar con Ctrl + Click Derecho
        if (e.ctrlKey && e.button === 2) {
            if (clickedIndex !== -1) {
                this.selections.splice(clickedIndex, 1);
                if (this.selections.length === 0) {
                    this.selections = [{ x: 0, y: 0, w: 32, h: 32 }];
                }
                this.activeIndex = Math.min(this.activeIndex, this.selections.length - 1);
                this.updateUI();
            }
            e.preventDefault();
            return;
        }

        if (e.ctrlKey && e.button === 0) {
            // Agregar nueva selección o mover existente
            if (clickedIndex !== -1) {
                this.activeIndex = clickedIndex;
                this.isMovingBox = true;
            } else {
                const last = this.selections[this.selections.length - 1] || { w: 32, h: 32 };
                this.selections.push({ x: Math.floor(x - last.w / 2), y: Math.floor(y - last.h / 2), w: last.w, h: last.h });
                this.activeIndex = this.selections.length - 1;
                this.isMovingBox = true;
            }
        } else if (e.shiftKey && e.button === 0 && this.selections.length > 0) {
            // Selección en rango (lineal)
            this.createRangeSelection(x, y);
        } else if (e.button === 0) {
            // Selección normal
            if (clickedIndex !== -1) {
                this.activeIndex = clickedIndex;
                this.isMovingBox = true;
            } else {
                // Empezar de cero con una sola selección
                const w = parseInt((document.getElementById('boxW') as HTMLInputElement).value) || 32;
                const h = parseInt((document.getElementById('boxH') as HTMLInputElement).value) || 32;
                this.selections = [{ x: Math.floor(x - w / 2), y: Math.floor(y - h / 2), w, h }];
                this.activeIndex = 0;
                this.isMovingBox = true;
            }
        }

        this.updateUI();
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.image) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom;
        const y = (e.clientY - rect.top) / this.zoom;

        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        if (this.isDragging) {
            sel.w = Math.max(1, Math.floor(x - sel.x));
            sel.h = Math.max(1, Math.floor(y - sel.y));
        } else if (this.isMovingBox) {
            sel.x = Math.floor(x - sel.w / 2);
            sel.y = Math.floor(y - sel.h / 2);
        } else {
            return;
        }

        this.updateInputsFromSelection();
        this.updateSelectionBoxes();
    }

    private handleMouseUp() {
        this.isDragging = false;
        this.isMovingBox = false;
        this.updatePreview();
    }

    private getSelectionIndexAt(x: number, y: number): number {
        for (let i = this.selections.length - 1; i >= 0; i--) {
            const s = this.selections[i];
            if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
                return i;
            }
        }
        return -1;
    }

    private createRangeSelection(targetX: number, targetY: number) {
        const last = this.selections[this.selections.length - 1];
        const dx = targetX - (last.x + last.w / 2);
        const dy = targetY - (last.y + last.h / 2);

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal
            const count = Math.floor(Math.abs(dx) / last.w);
            const step = dx > 0 ? last.w : -last.w;
            for (let i = 1; i <= count; i++) {
                this.selections.push({ x: last.x + step * i, y: last.y, w: last.w, h: last.h });
            }
        } else {
            // Vertical
            const count = Math.floor(Math.abs(dy) / last.h);
            const step = dy > 0 ? last.h : -last.h;
            for (let i = 1; i <= count; i++) {
                this.selections.push({ x: last.x, y: last.y + step * i, w: last.w, h: last.h });
            }
        }
        this.activeIndex = this.selections.length - 1;
    }

    private updateSelectionFromInputs() {
        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        sel.x = parseInt((document.getElementById('boxX') as HTMLInputElement).value) || 0;
        sel.y = parseInt((document.getElementById('boxY') as HTMLInputElement).value) || 0;
        sel.w = parseInt((document.getElementById('boxW') as HTMLInputElement).value) || 32;
        sel.h = parseInt((document.getElementById('boxH') as HTMLInputElement).value) || 32;
        this.updateSelectionBoxes();
        this.updatePreview();
    }

    private updateInputsFromSelection() {
        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        (document.getElementById('boxX') as HTMLInputElement).value = sel.x.toString();
        (document.getElementById('boxY') as HTMLInputElement).value = sel.y.toString();
        (document.getElementById('boxW') as HTMLInputElement).value = sel.w.toString();
        (document.getElementById('boxH') as HTMLInputElement).value = sel.h.toString();
    }

    private updateSelectionBoxes() {
        const container = document.getElementById('selectionBoxesContainer')!;
        container.innerHTML = "";

        this.selections.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = `selection-box ${i === this.activeIndex ? 'active' : ''}`;
            div.style.left = `${s.x}px`;
            div.style.top = `${s.y}px`;
            div.style.width = `${s.w}px`;
            div.style.height = `${s.h}px`;
            div.setAttribute('data-index', (i + 1).toString());
            container.appendChild(div);
        });
    }

    private updateUI() {
        this.updateInputsFromSelection();
        this.updateSelectionBoxes();
        this.updatePreview();
        this.updateFrameInfo();
    }

    private draw() {
        if (!this.image) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.image, 0, 0);
    }

    private updatePreview() {
        if (!this.image) return;
        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        const ratio = Math.min(this.previewCanvas.width / sel.w, this.previewCanvas.height / sel.h);
        const nw = sel.w * ratio;
        const nh = sel.h * ratio;

        this.previewCtx.drawImage(
            this.image,
            sel.x, sel.y, sel.w, sel.h,
            (this.previewCanvas.width - nw) / 2, (this.previewCanvas.height - nh) / 2, nw, nh
        );

        if (this.largePreviewModalVisible()) {
            this.updateLargePreview();
        }
    }

    private addFrameToConfig() {
        const cat = (document.getElementById('catSelect') as HTMLSelectElement).value;
        const clase = (document.getElementById('claseSelect') as HTMLSelectElement).value;
        const accion = (document.getElementById('accionSelect') as HTMLSelectElement).value;

        if (!this.config.mapeo[cat]) this.config.mapeo[cat] = {};
        if (!this.config.mapeo[cat][clase]) this.config.mapeo[cat][clase] = {};
        if (!this.config.mapeo[cat][clase][accion]) {
            this.config.mapeo[cat][clase][accion] = { puntos: [] };
        }

        this.config.mapeo[cat][clase][accion].imagen = this.imageName;

        // Agregar todas las selecciones actuales como frames
        this.selections.forEach(sel => {
            this.config.mapeo[cat][clase][accion].puntos.push({
                x: sel.x,
                y: sel.y,
                w: sel.w,
                h: sel.h
            });
        });

        this.updateFrameInfo();
        this.renderOutput();
    }

    private clearCurrentAction() {
        const cat = (document.getElementById('catSelect') as HTMLSelectElement).value;
        const clase = (document.getElementById('claseSelect') as HTMLSelectElement).value;
        const accion = (document.getElementById('accionSelect') as HTMLSelectElement).value;

        if (this.config.mapeo[cat] && this.config.mapeo[cat][clase]) {
            delete this.config.mapeo[cat][clase][accion];
        }
        this.updateFrameInfo();
        this.renderOutput();
    }

    private updateFrameInfo() {
        const cat = (document.getElementById('catSelect') as HTMLSelectElement).value;
        const clase = (document.getElementById('claseSelect') as HTMLSelectElement).value;
        const accion = (document.getElementById('accionSelect') as HTMLSelectElement).value;

        const puntos = this.config.mapeo[cat]?.[clase]?.[accion]?.puntos || [];
        document.getElementById('frameInfo')!.textContent = `Frames asignados: ${puntos.length}`;
    }

    private renderOutput() {
        const out = document.getElementById('output')!;
        out.textContent = JSON.stringify(this.config, null, 2);
        out.scrollTop = out.scrollHeight;
    }

    private togglePlay() {
        if (this.isPlaying) {
            this.stopAnim();
        } else {
            this.startAnim();
        }
    }

    private startAnim() {
        const cat = (document.getElementById('catSelect') as HTMLSelectElement).value;
        const clase = (document.getElementById('claseSelect') as HTMLSelectElement).value;
        const accion = (document.getElementById('accionSelect') as HTMLSelectElement).value;
        const puntos = this.config.mapeo[cat]?.[clase]?.[accion]?.puntos || [];

        if (puntos.length === 0) return;

        this.isPlaying = true;
        document.getElementById('btnPlayAnim')!.textContent = "STOP";

        const speed = parseInt((document.getElementById('animSpeed') as HTMLInputElement).value);
        this.animInterval = setInterval(() => {
            this.currentFrameIndex = (this.currentFrameIndex + 1) % puntos.length;
            this.drawPreviewFrame(puntos[this.currentFrameIndex]);
        }, speed);
    }

    private stopAnim() {
        this.isPlaying = false;
        document.getElementById('btnPlayAnim')!.textContent = "PLAY";
        clearInterval(this.animInterval);
        this.updatePreview(); // Volver al frame seleccionado actualmente
    }

    private drawPreviewFrame(p: any) {
        if (!this.image) return;

        // Small preview
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        const ratioS = Math.min(this.previewCanvas.width / p.w, this.previewCanvas.height / p.h);
        const nwS = p.w * ratioS;
        const nhS = p.h * ratioS;
        this.previewCtx.drawImage(this.image, p.x, p.y, p.w, p.h, (this.previewCanvas.width - nwS) / 2, (this.previewCanvas.height - nhS) / 2, nwS, nhS);

        // Large preview
        if (this.largePreviewModalVisible()) {
            this.largePreviewCtx.clearRect(0, 0, this.largePreviewCanvas.width, this.largePreviewCanvas.height);
            const ratioL = Math.min(this.largePreviewCanvas.width / p.w, this.largePreviewCanvas.height / p.h);
            const nwL = p.w * ratioL;
            const nhL = p.h * ratioL;
            this.largePreviewCtx.drawImage(this.image, p.x, p.y, p.w, p.h, (this.largePreviewCanvas.width - nwL) / 2, (this.largePreviewCanvas.height - nhL) / 2, nwL, nhL);
        }
    }

    private openLargePreview() {
        const modal = document.getElementById('largePreviewModal')!;
        modal.style.display = 'flex';
        this.updateLargePreview();
    }

    private closeLargePreview() {
        document.getElementById('largePreviewModal')!.style.display = 'none';
    }

    private largePreviewModalVisible() {
        return document.getElementById('largePreviewModal')!.style.display === 'flex';
    }

    private updateLargePreview() {
        if (!this.image) return;
        const sel = this.selections[this.activeIndex];
        if (!sel) return;

        this.largePreviewCtx.clearRect(0, 0, this.largePreviewCanvas.width, this.largePreviewCanvas.height);
        const ratio = Math.min(this.largePreviewCanvas.width / sel.w, this.largePreviewCanvas.height / sel.h);
        const nw = sel.w * ratio;
        const nh = sel.h * ratio;
        this.largePreviewCtx.drawImage(this.image, sel.x, sel.y, sel.w, sel.h, (this.largePreviewCanvas.width - nw) / 2, (this.largePreviewCanvas.height - nh) / 2, nw, nh);
    }
}

new Structor();
