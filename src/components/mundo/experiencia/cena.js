/**
 * Meu Pequeno Mundo — cena 3D (seção 5): a maquete procedural. Recebe Three.js já carregado (criarCena(T, …)) e a lista de lugares;
 * não conhece a interface nem os dados além das receitas visuais. As famílias tipográficas das placas vêm de FONTES.
 */
import { FONTES, PAISAGENS, REGIOES } from './config.js';
/* ==========================================================================
   5. CENA 3D — maquete procedural. Recebe a lista de lugares únicos e constrói, atualiza ou remove ilhas.
   Geometrias e materiais são criados uma vez e compartilhados; cada ilha só tem os próprios buffers (descartados ao sair).
   Toda variação vem de um gerador com semente no ID do lugar: o mesmo mundo tem sempre a mesma cara.
   ========================================================================== */
export const TAU = Math.PI * 2;
export const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const misturar = (a, b, t) => a + (b - a) * t;
export const facilSaida = (t) => 1 - Math.pow(1 - t, 3);
export const facilVolta = (t) => { const c = 1.5; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
export const facilMeio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function hash32(texto) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function semente(valor) {
  let a = valor >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function criarCena(T, canvas, opcoes) {
  const { THREE, OrbitControls, mergeGeometries } = T;
  const toqueGrosso = matchMedia('(pointer: coarse)').matches;
  let reduz = opcoes.reduzMovimento();

  // ---------- Renderizador, câmera, luz ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  const razaoPixels = () => Math.min(window.devicePixelRatio || 1, toqueGrosso ? 1.75 : 2);
  renderer.setPixelRatio(razaoPixels());
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // a sombra só é refeita quando algo muda de lugar
  let sujo = true; // há algo novo para desenhar (com movimento reduzido, só se desenha quando há)

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const AZIMUTE = 0.42;
  const POLAR = 0.98;
  camera.position.setFromSpherical(new THREE.Spherical(24, POLAR, AZIMUTE));

  const controles = new OrbitControls(camera, canvas);
  controles.enablePan = false;
  controles.enableDamping = !reduz;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.65;
  controles.zoomSpeed = 0.7;
  controles.minPolarAngle = 0.52;
  controles.maxPolarAngle = 1.22;
  controles.autoRotateSpeed = 0.55;
  controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controles.target.set(0, -0.4, 0);

  const ceu = new THREE.HemisphereLight(0xfff3e0, 0x7a6b58, 1.45);
  cena.add(ceu);
  const sol = new THREE.DirectionalLight(0xfff0d6, 2.3);
  const DIR_SOL = new THREE.Vector3(-0.55, 1, 0.45).normalize();
  sol.castShadow = true;
  sol.shadow.mapSize.set(toqueGrosso ? 1024 : 2048, toqueGrosso ? 1024 : 2048);
  sol.shadow.bias = -0.0005;
  sol.shadow.normalBias = 0.025;
  sol.shadow.radius = 3;
  cena.add(sol, sol.target);

  // Uma mesa invisível bem abaixo das ilhas: só recebe sombra e dá peso à maquete.
  const mesa = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ color: 0x3a2d1a, opacity: 0.11 }));
  mesa.rotation.x = -Math.PI / 2;
  mesa.position.y = -3.7;
  mesa.receiveShadow = true;
  cena.add(mesa);

  // ---------- Materiais compartilhados ----------
  const uTempo = { value: 0 };
  function comVento(material, chave, amplitude) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTempo = uTempo;
      shader.vertexShader = 'uniform float uTempo;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        #ifdef USE_INSTANCING
          float fase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        #else
          float fase = 0.0;
        #endif
        float alto = max( position.y - 0.12, 0.0 );
        transformed.x += sin( uTempo * 1.4 + fase ) * ${amplitude.toFixed(3)} * alto;
        transformed.z += cos( uTempo * 1.1 + fase * 1.3 ) * ${(amplitude * 0.7).toFixed(3)} * alto;`,
      );
    };
    material.customProgramCacheKey = () => chave;
    return material;
  }
  // Água: rios e lagos ondulam pouco; o mar aberto tem cor mais funda e ondas maiores (e espuma na praia, ver criarIlha).
  function materialAgua(cor, opacidade, amp, chave) {
    const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.22, metalness: 0, transparent: true, opacity: opacidade });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTempo = uTempo;
      shader.vertexShader = 'uniform float uTempo;\n' + shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `float ondaA = position.x * 2.3 + uTempo * 1.1;
          float ondaB = position.z * 2.9 - uTempo * 0.8;
          vec3 objectNormal = normalize( vec3( -cos( ondaA ) * ${(amp * 3.2).toFixed(4)}, 1.0, -cos( ondaB ) * ${(amp * 2.7).toFixed(4)} ) );
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`,
        )
        .replace('#include <begin_vertex>', `vec3 transformed = vec3( position );\ntransformed.y += sin( ondaA ) * ${amp.toFixed(4)} + sin( ondaB ) * ${(amp * 0.82).toFixed(4)};`);
    };
    m.customProgramCacheKey = () => chave;
    return m;
  }
  const agua = materialAgua(0x78adba, 0.82, 0.011, 'mpm-agua');

  const M = {
    terreno: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }),
    lateral: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
    veg: comVento(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }), 'mpm-veg', 0.045),
    casa: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    telhado: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    madeira: new THREE.MeshStandardMaterial({ color: 0x8a6949, roughness: 0.95, flatShading: true }),
    corda: new THREE.MeshStandardMaterial({ color: 0x5d4a37, roughness: 1 }),
    barco: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
    marco: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, flatShading: true }),
    agua,
    aguaMar: materialAgua(0x4f93a8, 0.86, 0.02, 'mpm-agua-mar'),
    aguaDuas: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.08, transparent: true, opacity: 0.86 }),
    espuma: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    oculto: new THREE.MeshBasicMaterial({ visible: false }), // só para o toque: área maior que o desenho (dunas, cruz, baleia)
  };

  // ---------- Geometrias compartilhadas (modeladas em unidades da maquete, base em y = 0) ----------
  const corDe = (hex) => new THREE.Color(hex);
  function pintar(geo, hex) {
    const c = corDe(hex);
    const n = geo.attributes.position.count;
    const cores = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cores[i * 3] = c.r; cores[i * 3 + 1] = c.g; cores[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    return geo;
  }
  function juntar(partes) {
    const prontas = partes.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      n.deleteAttribute('uv');
      return n;
    });
    const unida = mergeGeometries(prontas, false);
    prontas.forEach((g) => g.dispose());
    return unida;
  }
  const cil = (rt, rb, h, seg = 5) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const ico = (r) => new THREE.IcosahedronGeometry(r, 0);

  function folhagem(n, { comp, larg, inclinacao, cor1, cor2, alturaTopo, deslocX = 0, rnd }) {
    const partes = [];
    for (let k = 0; k < n; k++) {
      const f = ico(1).scale(comp, 0.028, larg).translate(comp * 0.9, 0, 0).rotateZ(inclinacao + (rnd() - 0.5) * 0.25).rotateY((k / n) * TAU + rnd() * 0.3);
      partes.push(pintar(f.translate(deslocX, alturaTopo, 0), k % 2 ? cor1 : cor2));
    }
    return partes;
  }
  const rg = semente(7);
  const troncoCurvo = (() => {
    const g = new THREE.CylinderGeometry(0.024, 0.04, 0.9, 5, 5).translate(0, 0.45, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + 0.11 * Math.pow(y / 0.9, 2)); }
    g.computeVertexNormals();
    return pintar(g, '#8a7458');
  })();

  const G = {
    redonda: juntar([
      pintar(cil(0.035, 0.05, 0.34).translate(0, 0.17, 0), '#6b4f39'),
      pintar(ico(0.25).scale(1, 0.9, 1).translate(0, 0.5, 0), '#6a8d4c'),
      pintar(ico(0.17).translate(0.11, 0.64, 0.05), '#7c9d5a'),
    ]),
    araucaria: juntar([
      pintar(cil(0.03, 0.05, 1.05).translate(0, 0.525, 0), '#5c4332'),
      pintar(cil(0.34, 0.08, 0.14, 9).translate(0, 0.9, 0), '#45663f'),
      pintar(cil(0.46, 0.12, 0.2, 9).translate(0, 1.06, 0), '#3d5b3b'),
      pintar(cil(0.4, 0.46, 0.05, 9).translate(0, 1.185, 0), '#4b6c43'),
    ]),
    palmeira: juntar([
      troncoCurvo,
      ...folhagem(7, { comp: 0.3, larg: 0.075, inclinacao: -0.5, cor1: '#6b8f45', cor2: '#7b9c50', alturaTopo: 0.9, deslocX: 0.11, rnd: rg }),
      pintar(ico(0.05).translate(0.12, 0.86, 0), '#6b5233'),
    ]),
    buriti: juntar([
      pintar(cil(0.035, 0.045, 1.05).translate(0, 0.525, 0), '#7b6a55'),
      ...folhagem(9, { comp: 0.27, larg: 0.11, inclinacao: 0.05, cor1: '#7a9450', cor2: '#6c8746', alturaTopo: 1.06, rnd: rg }),
    ]),
    mata: juntar([
      pintar(cil(0.04, 0.07, 0.74).translate(0, 0.37, 0), '#57402f'),
      pintar(ico(0.34).translate(0, 0.84, 0), '#3f6c3b'),
      pintar(ico(0.25).translate(0.2, 0.68, 0.1), '#4c7b42'),
      pintar(ico(0.24).translate(-0.19, 0.71, -0.12), '#366238'),
      pintar(ico(0.2).translate(0.02, 1.06, 0.04), '#4a7840'),
    ]),
    cerrado: juntar([
      pintar(cil(0.03, 0.045, 0.3).translate(0, 0.15, 0).rotateZ(0.22), '#4e3a2c'),
      pintar(cil(0.022, 0.03, 0.24).translate(0, 0.12, 0).rotateZ(-0.6).translate(-0.06, 0.25, 0), '#4e3a2c'),
      pintar(ico(0.3).scale(1, 0.4, 1).translate(0.03, 0.45, 0), '#8a9450'),
      pintar(ico(0.19).scale(1, 0.45, 1).translate(-0.17, 0.38, 0.06), '#9b9e5a'),
    ]),
    ipe: juntar([
      pintar(cil(0.03, 0.045, 0.4).translate(0, 0.2, 0).rotateZ(0.08), '#6b4f39'),
      pintar(ico(0.22).scale(1, 0.75, 1).translate(0.02, 0.52, 0), '#f6f2ec'),
      pintar(ico(0.14).scale(1, 0.8, 1).translate(-0.12, 0.47, 0.06), '#efeae2'),
    ]),
    arbusto: juntar([
      pintar(ico(0.13).scale(1, 0.72, 1).translate(0, 0.08, 0), '#769855'),
      pintar(ico(0.09).translate(0.09, 0.06, 0.03), '#84a25d'),
    ]),
    capim: juntar([
      pintar(new THREE.ConeGeometry(0.03, 0.24, 4).translate(0, 0.12, 0), '#b9aa6c'),
      pintar(new THREE.ConeGeometry(0.025, 0.2, 4).translate(0, 0.1, 0).rotateZ(0.3).translate(0.04, 0, 0.02), '#c6b679'),
      pintar(new THREE.ConeGeometry(0.025, 0.18, 4).translate(0, 0.09, 0).rotateZ(-0.32).translate(-0.04, 0, -0.01), '#a99d62'),
    ]),
    junco: juntar([
      pintar(new THREE.ConeGeometry(0.016, 0.34, 3).translate(0, 0.17, 0), '#8ea05a'),
      pintar(new THREE.ConeGeometry(0.014, 0.28, 3).translate(0, 0.14, 0).rotateZ(0.2).translate(0.03, 0, 0.01), '#9caf63'),
      pintar(new THREE.ConeGeometry(0.014, 0.3, 3).translate(0, 0.15, 0).rotateX(0.22).translate(-0.02, 0, 0.03), '#7f9450'),
    ]),
  };
  const paredes = (y0) => juntar([
    pintar(new THREE.BoxGeometry(0.34, 0.22, 0.28).translate(0, 0.11 + y0, 0), '#f3eee5'),
    pintar(new THREE.BoxGeometry(0.07, 0.12, 0.012).translate(0, 0.06 + y0, 0.141), '#5b4535'),
    pintar(new THREE.BoxGeometry(0.06, 0.05, 0.012).translate(-0.105, 0.13 + y0, 0.141), '#4a585e'),
    pintar(new THREE.BoxGeometry(0.06, 0.05, 0.012).translate(0.105, 0.13 + y0, 0.141), '#4a585e'),
  ]);
  const telhado = (y0) => {
    const forma = new THREE.Shape();
    forma.moveTo(-0.19, 0); forma.lineTo(0.19, 0); forma.lineTo(0, 0.15); forma.closePath();
    const g = new THREE.ExtrudeGeometry(forma, { depth: 0.4, bevelEnabled: false });
    g.deleteAttribute('uv');
    return g.translate(0, 0, -0.2).rotateY(Math.PI / 2).translate(0, 0.22 + y0, 0);
  };
  G.casaParede = paredes(0);
  G.casaTelhado = telhado(0);
  G.palafitaParede = paredes(0.2);
  G.palafitaTelhado = telhado(0.2);
  G.pilotis = juntar([[-0.14, -0.11], [0.14, -0.11], [-0.14, 0.11], [0.14, 0.11]].map(([x, z]) => pintar(cil(0.016, 0.016, 0.5, 4).translate(x, -0.05, z), '#7a5d41')));
  G.predio = juntar([
    pintar(new THREE.BoxGeometry(0.38, 1, 0.38).translate(0, 0.5, 0), '#e8e2d7'),
    ...[0.22, 0.42, 0.62, 0.82].map((y) => pintar(new THREE.BoxGeometry(0.386, 0.045, 0.386).translate(0, y, 0), '#8e999d')),
    pintar(new THREE.BoxGeometry(0.4, 0.03, 0.4).translate(0, 1.0, 0), '#cfc8bb'),
  ]);
  G.silo = juntar([
    pintar(cil(0.1, 0.1, 0.44, 10).translate(0, 0.22, 0), '#d2cdc2'),
    pintar(new THREE.ConeGeometry(0.11, 0.12, 10).translate(0, 0.5, 0), '#8f989b'),
  ]);
  G.barco = (() => {
    const casco = new THREE.BoxGeometry(0.36, 0.07, 0.14, 3, 1, 1);
    const faixa = new THREE.BoxGeometry(0.362, 0.022, 0.142, 3, 1, 1).translate(0, 0.012, 0);
    for (const g of [casco, faixa]) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.1) p.setZ(i, p.getZ(i) * 0.3);
      g.computeVertexNormals();
    }
    return juntar([pintar(casco.translate(0, 0.02, 0), '#efe9df'), pintar(faixa.translate(0, 0.02, 0), '#3d6b8a'), pintar(new THREE.BoxGeometry(0.11, 0.07, 0.09).translate(-0.05, 0.09, 0), '#d6cdbd')]);
  })();
  G.pier = juntar([
    new THREE.BoxGeometry(0.62, 0.03, 0.18).translate(0.31, 0.1, 0),
    ...[[0.08, 0.075], [0.08, -0.075], [0.54, 0.075], [0.54, -0.075]].map(([x, z]) => cil(0.016, 0.016, 0.36, 4).translate(x, -0.06, z)),
  ].map((g) => pintar(g, '#8a6949')));
  G.prancha = new THREE.BoxGeometry(0.46, 0.03, 0.105);
  G.poste = cil(0.026, 0.032, 0.5, 6).translate(0, 0.25, 0);
  G.placaPoste = cil(0.028, 0.034, 1.12, 6).translate(0, 0.56, 0);
  G.placaQuadro = new THREE.BoxGeometry(1.34, 0.54, 0.05);
  G.placaFace = new THREE.PlaneGeometry(1.26, 0.465);

  G.restinga = juntar([
    pintar(ico(0.12).scale(1.45, 0.5, 1.1).translate(0, 0.045, 0), '#8e9a58'),
    pintar(ico(0.085).scale(1.2, 0.6, 1).translate(0.13, 0.04, 0.05), '#a4aa66'),
    pintar(ico(0.07).scale(1, 0.7, 1).translate(-0.11, 0.035, -0.06), '#7c8a4e'),
  ]);
  G.alvoEsfera = new THREE.SphereGeometry(1, 10, 8);
  G.alvoCilindro = new THREE.CylinderGeometry(1, 1, 1, 18);

  // ---------- Marcos: formas simplificadas inspiradas em lugares reais — nunca reproduções ----------
  // Cada uma é modelada com a frente em +z (a ilha gira o marco para a câmera inicial) e a base em y = 0.
  const CONSTRUTORES_MARCO = {
    santuario() {
      // planta central, laterais côncavas que sobem até a torre com a cruz (a prefeitura descreve "duas mãos em oração")
      const H = 0.92, RB = 0.44;
      const curva = (escala, t) => 0.014 + RB * escala * Math.pow(1 - t, 1.85);
      const perfil = [];
      for (let k = 0; k <= 14; k++) { const t = k / 14; perfil.push(new THREE.Vector2(curva(1, t), t * H)); }
      const partes = [pintar(new THREE.LatheGeometry(perfil, 20), '#36587f')]; // vidro
      for (let q = 0; q < 4; q++) {
        const forma = new THREE.Shape();
        forma.moveTo(0.012, H * 0.985);
        for (let k = 1; k <= 14; k++) { const t = 1 - k / 14; forma.lineTo(curva(1.2, t), t * H * 0.985); }
        forma.lineTo(curva(0.84, 0), 0);
        for (let k = 1; k <= 14; k++) { const t = k / 14; forma.lineTo(curva(0.84, t), t * H * 0.97); }
        const nervura = new THREE.ExtrudeGeometry(forma, { depth: 0.042, bevelEnabled: false, curveSegments: 1 });
        partes.push(pintar(nervura.translate(0, 0, -0.021).rotateY(Math.PI / 4 + (q * Math.PI) / 2), '#f4f1ea'));
      }
      partes.push(
        pintar(new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(0, H + 0.06, 0), '#f4f1ea'),
        pintar(new THREE.BoxGeometry(0.022, 0.15, 0.022).translate(0, H + 0.27, 0), '#f4f1ea'),
        pintar(new THREE.BoxGeometry(0.1, 0.022, 0.022).translate(0, H + 0.3, 0), '#f4f1ea'),
        pintar(new THREE.CylinderGeometry(RB * 1.34, RB * 1.4, 0.05, 28).translate(0, 0.025, 0), '#dad4c6'),
        pintar(new THREE.BoxGeometry(0.13, 0.15, 0.03).translate(0, 0.125, 0.345), '#23364d'),
      );
      return juntar(partes);
    },
    casarao() {
      // sobrado eclético de três pavimentos (porão alto), fachada simétrica, platibanda com frontão e escadaria de acessos laterais
      const W = 0.7, D = 0.36, F = D / 2;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W, 0.11, D, 0, 0, 0, '#d9aaa0');
      caixa(W + 0.02, 0.016, D + 0.02, 0, 0.11, 0, '#f7f2ea');
      caixa(W, 0.15, D, 0, 0.126, 0, '#f2e8d8');
      caixa(W + 0.02, 0.016, D + 0.02, 0, 0.276, 0, '#f7f2ea');
      caixa(W, 0.15, D, 0, 0.292, 0, '#f2e8d8');
      caixa(W + 0.04, 0.024, D + 0.04, 0, 0.442, 0, '#f7f2ea');
      caixa(W, 0.055, D, 0, 0.466, 0, '#eadfce');
      const frontao = new THREE.Shape();
      frontao.moveTo(-0.15, 0); frontao.lineTo(0.15, 0); frontao.lineTo(0, 0.09); frontao.closePath();
      partes.push(pintar(new THREE.ExtrudeGeometry(frontao, { depth: 0.035, bevelEnabled: false }).translate(0, 0.521, F - 0.035), '#f7f2ea'));
      for (let k = 0; k < 7; k++) {
        const x = -W / 2 + 0.065 + (k * (W - 0.13)) / 6;
        caixa(0.045, k === 3 ? 0.12 : 0.09, 0.012, x, k === 3 ? 0.126 : 0.155, F + 0.004, k === 3 ? '#5b4636' : '#43474f');
        caixa(0.045, 0.09, 0.012, x, 0.322, F + 0.004, '#43474f');
        if (k !== 3) caixa(0.04, 0.034, 0.012, x, 0.04, F + 0.004, '#8b6a62');
      }
      for (const lado of [-1, 1]) for (const y of [0.155, 0.322]) for (const z of [-0.08, 0.08]) caixa(0.012, 0.09, 0.045, lado * (W / 2 + 0.004), y, z, '#43474f');
      caixa(0.14, 0.016, 0.075, 0, 0.11, F + 0.04, '#e6dccc');
      for (const lado of [-1, 1]) partes.push(pintar(new THREE.BoxGeometry(0.17, 0.02, 0.062).rotateZ(-lado * 0.62).translate(lado * 0.14, 0.062, F + 0.042), '#e6dccc'));
      return juntar(partes);
    },
    cruz() {
      return juntar([
        pintar(new THREE.BoxGeometry(0.03, 0.27, 0.03).translate(0, 0.135, 0), '#f4f1ea'),
        pintar(new THREE.BoxGeometry(0.14, 0.03, 0.03).translate(0, 0.195, 0), '#f4f1ea'),
      ]);
    },
    baleiaCorpo() {
      // dorso da baleia-franca (sem nadadeira dorsal) com as calosidades claras perto da cabeça
      return juntar([
        pintar(new THREE.SphereGeometry(0.2, 12, 8).scale(1.75, 0.48, 0.82), '#45515a'),
        pintar(ico(0.028).translate(0.31, 0.07, 0.035), '#dcd8cf'),
        pintar(ico(0.022).translate(0.27, 0.08, -0.04), '#dcd8cf'),
      ]);
    },
    baleiaCauda() {
      const lobo = (s) => {
        const f = new THREE.Shape();
        f.moveTo(0, 0); f.quadraticCurveTo(s * 0.07, 0.035, s * 0.18, 0.1); f.lineTo(s * 0.1, 0.03); f.lineTo(0, 0.012); f.closePath();
        return pintar(new THREE.ExtrudeGeometry(f, { depth: 0.016, bevelEnabled: false, curveSegments: 3 }).translate(0, 0.2, -0.008), '#3d4850');
      };
      return juntar([pintar(new THREE.CylinderGeometry(0.022, 0.06, 0.22, 7).translate(0, 0.1, 0), '#45515a'), lobo(1), lobo(-1)]);
    },
    estufa() {
      // estufa de ferro e vidro com três abóbadas (a maior no centro) e, à frente, jardins geométricos com um chafariz
      const vidro = '#a9cdcb', ferro = '#f4f1ea';
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      const W = 0.66, D = 0.3;
      caixa(W + 0.1, 0.03, D + 0.1, 0, 0, 0, '#dcd5c7');
      caixa(W, 0.15, D, 0, 0.03, 0, vidro);
      caixa(W + 0.02, 0.016, D + 0.02, 0, 0.18, 0, ferro);
      for (let k = 0; k <= 10; k++) for (const z of [-D / 2 - 0.003, D / 2 + 0.003]) caixa(0.008, 0.15, 0.008, -W / 2 + (k * W) / 10, 0.03, z, ferro);
      for (const x of [-W / 2 - 0.003, W / 2 + 0.003]) for (let k = 0; k <= 4; k++) caixa(0.008, 0.15, 0.008, x, 0.03, -D / 2 + (k * D) / 4, ferro);
      const cupula = (r, x, y0, alto) => {
        partes.push(pintar(new THREE.SphereGeometry(r, 16, 8, 0, TAU, 0, Math.PI / 2).scale(1, alto, 1).translate(x, y0, 0), vidro));
        for (let k = 0; k < 4; k++) partes.push(pintar(new THREE.TorusGeometry(r + 0.002, 0.005, 3, 14, Math.PI).scale(1, alto, 1).rotateY((k * Math.PI) / 4).translate(x, y0, 0), ferro));
      };
      caixa(0.25, 0.05, 0.25, 0, 0.196, 0, vidro);
      caixa(0.27, 0.012, 0.27, 0, 0.246, 0, ferro);
      cupula(0.125, 0, 0.258, 1.3);
      partes.push(pintar(new THREE.CylinderGeometry(0.022, 0.028, 0.05, 8).translate(0, 0.43, 0), ferro), pintar(new THREE.ConeGeometry(0.03, 0.04, 8).translate(0, 0.475, 0), ferro));
      for (const x of [-0.235, 0.235]) cupula(0.085, x, 0.196, 1.15);
      // jardins à francesa diante da estufa
      caixa(0.6, 0.01, 0.36, 0, 0, 0.4, '#e3d6b8');
      for (const x of [-0.15, 0.15]) for (const z of [0.3, 0.5]) caixa(0.23, 0.02, 0.13, x, 0, z, '#7fa35a');
      partes.push(pintar(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 14).translate(0, 0.015, 0.4), '#cfcabd'), pintar(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 14).translate(0, 0.027, 0.4), '#7fb3c0'));
      return juntar(partes);
    },
    torreRelogio() {
      // torre Art Déco: base, corpo e coroamento escalonados, relógio nas quatro faces e frisos geométricos no topo
      const pedra = '#d8cfbd', friso = '#b9ae98';
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      partes.push(pintar(new THREE.CylinderGeometry(0.26, 0.27, 0.015, 24).translate(0, 0.0075, 0), '#ddd6c8'));
      caixa(0.2, 0.09, 0.2, 0, 0.015, 0, pedra);
      caixa(0.17, 0.05, 0.17, 0, 0.105, 0, friso);
      caixa(0.13, 0.5, 0.13, 0, 0.155, 0, pedra);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) caixa(0.022, 0.5, 0.022, sx * 0.066, 0.155, sz * 0.066, friso);
      caixa(0.16, 0.12, 0.16, 0, 0.655, 0, pedra);
      for (let q = 0; q < 4; q++) {
        const face = [
          pintar(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 18).rotateX(Math.PI / 2).translate(0, 0.715, 0.082), '#3c3a35'),
          pintar(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 18).rotateX(Math.PI / 2).translate(0, 0.715, 0.084), '#f4f1ea'),
          pintar(new THREE.BoxGeometry(0.006, 0.034, 0.004).translate(0, 0.73, 0.09), '#3c3a35'),
          pintar(new THREE.BoxGeometry(0.026, 0.006, 0.004).translate(0.011, 0.715, 0.09), '#3c3a35'),
        ];
        for (const g of face) partes.push(g.rotateY((q * Math.PI) / 2));
      }
      caixa(0.12, 0.04, 0.12, 0, 0.775, 0, friso);
      caixa(0.085, 0.045, 0.085, 0, 0.815, 0, pedra);
      caixa(0.045, 0.06, 0.045, 0, 0.86, 0, friso);
      for (let q = 0; q < 4; q++) partes.push(pintar(new THREE.BoxGeometry(0.012, 0.07, 0.03).translate(0, 0.85, 0.05).rotateY((q * Math.PI) / 2), pedra));
      return juntar(partes);
    },
    usina() {
      // usina termelétrica de tijolos com grandes janelas de aço e a chaminé muito mais alta que o prédio, com plataforma no topo
      const tijolo = '#a65a43', concreto = '#dcd2c2', esquadria = '#39414a';
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(0.5, 0.025, 0.3, 0.06, 0, 0, concreto);
      caixa(0.46, 0.26, 0.26, 0.06, 0.025, 0, tijolo);
      caixa(0.48, 0.02, 0.28, 0.06, 0.285, 0, concreto);
      for (let k = 0; k < 5; k++) caixa(0.05, 0.17, 0.01, -0.12 + k * 0.09, 0.07, 0.132, esquadria);
      for (const z of [-0.07, 0.07]) caixa(0.01, 0.17, 0.05, 0.293, 0.07, z, esquadria);
      caixa(0.2, 0.17, 0.2, 0.38, 0.025, -0.02, tijolo);
      caixa(0.21, 0.015, 0.21, 0.38, 0.195, -0.02, concreto);
      for (const x of [0.33, 0.43]) caixa(0.04, 0.1, 0.01, x, 0.06, 0.082, esquadria);
      const cx = -0.27, cz = -0.04;
      caixa(0.13, 0.1, 0.13, cx, 0, cz, concreto);
      partes.push(
        pintar(new THREE.CylinderGeometry(0.04, 0.064, 1.24, 14).translate(cx, 0.72, cz), '#9b5442'),
        pintar(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 14).translate(cx, 1.33, cz), concreto),
        pintar(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 14).translate(cx, 1.23, cz), '#5b6166'),
      );
      return juntar(partes);
    },
    mercado() {
      // mercado neoclássico amarelo de dois pavimentos, em quadra fechada com átrio no meio e portal central mais alto
      const parede = '#e2bd5b', friso = '#f6efe0', janela = '#4a4237';
      const W = 0.74, D = 0.46, A = 0.12, H1 = 0.15, H2 = 0.14;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W - 2 * A, 0.015, D - 2 * A, 0, 0, 0, '#d9cdb3');
      for (const [w, d, x, z] of [[W, A, 0, D / 2 - A / 2], [W, A, 0, -D / 2 + A / 2], [A, D - 2 * A, W / 2 - A / 2, 0], [A, D - 2 * A, -W / 2 + A / 2, 0]]) {
        caixa(w, H1, d, x, 0, z, parede);
        caixa(w + 0.012, 0.014, d + 0.012, x, H1, z, friso);
        caixa(w, H2, d, x, H1 + 0.014, z, parede);
        caixa(w + 0.02, 0.022, d + 0.02, x, H1 + H2 + 0.014, z, friso);
      }
      for (let k = 0; k < 9; k++) {
        const x = -W / 2 + 0.06 + (k * (W - 0.12)) / 8;
        if (k === 4) continue;
        for (const z of [D / 2 + 0.003, -D / 2 - 0.003]) {
          caixa(0.04, 0.08, 0.01, x, 0.035, z, janela);
          caixa(0.04, 0.075, 0.01, x, H1 + 0.04, z, janela);
        }
      }
      for (const x of [W / 2 + 0.003, -W / 2 - 0.003]) for (const z of [-0.12, 0, 0.12]) {
        caixa(0.01, 0.08, 0.04, x, 0.035, z, janela);
        caixa(0.01, 0.075, 0.04, x, H1 + 0.04, z, janela);
      }
      caixa(0.16, H1 + H2 + 0.08, 0.03, 0, 0, D / 2 + 0.01, friso);
      caixa(0.07, 0.12, 0.012, 0, 0, D / 2 + 0.03, janela);
      caixa(0.05, 0.075, 0.012, 0, H1 + 0.04, D / 2 + 0.03, janela);
      const frontao = new THREE.Shape();
      frontao.moveTo(-0.09, 0); frontao.lineTo(0.09, 0); frontao.lineTo(0, 0.06); frontao.closePath();
      partes.push(pintar(new THREE.ExtrudeGeometry(frontao, { depth: 0.03, bevelEnabled: false }).translate(0, H1 + H2 + 0.08, D / 2 - 0.005), friso));
      return juntar(partes);
    },
    sobrado() {
      // sobrado eclético de dois pavimentos em alvenaria, com telhado de quatro águas em telha de barro
      const parede = '#e8dfcd', friso = '#f7f2ea', janela = '#4b4038';
      const W = 0.5, D = 0.32;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W + 0.02, 0.03, D + 0.02, 0, 0, 0, '#cbbfa8');
      caixa(W, 0.15, D, 0, 0.03, 0, parede);
      caixa(W + 0.016, 0.014, D + 0.016, 0, 0.18, 0, friso);
      caixa(W, 0.14, D, 0, 0.194, 0, parede);
      caixa(W + 0.03, 0.02, D + 0.03, 0, 0.334, 0, friso);
      partes.push(pintar(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(W + 0.05, 0.15, D + 0.05).translate(0, 0.354 + 0.075, 0), '#b5653f'));
      for (let k = 0; k < 5; k++) {
        const x = -W / 2 + 0.06 + (k * (W - 0.12)) / 4;
        caixa(0.045, k === 2 ? 0.12 : 0.09, 0.01, x, k === 2 ? 0.03 : 0.065, D / 2 + 0.003, janela);
        caixa(0.045, 0.09, 0.01, x, 0.215, D / 2 + 0.003, janela);
        caixa(0.06, 0.012, 0.016, x, 0.305, D / 2 + 0.006, friso);
      }
      for (const x of [W / 2 + 0.003, -W / 2 - 0.003]) for (const z of [-0.08, 0.08]) for (const y of [0.065, 0.215]) caixa(0.01, 0.09, 0.045, x, y, z, janela);
      return juntar(partes);
    },
    lagoMureta() {
      // lago redondo com mureta baixa, o trampolim de uma antiga represa e roseiras no contorno (a água é outra malha: lagoMuretaAgua)
      const r = 0.42;
      const partes = [pintar(new THREE.CylinderGeometry(r, r, 0.012, 36).translate(0, 0.006, 0), '#4f7d84')];
      const perfil = [new THREE.Vector2(r, 0), new THREE.Vector2(r + 0.035, 0), new THREE.Vector2(r + 0.035, 0.065), new THREE.Vector2(r, 0.065), new THREE.Vector2(r, 0)];
      partes.push(pintar(new THREE.LatheGeometry(perfil, 40), '#ddd5c4'));
      partes.push(
        pintar(new THREE.BoxGeometry(0.07, 0.17, 0.07).translate(r * 0.62, 0.085, -r * 0.62), '#ece6da'),
        pintar(new THREE.BoxGeometry(0.17, 0.014, 0.045).translate(r * 0.62 - 0.1, 0.17, -r * 0.62 + 0.04).rotateY(0), '#f4f1ea'),
      );
      const rosas = ['#c84a5c', '#e58aa0', '#f2ece4', '#d9647a'];
      for (let k = 0; k < 34; k++) {
        const a = (k / 34) * TAU, d = r + 0.075;
        if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 4), Math.cos(a + Math.PI / 4))) < 0.25) continue;
        partes.push(pintar(ico(0.03).scale(1, 0.8, 1).translate(Math.cos(a) * d, 0.03, Math.sin(a) * d), k % 2 ? '#5f8547' : rosas[(k >> 1) % rosas.length]));
      }
      return juntar(partes);
    },
    lagoMuretaAgua() {
      return new THREE.CylinderGeometry(0.425, 0.425, 0.01, 36).translate(0, 0.045, 0);
    },
    lagoIlha() {
      // lago de parque com margens de grama, uma ilha com uma figura abstrata (nunca uma obra reproduzida) e um deck que se abre em "Y"
      const partes = [pintar(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 36).scale(1.15, 1, 0.85).translate(0, 0.006, 0), '#4c7a82')];
      const perfil = [new THREE.Vector2(0.5, 0), new THREE.Vector2(0.56, 0), new THREE.Vector2(0.53, 0.03), new THREE.Vector2(0.5, 0.03), new THREE.Vector2(0.5, 0)];
      partes.push(pintar(new THREE.LatheGeometry(perfil, 40).scale(1.15, 1, 0.85), '#b8b585'));
      partes.push(
        pintar(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 14).translate(0.1, 0.025, -0.06), '#7a9b55'),
        pintar(new THREE.BoxGeometry(0.03, 0.18, 0.03).rotateZ(0.12).translate(0.1, 0.14, -0.06), '#8b8478'),
        pintar(new THREE.BoxGeometry(0.05, 0.012, 0.28).translate(0.1, 0.05, 0.3), '#9c7b5a'),
      );
      for (const lado of [-1, 1]) partes.push(pintar(new THREE.BoxGeometry(0.045, 0.012, 0.12).rotateY(lado * 0.6).translate(0.1 + lado * 0.034, 0.05, 0.12), '#9c7b5a'));
      for (const x of [0.06, 0.14]) for (const z of [0.2, 0.3, 0.4]) partes.push(pintar(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5).translate(x, 0.025, z), '#7d6047'));
      return juntar(partes);
    },
    lagoIlhaAgua() {
      return new THREE.CylinderGeometry(0.5, 0.5, 0.01, 36).scale(1.15, 1, 0.85).translate(0, 0.035, 0);
    },
    mercadoFerro() {
      // galpão de estrutura de ferro com telhado de telha cerâmica e torres de cobertura metálica nos cantos (número e cores ilustrativos)
      const ferro = '#5f686e', painel = '#e3ddd0', telha = '#b4623f', zinco = '#9aa1a3';
      const W = 0.62, D = 0.34;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W + 0.06, 0.025, D + 0.06, 0, 0, 0, '#d4cdbf');
      caixa(W, 0.2, D, 0, 0.025, 0, painel);
      for (let k = 0; k <= 8; k++) for (const z of [-D / 2 - 0.004, D / 2 + 0.004]) caixa(0.014, 0.2, 0.01, -W / 2 + (k * W) / 8, 0.025, z, ferro);
      for (const x of [-W / 2 - 0.004, W / 2 + 0.004]) for (let k = 0; k <= 4; k++) caixa(0.01, 0.2, 0.014, x, 0.025, -D / 2 + (k * D) / 4, ferro);
      for (const z of [-D / 2 - 0.004, D / 2 + 0.004]) caixa(W + 0.01, 0.016, 0.012, 0, 0.13, z, ferro);
      caixa(W + 0.03, 0.018, D + 0.03, 0, 0.225, 0, ferro);
      const forma = new THREE.Shape();
      forma.moveTo(-D / 2 - 0.02, 0); forma.lineTo(D / 2 + 0.02, 0); forma.lineTo(0, 0.13); forma.closePath();
      partes.push(pintar(new THREE.ExtrudeGeometry(forma, { depth: W - 0.06, bevelEnabled: false }).translate(0, 0, -(W - 0.06) / 2).rotateY(Math.PI / 2).translate(0, 0.243, 0), telha));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (W / 2 - 0.01), z = sz * (D / 2 - 0.01);
        caixa(0.08, 0.36, 0.08, x, 0.025, z, painel);
        for (const dx of [-0.04, 0.04]) for (const dz of [-0.04, 0.04]) caixa(0.01, 0.36, 0.01, x + dx, 0.025, z + dz, ferro);
        partes.push(pintar(new THREE.ConeGeometry(0.075, 0.16, 4).rotateY(Math.PI / 4).translate(x, 0.465, z), zinco));
        partes.push(pintar(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4).translate(x, 0.575, z), ferro));
      }
      return juntar(partes);
    },
    teatroFrontao() {
      // teatro eclético com pórtico de seis colunas sob um frontão reto e a caixa do palco mais alta atrás (cores ilustrativas)
      const parede = '#efe5d3', claro = '#faf6ee', janela = '#4a4540';
      const W = 0.58, D = 0.42;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W + 0.08, 0.03, D + 0.12, 0, 0, 0.02, '#d9d1c1');
      caixa(W, 0.26, D, 0, 0.03, -0.02, parede);
      caixa(W + 0.02, 0.02, D + 0.02, 0, 0.29, -0.02, claro);
      caixa(W * 0.7, 0.14, D * 0.5, 0, 0.31, -0.08, parede);
      caixa(W * 0.7 + 0.016, 0.016, D * 0.5 + 0.016, 0, 0.45, -0.08, claro);
      for (const lado of [-1, 1]) for (const z of [-0.14, -0.02, 0.1]) for (const y of [0.07, 0.17]) caixa(0.01, 0.07, 0.035, lado * (W / 2 + 0.003), y, z, janela);
      caixa(0.36, 0.02, 0.1, 0, 0.03, D / 2 + 0.03, claro);
      for (let k = 0; k < 6; k++) partes.push(pintar(new THREE.CylinderGeometry(0.014, 0.017, 0.2, 8).translate(-0.15 + k * 0.06, 0.15, D / 2 + 0.05), claro));
      caixa(0.37, 0.03, 0.08, 0, 0.25, D / 2 + 0.04, claro);
      caixa(0.37, 0.05, 0.05, 0, 0.28, D / 2 + 0.025, parede);
      caixa(0.39, 0.012, 0.06, 0, 0.33, D / 2 + 0.025, claro);
      caixa(0.07, 0.11, 0.01, 0, 0.03, D / 2 - 0.015, janela);
      for (const x of [-0.12, 0.12]) caixa(0.04, 0.09, 0.01, x, 0.05, D / 2 - 0.015, janela);
      return juntar(partes);
    },
    teatroCupula() {
      // teatro neoclássico rosa com detalhes brancos e cúpula de escamas nas cores da bandeira (desenho das escamas ilustrativo)
      const parede = '#e4a7a3', claro = '#f8f3ea', janela = '#4d4240';
      const W = 0.62, D = 0.42;
      const partes = [];
      const caixa = (w, h, d, x, y, z, cor) => partes.push(pintar(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cor));
      caixa(W + 0.1, 0.03, D + 0.14, 0, 0, 0.02, '#e2ddd3');
      caixa(W, 0.24, D, 0, 0.03, -0.02, parede);
      caixa(W + 0.02, 0.018, D + 0.02, 0, 0.12, -0.02, claro);
      caixa(W + 0.03, 0.022, D + 0.03, 0, 0.27, -0.02, claro);
      for (let k = 0; k < 7; k++) {
        const x = -W / 2 + 0.06 + (k * (W - 0.12)) / 6;
        if (k >= 2 && k <= 4) continue;
        for (const y of [0.05, 0.155]) caixa(0.04, 0.06, 0.01, x, y, D / 2 - 0.015, janela);
      }
      for (const lado of [-1, 1]) for (const z of [-0.16, -0.05, 0.06]) for (const y of [0.05, 0.155]) caixa(0.01, 0.06, 0.035, lado * (W / 2 + 0.003), y, z, janela);
      caixa(0.24, 0.02, 0.08, 0, 0.03, D / 2 + 0.02, claro);
      for (let k = 0; k < 4; k++) partes.push(pintar(new THREE.CylinderGeometry(0.014, 0.016, 0.2, 8).translate(-0.09 + k * 0.06, 0.15, D / 2 + 0.04), claro));
      caixa(0.25, 0.03, 0.07, 0, 0.25, D / 2 + 0.03, claro);
      const frontao = new THREE.Shape();
      frontao.moveTo(-0.13, 0); frontao.lineTo(0.13, 0); frontao.lineTo(0, 0.07); frontao.closePath();
      partes.push(pintar(new THREE.ExtrudeGeometry(frontao, { depth: 0.04, bevelEnabled: false }).translate(0, 0.28, D / 2 + 0.005), claro));
      // tambor e cúpula atrás do pórtico
      const cz = -0.06;
      partes.push(pintar(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 20).translate(0, 0.325, cz), claro));
      const cupula = new THREE.SphereGeometry(0.14, 18, 6, 0, TAU, 0, Math.PI / 2).scale(1, 1.12, 1).translate(0, 0.36, cz).toNonIndexed();
      const paleta = ['#e2b93b', '#3f8a4f', '#2f5f9e'].map(corDe);
      const pos = cupula.attributes.position, cores = new Float32Array(pos.count * 3);
      for (let t = 0; t < pos.count; t += 3) {
        let mx = 0, my = 0, mz = 0;
        for (let v = 0; v < 3; v++) { mx += pos.getX(t + v); my += pos.getY(t + v); mz += pos.getZ(t + v); }
        const anel = Math.min(4, Math.floor(((my / 3 - 0.36) / (0.14 * 1.12)) * 5));
        const setor = Math.floor(((Math.atan2(mz / 3 - cz, mx / 3) + Math.PI) / TAU) * 18);
        const cor = anel >= 4 ? paleta[2] : paleta[(setor + anel) % 2];
        for (let v = 0; v < 3; v++) cores.set([cor.r, cor.g, cor.b], (t + v) * 3);
      }
      cupula.setAttribute('color', new THREE.BufferAttribute(cores, 3));
      partes.push(cupula);
      partes.push(pintar(new THREE.CylinderGeometry(0.022, 0.03, 0.06, 8).translate(0, 0.53, cz), claro), pintar(new THREE.ConeGeometry(0.026, 0.05, 8).translate(0, 0.585, cz), claro));
      return juntar(partes);
    },
  };
  const geoMarco = (nome) => (G[`marco:${nome}`] ??= CONSTRUTORES_MARCO[nome]());

  const TIPOS = {
    restinga: { malhas: [['restinga', 'veg']], raio: 0.16 },
    redonda: { malhas: [['redonda', 'veg']], raio: 0.24 },
    araucaria: { malhas: [['araucaria', 'veg']], raio: 0.27 },
    ipe: { malhas: [['ipe', 'veg']], raio: 0.22 },
    palmeira: { malhas: [['palmeira', 'veg']], raio: 0.2 },
    buriti: { malhas: [['buriti', 'veg']], raio: 0.2 },
    mata: { malhas: [['mata', 'veg']], raio: 0.27 },
    cerrado: { malhas: [['cerrado', 'veg']], raio: 0.25 },
    arbusto: { malhas: [['arbusto', 'veg']], raio: 0.13 },
    capim: { malhas: [['capim', 'veg']], raio: 0.07 },
    junco: { malhas: [['junco', 'veg']], raio: 0.06 },
    casa: { malhas: [['casaParede', 'casa'], ['casaTelhado', 'telhado']], raio: 0.27 },
    palafita: { malhas: [['palafitaParede', 'casa'], ['palafitaTelhado', 'telhado'], ['pilotis', 'casa']], raio: 0.27 },
    predio: { malhas: [['predio', 'casa']], raio: 0.27 },
    silo: { malhas: [['silo', 'casa']], raio: 0.14 },
  };
  const PAREDES = ['#f6f1e7', '#efe2c4', '#e9d3b0', '#f3ece3', '#dfe4e2', '#ead7c9', '#f0e4d0'];
  const TELHAS = ['#b4623f', '#a5553a', '#94503a', '#7d6f66', '#b9714a'];
  const MADEIRAS = ['#b8946a', '#a98660', '#c9a67a', '#9f7d58'];

  // ---------- Placas: o nome do lugar desenhado com as fontes da loja ----------
  const anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function desenharPlaca(ctx, w, h, nome, sub) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a1712';
    ctx.lineWidth = 7;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const texto = nome.toUpperCase();
    const largura = w - 120;
    const fonte = (px) => `800 ${px}px ${FONTES.display}`;
    let px = 210;
    ctx.font = fonte(px);
    while (ctx.measureText(texto).width > largura && px > 120) { px -= 4; ctx.font = fonte(px); }
    let linhas = [texto];
    if (ctx.measureText(texto).width > largura) {
      // Nome longo: quebra na palavra mais próxima do meio e ajusta para caber em duas linhas.
      const palavras = texto.split(' ');
      let melhor = 1, dif = Infinity;
      for (let k = 1; k < palavras.length; k++) {
        const d = Math.abs(palavras.slice(0, k).join(' ').length - palavras.slice(k).join(' ').length);
        if (d < dif) { dif = d; melhor = k; }
      }
      linhas = palavras.length > 1 ? [palavras.slice(0, melhor).join(' '), palavras.slice(melhor).join(' ')] : [texto];
      px = 150;
      ctx.font = fonte(px);
      while (linhas.some((l) => ctx.measureText(l).width > largura) && px > 60) { px -= 4; ctx.font = fonte(px); }
    }
    const subAltura = sub ? 70 : 0;
    const total = linhas.length * px * 0.92 + subAltura;
    let y = (h - total) / 2 + px * 0.8;
    for (const l of linhas) { ctx.fillText(l, w / 2, y); y += px * 0.92; }
    if (sub) {
      ctx.font = `700 46px ${FONTES.body}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
      ctx.fillStyle = '#56564f';
      ctx.fillText(sub.toUpperCase(), w / 2, y + 26);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
  }

  // ---------- Ilha ----------
  const NIVEL = 0; // nível da água
  const FUNDO = -0.3;
  const RAIO_BASE = 2.25;
  const NR = 26;
  const NS = 112;
  const sombraSuja = () => { renderer.shadowMap.needsUpdate = true; sujo = true; };
  const ilhas = new Map();
  let ordem = [];
  const alvosToque = [];

  // Ângulo (como Math.atan2(z, x)) da direção da câmera inicial: a "frente" de toda ilha, para onde os marcos se voltam.
  const ANG_CAMERA = Math.atan2(Math.cos(AZIMUTE), Math.sin(AZIMUTE));
  const difAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  // Relevo base de cada módulo de perfil (o resto do relevo vem dos picos, dunas e plataformas montados em criarIlha).
  const AJUSTE_RELEVO = {
    'vale-montes': { base: 0.13, amp: 0.1, freq: 1.0, colina: 0 },
    planicie: { base: 0.11, amp: 0.05, freq: 0.8, colina: 0.04, chapada: 0 },
    'costa-dunas': { base: 0.12, amp: 0.08, freq: 0.9, colina: 0 },
  };

  // Marcos que são uma construção sobre chão aplainado (o santuário e o casarão têm regra própria, mais antiga). `ang` e `d` dizem onde
  // o marco prefere ficar (ângulo a partir da câmera inicial e fração do raio); `beiraAgua`, perto do mar ou do rio. `ancora` é o ponto de
  // descoberta e `centro`, onde um toque certamente acerta (no espaço do marco, frente em +z). `agua`: espelho d'água próprio (os lagos).
  const EDIFICIOS = {
    estufa: { geo: 'estufa', raio: 0.56, livre: 0.42, ang: -0.25, d: 0.36, ancora: [0, 0.7, 0], centro: [0, 0.2, 0.05] },
    'torre-relogio': { geo: 'torreRelogio', raio: 0.3, livre: 0.24, ang: 1.0, d: 0.28, ancora: [0, 1.16, 0], centro: [0, 0.45, 0] },
    usina: { geo: 'usina', raio: 0.52, livre: 0.36, ang: -0.4, d: 0.4, beiraAgua: true, ancora: [-0.27, 1.62, -0.04], centro: [0.05, 0.15, 0.05] },
    mercado: { geo: 'mercado', raio: 0.5, livre: 0.4, ang: 1.3, d: 0.32, ancora: [0, 0.72, 0], centro: [0, 0.18, 0.1] },
    sobrado: { geo: 'sobrado', raio: 0.38, livre: 0.3, ang: 1.1, d: 0.35, ancora: [0, 0.8, 0], centro: [0, 0.2, 0.05] },
    'lago-mureta': { geo: 'lagoMureta', agua: 'lagoMuretaAgua', raio: 0.58, livre: 0.5, ang: -0.75, d: 0.42, ancora: [0, 0.5, 0], centro: [0, 0.05, 0] },
    'lago-ilha': { geo: 'lagoIlha', agua: 'lagoIlhaAgua', raio: 0.68, livre: 0.6, ang: -0.75, d: 0.42, ancora: [0.1, 0.56, -0.06], centro: [0.1, 0.06, -0.06] },
    'mercado-ferro': { geo: 'mercadoFerro', raio: 0.48, livre: 0.36, ang: -0.4, d: 0.4, beiraAgua: true, ancora: [0, 0.82, 0], centro: [0, 0.18, 0.05] },
    'teatro-frontao': { geo: 'teatroFrontao', raio: 0.48, livre: 0.38, ang: 1.2, d: 0.3, ancora: [0, 0.8, 0], centro: [0, 0.2, 0.1] },
    'teatro-cupula': { geo: 'teatroCupula', raio: 0.5, livre: 0.38, ang: 2.6, d: 0.4, ancora: [0, 0.96, 0], centro: [0, 0.22, 0.1] },
  };

  /** Monta um marco na ilha. Devolve o objeto, o que responde ao toque, a âncora do ponto de descoberta e, se houver, animação e descarte. */
  function construirMarco(m, ctx) {
    const { amostra, rio, dirCam, rnd, contorno } = ctx;
    const voltado = Math.atan2(dirCam.x, dirCam.z); // gira o +z local do marco para a câmera inicial
    const grupoM = new THREE.Group();
    const ancora = new THREE.Object3D();
    const centro = new THREE.Object3D(); // o meio do desenho do marco (onde um toque com certeza acerta)
    grupoM.add(ancora, centro);
    const malha = (geo) => { const x = new THREE.Mesh(geo, M.marco); x.castShadow = true; x.receiveShadow = true; return x; };
    const alvoInvisivel = (geo, escala, x, y, z) => { const a = new THREE.Mesh(geo, M.oculto); a.scale.set(...escala); a.position.set(x, y, z); return a; };
    if (m.modulo === 'santuario' || m.modulo === 'casarao') {
      grupoM.position.set(m.x, amostra(m.x, m.z).h - 0.006, m.z);
      grupoM.rotation.y = voltado;
      const corpo = malha(geoMarco(m.modulo));
      grupoM.add(corpo);
      ancora.position.set(0, m.modulo === 'santuario' ? 1.48 : 0.88, 0);
      centro.position.set(0, m.modulo === 'santuario' ? 0.4 : 0.24, 0.05);
      return { objeto: grupoM, alvos: [corpo], ancora, centro };
    }
    const ed = EDIFICIOS[m.modulo];
    if (ed) {
      grupoM.position.set(m.x, amostra(m.x, m.z).h - 0.006, m.z);
      grupoM.rotation.y = voltado;
      const corpo = malha(geoMarco(ed.geo));
      grupoM.add(corpo);
      const alvos = [corpo];
      if (ed.agua) {
        const espelhoLago = new THREE.Mesh(geoMarco(ed.agua), M.agua);
        espelhoLago.receiveShadow = true;
        espelhoLago.renderOrder = 1;
        grupoM.add(espelhoLago);
        alvos.push(espelhoLago);
      }
      ancora.position.set(...ed.ancora);
      centro.position.set(...ed.centro);
      return { objeto: grupoM, alvos, ancora, centro };
    }
    if (m.modulo === 'encontro-aguas' && rio) {
      // duas águas lado a lado ao longo de todo o rio: a escura de um lado, a barrenta do outro, com uma faixa estreita de mistura
      // acima da ondulação do espelho d'água (senão as ondas escondem a faixa), abaixo das margens
      const larg = rio.larg * 1.15, y = NIVEL + 0.018;
      const faixas = [[-larg, -larg * 0.12, '#1d2226'], [-larg * 0.12, -larg * 0.03, '#3a3530'], [-larg * 0.03, larg * 0.12, '#7a5d3d'], [larg * 0.12, larg, '#a9814f']].map(([a, b, cor]) => [a, b, corDe(cor)]);
      const pos = [], cor = [];
      const ponto = (sP, lat) => {
        const l = rio.off + rio.amp * Math.sin(sP * rio.freq + rio.fase) + lat;
        return { x: rio.u.x * sP + rio.v.x * l, z: rio.u.z * sP + rio.v.z * l };
      };
      const dentro = (q) => Math.hypot(q.x, q.z) < contorno(Math.atan2(q.z, q.x)) * 0.97;
      const passo = 0.06, lim = RAIO_BASE * 1.2;
      for (let sP = -lim; sP < lim; sP += passo) for (const [a, b, c] of faixas) {
        const q = [ponto(sP, a), ponto(sP, b), ponto(sP + passo, b), ponto(sP + passo, a)];
        if (!q.every(dentro)) continue;
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(q[k].x, y, q[k].z); cor.push(c.r, c.g, c.b); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
      geo.computeVertexNormals();
      const faixa = new THREE.Mesh(geo, M.aguaDuas);
      faixa.receiveShadow = true;
      faixa.renderOrder = 2;
      grupoM.add(faixa);
      ancora.position.set(m.x, 0.5, m.z);
      centro.position.set(m.x, NIVEL, m.z);
      return { objeto: grupoM, alvos: [faixa], ancora, centro, descartar: () => geo.dispose() };
    }
    if (m.modulo === 'pico-cruz') {
      grupoM.position.set(m.x, amostra(m.x, m.z).h - 0.03, m.z);
      grupoM.rotation.y = voltado;
      const cruz = malha(geoMarco('cruz'));
      cruz.scale.setScalar(1.4);
      const alvo = alvoInvisivel(G.alvoEsfera, [0.46, 0.46, 0.46], 0, 0.12, 0);
      grupoM.add(cruz, alvo);
      ancora.position.set(0, 0.66, 0);
      centro.position.set(0, 0.14, 0);
      return { objeto: grupoM, alvos: [cruz, alvo], ancora, centro };
    }
    if (m.modulo === 'ponte-urbana' && rio) {
      const comp = rio.larg * 2.7 + 0.34;
      const partes = [pintar(new THREE.BoxGeometry(comp, 0.04, 0.27), '#cbc5b8')];
      for (const lado of [-1, 1]) {
        partes.push(pintar(new THREE.BoxGeometry(comp, 0.014, 0.014).translate(0, 0.075, lado * 0.125), '#8d8f8c'));
        for (let k = 0; k <= 8; k++) partes.push(pintar(new THREE.BoxGeometry(0.012, 0.06, 0.012).translate(-comp / 2 + (k * comp) / 8, 0.045, lado * 0.125), '#8d8f8c'));
      }
      for (const px of [-comp * 0.22, comp * 0.22]) partes.push(pintar(new THREE.BoxGeometry(0.06, 0.3, 0.2).translate(px, -0.15, 0), '#b9b3a6'));
      const geo = juntar(partes);
      const ponte = malha(geo);
      const pontas = [-1, 1].map((k) => amostra(m.x + rio.v.x * k * comp * 0.5, m.z + rio.v.z * k * comp * 0.5).h);
      grupoM.position.set(m.x, Math.max(0.1, ...pontas) + 0.004, m.z);
      grupoM.rotation.y = -Math.atan2(rio.v.z, rio.v.x); // o comprimento (x local) atravessa o rio
      grupoM.add(ponte);
      ancora.position.set(0, 0.44, 0);
      centro.position.set(0, 0.02, 0);
      return { objeto: grupoM, alvos: [ponte], ancora, centro, descartar: () => geo.dispose() };
    }
    if (m.modulo === 'dunas') {
      const alvo = alvoInvisivel(G.alvoCilindro, [m.raioCampo, 0.6, m.raioCampo], m.x, 0.15, m.z);
      grupoM.add(alvo);
      ancora.position.set(m.topo.x, amostra(m.topo.x, m.topo.z).h + 0.46, m.topo.z);
      centro.position.set(m.topo.x, amostra(m.topo.x, m.topo.z).h - 0.02, m.topo.z);
      return { objeto: grupoM, alvos: [alvo], ancora, centro };
    }
    if (m.modulo === 'baleia') {
      grupoM.position.set(m.x, NIVEL, m.z);
      grupoM.rotation.y = voltado + 1.35;
      const corpo = malha(geoMarco('baleiaCorpo'));
      corpo.position.y = -0.05;
      const cauda = new THREE.Group();
      cauda.position.set(-0.5, -0.03, 0);
      const caudaM = malha(geoMarco('baleiaCauda'));
      cauda.add(caudaM);
      const alvo = alvoInvisivel(G.alvoEsfera, [0.48, 0.36, 0.48], -0.22, 0.05, 0);
      grupoM.add(corpo, cauda, alvo);
      ancora.position.set(-0.22, 0.64, 0);
      centro.position.set(0, 0.0, 0);
      const fase = rnd() * TAU;
      const animar = (t) => {
        grupoM.position.y = NIVEL + Math.sin(t * 0.8 + fase) * 0.018;
        cauda.rotation.z = 0.1 + Math.sin(t * 1.05 + fase) * 0.16;
      };
      animar(0);
      return { objeto: grupoM, alvos: [corpo, caudaM, alvo], ancora, centro, animar };
    }
    return null;
  }

  function criarIlha(info) {
    const rnd = semente(hash32(info.id));
    const rec = info.receita;
    const paisagemBase = PAISAGENS[rec.base] ?? PAISAGENS.interior;
    // Com perfil, a receita sobrepõe à paisagem base cores, relevo, água, vegetação, construções e marcos.
    // Sem perfil, é a paisagem da curadoria e o gerador segue exatamente o caminho anterior (o mesmo mundo para os mesmos IDs).
    const tpl = rec.perfil
      ? {
          ...paisagemBase, cores: { ...paisagemBase.cores, ...rec.cores }, relevo: { ...paisagemBase.relevo, ...(AJUSTE_RELEVO[rec.relevo?.modulo] ?? {}) },
          vegetacao: rec.vegetacao ?? paisagemBase.vegetacao, casas: rec.construcoes?.casas ?? paisagemBase.casas, palafitas: 0, extras: rec.extras ?? [],
        }
      : paisagemBase;
    const modAgua = rec.agua?.modulo ?? null;
    const tipoAgua = modAgua === 'mar' ? 'costa' : modAgua;
    const marAberto = modAgua === 'mar';
    const angCam = ANG_CAMERA;
    const dirCam = { x: Math.cos(angCam), z: Math.sin(angCam) };
    const R = RAIO_BASE * (info.capital ? 1.08 : 1) * (0.95 + rnd() * 0.08);
    const harm = [[2, 0.03 + rnd() * 0.05, rnd() * TAU], [3, 0.02 + rnd() * 0.04, rnd() * TAU], [5, 0.01 + rnd() * 0.018, rnd() * TAU]];
    const contorno = (th) => R * (1 + harm.reduce((s, [k, a, f]) => s + a * Math.sin(k * th + f), 0));
    const ondas = Array.from({ length: 4 }, (_, i) => {
      const ang = rnd() * TAU;
      return { dx: Math.cos(ang), dz: Math.sin(ang), k: tpl.relevo.freq * (0.8 + i * 0.6) * (0.85 + rnd() * 0.3), f: rnd() * TAU, a: 1 / (1 + i * 0.9) };
    });
    const somaA = ondas.reduce((s, o) => s + o.a, 0);
    const ruido = (x, z) => ondas.reduce((s, o) => s + o.a * Math.sin((x * o.dx + z * o.dz) * o.k + o.f), 0) / somaA;
    const ruidoCor = (x, z) => Math.sin(x * 3.1 + z * 1.7 + ondas[0].f) * 0.5 + Math.sin(x * -1.9 + z * 4.3 + ondas[1].f) * 0.5;
    const colAng = rnd() * TAU, colDist = R * (0.15 + rnd() * 0.3), colS = R * (0.32 + rnd() * 0.15);
    const colX = Math.cos(colAng) * colDist, colZ = Math.sin(colAng) * colDist;
    const chapAng = rnd() * TAU, chapOff = 0.05 + rnd() * 0.2;
    let aguaAng = rnd() * TAU;
    if (tipoAgua === 'costa' && rec.agua?.direcao != null) aguaAng = angCam + rec.agua.direcao; // o perfil escolhe de que lado fica o mar
    const aguaDir = { x: Math.cos(aguaAng), z: Math.sin(aguaAng) };
    const rio = tipoAgua === 'rio' || tipoAgua === 'rio-largo' || tipoAgua === 'vereda'
      ? { ang: rnd() * Math.PI, off: (rnd() - 0.5) * R * 0.5, amp: R * (0.08 + rnd() * 0.1), freq: 1.2 + rnd() * 0.8, fase: rnd() * TAU, larg: tipoAgua === 'rio-largo' ? 0.5 : tipoAgua === 'vereda' ? 0.17 : 0.3 }
      : null;
    if (rio && rec.agua?.direcao != null) Object.assign(rio, { ang: angCam + Math.PI / 2 + rec.agua.direcao, off: 0, amp: R * 0.06, freq: 1.1 }); // atravessa a ilha diante da câmera
    if (rio && rec.agua?.largura) rio.larg = rec.agua.largura;
    if (rio) { rio.u = { x: Math.cos(rio.ang), z: Math.sin(rio.ang) }; rio.v = { x: -rio.u.z, z: rio.u.x }; }
    const lagoas = [];
    if (tipoAgua === 'lagoas' || tipoAgua === 'lagoas-muitas' || tipoAgua === 'lago') {
      const n = tipoAgua === 'lago' ? 1 : tipoAgua === 'lagoas' ? 1 + Math.floor(rnd() * 2) : 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const a = rnd() * TAU, d = tipoAgua === 'lago' ? R * 0.42 : R * (0.15 + rnd() * 0.55);
        lagoas.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: tipoAgua === 'lago' ? R * 0.52 : 0.32 + rnd() * 0.3 });
      }
    }
    const temAgua = !!tipoAgua;

    // --- módulos de relevo do perfil (semente própria: não muda a sequência das cidades sem perfil) ---
    const rm = semente(hash32(`${info.id}:modulos`));
    const modRelevo = rec.perfil ? rec.relevo?.modulo ?? null : null;
    const picos = [];
    let dunas = null;
    if (modRelevo === 'vale-montes') {
      // montes no fundo (do outro lado da câmera) e o vale aberto na frente
      const alt = rec.relevo.altura ?? 1;
      for (const [da, d, k] of [[-0.8, 0.62, 0.68], [0.06, 0.6, 1], [0.84, 0.64, 0.74]]) {
        const a = angCam + Math.PI + da + (rm() - 0.5) * 0.1;
        picos.push({ x: Math.cos(a) * d * R, z: Math.sin(a) * d * R, h: alt * k, s: R * (0.25 + rm() * 0.05) });
      }
    }
    if (modRelevo === 'costa-dunas') {
      // campo de dunas junto à praia, do lado que a câmera vê, com uma lagoa entre elas; um morro verde ao fundo
      const lat = { x: -aguaDir.z, z: aguaDir.x };
      const lado = Math.sign(lat.x * dirCam.x + lat.z * dirCam.z) || 1;
      const centro = { x: lat.x * lado * R * 0.24 - aguaDir.x * R * 0.1, z: lat.z * lado * R * 0.24 - aguaDir.z * R * 0.1 };
      const montes = [];
      // duas fileiras de cristas paralelas à costa, a de trás mais alta
      for (const [fileira, recuo, alto] of [[0, -0.02, 0.3], [1, -0.2, 0.42]]) {
        for (let k = 0; k < 5; k++) {
          const t = ((k + fileira * 0.5) / 4 - 0.55) * 0.9 * R, v = (recuo + (rm() - 0.5) * 0.05) * R;
          const x = centro.x + lat.x * t + aguaDir.x * v, z = centro.z + lat.z * t + aguaDir.z * v;
          if (Math.hypot(x, z) > R * 0.78) continue;
          montes.push({ x, z, h: alto + rm() * 0.14, su: R * (0.085 + rm() * 0.035), sv: R * (0.05 + rm() * 0.02) });
        }
      }
      dunas = { cx: centro.x, cz: centro.z, raioCampo: R * 0.42, montes, lat, lagoa: { x: centro.x - aguaDir.x * R * 0.1, z: centro.z - aguaDir.z * R * 0.1, r: R * 0.075 } };
      const a = angCam + Math.PI - 0.35;
      picos.push({ x: Math.cos(a) * R * 0.52, z: Math.sin(a) * R * 0.52, h: 0.6, s: R * 0.3 });
    }
    function alturaDuna(x, z) {
      let h = 0;
      for (const m of dunas.montes) {
        const dx = x - m.x, dz = z - m.z;
        const u = dx * dunas.lat.x + dz * dunas.lat.z, v = dx * aguaDir.x + dz * aguaDir.z;
        h = Math.max(h, m.h * Math.exp(-((u * u) / (2 * m.su * m.su) + (v * v) / (2 * m.sv * m.sv))));
      }
      const l = dunas.lagoa;
      return h - 0.38 * Math.exp(-((x - l.x) ** 2 + (z - l.z) ** 2) / (2 * l.r * l.r));
    }
    /** Altura do chão antes da água e das plataformas. */
    function seco(x, z) {
      let h = tpl.relevo.base + ruido(x, z) * tpl.relevo.amp * 0.5 + tpl.relevo.amp * 0.15;
      h += tpl.relevo.colina * Math.exp(-((x - colX) ** 2 + (z - colZ) ** 2) / (2 * colS * colS));
      if (tpl.relevo.chapada) h += tpl.relevo.chapada * suave(-0.03, 0.05, (x * Math.cos(chapAng) + z * Math.sin(chapAng)) / R - chapOff);
      let montanha = 0;
      for (const p of picos) montanha += p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (2 * p.s * p.s));
      if (modRelevo === 'vale-montes') montanha += (rec.relevo.altura ?? 1) * 0.2 * suave(0.1, 0.85, -(x * dirCam.x + z * dirCam.z) / R);
      const duna = dunas ? alturaDuna(x, z) : 0;
      return { h: h + montanha + duna, montanha, duna: Math.max(0, duna) };
    }
    const plataformas = []; // chão aplainado sob o santuário e o casarão
    function amostra(x, z) {
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      const rho = r / contorno(th);
      const sc = seco(x, z);
      let h = sc.h, plano = 0;
      for (const p of plataformas) {
        const t = 1 - suave(p.r * 0.7, p.r * 1.35, Math.hypot(x - p.x, z - p.z));
        if (t > 0) { h = misturar(h, p.h, t); plano = Math.max(plano, t); }
      }
      let molhado = 0;
      if (tipoAgua === 'costa') molhado = Math.max(molhado, suave(0.1, 0.4, (x * aguaDir.x + z * aguaDir.z) / R));
      if (rio) {
        const s = x * rio.u.x + z * rio.u.z;
        const lat = x * rio.v.x + z * rio.v.z - (rio.off + rio.amp * Math.sin(s * rio.freq + rio.fase));
        molhado = Math.max(molhado, (1 - suave(rio.larg * 0.55, rio.larg * 1.25, Math.abs(lat))) * (1 - suave(0.18, 0.5, sc.montanha)));
      }
      for (const l of lagoas) molhado = Math.max(molhado, 1 - suave(l.r * 0.5, l.r * 1.1, Math.hypot(x - l.x, z - l.z)));
      molhado *= 1 - plano;
      h = misturar(h, FUNDO, molhado);
      if (h > 0) h -= suave(0.86, 1.0, rho) * Math.min(0.06, h * 0.3);
      return { h, molhado, rho, duna: sc.duna, montanha: sc.montanha };
    }

    // --- marcos do perfil: onde fica cada um (antes do terreno, porque o santuário e o casarão aplainam o chão) ---
    const marcos = [];
    const caminhosFixos = []; // escadaria do santuário, ruas da cidade
    const secoEm = (x, z, raio) => [[0, 0], [raio, 0], [-raio, 0], [0, raio], [0, -raio]].every(([dx, dz]) => {
      const a = amostra(x + dx, z + dz);
      return a.h > 0.06 && a.molhado < 0.05 && a.rho < 0.82;
    });
    /** O lugar seco e livre mais perto de onde o marco prefere ficar, fora da faixa que a placa esconde e longe dos outros marcos. */
    function lugarParaMarco(cfg) {
      const aPlaca = angCam + 0.5, placa = { x: Math.cos(aPlaca) * contorno(aPlaca) * 0.62, z: Math.sin(aPlaca) * contorno(aPlaca) * 0.62 };
      // a placa encara a câmera: nada logo atrás dela (some atrás do quadro) nem logo à frente (tapa o nome)
      const atrasDaPlaca = (x, z, k) => {
        const dx = x - placa.x, dz = z - placa.z;
        const prof = dx * dirCam.x + dz * dirCam.z, lado = Math.abs(dx * -dirCam.z + dz * dirCam.x);
        return lado < (0.66 + cfg.raio * 0.9) * k && prof > -(1.15 + cfg.raio) * k && prof < (0.35 + cfg.raio) * k;
      };
      let alvo = { x: Math.cos(angCam + cfg.ang) * R * cfg.d, z: Math.sin(angCam + cfg.ang) * R * cfg.d };
      if (cfg.beiraAgua && tipoAgua === 'costa') alvo = { x: aguaDir.x * R * 0.05 + dirCam.x * R * 0.3, z: aguaDir.z * R * 0.05 + dirCam.z * R * 0.3 };
      else if (cfg.beiraAgua && rio) {
        let perto = null;
        for (let sP = -R * 0.6; sP <= R * 0.6; sP += R * 0.05) {
          const lat = rio.off + rio.amp * Math.sin(sP * rio.freq + rio.fase);
          const x = rio.u.x * sP + rio.v.x * lat, z = rio.u.z * sP + rio.v.z * lat;
          const d = Math.hypot(x - dirCam.x * R * 0.3, z - dirCam.z * R * 0.3);
          if (!perto || d < perto.d) perto = { x, z, d };
        }
        alvo = perto;
      }
      // ilha apertada (morros, mar, outro marco): cada passada aceita um pouco mais de encosta e chega mais perto da placa
      for (const [kLivre, maxMonte, kPlaca] of [[1, 0.25, 1], [0.8, 0.45, 0.7], [0.65, 0.7, 0.45]]) {
        let melhor = null;
        for (let rr = 0.08; rr <= 0.72; rr += 0.04) for (let k = 0; k < 48; k++) {
          const a = (k / 48) * TAU, x = Math.cos(a) * R * rr, z = Math.sin(a) * R * rr;
          const d = Math.hypot(x - alvo.x, z - alvo.z);
          if (melhor && d >= melhor.d) continue;
          if (atrasDaPlaca(x, z, kPlaca)) continue;
          if (marcos.some((o) => !o.terreno && !o.naAgua && Math.hypot(x - o.x, z - o.z) < o.raio + cfg.raio + 0.1)) continue;
          if (seco(x, z).montanha > maxMonte || !secoEm(x, z, cfg.livre * kLivre)) continue;
          melhor = { x, z, d };
        }
        if (melhor) return { x: melhor.x, z: melhor.z };
      }
      return null;
    }
    for (const m of rec.perfil ? rec.marcos ?? [] : []) {
      if (m.modulo === 'santuario') {
        const a = angCam - 0.62, d = R * 0.24;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        plataformas.push({ x, z, r: 0.58, h: Math.max(seco(x, z).h, 0.16) });
        marcos.push({ ...m, x, z, raio: 0.62 });
        caminhosFixos.push([{ x: x + dirCam.x * 0.5, z: z + dirCam.z * 0.5 }, { x: x + dirCam.x * 1.55, z: z + dirCam.z * 1.55 }]);
      } else if (m.modulo === 'casarao') {
        // perto do centro e à direita da placa na visão inicial; se o rio estiver lá, procura em volta, na outra margem ou mais longe
        let lugar = null;
        for (const raio of [0.48, 0.58, 0.36, 0.66]) {
          for (let k = 0; k < 23 && !lugar; k++) {
            const a = angCam - 0.3 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.27, d = R * raio;
            if (secoEm(Math.cos(a) * d, Math.sin(a) * d, 0.36)) lugar = { x: Math.cos(a) * d, z: Math.sin(a) * d };
          }
          if (lugar) break;
        }
        if (!lugar) continue;
        plataformas.push({ ...lugar, r: 0.5, h: Math.max(seco(lugar.x, lugar.z).h, 0.1) });
        marcos.push({ ...m, ...lugar, raio: 0.5 });
      } else if (EDIFICIOS[m.modulo]) {
        const cfg = EDIFICIOS[m.modulo];
        const lugar = lugarParaMarco(cfg);
        if (!lugar) continue;
        plataformas.push({ ...lugar, r: cfg.raio, h: Math.max(seco(lugar.x, lugar.z).h, 0.1) });
        marcos.push({ ...m, ...lugar, raio: cfg.raio });
      } else if (m.modulo === 'encontro-aguas' && rio) {
        // o ponto de descoberta fica no trecho do rio mais perto de um ponto à frente e à direita (a placa fica à esquerda)
        const alvo = { x: Math.cos(angCam - 0.75) * R * 0.3, z: Math.sin(angCam - 0.75) * R * 0.3 };
        let melhor = null;
        for (let sP = -R * 0.6; sP <= R * 0.6; sP += R * 0.04) {
          const lat = rio.off + rio.amp * Math.sin(sP * rio.freq + rio.fase);
          const x = rio.u.x * sP + rio.v.x * lat, z = rio.u.z * sP + rio.v.z * lat;
          if (Math.hypot(x, z) > R * 0.62) continue;
          const nota = -Math.hypot(x - alvo.x, z - alvo.z);
          if (!melhor || nota > melhor.nota) melhor = { x, z, nota };
        }
        if (melhor) marcos.push({ ...m, x: melhor.x, z: melhor.z, raio: 0, naAgua: true });
      } else if (m.modulo === 'pico-cruz' && picos.length) {
        const p = picos.reduce((a, b) => (b.h > a.h ? b : a));
        marcos.push({ ...m, x: p.x, z: p.z, raio: 0.25, noPico: true });
      } else if (m.modulo === 'ponte-urbana' && rio) {
        // o trecho do rio mais perto de um ponto à frente e à direita (a placa fica à esquerda: não tapa a ponte)
        const alvo = { x: Math.cos(angCam - 0.75) * R * 0.32, z: Math.sin(angCam - 0.75) * R * 0.32 };
        let melhor = null;
        for (let sP = -R * 0.6; sP <= R * 0.6; sP += R * 0.04) {
          const lat = rio.off + rio.amp * Math.sin(sP * rio.freq + rio.fase);
          const x = rio.u.x * sP + rio.v.x * lat, z = rio.u.z * sP + rio.v.z * lat;
          if (Math.hypot(x, z) > R * 0.62) continue;
          const nota = -Math.hypot(x - alvo.x, z - alvo.z);
          if (!melhor || nota > melhor.nota) melhor = { x, z, nota };
        }
        marcos.push({ ...m, x: melhor.x, z: melhor.z, raio: 0.32, naAgua: true });
      } else if (m.modulo === 'dunas' && dunas?.montes.length) {
        // o ponto de descoberta fica na duna mais voltada para a câmera (a mais alta pode estar escondida atrás das outras)
        const topo = dunas.montes.reduce((a, b) => (b.x * dirCam.x + b.z * dirCam.z > a.x * dirCam.x + a.z * dirCam.z ? b : a));
        marcos.push({ ...m, x: dunas.cx, z: dunas.cz, raio: 0, terreno: true, topo, raioCampo: dunas.raioCampo });
      } else if (m.modulo === 'baleia' && marAberto) {
        const a0 = aguaAng + difAng(angCam, aguaAng) * 0.45;
        let lugar = null;
        for (let k = 0; k < 24 && !lugar; k++) {
          const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1, d = R * (0.72 - (k % 3) * 0.05);
          const x = Math.cos(a) * d, z = Math.sin(a) * d, sa = amostra(x, z);
          if (sa.h < -0.2 && sa.rho < 0.84) lugar = { x, z };
        }
        if (lugar) marcos.push({ ...m, ...lugar, raio: 0.32, naAgua: true });
      }
    }

    // --- topo (grade polar) ---
    const nVert = 1 + NR * NS;
    const pos = new Float32Array(nVert * 3);
    const alturas = new Float32Array(nVert);
    const coresBase = new Float32Array(nVert * 3);
    const c = new THREE.Color(), c2 = new THREE.Color();
    const cores = {
      grama0: corDe(tpl.cores.grama[0]), grama1: corDe(tpl.cores.grama[1]), areia: corDe(tpl.cores.areia), fundo: corDe(tpl.cores.fundo),
      caminho: corDe(tpl.cores.caminho), terra: corDe(tpl.cores.terra ?? tpl.cores.estratos[1]), rocha: corDe('#8d877a'),
      areiaSombra: corDe('#c7ad7c'),
    };
    const lavouras = [];
    if (tpl.extras.includes('lavoura')) {
      const paleta = (tpl.cores.lavoura ?? ['#c3b25f', '#8c9b4c', '#7e5a3e']).map(corDe);
      for (let k = 0, tent = 0; k < 4 && tent < 40; tent++) {
        const a = rnd() * TAU, d = R * (0.35 + rnd() * 0.4);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (amostra(x, z).h < 0.08) continue;
        lavouras.push({ x, z, w: 0.55 + rnd() * 0.45, d: 0.4 + rnd() * 0.35, ang: rnd() * Math.PI, cor: paleta[k % paleta.length] });
        k++;
      }
    }
    function corTopo(x, z, a, saida) {
      const h = a.h;
      if (h < NIVEL - 0.012) {
        saida.copy(cores.areia).lerp(cores.fundo, suave(-0.02, -0.24, h));
        return;
      }
      const praia = tipoAgua === 'costa' ? 0.13 : 0.06;
      saida.copy(cores.grama0).lerp(cores.grama1, 0.5 + 0.5 * ruidoCor(x, z));
      if (tpl.cores.terra) saida.lerp(cores.terra, suave(0.35, 0.8, ruidoCor(z * 1.3, x * 0.7)) * 0.55);
      for (const l of lavouras) {
        const dx = x - l.x, dz = z - l.z, ca = Math.cos(l.ang), sa = Math.sin(l.ang);
        const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
        if (Math.abs(u) < l.w / 2 && Math.abs(v) < l.d / 2) {
          saida.copy(l.cor);
          if (Math.floor((v + 5) / 0.09) % 2 === 0) saida.multiplyScalar(0.9);
        }
      }
      if (h > 0.62) saida.lerp(cores.rocha, suave(0.62, 0.95, h) * 0.6 * (picos.length ? 0.45 : 1)); // montes de perfil: mata até o alto
      if (temAgua && h < NIVEL + praia) saida.lerp(cores.areia, 1 - suave(NIVEL + praia * 0.55, NIVEL + praia, h));
      if (a.duna > 0) {
        saida.lerp(cores.areia, suave(0.01, 0.05, a.duna));
        // face de sotavento (de costas para o mar) um pouco mais escura: desenha as cristas
        const declive = alturaDuna(x - aguaDir.x * 0.05, z - aguaDir.z * 0.05) - alturaDuna(x, z);
        saida.lerp(cores.areiaSombra, suave(0.0, 0.035, -declive) * 0.55 * suave(0.03, 0.1, a.duna));
      }
    }
    pos[0] = 0; pos[2] = 0;
    for (let i = 1; i <= NR; i++) {
      const rho = i / NR;
      for (let j = 0; j < NS; j++) {
        const th = (j / NS) * TAU;
        const r = rho * contorno(th);
        const idx = 1 + (i - 1) * NS + j;
        pos[idx * 3] = Math.cos(th) * r;
        pos[idx * 3 + 2] = Math.sin(th) * r;
      }
    }
    for (let v = 0; v < nVert; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2];
      const a = amostra(x, z);
      pos[v * 3 + 1] = a.h;
      alturas[v] = a.h;
      corTopo(x, z, a, c);
      coresBase[v * 3] = c.r; coresBase[v * 3 + 1] = c.g; coresBase[v * 3 + 2] = c.b;
    }
    const indices = [];
    for (let j = 0; j < NS; j++) indices.push(0, 1 + ((j + 1) % NS), 1 + j);
    for (let i = 1; i < NR; i++) {
      for (let j = 0; j < NS; j++) {
        const a = 1 + (i - 1) * NS + j, b = 1 + (i - 1) * NS + ((j + 1) % NS);
        const d = 1 + i * NS + j, e = 1 + i * NS + ((j + 1) % NS);
        indices.push(a, b, d, b, e, d);
      }
    }
    const geoTopo = new THREE.BufferGeometry();
    geoTopo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geoTopo.setAttribute('color', new THREE.BufferAttribute(coresBase.slice(), 3));
    geoTopo.setIndex(indices);
    geoTopo.computeVertexNormals();
    const topo = new THREE.Mesh(geoTopo, M.terreno);
    topo.receiveShadow = true;
    topo.castShadow = true;

    // --- laterais em estratos e a base de pedra (bandas com cor própria, sem degradê) ---
    const borda = [];
    for (let j = 0; j < NS; j++) {
      const th = (j / NS) * TAU, idx = 1 + (NR - 1) * NS + j;
      borda.push({ th, r: contorno(th), h: alturas[idx], cor: new THREE.Color(coresBase[idx * 3], coresBase[idx * 3 + 1], coresBase[idx * 3 + 2]) });
    }
    const f1 = rnd() * TAU, f2 = rnd() * TAU, f3 = rnd() * TAU;
    const est = tpl.cores.estratos.map(corDe);
    const aneis = [
      (b) => ({ y: temAgua ? Math.max(b.h, NIVEL) : b.h, k: 1 }),
      (b) => ({ y: b.h, k: 1 }),
      (b) => ({ y: Math.min(b.h, temAgua ? Math.max(b.h, NIVEL) : b.h) - 0.07, k: 1 }),
      (b) => ({ y: -0.42 + 0.04 * Math.sin(3 * b.th + f1), k: 0.995 }),
      (b) => ({ y: -0.86 + 0.05 * Math.sin(2 * b.th + f2), k: 0.985 }),
      (b) => ({ y: -1.25 + 0.05 * Math.sin(4 * b.th + f3), k: 0.962 }),
    ];
    const agua1 = corDe('#6ea4b1'), agua2 = corDe('#4d8593');
    const coresBanda = [
      (b, t) => c2.copy(agua1).lerp(agua2, t),
      (b) => c2.copy(b.cor).multiplyScalar(0.86),
      () => c2.copy(est[0]),
      () => c2.copy(est[1]),
      () => c2.copy(est[2]),
    ];
    const ladoPos = [], ladoCor = [];
    const vrt = (x, y, z, col, mul = 1) => { ladoPos.push(x, y, z); ladoCor.push(col.r * mul, col.g * mul, col.b * mul); };
    for (let bnd = 0; bnd < aneis.length - 1; bnd++) {
      for (let j = 0; j < NS; j++) {
        const b0 = borda[j], b1 = borda[(j + 1) % NS];
        const a0 = aneis[bnd](b0), a1 = aneis[bnd](b1), d0 = aneis[bnd + 1](b0), d1 = aneis[bnd + 1](b1);
        if (Math.abs(a0.y - d0.y) < 1e-4 && Math.abs(a1.y - d1.y) < 1e-4) continue;
        const p = (b, a) => [Math.cos(b.th) * b.r * a.k, a.y, Math.sin(b.th) * b.r * a.k];
        const A = p(b0, a0), B = p(b1, a1), Cc = p(b1, d1), D = p(b0, d0);
        const mul = 0.95 + rnd() * 0.08;
        const ct = (t) => coresBanda[bnd](b0, t).clone();
        const cTop = ct(0), cBot = bnd === 0 ? ct(1) : cTop;
        vrt(...A, cTop, mul); vrt(...B, cTop, mul); vrt(...D, cBot, mul);
        vrt(...B, cTop, mul); vrt(...Cc, cBot, mul); vrt(...D, cBot, mul);
      }
    }
    // base de pedra afunilada
    const base = [
      { y: -1.7, k: 0.8 }, { y: -2.15, k: 0.57 }, { y: -2.55, k: 0.32 },
    ];
    const rocha = corDe(tpl.cores.estratos[3]);
    const anelBase = [borda.map((b) => ({ x: Math.cos(b.th) * b.r * 0.962, y: -1.25 + 0.05 * Math.sin(4 * b.th + f3), z: Math.sin(b.th) * b.r * 0.962 }))];
    const passoBase = 2; // menos lados embaixo: facetas de pedra
    for (const nivel of base) {
      const anel = [];
      for (let j = 0; j < NS; j += passoBase) {
        const b = borda[j];
        const k = nivel.k * (0.9 + rnd() * 0.18);
        anel.push({ x: Math.cos(b.th) * b.r * k, y: nivel.y + (rnd() - 0.5) * 0.16, z: Math.sin(b.th) * b.r * k });
      }
      anelBase.push(anel);
    }
    const ponta = { x: (rnd() - 0.5) * 0.3, y: -2.95, z: (rnd() - 0.5) * 0.3 };
    for (let n = 0; n < anelBase.length; n++) {
      const sup = anelBase[n];
      const inf = anelBase[n + 1];
      const escuro = 1 - n * 0.09;
      if (!inf) {
        for (let j = 0; j < sup.length; j++) {
          const a = sup[j], b = sup[(j + 1) % sup.length], mul = (0.9 + rnd() * 0.12) * escuro;
          vrt(a.x, a.y, a.z, rocha, mul); vrt(b.x, b.y, b.z, rocha, mul); vrt(ponta.x, ponta.y, ponta.z, rocha, mul);
        }
        continue;
      }
      const passo = sup.length / inf.length;
      for (let j = 0; j < inf.length; j++) {
        const i0 = inf[j], i1 = inf[(j + 1) % inf.length];
        const s0 = sup[Math.round(j * passo) % sup.length], s1 = sup[Math.round((j + 1) * passo) % sup.length];
        const mul = (0.9 + rnd() * 0.12) * escuro;
        if (passo > 1) {
          // o anel de cima tem o dobro de pontos: um leque liga os do meio
          const sm = sup[(Math.round(j * passo) + 1) % sup.length];
          vrt(s0.x, s0.y, s0.z, rocha, mul); vrt(sm.x, sm.y, sm.z, rocha, mul); vrt(i0.x, i0.y, i0.z, rocha, mul);
          vrt(sm.x, sm.y, sm.z, rocha, mul); vrt(i1.x, i1.y, i1.z, rocha, mul); vrt(i0.x, i0.y, i0.z, rocha, mul);
          vrt(sm.x, sm.y, sm.z, rocha, mul); vrt(s1.x, s1.y, s1.z, rocha, mul); vrt(i1.x, i1.y, i1.z, rocha, mul);
        } else {
          vrt(s0.x, s0.y, s0.z, rocha, mul); vrt(s1.x, s1.y, s1.z, rocha, mul); vrt(i0.x, i0.y, i0.z, rocha, mul);
          vrt(s1.x, s1.y, s1.z, rocha, mul); vrt(i1.x, i1.y, i1.z, rocha, mul); vrt(i0.x, i0.y, i0.z, rocha, mul);
        }
      }
    }
    const geoLado = new THREE.BufferGeometry();
    geoLado.setAttribute('position', new THREE.Float32BufferAttribute(ladoPos, 3));
    geoLado.setAttribute('color', new THREE.Float32BufferAttribute(ladoCor, 3));
    geoLado.computeVertexNormals();
    const lado = new THREE.Mesh(geoLado, M.lateral);
    lado.castShadow = true;
    lado.receiveShadow = true;

    // --- água ---
    let espelho = null;
    if (temAgua) {
      const NRA = 10;
      const pa = new Float32Array((1 + NRA * NS) * 3);
      for (let i = 1; i <= NRA; i++) {
        for (let j = 0; j < NS; j++) {
          const th = (j / NS) * TAU, r = (i / NRA) * contorno(th) * 0.999, idx = 1 + (i - 1) * NS + j;
          pa[idx * 3] = Math.cos(th) * r; pa[idx * 3 + 1] = NIVEL; pa[idx * 3 + 2] = Math.sin(th) * r;
        }
      }
      const ia = [];
      for (let j = 0; j < NS; j++) ia.push(0, 1 + ((j + 1) % NS), 1 + j);
      for (let i = 1; i < NRA; i++) for (let j = 0; j < NS; j++) {
        const a = 1 + (i - 1) * NS + j, b = 1 + (i - 1) * NS + ((j + 1) % NS), d = 1 + i * NS + j, e = 1 + i * NS + ((j + 1) % NS);
        ia.push(a, b, d, b, e, d);
      }
      const ga = new THREE.BufferGeometry();
      ga.setAttribute('position', new THREE.BufferAttribute(pa, 3));
      ga.setIndex(ia);
      ga.computeVertexNormals();
      espelho = new THREE.Mesh(ga, marAberto ? M.aguaMar : M.agua);
      espelho.receiveShadow = true;
      espelho.renderOrder = 1;
    }

    // --- objetos: casas, árvores, extras ---
    const ocupado = [];
    const livre = (x, z, r) => ocupado.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 >= (o.r + r) ** 2);
    const itens = [];
    const ponto = (raioMax = 0.88) => { const r = Math.sqrt(rnd()) * R * raioMax, a = rnd() * TAU; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; };
    for (const m of marcos) if (!m.naAgua && !m.terreno && !m.noPico) ocupado.push({ x: m.x, z: m.z, r: m.raio });
    const naDuna = (s, limite = 0.03) => dunas && s.duna > limite;

    // a frente da ilha (voltada para a câmera inicial) guarda o lugar da placa
    const angFrente = Math.atan2(Math.cos(AZIMUTE), Math.sin(AZIMUTE)) + 0.5;
    let placaPos = null;
    for (let k = 0; k < 24 && !placaPos; k++) {
      const a = angFrente + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.22;
      const d = contorno(a) * 0.62, x = Math.cos(a) * d, z = Math.sin(a) * d, s = amostra(x, z);
      if (s.h > 0.05 && livre(x, z, 0.5) && !naDuna(s)) placaPos = { x, z, y: s.h };
    }
    if (!placaPos) placaPos = { x: 0, z: 0, y: Math.max(amostra(0, 0).h, NIVEL) };
    ocupado.push({ x: placaPos.x, z: placaPos.z, r: 0.75 });

    // centro do povoado (a "praça", de onde saem os caminhos)
    let praca = null;
    for (let k = 0; k < 60 && !praca; k++) {
      const p = ponto(0.42), s = amostra(p.x, p.z);
      if (s.h > 0.08 && livre(p.x, p.z, 0.3) && !naDuna(s)) praca = { x: p.x, z: p.z };
    }
    if (!praca) praca = { x: 0, z: 0 };
    ocupado.push({ x: praca.x, z: praca.z, r: 0.22 });

    const novoItem = (tipo, x, z, y, extra = {}) => itens.push({ tipo, x, z, y, rot: extra.rot ?? rnd() * TAU, s: extra.s ?? 1, sy: extra.sy ?? 1, cores: extra.cores ?? [], oculto: false });
    const estilo = rec.perfil ? rec.construcoes?.estilo : null;
    const paredes = estilo === 'acoriano' ? ['#f8f5ef', '#f4efe6', '#f6f1e7', '#eef1ee'] : estilo === 'colonial' ? ['#f6f1e7', '#f3ece3', '#efe2c4', '#f0e4d0'] : PAREDES;
    const telhas = estilo === 'acoriano' || estilo === 'colonial' ? ['#b4623f', '#a5553a', '#b9714a'] : TELHAS;
    const nCasas = (tpl.casas ?? 0) + (info.capital ? 2 : 0);
    if (estilo === 'urbano') {
      // cidade em quadras: ruas paralelas e transversais ao rio (uma passa pela ponte), casas voltadas para a rua
      const ponteM = marcos.find((m) => m.modulo === 'ponte-urbana');
      const centro = ponteM ?? praca;
      const eA = rio ? rio.u : { x: -dirCam.z, z: dirCam.x }, eB = rio ? rio.v : dirCam;
      const reta = (o, e) => [{ x: o.x - e.x * R * 1.2, z: o.z - e.z * R * 1.2 }, { x: o.x + e.x * R * 1.2, z: o.z + e.z * R * 1.2 }];
      for (const k of [-1, 0, 1]) caminhosFixos.push(reta({ x: centro.x + eA.x * k * 0.78, z: centro.z + eA.z * k * 0.78 }, eB));
      for (const k of [-1, 1]) caminhosFixos.push(reta({ x: centro.x + eB.x * k * 0.98, z: centro.z + eB.z * k * 0.98 }, eA));
      const distRua = (x, z) => Math.min(...caminhosFixos.map(([A, B]) => {
        const vx = B.x - A.x, vz = B.z - A.z, t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / (vx * vx + vz * vz)));
        return Math.hypot(x - A.x - vx * t, z - A.z - vz * t);
      }));
      const lotes = [];
      for (const [A, B] of caminhosFixos) {
        const len = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
        for (let t = 0.17; t < len; t += 0.33) for (const lado of [-1, 1]) {
          lotes.push({ x: A.x + dx * t - dz * lado * 0.2, z: A.z + dz * t + dx * lado * 0.2, rot: Math.atan2(dz * lado, -dx * lado) });
        }
      }
      lotes.sort((a, b) => Math.hypot(a.x - centro.x, a.z - centro.z) - Math.hypot(b.x - centro.x, b.z - centro.z));
      let feitas = 0, predios = 0;
      const nPredios = rec.construcoes?.predios ?? 0;
      for (const l of lotes) {
        if (feitas >= nCasas + nPredios) break;
        const s = amostra(l.x, l.z);
        if (s.h < 0.07 || s.rho > 0.84 || s.molhado > 0.02 || !livre(l.x, l.z, 0.16) || distRua(l.x, l.z) < 0.12) continue;
        ocupado.push({ x: l.x, z: l.z, r: 0.17 });
        if (predios < nPredios && feitas % 3 === 1) {
          novoItem('predio', l.x, l.z, s.h - 0.01, { rot: l.rot, s: 0.62, sy: 0.3 + rm() * 0.22, cores: [['#efeae1', '#e4ddcf', '#e9dfcc'][predios % 3]] });
          predios++;
        } else {
          novoItem('casa', l.x, l.z, s.h - 0.01, { rot: l.rot, s: 0.78, cores: [paredes[Math.floor(rm() * paredes.length)], telhas[Math.floor(rm() * telhas.length)]] });
        }
        feitas++;
      }
    } else {
      for (let k = 0, tent = 0; k < nCasas && tent < 200; tent++) {
        const a = rnd() * TAU, d = 0.32 + rnd() * 0.75;
        const x = praca.x + Math.cos(a) * d, z = praca.z + Math.sin(a) * d, s = amostra(x, z);
        if (s.h < 0.07 || s.rho > 0.86 || !livre(x, z, 0.24) || naDuna(s)) continue;
        ocupado.push({ x, z, r: 0.24 });
        const rot = Math.round((Math.atan2(x - praca.x, z - praca.z)) / (Math.PI / 2)) * (Math.PI / 2) + (rnd() - 0.5) * 0.3;
        novoItem('casa', x, z, s.h - 0.01, { rot, s: 0.9 + rnd() * 0.25, cores: [paredes[Math.floor(rnd() * paredes.length)], telhas[Math.floor(rnd() * telhas.length)]] });
        k++;
      }
    }
    // jardim do casarão: palmeiras e uma figueira em volta (a ficha da UDESC descreve área arborizada com palmeiras e figueiras)
    for (const m of marcos.filter((x) => x.modulo === 'casarao')) {
      const rot = Math.atan2(dirCam.x, dirCam.z), ca = Math.cos(rot), sa = Math.sin(rot);
      for (const [lx, lz, tipo, esc] of [[-0.5, 0.12, 'palmeira', 1.15], [0.5, 0.1, 'palmeira', 1.05], [0.34, -0.42, 'redonda', 1.5]]) {
        const x = m.x + lx * ca + lz * sa, z = m.z - lx * sa + lz * ca, s = amostra(x, z);
        if (s.h < 0.06 || !livre(x, z, 0.1)) continue;
        ocupado.push({ x, z, r: 0.14 });
        novoItem(tipo, x, z, s.h - 0.02, { s: esc, cores: ['rgb(245,240,232)'] });
      }
    }
    if (info.capital) {
      for (let k = 0, tent = 0; k < 5 && tent < 160; tent++) {
        const a = rnd() * TAU, d = 0.25 + rnd() * 0.55;
        const x = praca.x + Math.cos(a) * d, z = praca.z + Math.sin(a) * d, s = amostra(x, z);
        if (s.h < 0.08 || s.rho > 0.8 || !livre(x, z, 0.23)) continue;
        ocupado.push({ x, z, r: 0.23 });
        novoItem('predio', x, z, s.h - 0.01, { rot: Math.round(rnd() * 4) * (Math.PI / 2), s: 0.85 + rnd() * 0.2, sy: 0.55 + rnd() * 0.75, cores: [['#efeae1', '#e4ddcf', '#dcd8cf', '#e9dfcc'][k % 4]] });
        k++;
      }
    }
    for (let k = 0, tent = 0; k < (tpl.palafitas ?? 0) && tent < 300; tent++) {
      const p = ponto(0.86), s = amostra(p.x, p.z);
      if (s.h > -0.04 || s.h < -0.26 || !livre(p.x, p.z, 0.26)) continue;
      ocupado.push({ x: p.x, z: p.z, r: 0.26 });
      novoItem('palafita', p.x, p.z, NIVEL, { cores: [MADEIRAS[Math.floor(rnd() * MADEIRAS.length)], ['#7a6a55', '#8a7558', '#6f6a64'][k % 3], '#ffffff'] });
      k++;
    }
    if (tpl.extras.includes('silo')) {
      for (let k = 0, tent = 0; k < 2 && tent < 80; tent++) {
        const a = rnd() * TAU, d = 0.5 + rnd() * 0.5, x = praca.x + Math.cos(a) * d, z = praca.z + Math.sin(a) * d, s = amostra(x, z);
        if (s.h < 0.08 || s.rho > 0.85 || !livre(x, z, 0.14)) continue;
        ocupado.push({ x, z, r: 0.14 });
        novoItem('silo', x, z, s.h - 0.01, { rot: 0, s: 0.9 + rnd() * 0.25, cores: ['#ffffff'] });
        k++;
      }
    }
    // extras únicos (malhas próprias): píer e barcos
    const avulsos = [];
    if (tpl.extras.includes('pier') && temAgua) {
      const dirs = tipoAgua === 'costa' ? [aguaAng] : lagoas.map((l) => Math.atan2(l.z, l.x));
      for (const a of dirs) {
        let antes = null;
        for (let t = 0.1; t < 0.95; t += 0.03) {
          const x = Math.cos(a) * R * t, z = Math.sin(a) * R * t, s = amostra(x, z);
          if (s.h < NIVEL + 0.02 && antes) {
            const m = new THREE.Mesh(G.pier, M.madeira);
            m.position.set(antes.x, NIVEL - 0.02, antes.z);
            m.rotation.y = -a;
            m.castShadow = true;
            avulsos.push(m);
            ocupado.push({ x: antes.x + Math.cos(a) * 0.3, z: antes.z + Math.sin(a) * 0.3, r: 0.35 });
            break;
          }
          antes = { x, z };
        }
        if (avulsos.length) break;
      }
    }
    const barcos = [];
    if (tpl.extras.includes('barco') && temAgua) {
      for (let k = 0, tent = 0; k < 2 && tent < 200; tent++) {
        const p = ponto(0.82), s = amostra(p.x, p.z);
        if (s.h > -0.2 || !livre(p.x, p.z, 0.25)) continue;
        ocupado.push({ x: p.x, z: p.z, r: 0.25 });
        const m = new THREE.Mesh(G.barco, M.barco);
        m.position.set(p.x, NIVEL - 0.015, p.z);
        m.rotation.y = rnd() * TAU;
        m.userData.fase = rnd() * TAU;
        barcos.push(m);
        avulsos.push(m);
        k++;
      }
    }
    // cercas de pasto
    let cerca = null;
    const nCercas = tpl.extras.filter((e) => e === 'cerca').length;
    if (nCercas) {
      const partes = [];
      for (let k = 0, tent = 0; k < nCercas && tent < 60; tent++) {
        const p = ponto(0.62), s = amostra(p.x, p.z);
        if (s.h < 0.08 || !livre(p.x, p.z, 0.5)) continue;
        const w = 0.8 + rnd() * 0.5, d = 0.55 + rnd() * 0.4, ang = rnd() * Math.PI;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const cantos = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => ({ x: p.x + u * ca - v * sa, z: p.z + u * sa + v * ca }));
        for (let e = 0; e < 4; e++) {
          if (e === 3) continue; // um lado aberto: a porteira
          const A = cantos[e], B = cantos[(e + 1) % 4];
          const comp = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(2, Math.round(comp / 0.2));
          const rotY = -Math.atan2(B.z - A.z, B.x - A.x);
          for (let q = 0; q <= n; q++) {
            const x = misturar(A.x, B.x, q / n), z = misturar(A.z, B.z, q / n), sh = amostra(x, z).h;
            if (sh < 0.04) continue;
            partes.push(pintar(new THREE.BoxGeometry(0.028, 0.17, 0.028).translate(x, sh + 0.075, z), '#7b5f44'));
          }
          const meio = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, hm = amostra(meio.x, meio.z).h;
          if (hm < 0.04) continue;
          for (const yy of [0.07, 0.13]) {
            partes.push(pintar(new THREE.BoxGeometry(comp, 0.016, 0.016).rotateY(rotY).translate(meio.x, hm + yy, meio.z), '#8a6c4e'));
          }
        }
        ocupado.push({ x: p.x, z: p.z, r: Math.max(w, d) * 0.45 });
        k++;
      }
      if (partes.length) {
        cerca = new THREE.Mesh(juntar(partes), M.casa);
        cerca.castShadow = true;
      }
    }
    // vegetação
    for (const [tipo, qtd] of tpl.vegetacao) {
      const alvo = Math.round(qtd * (0.8 + rnd() * 0.4));
      const raio = TIPOS[tipo].raio;
      for (let k = 0, tent = 0; k < alvo && tent < alvo * 40; tent++) {
        const p = ponto(tipo === 'junco' ? 0.95 : 0.9), s = amostra(p.x, p.z);
        let ok;
        if (tipo === 'restinga') ok = s.h > 0.03 && s.rho < 0.94 && (!dunas || s.duna < 0.13);
        else if (dunas && tipo === 'capim') ok = s.h > 0.04 && s.rho < 0.93 && s.duna < 0.09;
        else if (naDuna(s, 0.04)) ok = false;
        else if (tipo === 'junco') ok = s.h > -0.07 && s.h < 0.07 && s.rho < 0.97;
        else if (tipo === 'buriti') ok = s.h > 0.03 && (temAgua ? s.h < 0.2 : true);
        else if (tipo === 'palmeira' && tipoAgua === 'costa') ok = s.h > 0.04 && s.h < 0.24;
        else ok = s.h > 0.07 && s.rho < 0.92;
        if (!ok || !livre(p.x, p.z, raio)) continue;
        ocupado.push({ x: p.x, z: p.z, r: raio * 0.85 });
        const tom = 0.88 + rnd() * 0.2;
        if (tipo === 'ipe') { novoItem(tipo, p.x, p.z, s.h - 0.02, { s: 0.85 + rnd() * 0.35, cores: [rnd() < 0.5 ? '#e08bb3' : '#ecc64a'] }); k++; continue; }
        novoItem(tipo, p.x, p.z, s.h - 0.02, { s: (tipo === 'mata' ? 0.9 + rnd() * 0.55 : 0.8 + rnd() * 0.4), cores: [`rgb(${Math.round(255 * Math.min(1, tom * 1.02))},${Math.round(255 * Math.min(1, tom))},${Math.round(255 * Math.min(1, tom * 0.95))})`] });
        k++;
      }
    }

    // --- malhas instanciadas por tipo (geometria e material compartilhados) ---
    const grupo = new THREE.Group();
    const conteudo = new THREE.Group(); // cresce na entrada
    grupo.add(conteudo);
    conteudo.add(topo, lado);
    if (espelho) conteudo.add(espelho);
    if (cerca) conteudo.add(cerca);
    for (const m of avulsos) conteudo.add(m);
    const porTipo = new Map();
    itens.forEach((it, k) => { it.atraso = 0.25 + (k / Math.max(1, itens.length)) * 0.4 + rnd() * 0.08; if (!porTipo.has(it.tipo)) porTipo.set(it.tipo, []); porTipo.get(it.tipo).push(it); });
    const instanciados = [];
    for (const [tipo, lista] of porTipo) {
      TIPOS[tipo].malhas.forEach(([geo, mat], camada) => {
        const im = new THREE.InstancedMesh(G[geo], M[mat], lista.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        lista.forEach((it, k) => im.setColorAt(k, c.set(it.cores[camada] ?? it.cores[0] ?? '#ffffff')));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        conteudo.add(im);
        instanciados.push({ im, lista });
      });
    }
    const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), esc = new THREE.Vector3(), vp = new THREE.Vector3(), eixoY = new THREE.Vector3(0, 1, 0);
    let progresso = 1;
    function aplicarInstancias() {
      for (const { im, lista } of instanciados) {
        lista.forEach((it, k) => {
          const t = Math.min(1, Math.max(0, (progresso - it.atraso) / 0.28));
          const f = it.oculto ? 0 : progresso >= 1 ? 1 : facilVolta(t);
          qt.setFromAxisAngle(eixoY, it.rot);
          esc.set(it.s * f + 1e-5, it.s * it.sy * f + 1e-5, it.s * f + 1e-5);
          mtx.compose(vp.set(it.x, it.y, it.z), qt, esc);
          im.setMatrixAt(k, mtx);
        });
        im.instanceMatrix.needsUpdate = true;
      }
    }

    // --- placa ---
    const placa = new THREE.Group();
    placa.position.set(placaPos.x, placaPos.y - 0.02, placaPos.z);
    const telaPlaca = document.createElement('canvas');
    telaPlaca.width = 1024; telaPlaca.height = 356;
    const texPlaca = new THREE.CanvasTexture(telaPlaca);
    texPlaca.colorSpace = THREE.SRGBColorSpace;
    texPlaca.anisotropy = anisotropia;
    const matPlaca = new THREE.MeshStandardMaterial({ map: texPlaca, roughness: 0.9 });
    const desenhar = () => { desenharPlaca(telaPlaca.getContext('2d'), telaPlaca.width, telaPlaca.height, info.textoPlaca, info.subPlaca); texPlaca.needsUpdate = true; };
    desenhar();
    for (const x of [-0.56, 0.56]) { const p = new THREE.Mesh(G.placaPoste, M.madeira); p.position.x = x; p.castShadow = true; placa.add(p); }
    const quadro = new THREE.Mesh(G.placaQuadro, M.madeira);
    quadro.position.y = 1.0;
    quadro.castShadow = true;
    const frente = new THREE.Mesh(G.placaFace, matPlaca);
    frente.position.set(0, 1.0, 0.027);
    const verso = new THREE.Mesh(G.placaFace, matPlaca);
    verso.position.set(0, 1.0, -0.027);
    verso.rotation.y = Math.PI;
    placa.add(quadro, frente, verso);
    conteudo.add(placa);
    const ancoraEtiqueta = new THREE.Vector3(0, 1.62, 0);

    for (const alvo of [topo, lado, quadro, frente, verso]) { alvo.userData.ilhaId = info.id; alvosToque.push(alvo); }

    // --- marcos do perfil e seus pontos de descoberta ---
    const descobertas = [];
    const animados = [];
    const descartes = [];
    const alvosMarcos = [];
    for (const m of marcos) {
      const feito = construirMarco(m, { amostra, rio, dirCam, rnd: rm, contorno });
      if (!feito) continue;
      conteudo.add(feito.objeto);
      for (const a of feito.alvos) { a.userData.ilhaId = info.id; a.userData.descoberta = m.referencia; alvosMarcos.push(a); alvosToque.push(a); }
      descobertas.push({ referencia: m.referencia, ancora: feito.ancora, centro: feito.centro });
      if (feito.animar) animados.push(feito.animar);
      if (feito.descartar) descartes.push(feito.descartar);
    }

    // --- espuma na linha da praia (mar aberto): uma faixa clara que respira com a maré ---
    let espuma = null;
    if (marAberto) {
      const lat = { x: -aguaDir.z, z: aguaDir.x };
      const linha = [];
      for (let l = -R * 1.05; l <= R * 1.05; l += 0.045) {
        let antes = null, achou = null;
        for (let sP = -R * 0.3; sP <= R * 1.05; sP += 0.018) {
          const x = lat.x * l + aguaDir.x * sP, z = lat.z * l + aguaDir.z * sP;
          const a = amostra(x, z);
          if (a.rho > 0.97) { if (sP > 0) break; antes = null; continue; }
          if (antes !== null && antes >= NIVEL && a.h < NIVEL) { achou = { x, z }; break; }
          antes = a.h;
        }
        linha.push(achou);
      }
      const longe = (p, d) => ({ x: p.x + aguaDir.x * d, z: p.z + aguaDir.z * d });
      const dentro = (q) => Math.hypot(q.x, q.z) < contorno(Math.atan2(q.z, q.x)) * 0.985;
      const pe = [];
      for (let k = 0; k < linha.length - 1; k++) {
        const a = linha[k], b = linha[k + 1];
        if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > 0.2) continue;
        const a0 = longe(a, 0.012), a1 = longe(a, 0.11), b0 = longe(b, 0.012), b1 = longe(b, 0.11);
        if (!dentro(a1) || !dentro(b1)) continue;
        pe.push(a0.x, 0, a0.z, b0.x, 0, b0.z, a1.x, 0, a1.z, b0.x, 0, b0.z, b1.x, 0, b1.z, a1.x, 0, a1.z);
      }
      if (pe.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pe, 3));
        espuma = new THREE.Mesh(geo, M.espuma);
        espuma.position.y = NIVEL + 0.012;
        espuma.renderOrder = 2;
        conteudo.add(espuma);
      }
    }

    // --- caminhos até as pontes (recalculados quando o arranjo muda) ---
    const corAtual = geoTopo.attributes.color.array;
    function definirAncoras(pontos) {
      const caminhos = [];
      const linha = (A, B, curva) => {
        const pts = [];
        const mx = (A.x + B.x) / 2 + (B.z - A.z) * curva, mz = (A.z + B.z) / 2 - (B.x - A.x) * curva;
        for (let t = 0; t <= 1.0001; t += 1 / 18) {
          const u = 1 - t;
          pts.push({ x: u * u * A.x + 2 * u * t * mx + t * t * B.x, z: u * u * A.z + 2 * u * t * mz + t * t * B.z });
        }
        return pts;
      };
      const curvaSemente = semente(hash32(info.id + ':caminhos'));
      caminhos.push(linha(praca, { x: placaPos.x * 0.92, z: placaPos.z * 0.92 }, (curvaSemente() - 0.5) * 0.3));
      for (const c of caminhosFixos) caminhos.push(c);
      for (const p of pontos) caminhos.push(linha(praca, p, (curvaSemente() - 0.5) * 0.35));
      const distSeg = (x, z, a, b) => {
        const vx = b.x - a.x, vz = b.z - a.z, wx = x - a.x, wz = z - a.z;
        const t = Math.max(0, Math.min(1, (vx * wx + vz * wz) / (vx * vx + vz * vz || 1)));
        return Math.hypot(wx - vx * t, wz - vz * t);
      };
      const dist = (x, z) => {
        let m = Infinity;
        for (const pts of caminhos) for (let k = 0; k < pts.length - 1; k++) m = Math.min(m, distSeg(x, z, pts[k], pts[k + 1]));
        return m;
      };
      for (let v = 0; v < nVert; v++) {
        const x = pos[v * 3], z = pos[v * 3 + 2], h = alturas[v];
        let r = coresBase[v * 3], g = coresBase[v * 3 + 1], b = coresBase[v * 3 + 2];
        if (h > NIVEL + 0.015) {
          const d = dist(x, z);
          const t = (1 - suave(0.045, 0.1, d)) * 0.9;
          if (t > 0) { r = misturar(r, cores.caminho.r, t); g = misturar(g, cores.caminho.g, t); b = misturar(b, cores.caminho.b, t); }
        }
        corAtual[v * 3] = r; corAtual[v * 3 + 1] = g; corAtual[v * 3 + 2] = b;
      }
      geoTopo.attributes.color.needsUpdate = true;
      for (const it of itens) it.oculto = it.tipo !== 'palafita' && dist(it.x, it.z) < 0.14 + TIPOS[it.tipo].raio * 0.5;
      aplicarInstancias();
      sombraSuja();
    }
    function pontoDeAncora(anguloMundo) {
      for (let k = 0; k < 30; k++) {
        const a = anguloMundo + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.07;
        const r = contorno(a) * 0.93;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, s = amostra(x, z);
        if (s.h > 0.04) return { x, z, y: s.h };
      }
      const r = contorno(anguloMundo) * 0.93;
      return { x: Math.cos(anguloMundo) * r, z: Math.sin(anguloMundo) * r, y: Math.max(NIVEL, amostra(Math.cos(anguloMundo) * r, Math.sin(anguloMundo) * r).h) };
    }

    const alturaBase = (rnd() - 0.5) * 0.36;
    grupo.position.y = alturaBase;
    definirAncoras([]);

    const ilha = {
      // raio para enquadrar: ilhas com montes (e mata no alto) sobem mais que as outras e precisam de margem
      id: info.id, info, grupo, conteudo, placa, raio: R, raioVisual: R * (picos.length ? (modRelevo === 'vale-montes' ? 1.22 : 1.08) : 1), alturaBase, barcos,
      ancoraEtiqueta, saindo: false, descobertas, animados,
      definirAncoras, pontoDeAncora,
      atualizarPlaca(novaInfo) { if (novaInfo) Object.assign(info, novaInfo); desenhar(); },
      definirProgresso(p) { progresso = p; aplicarInstancias(); },
      descartar() {
        for (const alvo of [topo, lado, quadro, frente, verso, ...alvosMarcos]) { const i = alvosToque.indexOf(alvo); if (i >= 0) alvosToque.splice(i, 1); }
        geoTopo.dispose(); geoLado.dispose();
        if (espuma) espuma.geometry.dispose();
        for (const f of descartes) f();
        if (espelho) espelho.geometry.dispose();
        if (cerca) cerca.geometry.dispose();
        for (const { im } of instanciados) im.dispose();
        texPlaca.dispose(); matPlaca.dispose();
        grupo.removeFromParent();
      },
    };
    aplicarInstancias();
    return ilha;
  }

  // ---------- Pontes (tábuas sobre uma catenária, cordas e postes) ----------
  let pontes = [];
  function criarPonte(ilhaA, ilhaB) {
    const pa = ilhaA.grupo.position, pb = ilhaB.grupo.position;
    const angAB = Math.atan2(pb.z - pa.z, pb.x - pa.x);
    const la = ilhaA.pontoDeAncora(angAB), lb = ilhaB.pontoDeAncora(angAB + Math.PI);
    const A = new THREE.Vector3(pa.x + la.x, ilhaA.alturaBase + la.y + 0.02, pa.z + la.z);
    const B = new THREE.Vector3(pb.x + lb.x, ilhaB.alturaBase + lb.y + 0.02, pb.z + lb.z);
    const comp = A.distanceTo(B);
    const flecha = 0.1 + comp * 0.05;
    const ponto = (t, v = new THREE.Vector3()) => v.lerpVectors(A, B, t).setY(misturar(A.y, B.y, t) - flecha * Math.sin(Math.PI * t));
    const dir = new THREE.Vector3().subVectors(B, A).setY(0).normalize();
    const lateral = new THREE.Vector3(-dir.z, 0, dir.x);
    const n = Math.max(4, Math.floor(comp / 0.135));
    const grupo = new THREE.Group();
    const tabuas = new THREE.InstancedMesh(G.prancha, M.madeira, n);
    tabuas.castShadow = true; tabuas.receiveShadow = true; tabuas.frustumCulled = false;
    const tons = semente(hash32(ilhaA.id + ilhaB.id));
    for (let k = 0; k < n; k++) tabuas.setColorAt(k, new THREE.Color().setScalar(0.86 + tons() * 0.2));
    grupo.add(tabuas);
    const cordas = [];
    for (const lado of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        pts.push(ponto(t).addScaledVector(lateral, 0.22 * lado).add(new THREE.Vector3(0, 0.3 - 0.06 * Math.sin(Math.PI * t), 0)));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 5, false);
      const m = new THREE.Mesh(g, M.corda);
      m.castShadow = true;
      cordas.push(m);
      grupo.add(m);
    }
    const postes = new THREE.InstancedMesh(G.poste, M.madeira, 4);
    postes.castShadow = true; postes.frustumCulled = false;
    const mm = new THREE.Matrix4();
    [[A, -1], [A, 1], [B, -1], [B, 1]].forEach(([P, lado], k) => postes.setMatrixAt(k, mm.makeTranslation(P.x + lateral.x * 0.22 * lado, P.y - 0.06, P.z + lateral.z * 0.22 * lado)));
    grupo.add(postes);
    cena.add(grupo);
    const fwd = new THREE.Vector3(), up = new THREE.Vector3(), lat = new THREE.Vector3(), base = new THREE.Matrix4(), esc = new THREE.Matrix4(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    function progresso(p) {
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        ponto(Math.max(0, t - 0.01), p0); ponto(Math.min(1, t + 0.01), p1);
        fwd.subVectors(p1, p0).normalize();
        lat.crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
        up.crossVectors(fwd, lat).normalize();
        const f = Math.min(1, Math.max(0, (p * (n + 6) - k) / 6));
        base.makeBasis(lat, up, fwd).setPosition(ponto(t));
        esc.makeScale(f + 1e-5, f + 1e-5, f + 1e-5);
        tabuas.setMatrixAt(k, base.multiply(esc));
      }
      tabuas.instanceMatrix.needsUpdate = true;
      if (tabuas.instanceColor) tabuas.instanceColor.needsUpdate = true;
      for (const m of cordas) m.visible = p >= 1;
      postes.visible = p > 0.05;
    }
    progresso(0);
    return {
      grupo, progresso,
      descartar() { tabuas.dispose(); postes.dispose(); for (const m of cordas) m.geometry.dispose(); grupo.removeFromParent(); },
    };
  }
  function refazerPontes(animar) {
    for (const p of pontes) p.descartar();
    pontes = [];
    const lista = ordem.map((id) => ilhas.get(id)).filter(Boolean);
    const ancoras = new Map(lista.map((i) => [i.id, []]));
    for (let k = 0; k < lista.length - 1; k++) {
      const a = lista[k], b = lista[k + 1];
      const ponte = criarPonte(a, b);
      pontes.push(ponte);
      const ang = Math.atan2(b.grupo.position.z - a.grupo.position.z, b.grupo.position.x - a.grupo.position.x);
      ancoras.get(a.id).push(a.pontoDeAncora(ang));
      ancoras.get(b.id).push(b.pontoDeAncora(ang + Math.PI));
      if (animar && !reduz) animar_({ dur: 700 + k * 120, atraso: k * 160, passo: (t) => ponte.progresso(t), fim: () => ponte.progresso(1) });
      else ponte.progresso(1);
    }
    for (const ilha of lista) ilha.definirAncoras(ancoras.get(ilha.id));
    sombraSuja();
  }

  // ---------- Animações (uma fila simples, sem dependências) ----------
  const animacoes = [];
  function animar_({ dur, atraso = 0, passo, fim }) {
    const a = { inicio: performance.now() + atraso, dur, passo, fim };
    animacoes.push(a);
    return a;
  }
  function rodarAnimacoes(agora) {
    for (let k = animacoes.length - 1; k >= 0; k--) {
      const a = animacoes[k];
      if (agora < a.inicio) continue;
      const t = Math.min(1, (agora - a.inicio) / a.dur);
      a.passo(t);
      if (t >= 1) { animacoes.splice(k, 1); a.fim?.(); }
    }
    return animacoes.length > 0;
  }
  function concluirAnimacoes() {
    while (animacoes.length) { const a = animacoes.shift(); a.passo(1); a.fim?.(); }
  }

  // ---------- Arranjo do mundo ----------
  // Posições no referencial da câmera inicial (x à direita, z na direção de quem olha) e depois giradas para o mundo.
  // Tela larga: a história corre da esquerda para a direita. Tela em pé (celular): corre de cima (fundo) para baixo (frente).
  const ARRANJOS = {
    largo: { 1: [[0, 0]], 2: [[-3.1, 0.3], [3.1, -0.3]], 3: [[-3.9, 1.2], [0, -2.9], [3.9, 1.2]] },
    retrato: { 1: [[0, 0]], 2: [[-1.7, -2.3], [1.7, 2.3]], 3: [[-2.1, -4.3], [2.1, -0.3], [-1.9, 3.7]] },
  };
  let arranjoAtual = 'largo';
  function formatoDaTela() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const visW = Math.max(w - area.direita, w * 0.35), visH = Math.max(h - area.base - area.topo, h * 0.25);
    return visW / visH < 1.05 ? 'retrato' : 'largo';
  }
  function posicoesPara(n) {
    const lista = ARRANJOS[arranjoAtual][Math.max(1, Math.min(3, n))];
    const c = Math.cos(AZIMUTE), s = Math.sin(AZIMUTE);
    return lista.map(([x, z]) => [x * c + z * s, -x * s + z * c]);
  }
  let ultimaLista = [];
  let marcador = null;
  function definirMarcador(visivel) {
    if (visivel && !marcador) {
      const g = new THREE.RingGeometry(1.6, 1.68, 96).rotateX(-Math.PI / 2);
      marcador = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1a1712, transparent: true, opacity: 0.22, depthWrite: false }));
      marcador.position.y = 0.0;
      cena.add(marcador);
    } else if (!visivel && marcador) {
      marcador.geometry.dispose(); marcador.material.dispose(); marcador.removeFromParent(); marcador = null;
    }
  }

  function entrar(ilha, animar) {
    const yFinal = ilha.alturaBase;
    if (!animar || reduz) { ilha.conteudo.scale.setScalar(1); ilha.grupo.position.y = yFinal; ilha.definirProgresso(1); sombraSuja(); return; }
    ilha.definirProgresso(0);
    ilha.conteudo.scale.setScalar(0.55);
    ilha.grupo.position.y = yFinal - 2.6;
    animar_({
      dur: 1500,
      passo: (t) => {
        const a = Math.min(1, t / 0.55);
        ilha.grupo.position.y = misturar(yFinal - 2.6, yFinal, facilSaida(a));
        ilha.conteudo.scale.setScalar(misturar(0.55, 1, facilVolta(a)));
        ilha.definirProgresso(t);
        sombraSuja();
      },
      fim: () => { ilha.definirProgresso(1); sombraSuja(); },
    });
  }
  function sair(ilha, animar) {
    ilha.saindo = true;
    if (!animar || reduz) { ilha.descartar(); sombraSuja(); return; }
    const y0 = ilha.grupo.position.y;
    animar_({
      dur: 480,
      passo: (t) => { const e = t * t; ilha.grupo.position.y = y0 - 2.8 * e; ilha.conteudo.scale.setScalar(1 - 0.45 * e); sombraSuja(); },
      fim: () => { ilha.descartar(); sombraSuja(); },
    });
  }

  let foco = null; // id da ilha em destaque
  let destaque = null;
  function definirDestaque(id) {
    if (destaque) { destaque.geometry.dispose(); destaque.material.dispose(); destaque.removeFromParent(); destaque = null; }
    const ilha = id && ilhas.get(id);
    if (!ilha) return;
    const pts = [];
    const NSD = 96;
    for (let j = 0; j <= NSD; j++) {
      const th = (j / NSD) * TAU;
      pts.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
    }
    const geo = new THREE.BufferGeometry();
    const arr = [];
    for (let j = 0; j < NSD; j++) {
      const a = pts[j], b = pts[j + 1];
      const r1 = ilha.raio * 1.07, r2 = ilha.raio * 1.105;
      arr.push(a.x * r1, 0, a.z * r1, a.x * r2, 0, a.z * r2, b.x * r1, 0, b.z * r1, b.x * r1, 0, b.z * r1, a.x * r2, 0, a.z * r2, b.x * r2, 0, b.z * r2);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    destaque = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(REGIOES[ilha.info.regiao]?.cor ?? '#000'), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    destaque.position.set(0, 0.03, 0);
    ilha.grupo.add(destaque);
  }

  function limitesMundo() {
    const lista = ordem.map((id) => ilhas.get(id)).filter(Boolean);
    if (!lista.length) return { centro: new THREE.Vector3(0, -0.4, 0), raio: 3.4 };
    const centro = new THREE.Vector3();
    for (const i of lista) centro.add(new THREE.Vector3(i.alvo.x, 0, i.alvo.z));
    centro.divideScalar(lista.length).setY(-0.35);
    let raio = 0;
    for (const i of lista) raio = Math.max(raio, Math.hypot(i.alvo.x - centro.x, i.alvo.z - centro.z) + i.raioVisual);
    return { centro, raio: Math.max(raio + 0.1, 3.0) };
  }
  function ajustarSombra() {
    const { centro, raio } = limitesMundo();
    sol.target.position.copy(centro);
    sol.position.copy(centro).addScaledVector(DIR_SOL, 24);
    const cam = sol.shadow.camera;
    const r = raio + 2.5;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 4; cam.far = 50;
    cam.updateProjectionMatrix();
    sombraSuja();
  }

  function definirMundo(lista, { animar = true, enquadrar = true } = {}) {
    ultimaLista = lista;
    arranjoAtual = formatoDaTela();
    const ids = new Set(lista.map((x) => x.id));
    for (const [id, ilha] of ilhas) if (!ids.has(id)) { ilhas.delete(id); sair(ilha, animar); }
    const posicoes = posicoesPara(lista.length);
    let mudouArranjo = false;
    lista.forEach((x, k) => {
      const [px, pz] = posicoes[k];
      let ilha = ilhas.get(x.id);
      if (!ilha) {
        ilha = criarIlha(x);
        ilhas.set(x.id, ilha);
        ilha.grupo.position.x = px; ilha.grupo.position.z = pz;
        ilha.alvo = { x: px, z: pz };
        cena.add(ilha.grupo);
        entrar(ilha, animar);
        mudouArranjo = true;
      } else {
        Object.assign(ilha.info, { papeis: x.papeis });
        ilha.alvo = { x: px, z: pz };
        const de = { x: ilha.grupo.position.x, z: ilha.grupo.position.z };
        if (Math.abs(de.x - px) > 1e-3 || Math.abs(de.z - pz) > 1e-3) {
          mudouArranjo = true;
          if (animar && !reduz) animar_({ dur: 650, passo: (t) => { const e = facilMeio(t); ilha.grupo.position.x = misturar(de.x, px, e); ilha.grupo.position.z = misturar(de.z, pz, e); sombraSuja(); } });
          else { ilha.grupo.position.x = px; ilha.grupo.position.z = pz; }
        }
      }
    });
    const novaOrdem = lista.map((x) => x.id);
    if (novaOrdem.join('|') !== ordem.join('|')) mudouArranjo = true;
    ordem = novaOrdem;
    if (mudouArranjo) {
      for (const p of pontes) p.descartar();
      pontes = [];
      if (animar && !reduz) animar_({ dur: 1, atraso: 680, passo: () => {}, fim: () => refazerPontes(true) });
      else refazerPontes(false);
    }
    if (foco && !ilhas.has(foco)) foco = null;
    definirDestaque(foco);
    ajustarSombra();
    if (enquadrar && !foco && mudouArranjo) visaoInicial({ animar });
  }

  // ---------- Câmera: enquadramento com a área livre de painéis ----------
  const area = { direita: 0, base: 0, topo: 0 };
  function aplicarAreaVisivel() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    camera.aspect = w / h;
    camera.setViewOffset(w, h, area.direita / 2, (area.base - area.topo) / 2, w, h);
    camera.updateProjectionMatrix();
  }
  function distanciaPara(raio, cam = camera, larg = canvas.clientWidth, alt = canvas.clientHeight, livre = area) {
    const visW = Math.max(larg - livre.direita, larg * 0.35), visH = Math.max(alt - livre.base - livre.topo, alt * 0.25);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const t = Math.min((tanV * visH) / alt, (tanV * visW) / alt);
    return raio / Math.sin(Math.atan(t));
  }
  const esferico = new THREE.Spherical();
  function voarPara(alvo, distancia, { azimute, polar, dur = 950 } = {}) {
    esferico.setFromVector3(new THREE.Vector3().subVectors(camera.position, controles.target));
    const de = { alvo: controles.target.clone(), r: esferico.radius, phi: esferico.phi, theta: esferico.theta };
    let dTheta = (azimute ?? de.theta) - de.theta;
    dTheta = ((((dTheta + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    const para = { alvo: alvo.clone(), r: distancia, phi: polar ?? Math.min(Math.max(de.phi, controles.minPolarAngle), controles.maxPolarAngle), theta: de.theta + dTheta };
    controles.minDistance = Math.min(controles.minDistance, distancia);
    controles.maxDistance = Math.max(controles.maxDistance, distancia);
    const aplicar = (e) => {
      controles.target.lerpVectors(de.alvo, para.alvo, e);
      esferico.set(misturar(de.r, para.r, e), misturar(de.phi, para.phi, e), misturar(de.theta, para.theta, e));
      camera.position.setFromSpherical(esferico).add(controles.target);
      camera.lookAt(controles.target);
    };
    if (reduz || dur === 0) { aplicar(1); controles.update(); return; }
    controles.enabled = false;
    animar_({ dur, passo: (t) => aplicar(facilMeio(t)), fim: () => { controles.enabled = true; controles.update(); } });
  }
  let distanciaBase = 20;
  function visaoInicial({ animar = true } = {}) {
    foco = null;
    definirDestaque(null);
    const { centro, raio } = limitesMundo();
    distanciaBase = distanciaPara(raio) * 0.95;
    controles.minDistance = distanciaBase * 0.4;
    controles.maxDistance = distanciaBase * 1.6;
    voarPara(centro, distanciaBase, { azimute: AZIMUTE, polar: POLAR, dur: animar ? 1000 : 0 });
  }
  function focar(id, { animar = true } = {}) {
    const ilha = ilhas.get(id);
    if (!ilha) return;
    foco = id;
    definirDestaque(id);
    const alvo = new THREE.Vector3(ilha.alvo.x, ilha.alturaBase + 0.2, ilha.alvo.z);
    voarPara(alvo, distanciaPara(ilha.raioVisual + 1.5), { dur: animar ? 900 : 0 });
  }
  function girar(delta) {
    esferico.setFromVector3(new THREE.Vector3().subVectors(camera.position, controles.target));
    voarPara(controles.target, esferico.radius, { azimute: esferico.theta + delta, polar: esferico.phi, dur: 450 });
  }
  function inclinar(delta) {
    esferico.setFromVector3(new THREE.Vector3().subVectors(camera.position, controles.target));
    voarPara(controles.target, esferico.radius, { polar: Math.min(controles.maxPolarAngle, Math.max(controles.minPolarAngle, esferico.phi + delta)), dur: 350 });
  }
  function aproximar(fator) {
    esferico.setFromVector3(new THREE.Vector3().subVectors(camera.position, controles.target));
    const r = Math.min(controles.maxDistance, Math.max(controles.minDistance, esferico.radius * fator));
    voarPara(controles.target, r, { polar: esferico.phi, dur: 300 });
  }

  // ---------- Toque, arrasto e foco do ponteiro ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** O que está sob o ponteiro: { id da ilha, descoberta } (descoberta = marco do perfil) ou null. O mais próximo da câmera vence. */
  function alvoEm(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(alvosToque, false)[0];
    const id = hit?.object.userData.ilhaId;
    if (!id || !ilhas.has(id) || ilhas.get(id).saindo) return null;
    return { id, descoberta: hit.object.userData.descoberta ?? null };
  }
  let toque = null;
  canvas.addEventListener('pointerdown', (e) => {
    toque = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, multi: toque !== null };
    canvas.classList.add('arrastando');
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('arrastando');
    if (!toque || toque.id !== e.pointerId) { toque = null; return; }
    const movimento = Math.hypot(e.clientX - toque.x, e.clientY - toque.y);
    const rapido = performance.now() - toque.t < 600;
    const eraMulti = toque.multi;
    toque = null;
    if (movimento < 8 && rapido && !eraMulti) opcoes.aoTocar?.(alvoEm(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointercancel', () => { toque = null; canvas.classList.remove('arrastando'); });
  let pendenteHover = null;
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !toque) pendenteHover = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerleave', () => { pendenteHover = null; canvas.classList.remove('sobre-ilha'); });
  controles.addEventListener('start', () => { opcoes.aoInteragir?.(); });

  // ---------- Laço de desenho ----------
  const relogio = new THREE.Timer();
  relogio.connect(document);
  let rafId = 0;
  let autoGirar = false;
  const vt = new THREE.Vector3();
  function orientarPlacas(cam) {
    for (const ilha of ilhas.values()) {
      const p = ilha.placa;
      p.getWorldPosition(vt);
      p.rotation.y = Math.atan2(cam.position.x - vt.x, cam.position.z - vt.z);
    }
  }
  const projecoes = [];
  const projDescobertas = [];
  function projetar() {
    projecoes.length = 0;
    projDescobertas.length = 0;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const id of ordem) {
      const ilha = ilhas.get(id);
      if (!ilha || ilha.saindo) continue;
      vt.copy(ilha.ancoraEtiqueta);
      ilha.placa.localToWorld(vt);
      vt.project(camera);
      projecoes.push({ id, x: (vt.x * 0.5 + 0.5) * w, y: (-vt.y * 0.5 + 0.5) * h, visivel: vt.z < 1 && Math.abs(vt.x) < 1.3 && Math.abs(vt.y) < 1.3 });
      for (const d of ilha.descobertas) {
        d.ancora.getWorldPosition(vt);
        vt.project(camera);
        projDescobertas.push({ id, referencia: d.referencia, x: (vt.x * 0.5 + 0.5) * w, y: (-vt.y * 0.5 + 0.5) * h, visivel: vt.z < 1 && Math.abs(vt.x) < 1.05 && Math.abs(vt.y) < 1.05 });
      }
    }
    return projecoes;
  }
  function quadro(ts) {
    rafId = requestAnimationFrame(quadro);
    relogio.update(ts);
    const dt = Math.min(relogio.getDelta(), 0.05);
    const animando = rodarAnimacoes(performance.now());
    controles.autoRotate = autoGirar && !reduz && controles.enabled;
    const mexeu = controles.update(dt);
    if (reduz && !animando && !mexeu && !sujo) return;
    if (!reduz) {
      uTempo.value += dt;
      for (const ilha of ilhas.values()) for (const b of ilha.barcos) {
        b.position.y = NIVEL - 0.015 + Math.sin(uTempo.value * 1.6 + b.userData.fase) * 0.012;
        b.rotation.z = Math.sin(uTempo.value * 1.2 + b.userData.fase) * 0.04;
      }
      for (const ilha of ilhas.values()) for (const f of ilha.animados) f(uTempo.value);
      M.espuma.opacity = 0.42 + Math.sin(uTempo.value * 1.7) * 0.2;
      if (destaque) destaque.material.opacity = 0.55 + Math.sin(uTempo.value * 2.4) * 0.2;
      if (marcador) marcador.scale.setScalar(1 + Math.sin(uTempo.value * 1.8) * 0.04);
    }
    if (pendenteHover) {
      canvas.classList.toggle('sobre-ilha', !!alvoEm(pendenteHover.x, pendenteHover.y));
      pendenteHover = null;
    }
    orientarPlacas(camera);
    renderer.render(cena, camera);
    sujo = false;
    opcoes.aoQuadro?.(projetar(), projDescobertas);
  }
  function iniciarLaco() { if (!rafId) rafId = requestAnimationFrame(quadro); }
  function pararLaco() { cancelAnimationFrame(rafId); rafId = 0; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pararLaco(); else { sujo = true; iniciarLaco(); } });
  controles.addEventListener('change', () => { sujo = true; });

  function redimensionar() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(razaoPixels());
    renderer.setSize(w, h, false);
    aplicarAreaVisivel();
    sujo = true;
  }
  new ResizeObserver(redimensionar).observe(canvas);
  redimensionar();
  ajustarSombra();
  visaoInicial({ animar: false });
  iniciarLaco();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pararLaco(); opcoes.aoPerderContexto?.(); });

  // ---------- Exportação: a maquete inteira, numa câmera própria, sem interface ----------
  function exportar(largura, altura, escala = 2) {
    concluirAnimacoes();
    const cam = new THREE.PerspectiveCamera(camera.fov, largura / altura, 0.1, 200);
    const { centro, raio } = limitesMundo();
    const d = distanciaPara(raio * 0.82, cam, largura, altura, { direita: 0, base: 0, topo: 0 });
    cam.position.setFromSpherical(new THREE.Spherical(d, POLAR - 0.02, AZIMUTE)).add(centro);
    cam.lookAt(centro);
    cam.updateMatrixWorld();
    const destaqueVisivel = destaque?.visible;
    if (destaque) destaque.visible = false;
    if (marcador) marcador.visible = false;
    orientarPlacas(cam);
    const pr = renderer.getPixelRatio();
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    renderer.setPixelRatio(1);
    renderer.setSize(largura * escala, altura * escala, false);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(cena, cam);
    const saida = document.createElement('canvas');
    saida.width = largura * escala; saida.height = altura * escala;
    saida.getContext('2d').drawImage(canvas, 0, 0);
    renderer.setPixelRatio(pr);
    renderer.setSize(w0, h0, false);
    aplicarAreaVisivel();
    if (destaque) destaque.visible = destaqueVisivel;
    if (marcador) marcador.visible = true;
    orientarPlacas(camera);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(cena, camera);
    return saida;
  }

  return {
    definirMundo,
    definirMarcador,
    focar,
    visaoInicial,
    girar,
    inclinar,
    aproximar,
    exportar,
    redesenharPlacas() { for (const ilha of ilhas.values()) ilha.atualizarPlaca(); sujo = true; },
    redesenhar() { sujo = true; },
    /** QA: onde está, na tela, o desenho de um marco (para tocar nele como uma pessoa tocaria). */
    marcoNaTela(id, referencia) {
      const d = ilhas.get(id)?.descobertas.find((x) => x.referencia === referencia);
      if (!d) return null;
      d.centro.getWorldPosition(vt);
      vt.project(camera);
      return { x: (vt.x * 0.5 + 0.5) * canvas.clientWidth, y: (-vt.y * 0.5 + 0.5) * canvas.clientHeight };
    },
    definirAreaVisivel(livre) {
      const mudou = livre.direita !== area.direita || livre.base !== area.base || livre.topo !== area.topo;
      Object.assign(area, livre);
      aplicarAreaVisivel();
      sujo = true;
      // virou a tela (ou o painel mudou muito): rearranja as ilhas para o novo formato
      if (formatoDaTela() !== arranjoAtual && ultimaLista.length > 1) { definirMundo(ultimaLista, { animar: true, enquadrar: false }); return true; }
      return mudou;
    },
    reenquadrar({ animar = true } = {}) { if (foco) focar(foco, { animar }); else visaoInicial({ animar }); },
    definirAutoGiro(v) { autoGirar = v; },
    definirMovimentoReduzido(v) { reduz = v; controles.enableDamping = !v; if (v) concluirAnimacoes(); sujo = true; },
    get foco() { return foco; },
    /** Diagnóstico: o que está alocado na GPU e quantos objetos a cena tem (usado pelo QA para provar que trocas não acumulam). */
    memoria() {
      let objetos = 0;
      cena.traverse(() => { objetos++; });
      return { geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures, programas: renderer.info.programs?.length ?? 0, objetos, ilhas: ilhas.size, animacoes: animacoes.length };
    },
    soltarFoco() { foco = null; definirDestaque(null); },
  };
}

