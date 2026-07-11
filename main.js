import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- APPLICATION SETUP ---
class App {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        this.isTabActive = true;
        this.isMobile = window.innerWidth <= 768;
        
        // Mouse coordinate states for parallax
        this.mouse = { x: 0, y: 0 };
        this.targetMouse = { x: 0, y: 0 };

        // Moon rotation state
        this.moonRotationSpeed = 0.0005;
        this.moonStyle = 'calm';

        this.initThree();
        this.initLights();
        this.initMoon();
        this.initStars();
        // this.initDustLines();
        this.initPostProcessing();
        this.initScrollAnimations();
        this.initResize();
        this.initNavigation();
        this.initCursor();
        this.initMouseEvents();
        this.initControlPanelEvents();
        this.initHamburger();
        
        // Start Render Loop
        this.animate();
    }

    // 1. Setup Scene, Camera, and WebGLRenderer
    initThree() {
        this.scene = new THREE.Scene();
        
        // Deep space background
        const bgColor = '#0a0e1a';
        this.scene.background = new THREE.Color(bgColor);
        this.scene.fog = new THREE.FogExp2(bgColor, 0.004);

        this.camera = new THREE.PerspectiveCamera(
            50, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            300
        );
        this.camera.position.set(0, 2, 12);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
        
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    // 2. Setup Lighting
    initLights() {
        // Ambient light for space atmosphere
        this.ambientLight = new THREE.AmbientLight('#1a2550', 0.8);
        this.scene.add(this.ambientLight);

        // Main directional light (sunlight from top-right)
        this.sunLight = new THREE.DirectionalLight('#ffe8cc', 2.0);
        this.sunLight.position.set(5, 8, 6);
        this.scene.add(this.sunLight);

        // Blue rim light from the left (earth-like reflection)
        this.rimLight = new THREE.DirectionalLight('#4a8fe7', 0.8);
        this.rimLight.position.set(-6, 2, -4);
        this.scene.add(this.rimLight);

        // Subtle bottom fill light
        this.bottomLight = new THREE.DirectionalLight('#2a3a6a', 0.4);
        this.bottomLight.position.set(0, -5, 3);
        this.scene.add(this.bottomLight);
    }

    // 3. Create MASSIVE 3D Moon at the bottom with visible craters
    initMoon() {
        // Parent Parallax Group (for mouse movement)
        this.parallaxGroup = new THREE.Group();
        this.scene.add(this.parallaxGroup);

        // Child Scroll Group (for scroll-driven movement)
        this.meshGroup = new THREE.Group();
        this.parallaxGroup.add(this.meshGroup);

        // Making the moon smaller
        const moonRadius = this.isMobile ? 8 : 12;
        const detail = this.isMobile ? 96 : 128;

        // Moon geometry
        const moonGeo = new THREE.SphereGeometry(moonRadius, detail, detail);

        // Displace vertices to create strong crater terrain + surface texture
        const posAttr = moonGeo.attributes.position;
        const vertex = new THREE.Vector3();

        // Generate LARGE visible craters (like the blue ovals in the sketch)
        const bigCraterCount = this.isMobile ? 6 : 8;
        const smallCraterCount = this.isMobile ? 25 : 50;
        this.craters = [];

        // Big craters (visible ovals like the sketch)
        for (let c = 0; c < bigCraterCount; c++) {
            const theta = Math.random() * Math.PI * 2;
            // Bias toward the top hemisphere (visible part)
            const phi = Math.acos(1 - Math.random() * 0.8);
            this.craters.push({
                pos: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                ),
                radius: 0.25 + Math.random() * 0.2,
                depth: 0.12 + Math.random() * 0.1,
                isBig: true
            });
        }

        // Smaller craters for texture
        for (let c = 0; c < smallCraterCount; c++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            this.craters.push({
                pos: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                ),
                radius: 0.05 + Math.random() * 0.12,
                depth: 0.02 + Math.random() * 0.05,
                isBig: false
            });
        }

        // Per-vertex color for crater coloring
        const colors = new Float32Array(posAttr.count * 3);

        for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            const dir = vertex.clone().normalize();

            // Base surface noise (moon-like bumpy terrain texture)
            let displacement = 0;
            displacement += Math.sin(dir.x * 18.0 + dir.y * 12.0) * 0.02;
            displacement += Math.cos(dir.z * 14.0 + dir.x * 9.0) * 0.015;
            displacement += Math.sin(dir.y * 22.0 + dir.z * 16.0) * 0.012;
            displacement += Math.cos(dir.x * 30.0 + dir.z * 25.0) * 0.006;
            displacement += Math.sin(dir.x * 45.0 + dir.y * 40.0 + dir.z * 35.0) * 0.004;

            // Base color: light gray-blue moon surface
            let r = 0.72, g = 0.74, b = 0.80;
            
            // Apply craters
            let inBigCrater = false;
            for (const crater of this.craters) {
                const dist = dir.distanceTo(crater.pos);
                if (dist < crater.radius) {
                    const t = dist / crater.radius;
                    
                    // Depression shape
                    const craterShape = (1.0 - t * t) * crater.depth;
                    displacement -= craterShape;

                    // Rim elevation
                    if (t > 0.7 && t < 1.0) {
                        const rimT = (t - 0.7) / 0.3;
                        displacement += Math.sin(rimT * Math.PI) * crater.depth * 0.3;
                    }

                    // Color big craters darker blue (like the sketch ovals)
                    if (crater.isBig && t < 0.85) {
                        const colorBlend = 1.0 - (t / 0.85);
                        r -= colorBlend * 0.25;
                        g -= colorBlend * 0.22;
                        b -= colorBlend * 0.08;
                        inBigCrater = true;
                    }
                    
                    // Small craters get slightly darker
                    if (!crater.isBig && t < 0.8) {
                        const colorBlend = (1.0 - t / 0.8) * 0.5;
                        r -= colorBlend * 0.08;
                        g -= colorBlend * 0.06;
                        b -= colorBlend * 0.02;
                    }
                }
            }

            // Add some color variation across the surface (maria-like darker patches)
            const maria = Math.sin(dir.x * 3.0 + dir.z * 2.0) * 0.5 + 0.5;
            if (maria > 0.65 && !inBigCrater) {
                r -= 0.06;
                g -= 0.05;
                b -= 0.02;
            }

            colors[i * 3] = Math.max(0, Math.min(1, r));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b));

            vertex.addScaledVector(dir, displacement);
            posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        moonGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        moonGeo.computeVertexNormals();

        // Moon material with vertex colors for crater detail
        this.moonMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88,
            metalness: 0.03,
            flatShading: false,
        });

        this.moon = new THREE.Mesh(moonGeo, this.moonMaterial);
        this.meshGroup.add(this.moon);

        // Subtle atmosphere glow around the moon
        const glowGeo = new THREE.SphereGeometry(moonRadius * 1.015, 64, 64);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x4a7abf,
            transparent: true,
            opacity: 0.05,
            side: THREE.BackSide,
        });
        this.moonGlow = new THREE.Mesh(glowGeo, glowMat);
        this.meshGroup.add(this.moonGlow);

        // Outer halo
        const haloGeo = new THREE.SphereGeometry(moonRadius * 1.04, 48, 48);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0x3a5fa0,
            transparent: true,
            opacity: 0.025,
            side: THREE.BackSide,
        });
        this.moonHalo = new THREE.Mesh(haloGeo, haloMat);
        this.meshGroup.add(this.moonHalo);

        // Position moon FAR below - only the top curve is visible (like the sketch)
        this.meshGroup.position.set(0, -(moonRadius + (this.isMobile ? 4 : 5)), 0);
    }

    // 4. Create starfield background
    initStars() {
        const starCount = this.isMobile ? 1000 : 3000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const radius = 40 + Math.random() * 100;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Star color variation
            const colorChoice = Math.random();
            if (colorChoice < 0.25) {
                colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.92; colors[i * 3 + 2] = 0.82;
            } else if (colorChoice < 0.5) {
                colors[i * 3] = 0.82; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1.0;
            } else {
                colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 1.0;
            }
        }

        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starMat = new THREE.PointsMaterial({
            size: 0.12,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    // 5. Create dust lines / space trails above the moon (like the wavy lines in the sketch)
    initDustLines() {
        this.dustGroup = new THREE.Group();
        this.scene.add(this.dustGroup);

        const lineCount = this.isMobile ? 8 : 14;

        for (let l = 0; l < lineCount; l++) {
            const pointCount = 60 + Math.floor(Math.random() * 40);
            const points = [];

            // Starting position: spread across the screen area above the moon
            const startX = (Math.random() - 0.5) * 20;
            const startY = (Math.random() - 0.3) * 8 + 2;
            const startZ = -3 + Math.random() * 4;

            const waveFreq = 0.3 + Math.random() * 0.5;
            const waveAmp = 0.15 + Math.random() * 0.25;
            const length = 6 + Math.random() * 8;

            for (let p = 0; p < pointCount; p++) {
                const t = p / pointCount;
                const x = startX + t * length;
                const y = startY + Math.sin(t * Math.PI * 2 * waveFreq) * waveAmp;
                const z = startZ + Math.cos(t * Math.PI * waveFreq * 0.5) * 0.3;
                points.push(new THREE.Vector3(x, y, z));
            }

            const curve = new THREE.CatmullRomCurve3(points);
            const lineGeo = new THREE.TubeGeometry(curve, pointCount, 0.012 + Math.random() * 0.015, 4, false);
            const lineMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(
                    0.58 + Math.random() * 0.08,  // Blue-ish hue
                    0.3 + Math.random() * 0.3,
                    0.55 + Math.random() * 0.2
                ),
                transparent: true,
                opacity: 0.15 + Math.random() * 0.2,
            });

            const lineMesh = new THREE.Mesh(lineGeo, lineMat);
            this.dustGroup.add(lineMesh);
        }

        // Some small wisp/hash marks (like the bird-like marks in the sketch)
        const wispCount = this.isMobile ? 4 : 8;
        for (let w = 0; w < wispCount; w++) {
            const wispPoints = [];
            const wx = 3 + Math.random() * 8;
            const wy = 3 + Math.random() * 5;
            const wz = -2 + Math.random() * 3;

            // Small 3-stroke wisp
            for (let s = 0; s < 3; s++) {
                const subPoints = [];
                const offsetY = s * 0.2;
                for (let p = 0; p < 8; p++) {
                    const t = p / 7;
                    subPoints.push(new THREE.Vector3(
                        wx + t * 0.8 - s * 0.1,
                        wy + offsetY + Math.sin(t * 3) * 0.08,
                        wz
                    ));
                }
                const wispCurve = new THREE.CatmullRomCurve3(subPoints);
                const wispGeo = new THREE.TubeGeometry(wispCurve, 8, 0.01, 3, false);
                const wispMat = new THREE.MeshBasicMaterial({
                    color: 0x6080b0,
                    transparent: true,
                    opacity: 0.12 + Math.random() * 0.15,
                });
                this.dustGroup.add(new THREE.Mesh(wispGeo, wispMat));
            }
        }
    }

    // Set moon surface tint dynamically
    setMoonColor(colorName) {
        if (!this.moon) return;
        const geo = this.moon.geometry;
        const colors = geo.attributes.color.array;
        const posAttr = geo.attributes.position;
        const vertex = new THREE.Vector3();

        let baseR, baseG, baseB;
        if (colorName === 'lunar') { baseR = 0.72; baseG = 0.74; baseB = 0.80; }
        else if (colorName === 'blue moon') { baseR = 0.55; baseG = 0.62; baseB = 0.82; }
        else if (colorName === 'gold') { baseR = 0.82; baseG = 0.72; baseB = 0.50; }
        else return;

        for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            const dir = vertex.clone().normalize();

            let r = baseR, g = baseG, b = baseB;

            // Re-apply crater darkening
            for (const crater of this.craters) {
                const dist = dir.distanceTo(crater.pos);
                if (dist < crater.radius) {
                    const t = dist / crater.radius;
                    if (crater.isBig && t < 0.85) {
                        const colorBlend = 1.0 - (t / 0.85);
                        r -= colorBlend * 0.25;
                        g -= colorBlend * 0.22;
                        b -= colorBlend * 0.08;
                    }
                    if (!crater.isBig && t < 0.8) {
                        const colorBlend = (1.0 - t / 0.8) * 0.5;
                        r -= colorBlend * 0.08;
                        g -= colorBlend * 0.06;
                        b -= colorBlend * 0.02;
                    }
                }
            }

            colors[i * 3] = Math.max(0, Math.min(1, r));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
        }

        geo.attributes.color.needsUpdate = true;
    }

    // Set moon rotation speed
    setMoonSpeed(sizeName) {
        if (sizeName === 'small') this.moonRotationSpeed = 0.0002;
        else if (sizeName === 'medium') this.moonRotationSpeed = 0.0005;
        else if (sizeName === 'large') this.moonRotationSpeed = 0.0015;
    }

    // Bind GUI control buttons
    initControlPanelEvents() {
        // Wave Style selectors (controls moon rotation style)
        document.querySelectorAll('#wave-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#wave-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.moonStyle = btn.dataset.wave;
            });
        });

        // Color selectors
        document.querySelectorAll('#color-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#color-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setMoonColor(btn.dataset.color);
            });
        });

        // Speed selectors
        document.querySelectorAll('#size-selectors .ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#size-selectors .ctrl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setMoonSpeed(btn.dataset.size);
            });
        });

        // Toggle Control Panel
        const controlPanel = document.getElementById('controlPanel');
        const closeBtn = document.getElementById('closePanelBtn');
        const openBtn = document.getElementById('openPanelBtn');

        if (controlPanel && closeBtn && openBtn) {
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                gsap.set(controlPanel, { y: '100%', opacity: 0, visibility: 'hidden' });
                gsap.set(openBtn, { scale: 1, opacity: 1, visibility: 'visible' });
            } else {
                gsap.set(controlPanel, { x: 0, opacity: 1, visibility: 'visible' });
                gsap.set(openBtn, { scale: 0.9, opacity: 0, visibility: 'hidden' });
            }

            closeBtn.addEventListener('click', () => {
                const currentIsMobile = window.innerWidth <= 768;
                gsap.timeline()
                    .to(controlPanel, { 
                        x: currentIsMobile ? 0 : -150, 
                        y: currentIsMobile ? '100%' : 0,
                        opacity: 0, 
                        duration: 0.4, 
                        ease: 'power2.inOut',
                        onComplete: () => {
                            gsap.set(controlPanel, { visibility: 'hidden' });
                        }
                    })
                    .to(openBtn, { 
                        scale: 1, 
                        opacity: 1, 
                        visibility: 'visible', 
                        duration: 0.3, 
                        ease: 'back.out(1.7)' 
                    }, '-=0.1');
            });

            openBtn.addEventListener('click', () => {
                const currentIsMobile = window.innerWidth <= 768;
                gsap.timeline()
                    .to(openBtn, { 
                        scale: 0.9, 
                        opacity: 0, 
                        duration: 0.3, 
                        ease: 'power2.in',
                        onComplete: () => {
                            gsap.set(openBtn, { visibility: 'hidden' });
                        }
                    })
                    .set(controlPanel, { visibility: 'visible' })
                    .to(controlPanel, { 
                        x: 0, 
                        y: 0,
                        opacity: 1, 
                        duration: 0.4, 
                        ease: 'power2.out' 
                    }, '-=0.1');
            });
        }
    }

    // Hamburger Menu Toggle for Mobile Navigation
    initHamburger() {
        const hamburger = document.getElementById('hamburgerBtn');
        const navLinks = document.querySelector('.nav-links');
        if (!hamburger || !navLinks) return;

        hamburger.addEventListener('click', () => {
            const isOpen = navLinks.classList.contains('open');
            if (isOpen) {
                this.closeNav(hamburger, navLinks);
            } else {
                this.openNav(hamburger, navLinks);
            }
        });

        navLinks.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks.classList.contains('open')) {
                    this.closeNav(hamburger, navLinks);
                }
            });
        });
    }

    openNav(hamburger, navLinks) {
        hamburger.classList.add('active');
        navLinks.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeNav(hamburger, navLinks) {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
    }

    // 6. Setup Post-processing Glow via UnrealBloomPass
    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.3,    // strength
            0.4,    // radius
            0.85    // threshold
        );
        this.composer.addPass(this.bloomPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    // 7. ScrollTrigger: Moon rises from bottom to top as user scrolls
    initScrollAnimations() {
        gsap.registerPlugin(ScrollTrigger);

        // Set initial visibility
        gsap.set('#sec-hero', { autoAlpha: 1, y: 0, pointerEvents: 'auto' });
        gsap.set(['#sec-about', '#sec-cv', '#sec-projects', '#sec-contact'], { autoAlpha: 0, y: 30, pointerEvents: 'none' });

        const moonRadius = this.isMobile ? 8 : 12;
        // Starting Y: moon mostly hidden below
        const startY = -(moonRadius + (this.isMobile ? 4 : 5));
        // End Y: moon rises but not all the way to full moon
        const endY = -(moonRadius + (this.isMobile ? 2 : 3));

        // Scroll Timeline
        this.scrollTimeline = gsap.timeline({
            scrollTrigger: {
                trigger: '#scroll-height-generator',
                start: 'top top',
                end: 'bottom bottom',
                scrub: this.isMobile ? 0.5 : 0.8
            }
        });

        this.scrollTimeline
            // --- Phase 1: Hero to About ---
            // Moon rises and shifts slightly to the right
            .to('#sec-hero', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('.scroll-indicator', { autoAlpha: 0, duration: 0.5 }, '<')
            .to('#sec-about', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { 
                x: this.isMobile ? 0.5 : 1.5, 
                y: startY + (endY - startY) * 0.33,
                z: 0,
                duration: 1 
            }, '<')
            .to(this.meshGroup.rotation, { y: 0.15, duration: 1 }, '<')

            // --- Phase 2: About to CV ---
            .to('#sec-about', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('#sec-cv', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { 
                x: this.isMobile ? 0 : 0, 
                y: startY + (endY - startY) * 0.66,
                z: 0,
                duration: 1 
            }, '<')
            .to(this.meshGroup.rotation, { y: 0.25, duration: 1 }, '<')

            // --- Phase 3: CV to Projects ---
            // Moon continues rising, shifts to the left
            .to('#sec-cv', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('#sec-projects', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { 
                x: this.isMobile ? -0.5 : -2, 
                y: startY + (endY - startY) * 0.85,
                z: 0,
                duration: 1 
            }, '<')
            .to(this.meshGroup.rotation, { y: 0.35, duration: 1 }, '<')

            // --- Phase 4: Projects to Contact ---
            // Moon almost at highest point in view but still huge and bottom-heavy
            .to('#sec-projects', { autoAlpha: 0, y: -40, pointerEvents: 'none', duration: 1 })
            .to('#sec-contact', { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: 1 }, '<')
            .to(this.meshGroup.position, { 
                x: 0, 
                y: endY,
                z: 0,
                duration: 1 
            }, '<')
            .to(this.meshGroup.rotation, { y: 0.55, duration: 1 }, '<');

        ScrollTrigger.refresh();
    }

    // 8. Navigation
    initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        ScrollTrigger.create({
            trigger: '#scroll-height-generator',
            start: 'top top',
            end: 'bottom bottom',
            onUpdate: (self) => {
                const progress = self.progress;
                let activeIndex = 0;
                
                if (progress > 0.85) activeIndex = 4;
                else if (progress > 0.6) activeIndex = 3;
                else if (progress > 0.35) activeIndex = 2;
                else if (progress > 0.1) activeIndex = 1;
                
                navLinks.forEach((link, idx) => {
                    if (idx === activeIndex) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetIdx = parseInt(link.getAttribute('data-section'));
                const totalScroll = document.getElementById('scroll-height-generator').offsetHeight - window.innerHeight;
                const scrollPos = (targetIdx / 4) * totalScroll;
                window.scrollTo({ top: scrollPos, behavior: 'smooth' });
            });
        });

        document.querySelectorAll('button[data-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetIdx = parseInt(btn.getAttribute('data-section'));
                const totalScroll = document.getElementById('scroll-height-generator').offsetHeight - window.innerHeight;
                const scrollPos = (targetIdx / 4) * totalScroll;
                window.scrollTo({ top: scrollPos, behavior: 'smooth' });
            });
        });
    }

    // 9. Custom Cursor
    initCursor() {
        const dot = document.querySelector('.custom-cursor-dot');
        const outline = document.querySelector('.custom-cursor-outline');

        if (dot && outline) {
            window.addEventListener('mousemove', (e) => {
                gsap.to(dot, { x: e.clientX, y: e.clientY, duration: 0 });
                gsap.to(outline, { x: e.clientX, y: e.clientY, duration: 0.15, ease: 'power2.out' });
            });

            const hoverables = document.querySelectorAll('a, button, .project-card');
            hoverables.forEach(el => {
                el.addEventListener('mouseenter', () => {
                    dot.classList.add('hover');
                    outline.classList.add('hover');
                });
                el.addEventListener('mouseleave', () => {
                    dot.classList.remove('hover');
                    outline.classList.remove('hover');
                });
            });
        }
    }

    // 10. Mouse Parallax
    initMouseEvents() {
        window.addEventListener('mousemove', (e) => {
            this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        document.addEventListener('visibilitychange', () => {
            this.isTabActive = !document.hidden;
        });
    }

    // Dynamic resizing
    initResize() {
        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            this.isMobile = width <= 768;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));

            this.composer.setSize(width, height);
            this.bloomPass.setSize(width, height);
            
            ScrollTrigger.refresh();
        });
    }

    // Render loop
    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isTabActive) return;

        const time = Date.now() * 0.001;

        // 1. Rotate moon slowly
        if (this.moon) {
            let rotSpeed = this.moonRotationSpeed;
            
            if (this.moonStyle === 'calm') {
                this.moon.rotation.y += rotSpeed;
            } else if (this.moonStyle === 'storm') {
                this.moon.rotation.y += rotSpeed * 3;
                this.moon.rotation.x = Math.sin(time * 0.3) * 0.04;
            } else if (this.moonStyle === 'digital') {
                this.moon.rotation.y = Math.floor(time * 0.3) * 0.15;
            }
        }

        // 2. Star slow rotation for subtle twinkle
        if (this.stars) {
            this.stars.rotation.y += 0.00003;
            this.stars.rotation.x += 0.00001;
        }

        // 3. Animate dust lines subtly
        if (this.dustGroup) {
            this.dustGroup.children.forEach((child, i) => {
                child.position.x += Math.sin(time * 0.2 + i * 0.5) * 0.0003;
                child.position.y += Math.cos(time * 0.15 + i * 0.3) * 0.0002;
            });
        }

        // 4. Mouse parallax interpolation
        this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.04;
        this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.04;

        // 5. Apply parallax (subtle for the massive moon)
        if (this.parallaxGroup) {
            this.parallaxGroup.position.x = this.mouse.x * 0.2;
            this.parallaxGroup.position.y = this.mouse.y * 0.15;
            
            this.parallaxGroup.rotation.y = this.mouse.x * 0.05;
            this.parallaxGroup.rotation.x = -this.mouse.y * 0.03;
        }

        // 6. Camera look
        if (this.camera) {
            this.camera.lookAt(0, 0, 0);
        }

        // 7. Render with post-processing
        this.composer.render();
    }
}

// Start app on full window load
window.addEventListener('load', () => {
    new App();
});
