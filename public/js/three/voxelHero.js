// voxelHero.js — Héroe voxel original estilo Minecraft Dungeons.
// Se construye solo con BoxGeometry + CanvasTexture procedurales (16×16/8×8,
// NearestFilter). Sin modelos externos ni assets con copyright.
// Recibe THREE por parámetro para no importar el módulo aquí (el visor lo
// carga de forma diferida y defensiva).

function pixelTexture(THREE, w, h, draw) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	draw(canvas.getContext('2d'));
	const tex = new THREE.CanvasTexture(canvas);
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export function buildVoxelHero(THREE) {
	const hero = new THREE.Group();
	hero.name = 'voxel-hero';

	const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
	const box = (w, h, d, mat) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	};

	// ---------- Texturas procedurales ----------
	// Cara: piel + pelo + ojos/boca pixelados.
	const faceTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#d8a066'; g.fillRect(0, 0, 16, 16);      // piel
		g.fillStyle = '#4a3524'; g.fillRect(0, 0, 16, 5);        // pelo
		g.fillRect(0, 5, 2, 1); g.fillRect(5, 5, 2, 1);
		g.fillRect(9, 5, 3, 1); g.fillRect(14, 5, 2, 1);         // flequillo
		g.fillRect(3, 6, 3, 1); g.fillRect(10, 6, 3, 1);         // cejas
		g.fillStyle = '#f4f0e6'; g.fillRect(3, 7, 2, 2); g.fillRect(11, 7, 2, 2); // ojos
		g.fillStyle = '#2b2b3a'; g.fillRect(4, 8, 1, 1); g.fillRect(11, 8, 1, 1); // pupilas
		g.fillStyle = '#b0763f'; g.fillRect(7, 10, 2, 1);        // nariz
		g.fillStyle = '#8a5040'; g.fillRect(6, 12, 4, 1);        // boca
		g.fillStyle = '#c08a54'; g.fillRect(0, 15, 16, 1);       // sombra barbilla
	});
	const hairSideTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#4a3524'; g.fillRect(0, 0, 16, 10);
		g.fillStyle = '#d8a066'; g.fillRect(0, 10, 16, 6);       // mandíbula
		g.fillStyle = '#3d2b1d'; g.fillRect(0, 9, 16, 1);
	});
	const hairBackTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#4a3524'; g.fillRect(0, 0, 16, 16);
		g.fillStyle = '#3d2b1d'; g.fillRect(0, 12, 16, 4);
	});
	const hairTopTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#4a3524'; g.fillRect(0, 0, 16, 16);
		g.fillStyle = '#5a4230'; g.fillRect(6, 6, 4, 4);         // remolino
	});
	const neckTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#8a5f38'; g.fillRect(0, 0, 16, 16);
	});

	// Túnica azul con cinturón (misma textura envuelve el torso).
	const torsoTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#3f6d9e'; g.fillRect(0, 0, 16, 16);       // túnica
		g.fillStyle = '#33567c'; g.fillRect(0, 0, 16, 2);        // cuello
		g.fillRect(0, 15, 16, 1);                                // dobladillo
		g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);       // sombra lateral
		g.fillStyle = '#6b4a2a'; g.fillRect(0, 9, 16, 3);        // cinturón
		g.fillStyle = '#d8b04a'; g.fillRect(7, 9, 2, 3);         // hebilla
	});

	// Brazo: manga de túnica arriba, mano de piel abajo.
	const armTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#3f6d9e'; g.fillRect(0, 0, 16, 9);
		g.fillStyle = '#33567c'; g.fillRect(0, 0, 16, 1);
		g.fillStyle = '#d8b04a'; g.fillRect(0, 8, 16, 1);        // puño dorado
		g.fillStyle = '#d8a066'; g.fillRect(0, 9, 16, 7);        // mano
	});

	// Pierna: pantalón + bota.
	const legTex = pixelTexture(THREE, 16, 16, (g) => {
		g.fillStyle = '#43404a'; g.fillRect(0, 0, 16, 10);       // pantalón
		g.fillStyle = '#2f2723'; g.fillRect(0, 10, 16, 6);       // bota
		g.fillStyle = '#1f1a17'; g.fillRect(0, 15, 16, 1);       // suela
	});

	// Hoja de espada: acero con filo claro y punta simulada abajo.
	const bladeTex = pixelTexture(THREE, 8, 16, (g) => {
		g.fillStyle = '#77828f'; g.fillRect(0, 0, 8, 16);        // filos
		g.fillStyle = '#aab8c8'; g.fillRect(1, 0, 6, 16);
		g.fillStyle = '#e8f0f8'; g.fillRect(3, 0, 2, 16);        // brillo central
		g.fillStyle = '#8a97a6'; g.fillRect(0, 0, 8, 2);         // base junto a guarda
		g.fillStyle = '#77828f'; g.fillRect(0, 14, 2, 2); g.fillRect(6, 14, 2, 2);
		g.fillRect(0, 15, 3, 1); g.fillRect(5, 15, 3, 1);        // punta
	});

	// Loro/compañero: cuerpo verde y cara mínima.
	const parrotBodyTex = pixelTexture(THREE, 8, 8, (g) => {
		g.fillStyle = '#3f9e4d'; g.fillRect(0, 0, 8, 8);
		g.fillStyle = '#2e7d3a'; g.fillRect(0, 5, 8, 3);         // barriga
		g.fillRect(0, 2, 1, 4); g.fillRect(7, 2, 1, 4);          // alas
	});
	const parrotFaceTex = pixelTexture(THREE, 8, 8, (g) => {
		g.fillStyle = '#4db85c'; g.fillRect(0, 0, 8, 8);
		g.fillStyle = '#1a1a22'; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1); // ojos
		g.fillStyle = '#3f9e4d'; g.fillRect(0, 6, 8, 2);
	});

	// ---------- Ensamblaje (pies en y=0, héroe ≈1.9 alto) ----------
	const legMat = lambert({ map: legTex });
	for (const side of [-1, 1]) {
		const leg = box(0.28, 0.55, 0.32, legMat);
		leg.position.set(0.17 * side, 0.275, 0);
		hero.add(leg);
	}

	const torso = box(0.7, 0.6, 0.38, lambert({ map: torsoTex }));
	torso.position.set(0, 0.85, 0);
	hero.add(torso);

	// Cabeza con materiales por cara: [+x, -x, +y, -y, +z (frente), -z].
	const headMats = [
		lambert({ map: hairSideTex }), lambert({ map: hairSideTex }),
		lambert({ map: hairTopTex }), lambert({ map: neckTex }),
		lambert({ map: faceTex }), lambert({ map: hairBackTex }),
	];
	const head = box(0.55, 0.55, 0.55, headMats);
	head.position.set(0, 1.44, 0);
	hero.add(head);

	// Brazos con pivote en el hombro para poder balancearlos.
	const armMat = lambert({ map: armTex });
	const armL = new THREE.Group();
	armL.position.set(-0.47, 1.1, 0);
	const armLMesh = box(0.22, 0.58, 0.26, armMat);
	armLMesh.position.y = -0.29;
	armL.add(armLMesh);
	armL.rotation.x = 0.08;
	hero.add(armL);

	const armR = new THREE.Group();
	armR.position.set(0.47, 1.1, 0);
	const armRMesh = box(0.22, 0.58, 0.26, armMat);
	armRMesh.position.y = -0.29;
	armR.add(armRMesh);
	armR.rotation.x = -0.28;
	hero.add(armR);

	// Hombreras metálicas.
	const padMat = lambert({ color: '#8a95a5' });
	for (const side of [-1, 1]) {
		const pad = box(0.3, 0.16, 0.34, padMat);
		pad.position.set(0.47 * side, 1.2, 0);
		pad.rotation.z = -0.12 * side;
		hero.add(pad);
	}

	// Espada en la mano derecha, en reposo apuntando abajo-adelante.
	const sword = new THREE.Group();
	sword.position.set(0, -0.5, 0.02);
	const grip = box(0.07, 0.18, 0.07, lambert({ color: '#5a3d24' }));
	grip.position.y = 0.06;
	const guard = box(0.3, 0.07, 0.1, lambert({ color: '#c9a24a' }));
	guard.position.y = -0.04;
	const blade = box(0.13, 0.68, 0.05, lambert({ map: bladeTex }));
	blade.position.y = -0.42;
	sword.add(grip, guard, blade);
	sword.rotation.x = -0.5;
	armR.add(sword);

	// Loro posado en la hombrera izquierda (detalle decorativo).
	const companion = new THREE.Group();
	companion.position.set(-0.47, 1.28, 0.05);
	const pBody = box(0.16, 0.16, 0.16, lambert({ map: parrotBodyTex }));
	pBody.position.y = 0.08;
	const pHeadPlain = lambert({ color: '#4db85c' });
	const pHead = box(0.12, 0.12, 0.12, [
		pHeadPlain, pHeadPlain, pHeadPlain, pHeadPlain,
		lambert({ map: parrotFaceTex }), pHeadPlain,
	]);
	pHead.position.y = 0.2;
	const pBeak = box(0.05, 0.04, 0.06, lambert({ color: '#e8c23a' }));
	pBeak.position.set(0, 0.19, 0.09);
	const pTail = box(0.05, 0.14, 0.03, lambert({ color: '#2e7d3a' }));
	pTail.position.set(0, 0.05, -0.1);
	pTail.rotation.x = 0.5;
	companion.add(pBody, pHead, pBeak, pTail);
	hero.add(companion);

	return { group: hero, head, armL, armR, sword, companion };
}
