import { Line, OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { minuteOfDay } from '../sim/schedule';
import { useSim, useSimStore } from '../state/useSimStore';
import { FarmStall, GradingStation, StaffHouse, Storefront, Truck } from './Buildings';
import { House } from './House';
import { Label } from './Label';
import { employeePath, FARM_STALL, farmBounds, GRADING, overview, ROAD_Z, STAFF_HOUSE, STORE, TRUCK_PATH, type V2 } from './layout';
import { lampMaterial, windowMaterial } from './materials';
import { Customers, Employees } from './People';

function SimDriver() {
  const advance = useSimStore((s) => s.advance);
  useFrame((_, dt) => advance(dt));
  return null;
}

// ---------- แสงตามเวลาของวัน ----------

const SKY_NIGHT = new THREE.Color('#0f1a33');
const SKY_DAWN = new THREE.Color('#f2b27e');
const SKY_DAY = new THREE.Color('#a9d8f2');
const SUN_WARM = new THREE.Color('#ffb46b');
const SUN_DAY = new THREE.Color('#fff6e5');
const MOON = new THREE.Color('#9db4ff');

function DayLight({ center }: { center: V2 }) {
  const sun = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const stars = useRef<THREE.Group>(null!);
  const { scene } = useThree();
  const bg = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 160, 420);
    scene.add(sun.current.target);
    return () => {
      scene.remove(sun.current.target);
    };
  }, [scene, bg]);

  useFrame(() => {
    const t = useSimStore.getState().sim.time;
    const h = minuteOfDay(t) / 60;
    const ang = ((h - 6) / 12) * Math.PI; // 0 = 6 โมงเช้า, π = 6 โมงเย็น
    const elev = Math.sin(ang);
    const up = Math.max(0, elev);
    const low = 1 - Math.min(1, up * 3);

    if (elev > 0) {
      sun.current.position.set(center[0] - Math.cos(ang) * 110, 15 + up * 110, center[1] + 50);
      sun.current.color.copy(SUN_DAY).lerp(SUN_WARM, low);
      sun.current.intensity = 0.6 + up * 2.2;
    } else {
      sun.current.position.set(center[0] + 60, 90, center[1] + 40);
      sun.current.color.copy(MOON);
      sun.current.intensity = 0.12;
    }
    sun.current.target.position.set(center[0], 0, center[1]);
    hemi.current.intensity = 0.1 + up * 0.9;

    const dayness = Math.min(1, Math.max(0, (elev + 0.15) / 0.5));
    bg.copy(SKY_NIGHT).lerp(SKY_DAWN, dayness).lerp(SKY_DAY, Math.min(1, up * 2.2));
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(bg);

    const night = 1 - dayness;
    lampMaterial.emissiveIntensity = night * 2.2;
    windowMaterial.emissiveIntensity = night * 1.5;
    stars.current.visible = night > 0.5;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#dff1ff', '#6b7d4a', 0.8]} />
      <ambientLight intensity={0.08} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-far={400}
        shadow-bias={-0.0005}
      />
      <group ref={stars}>
        <Stars radius={260} depth={40} count={1500} factor={5} fade speed={0.5} />
      </group>
    </>
  );
}

// ---------- กล้อง ----------

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null!);
  const focus = useSimStore((s) => s.focus);
  const autoRotate = useSimStore((s) => s.autoRotate);
  const { camera } = useThree();
  const anim = useRef<{ t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null>(null);

  // เปิดมาให้กล้องจับภาพรวมฟาร์มพอดี
  useEffect(() => {
    const o = overview(useSimStore.getState().sim);
    const t = new THREE.Vector3(o.x, 0, o.z);
    controls.current.target.copy(t);
    camera.position.copy(t).add(new THREE.Vector3(0.3, 0.72, 0.62).normalize().multiplyScalar(o.zoom));
    controls.current.update();
  }, [camera]);

  useEffect(() => {
    if (!focus || !controls.current) return;
    const c = controls.current;
    const toT = new THREE.Vector3(focus.x, 0, focus.z);
    const dir = camera.position.clone().sub(c.target).normalize();
    const dist = focus.zoom ?? camera.position.distanceTo(c.target);
    anim.current = { t: 0, fromT: c.target.clone(), toT, fromP: camera.position.clone(), toP: toT.clone().add(dir.multiplyScalar(dist)) };
  }, [focus, camera]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt * 1.4);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.current.target.lerpVectors(a.fromT, a.toT, k);
    camera.position.lerpVectors(a.fromP, a.toP, k);
    if (a.t >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={1.42}
      minDistance={6}
      maxDistance={260}
      autoRotate={autoRotate}
      autoRotateSpeed={0.4}
    />
  );
}

// ---------- พื้น ถนน ต้นไม้ ----------

function Ground({ bounds }: { bounds: ReturnType<typeof farmBounds> }) {
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const roadStart = STORE[0] - 45;
  const roadEnd = bounds.maxX + 40;
  const dashes = Math.floor((roadEnd - roadStart) / 4);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={() => useSimStore.getState().set({ selected: null })}>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#8dbb68" />
      </mesh>
      {/* ลานฟาร์ม */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bounds.minX + bounds.maxX) / 2 - 8, 0.02, (bounds.minZ + bounds.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[w + 26, d + 6]} />
        <meshStandardMaterial color="#d6c79f" />
      </mesh>
      {/* ถนน */}
      <mesh position={[(roadStart + roadEnd) / 2, 0.05, ROAD_Z]} receiveShadow>
        <boxGeometry args={[roadEnd - roadStart, 0.06, 5]} />
        <meshStandardMaterial color="#5d6168" />
      </mesh>
      {Array.from({ length: dashes }, (_, i) => (
        <mesh key={i} position={[roadStart + 2 + i * 4, 0.09, ROAD_Z]}>
          <boxGeometry args={[2, 0.02, 0.15]} />
          <meshStandardMaterial color="#f2f2f2" />
        </mesh>
      ))}
      {/* ทางเชื่อมจุดคัดไข่ */}
      <mesh position={[GRADING[0], 0.04, (GRADING[1] + ROAD_Z) / 2 + 2]} receiveShadow>
        <boxGeometry args={[4, 0.05, ROAD_Z - GRADING[1] - 2]} />
        <meshStandardMaterial color="#8c8f94" />
      </mesh>
      <Label position={[bounds.maxX - 4, 3, ROAD_Z + 4]} small>
        ทางเข้าฟาร์ม
      </Label>
    </group>
  );
}

