import * as THREE from "https://unpkg.com/three@latest/build/three.module.js";

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 2;

let renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // fully transparent
document.body.appendChild(renderer.domElement);

const loader = new THREE.TextureLoader();

const texture = loader.load("assets/image.jpg", (t) => {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
}); // use your own image
const disp = loader.load("assets/displacement-map.jpg", (t) => {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
}); // grayscale displacement map
const cloudTexture = loader.load("assets/clouds.png", (t) => {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
});
const nightTexture = loader.load("assets/nightlights.png", (t) => {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
});

texture.wrapS = THREE.RepeatWrapping;
nightTexture.wrapS = THREE.RepeatWrapping;
disp.wrapS = THREE.RepeatWrapping;

texture.wrapT = THREE.ClampToEdgeWrapping; // vertical seam is not needed
nightTexture.wrapT = THREE.ClampToEdgeWrapping;
disp.wrapT = THREE.ClampToEdgeWrapping;

const sunGeometry = new THREE.SphereGeometry(0.05, 16, 16);
const sunMaterial = new THREE.MeshBasicMaterial({
  color: 0xffcc00,
  transparent: true,
  opacity: 0.9,
});
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
sunMesh.castShadow = false;
scene.add(sunMesh);

// --- Sun Glow Effect ---
const sunGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffee88,
  transparent: true,
  opacity: 0.1,
  side: THREE.BackSide,
});
const sunGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 32, 32), // slightly larger than sunMesh
  sunGlowMaterial
);
sunGlow.position.copy(sunMesh.position);

scene.add(sunGlow);

// --- Sun Light ---
const sunLight = new THREE.PointLight(0xffcc00, 1.5, 10, 2);
sunLight.position.copy(sunMesh.position);
scene.add(sunLight);

let cloudOpacity = 0.0;
let fadingIn = true;

const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0x00aaff,
  transparent: true,
  opacity: 0.2,
  side: THREE.BackSide,
});

const glowMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 64, 64),
  glowMaterial
);
scene.add(glowMesh);

const cloudMaterial = new THREE.MeshPhongMaterial({
  map: cloudTexture,
  transparent: true,
  depthWrite: false, // prevents depth-fighting with the planet surface
  opacity: 0.3,
  side: THREE.DoubleSide, // ensures both sides render
});

const cloudGeometry = new THREE.SphereGeometry(0.76, 64, 64); // slightly larger than planet
const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(cloudMesh);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // soft light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(2, 2, 5);
scene.add(directionalLight);

// Optional: spotlight for more drama
const spotLight = new THREE.SpotLight(0xffffff, 1);
spotLight.position.set(0, 3, 3);
spotLight.castShadow = true;
scene.add(spotLight);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pmrem = new THREE.PMREMGenerator(renderer);
loader.load("env.hdr", (hdrTexture) => {
  const envMap = pmrem.fromEquirectangular(hdrTexture).texture;
  scene.environment = envMap; // realistic reflections and ambient light
});

/* RENDER BACKGROUND
const bgTexture = loader.load("background.jpg");
scene.background = bgTexture; */

let uniforms = {
  uTexture: { value: texture },
  uDisp: { value: disp },
  uNightTexture: { value: nightTexture },
  uLightPos: { value: new THREE.Vector3(0, 0, 1).normalize() },
  uTime: { value: 0.0 },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uResolution: {
    value: new THREE.Vector2(window.innerWidth, window.innerHeight),
  },
};

uniforms.uLightPos.value.set(1, 0, 0).normalize(); // sun from the side
uniforms.uSunPos = { value: sunMesh.position.clone() };


