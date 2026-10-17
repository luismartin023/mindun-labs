// characterViewer.js — Visor 3D decorativo e independiente del héroe.
//
// Contrato (ARCHITECTURE.md §5): createCharacterViewer(container, {paused}) →
// { dispose, setPaused, resetView, isRunning, renderer }. El host es
// `.char-stage`; si WebGL falla se añade `.no-webgl` y el CSS muestra
// `.char-fallback`. NUNCA lee el ítem seleccionado ni acopla equipamiento.
//
// Three se carga de forma diferida desde '/vendor/three.module.js' (la única
// fuente permitida). Import diferido a propósito: el build vendorizado es el
// paquete dividido que re-exporta desde './three.core.js'; si ese archivo no
// está servido o WebGL no existe, un import estático rompería toda la página.
// Así cualquier fallo degrada al fallback CSS sin romper nada.

import { buildVoxelHero } from './voxelHero.js';

const BG = 0x1d1819;                 // --bg-world, niebla a juego
const AUTO_ROTATE_MAX = 0.4;         // rad/s
const BASE_RADIUS = 4.3;
const TARGET_Y = 0.95;
const DEF = { yaw: 0.62, pitch: 0.36, zoom: 1 }; // vista ~3/4
const PITCH_MIN = 0.06;
const PITCH_MAX = 1.25;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createCharacterViewer(container, opts = {}) {
	const st = {
		disposed: false,
		paused: !!opts.paused,
		reduced: false,
		lost: false,
		running: false,
		raf: 0,
		renderer: null,
		scene: null,
		camera: null,
		timer: null,
		t: 0,
		yaw: DEF.yaw,
		pitch: DEF.pitch,
		zoom: DEF.zoom,
		dragging: false,
		lastX: 0,
		lastY: 0,
		ro: null,
		mq: null,
		hero: null,
		parts: null,
		canvas: null,
	};

	const api = {
		dispose,
		setPaused,
		resetView,
		isRunning: () => st.running,
		get renderer() { return st.renderer; },
	};

	if (!container || typeof container.appendChild !== 'function') return api;

	// Carga diferida defensiva de Three (ver cabecera).
	import('/vendor/three.module.js')
		.then((THREE) => { if (!st.disposed) init(THREE); })
		.catch(() => { if (!st.disposed) failToFallback(); });

	return api;

	// ------------------------------------------------------------------
	function failToFallback() {
		try { container.classList.add('no-webgl'); } catch (_e) { /* noop */ }
	}

	function effectivePaused() { return st.paused || st.reduced; }

	function init(THREE) {
		let renderer;
		try {
			renderer = new THREE.WebGLRenderer({
				antialias: true,
				powerPreference: 'low-power',
			});
		} catch (_e) {
			failToFallback();
			return;
		}
		try {
			buildScene(THREE, renderer);
		} catch (_e) {
			// Fallo a mitad de montaje: limpia lo creado y degrada al fallback.
			failToFallback();
			try { dispose(); } catch (_d) { /* noop */ }
		}
	}

	function buildScene(THREE, renderer) {
		const canvas = renderer.domElement;
		st.renderer = renderer;
		st.canvas = canvas;

		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;

		// Accesibilidad + a11y contract.
		canvas.tabIndex = 0;
		canvas.setAttribute('role', 'img');
		canvas.setAttribute('aria-label', 'Personaje 3D');
		canvas.style.cursor = 'grab';
		canvas.style.touchAction = 'none';
		container.appendChild(canvas);

		// ---------- Escena ----------
		const scene = new THREE.Scene();
		st.scene = scene;
		scene.background = new THREE.Color(BG);
		scene.fog = new THREE.Fog(BG, 6, 12);

		const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
		st.camera = camera;

		scene.add(new THREE.AmbientLight(0x8a7568, 0.55));

		const key = new THREE.DirectionalLight(0xffd9a8, 1.7);   // cálida
		key.position.set(2.6, 4.2, 2.2);
		key.castShadow = true;
		key.shadow.mapSize.set(1024, 1024);
		key.shadow.camera.left = -2.6; key.shadow.camera.right = 2.6;
		key.shadow.camera.top = 2.6; key.shadow.camera.bottom = -2.6;
		key.shadow.camera.near = 1; key.shadow.camera.far = 12;
		key.shadow.bias = -0.0004;
		key.shadow.normalBias = 0.02;
		scene.add(key);

		const rim = new THREE.DirectionalLight(0x7fa0e0, 0.85);  // fría
		rim.position.set(-3.2, 2.4, -2.8);
		scene.add(rim);

		// Pedestal oscuro que recibe la sombra suave.
		const pedestal = new THREE.Mesh(
			new THREE.CylinderGeometry(0.98, 1.06, 0.14, 40),
			new THREE.MeshLambertMaterial({ color: '#262022' })
		);
		pedestal.position.y = -0.07;
		pedestal.receiveShadow = true;
		scene.add(pedestal);

		// ---------- Héroe voxel ----------
		const built = buildVoxelHero(THREE);
		st.hero = built.group;
		st.parts = built;
		scene.add(built.group);

		st.timer = new THREE.Timer();
		st.timer.connect(document);

		// ---------- prefers-reduced-motion ----------
		if (typeof window.matchMedia === 'function') {
			st.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
			st.reduced = !!st.mq.matches;
			const onMq = (e) => { st.reduced = !!e.matches; syncLoop(); };
			st.onMq = onMq;
			if (st.mq.addEventListener) st.mq.addEventListener('change', onMq);
			else if (st.mq.addListener) st.mq.addListener(onMq);
		}

		// ---------- Controles (drag / wheel / doble clic / teclado) ----------
		st.onPointerDown = (e) => {
			st.dragging = true;
			st.lastX = e.clientX; st.lastY = e.clientY;
			canvas.style.cursor = 'grabbing';
			try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
		};
		st.onPointerMove = (e) => {
			if (!st.dragging) return;
			st.yaw -= (e.clientX - st.lastX) * 0.007;
			st.pitch = clamp(st.pitch + (e.clientY - st.lastY) * 0.006, PITCH_MIN, PITCH_MAX);
			st.lastX = e.clientX; st.lastY = e.clientY;
			renderOnce();
		};
		const endDrag = () => { st.dragging = false; canvas.style.cursor = 'grab'; };
		st.onPointerUp = endDrag;
		st.onPointerCancel = endDrag;
		st.onWheel = (e) => {
			e.preventDefault();
			st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0009), ZOOM_MIN, ZOOM_MAX);
			renderOnce();
		};
		st.onDblClick = () => resetView();
		st.onKeyDown = (e) => {
			const step = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key];
			if (step) {
				e.preventDefault();
				st.yaw += step[0];
				st.pitch = clamp(st.pitch + step[1], PITCH_MIN, PITCH_MAX);
				renderOnce();
			} else if (e.key === 'Home') { e.preventDefault(); resetView(); }
		};
		st.onContextLost = (e) => {
			if (st.disposed) return;
			e.preventDefault();
			st.lost = true;
			stopLoop();
			failToFallback();
		};

		canvas.addEventListener('pointerdown', st.onPointerDown);
		canvas.addEventListener('pointermove', st.onPointerMove);
		canvas.addEventListener('pointerup', st.onPointerUp);
		canvas.addEventListener('pointercancel', st.onPointerCancel);
		canvas.addEventListener('wheel', st.onWheel, { passive: false });
		canvas.addEventListener('dblclick', st.onDblClick);
		canvas.addEventListener('keydown', st.onKeyDown);
		canvas.addEventListener('webglcontextlost', st.onContextLost);

		// ---------- Resize ----------
		const doResize = () => {
			const w = Math.max(2, container.clientWidth | 0);
			const h = Math.max(2, container.clientHeight | 0);
			renderer.setSize(w, h, false); // CSS .char-stage canvas ya fija 100%
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderOnce();
		};
		if (typeof ResizeObserver === 'function') {
			st.ro = new ResizeObserver(doResize);
			st.ro.observe(container);
		} else {
			st.onWinResize = doResize;
			window.addEventListener('resize', doResize);
		}
		doResize();
		syncLoop();
	}

	// ---------- Bucle / animación ----------
	function applyCamera() {
		if (!st.camera) return;
		const r = BASE_RADIUS * st.zoom;
		const cp = Math.cos(st.pitch);
		st.camera.position.set(
			r * cp * Math.sin(st.yaw),
			TARGET_Y + r * Math.sin(st.pitch),
			r * cp * Math.cos(st.yaw)
		);
		st.camera.lookAt(0, TARGET_Y, 0);
	}

	function animate(t) {
		const p = st.parts;
		if (!p) return;
		// Bob suave (sin hundir los pies en el pedestal), balanceo de espada,
		// cabeza y loro con micro-movimiento. Todo sutil.
		p.group.position.y = 0.02 + 0.02 * Math.sin(t * 1.7);
		p.group.rotation.y = 0.04 * Math.sin(t * 0.5);
		p.armR.rotation.z = 0.04 * Math.sin(t * 1.4);
		p.armL.rotation.x = 0.08 + 0.05 * Math.sin(t * 1.6 + 1);
		p.head.rotation.y = 0.06 * Math.sin(t * 0.7);
		p.companion.rotation.z = 0.08 * Math.sin(t * 2.3);
		p.companion.position.y = 1.28 + 0.015 * Math.sin(t * 2.3 + 0.6);
	}

	function tick() {
		if (st.disposed || st.lost || !st.renderer || !st.timer) {
			st.running = false; st.raf = 0;
			return;
		}
		st.raf = requestAnimationFrame(tick);
		st.timer.update();
		const dt = Math.min(st.timer.getDelta(), 0.05);
		st.t += dt;
		if (!st.dragging) st.yaw += AUTO_ROTATE_MAX * dt;
		animate(st.t);
		applyCamera();
		st.renderer.render(st.scene, st.camera);
	}

	function renderOnce() {
		if (st.disposed || st.lost || !st.renderer || st.running) return; // el bucle ya dibuja
		applyCamera();
		st.renderer.render(st.scene, st.camera);
	}

	function startLoop() {
		if (st.running || st.disposed || st.lost || !st.renderer || !st.timer) return;
		st.running = true;
		st.timer.reset();
		st.raf = requestAnimationFrame(tick);
	}

	function stopLoop() {
		if (st.raf) cancelAnimationFrame(st.raf);
		st.raf = 0;
		st.running = false;
	}

	function syncLoop() {
		if (effectivePaused()) {
			stopLoop();
			renderOnce(); // deja un frame estático
		} else {
			startLoop();
		}
	}

	// ---------- API ----------
	function setPaused(p) {
		st.paused = !!p;
		syncLoop();
	}

	function resetView() {
		st.yaw = DEF.yaw; st.pitch = DEF.pitch; st.zoom = DEF.zoom;
		renderOnce();
	}

	function dispose() {
		if (st.disposed) return;
		st.disposed = true;
		stopLoop();

		if (st.ro) st.ro.disconnect();
		else if (st.onWinResize) window.removeEventListener('resize', st.onWinResize);
		if (st.mq) {
			if (st.mq.removeEventListener) st.mq.removeEventListener('change', st.onMq);
			else if (st.mq.removeListener) st.mq.removeListener(st.onMq);
		}

		const canvas = st.canvas;
		if (canvas) {
			canvas.removeEventListener('pointerdown', st.onPointerDown);
			canvas.removeEventListener('pointermove', st.onPointerMove);
			canvas.removeEventListener('pointerup', st.onPointerUp);
			canvas.removeEventListener('pointercancel', st.onPointerCancel);
			canvas.removeEventListener('wheel', st.onWheel);
			canvas.removeEventListener('dblclick', st.onDblClick);
			canvas.removeEventListener('keydown', st.onKeyDown);
			canvas.removeEventListener('webglcontextlost', st.onContextLost);
		}

		if (st.scene) {
			st.scene.traverse((o) => {
				if (o.geometry) o.geometry.dispose();
				const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
				for (const m of mats) {
					if (m.map) m.map.dispose();
					m.dispose();
				}
			});
		}
		if (st.renderer) {
			st.renderer.dispose();
			if (st.renderer.forceContextLoss) st.renderer.forceContextLoss();
		}
		st.timer?.dispose();
		st.timer = null;
		if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
		st.renderer = null;
	}
}