const trunkGeom = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 5);
trunkGeom.translate(0, 0.8, 0);
const leafGeom2 = new THREE.IcosahedronGeometry(1.5, 0);
leafGeom2.translate(0, 2.6, 0);

function Trees({ bounds, farmSales }: { bounds: ReturnType<typeof farmBounds>; farmSales: boolean }) {
  const trunk = useRef<THREE.InstancedMesh>(null!);
  const leaf = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    let seed = 42;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const blocked = (x: number, z: number) =>
      (x > bounds.minX - 26 && x < bounds.maxX + 5 && z > bounds.minZ - 5 && z < bounds.maxZ + 3) ||
      Math.abs(z - ROAD_Z) < 5 ||
      (!farmSales && Math.abs(x - STORE[0]) < 12 && Math.abs(z - STORE[1] - 2) < 9) ||
      (Math.abs(x - FARM_STALL[0]) < 6 && Math.abs(z - FARM_STALL[1]) < 6) ||
      (Math.abs(x - STAFF_HOUSE[0]) < 5 && Math.abs(z - STAFF_HOUSE[1]) < 5) ||
      (x > STORE[0] - 32 && x < STORE[0] + 22 && z > ROAD_Z && z < ROAD_Z + 16);
    for (let i = 0; out.length < 160 && i < 3000; i++) {
      const x = STORE[0] - 60 + r() * (bounds.maxX - STORE[0] + 110);
      const z = bounds.minZ - 40 + r() * (bounds.maxZ - bounds.minZ + 90);
      if (!blocked(x, z)) out.push([x, z, 0.7 + r() * 0.8]);
    }
    return out;
  }, [bounds, farmSales]);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    pts.forEach(([x, z, s], i) => {
      d.position.set(x, 0, z);
      d.scale.setScalar(s);
      d.rotation.y = s * 7;
      d.updateMatrix();
      trunk.current.setMatrixAt(i, d.matrix);
      leaf.current.setMatrixAt(i, d.matrix);
      leaf.current.setColorAt(i, new THREE.Color().setHSL(0.27 + (s % 0.1), 0.45, 0.32 + (s % 0.2) * 0.4));
    });
    trunk.current.count = leaf.current.count = pts.length;
    trunk.current.instanceMatrix.needsUpdate = true;
    leaf.current.instanceMatrix.needsUpdate = true;
    if (leaf.current.instanceColor) leaf.current.instanceColor.needsUpdate = true;
  }, [pts]);

  return (
    <>
      <instancedMesh ref={trunk} args={[trunkGeom, undefined, 200]} castShadow>
        <meshStandardMaterial color="#7a5233" flatShading />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[leafGeom2, undefined, 200]} castShadow>
        <meshStandardMaterial color="#ffffff" flatShading />
      </instancedMesh>
    </>
  );
}

function Paths() {
  const sim = useSim();
  const toPts = (p: V2[]) => p.map(([x, z]) => [x, 0.25, z] as [number, number, number]);
  const colors = ['#ff6b35', '#2ec4b6', '#e71d36', '#7b2cbf'];
  return (
    <group>
      {sim.settings.salesMode === 'store' && <Line points={toPts(TRUCK_PATH)} color="#2f6fb3" lineWidth={3} dashed dashSize={1} gapSize={0.6} />}
      {sim.employees
        .filter((e) => e.role === 'farm')
        .map((e, i) => {
          const p = employeePath(sim, e);
          return p.length > 1 ? <Line key={e.id} points={toPts(p)} color={colors[i % colors.length]} lineWidth={2} /> : null;
        })}
    </group>
  );
}

function SceneContent() {
  const sim = useSim();
  const showPaths = useSimStore((s) => s.showPaths);
  const farmSales = sim.settings.salesMode === 'farm';
  const n = sim.houses.length;
  const bounds = useMemo(() => farmBounds(n), [n]);
  const center: V2 = [(STORE[0] + bounds.maxX) / 2, (bounds.minZ + ROAD_Z) / 2];
  return (
    <>
      <SimDriver />
      <DayLight center={center} />
      <CameraRig />
      <Ground bounds={bounds} />
      <Trees bounds={bounds} farmSales={farmSales} />
      {sim.houses.map((h, i) => (
        <House key={h.id} house={h} index={i} />
      ))}
      <GradingStation />
      <StaffHouse />
      {farmSales ? (
        <FarmStall />
      ) : (
        <>
          <Storefront />
          <Truck />
        </>
      )}
      <Employees />
      <Customers />
      {showPaths && <Paths />}
    </>
  );
}

export function FarmScene() {
  const shadows = useSimStore((s) => s.shadows);
  return (
    <Canvas
      key={shadows ? 'shadow' : 'flat'}
      shadows={shadows ? 'soft' : false}
      dpr={[1, 2]}
      camera={{ position: [6, 56, 60], fov: 42, near: 0.5, far: 1200 }}
      gl={{ antialias: true }}
    >
      <SceneContent />
    </Canvas>
  );
}