let material = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: ` 
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vUv = uv; 
        gl_Position = projectionMatrix * viewMatrix * worldPos;
        
    }
 `,
  fragmentShader: `
    uniform sampler2D uTexture;
uniform sampler2D uDisp;
uniform sampler2D uNightTexture;
uniform vec3 uLightPos;
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uResolution;
uniform vec3 uSunPos;


varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;


void main() {
vec3 lightDir = normalize(uLightPos); // if you set uLightPos as a direction
float facing = step(0.0, dot(vNormal, lightDir));
float diff = max(dot(vNormal, lightDir), 0.0);
diff = pow(diff, 10.0); // or 3.0
    float disp = texture2D(uDisp, vUv).r;
    diff *= 0.5 + 0.1 * disp;

    vec3 dayColor = texture2D(uTexture, vUv).rgb;
    vec3 nightTex = texture2D(uNightTexture, vUv).rgb;
    vec3 nightColor = vec3(1.0, 0.85, 0.2) * nightTex; // yellowish tint

    float dist = length(uSunPos - vWorldPos);
float distanceAttenuation = 1.0 / (1.0 + dist * dist); // basic quadratic falloff

float lightFactor = smoothstep(0.15, 0.5, diff); // fade in from 0.15 to 0.5 dot product
lightFactor *= distanceAttenuation;

    // --- Mouse-based night light fade ---
    vec2 mouseUV = uMouse; // already normalized 0–1
    vec2 delta = abs(vUv - mouseUV);
    delta.x = min(delta.x, 1.0 - delta.x); // wrap UV horizontally
    float distToMouse = length(delta);

    float mouseInfluence = smoothstep(0.3, 0.0, distToMouse); // closer = stronger fade
    float nightFade = clamp(1.0 - lightFactor - mouseInfluence, 0.0, 1.0);

    vec3 finalColor = mix(dayColor, nightColor, nightFade);

    gl_FragColor = vec4(finalColor, 1.0);
}
  `,
  lights: false,
});

let geometry = new THREE.SphereGeometry(0.75, 64, 64);
let mesh = new THREE.Mesh(geometry, material);

mesh.castShadow = true;
mesh.receiveShadow = true;
directionalLight.castShadow = true;

scene.add(mesh);

let targetMouse = new THREE.Vector2(0.5, 0.5);
let currentMouse = new THREE.Vector2(0.5, 0.5);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(mesh);

  if (intersects.length > 0) {
    const intersectPoint = intersects[0].point;

    // Position the sun visuals at that point
    sunMesh.position.copy(intersectPoint);
    sunGlow.position.copy(intersectPoint);
    sunLight.position.copy(intersectPoint);
    directionalLight.position.copy(intersectPoint);

    // Light should shine outward from the surface
    const lightDirection = new THREE.Vector3()
      .copy(intersectPoint)
      .sub(mesh.position) // vector from center to surface point
      .normalize();

    uniforms.uLightPos.value.copy(lightDirection);

    // Normalized UV for night light fade effect
    uniforms.uMouse.value.set(
      e.clientX / window.innerWidth,
      1.0 - e.clientY / window.innerHeight
    );
  }
});

window.addEventListener("click", () => {
  // Fade in to 0.4 over 1 second
  let start = cloudMaterial.opacity;
  let target = 0.4;
  let duration = 1000;
  let startTime = performance.now();

  function fade(time) {
    let t = (time - startTime) / duration;
    if (t > 1) t = 1;
    cloudMaterial.opacity = start + (target - start) * t;
    if (t < 1) requestAnimationFrame(fade);
  }

  requestAnimationFrame(fade);
});

function animate(time) {
  requestAnimationFrame(animate);
  uniforms.uTime.value = time * 0.001;

  renderer.render(scene, camera);

  mesh.rotation.y += 0.005;
  mesh.rotation.x += 0.002;
  cloudMesh.rotation.y += 0.003;
  cloudMesh.rotation.x += 0.002;

  if (fadingIn) {
    cloudOpacity += 0.001;
    if (cloudOpacity >= 0.3) fadingIn = false;
  } else {
    cloudOpacity -= 0.001;
    if (cloudOpacity <= 0.1) fadingIn = true;
  }
  cloudMaterial.opacity = cloudOpacity;
}

animate();
