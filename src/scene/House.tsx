import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { flockAge, flockOf } from '../sim/engine';
import { layRate } from '../sim/flock';
import type { House as HouseT } from '../sim/types';
import { useSimStore } from '../state/useSimStore';
import { Label } from './Label';
import { beltEggFraction, feedLevel, houseActivity, housePos, HOUSE_H, HOUSE_L, HOUSE_W } from './layout';
import { lampMaterial } from './materials';

// ---------- โครงสร้างกรงตับ A-frame (ใช้ร่วมกันทุกโรงเรือน) ----------

const ROW_X = [-2.6, 2.6];
const TIERS = 3;
const CELLS = 14;
const CAGE_LEN = HOUSE_L - 4;
const CELL_STEP = CAGE_LEN / CELLS;
const EGGS_PER_BLOCK = 22;

interface Block {
  x: number;
  y: number;
  s: 1 | -1; // ด้านที่ไก่หันหน้า (ไปทางรางอาหาร)
}

const BLOCKS: Block[] = [];
for (const rx of ROW_X)
  for (const s of [-1, 1] as const)
    for (let k = 0; k < TIERS; k++) BLOCKS.push({ x: rx + s * (0.42 + (TIERS - 1 - k) * 0.2), y: 0.5 + k * 0.6, s });

export const CHICKEN_SLOTS = BLOCKS.length * CELLS;

function cageWireGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  const seg = (a: number[], b: number[]) => pts.push(...a, ...b);
  const z0 = -CAGE_LEN / 2;
  const z1 = CAGE_LEN / 2;
  for (const b of BLOCKS) {
    const xi = b.x - b.s * 0.32;
    const xo = b.x + b.s * 0.32;
    const yb = b.y - 0.22;
    const yt = b.y + 0.22;
    for (const [x, y] of [[xi, yb], [xi, yt], [xo, yb], [xo, yt]]) seg([x, y, z0], [x, y, z1]);
    for (let j = 0; j <= CELLS; j++) {
      const z = z0 + j * CELL_STEP;
      seg([xi, yb, z], [xi, yt, z]);
      seg([xo, yb, z], [xo, yt, z]);
      seg([xi, yt, z], [xo, yt, z]);
      for (let q = 1; q < 4; q++) {
        const zz = z + (q * CELL_STEP) / 4;
        if (j < CELLS) seg([xo, yb, zz], [xo, yt, zz]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

const wireGeom = cageWireGeometry();
const wireMat = new THREE.LineBasicMaterial({ color: '#8d969e' });
const troughGeom = new THREE.BoxGeometry(0.2, 0.12, CAGE_LEN);
const troughMat = new THREE.MeshStandardMaterial({ color: '#d7dbe0', flatShading: true });
const feedGeom = new THREE.BoxGeometry(0.15, 0.1, CAGE_LEN - 0.1);
feedGeom.translate(0, 0.05, 0);
const feedMat = new THREE.MeshStandardMaterial({ color: '#c9a04a', flatShading: true });
const floorGeom = new THREE.BoxGeometry(0.75, 0.03, CAGE_LEN);
const floorMat = new THREE.MeshStandardMaterial({ color: '#a7aeb5' });
const pipeGeom = new THREE.CylinderGeometry(0.025, 0.025, CAGE_LEN, 6);
pipeGeom.rotateX(Math.PI / 2);
const pipeMat = new THREE.MeshStandardMaterial({ color: '#e9eef2' });
const nippleGeom = new THREE.CylinderGeometry(0.025, 0.035, 0.08, 6);
const nippleMat = new THREE.MeshStandardMaterial({ color: '#d33b2c' });
const eggGeom = new THREE.SphereGeometry(0.055, 7, 5);
eggGeom.scale(1, 1.3, 1);
const eggMat = new THREE.MeshStandardMaterial({ color: '#e9c9a1', roughness: 0.6 });
const bodyGeom = new THREE.SphereGeometry(0.17, 7, 5);
const bodyMat = new THREE.MeshStandardMaterial({ color: '#b2612f', flatShading: true });
const headGeom = new THREE.SphereGeometry(0.085, 6, 4);
const headMat = new THREE.MeshStandardMaterial({ color: '#c47a45', flatShading: true });
const combGeom = new THREE.BoxGeometry(0.03, 0.07, 0.09);
const combMat = new THREE.MeshStandardMaterial({ color: '#e0302a', flatShading: true });
const manureMat = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 1, flatShading: true });
const manureGeom = new THREE.BoxGeometry(2.6, 1, CAGE_LEN);
manureGeom.translate(0, 0.5, 0);

/** ลำดับช่องกรงแบบสลับ เพื่อให้ไก่จำนวนน้อยกระจายทั่วโรงเรือน */
const SLOT_ORDER = (() => {
  const idx = Array.from({ length: CHICKEN_SLOTS }, (_, i) => i);
  let seed = 7;
  for (let i = idx.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
})();

function slotInfo(slot: number) {
  const b = BLOCKS[Math.floor(slot / CELLS)];
  const j = slot % CELLS;
  return { b, z: -CAGE_LEN / 2 + (j + 0.5) * CELL_STEP };
}

const dummy = new THREE.Object3D();

function Cages({ house }: { house: HouseT }) {
  const body = useRef<THREE.InstancedMesh>(null!);
  const head = useRef<THREE.InstancedMesh>(null!);
  const comb = useRef<THREE.InstancedMesh>(null!);
  const eggs = useRef<THREE.InstancedMesh>(null!);
  const nipples = useRef<THREE.InstancedMesh>(null!);
  const feeds = useRef<THREE.Mesh[]>([]);
  const manure = useRef<THREE.Group>(null!);

  useLayoutEffect(() => {
    SLOT_ORDER.forEach((slot, i) => {
      const { b, z } = slotInfo(slot);
      dummy.position.set(b.x, b.y - 0.08, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.25, 0.95, 0.85);
      dummy.updateMatrix();
      body.current.setMatrixAt(i, dummy.matrix);
    });
    body.current.instanceMatrix.needsUpdate = true;
    let n = 0;
    // วนช่องก่อนแล้วค่อยวนกรง เพื่อให้ไข่จำนวนน้อยกระจายทุกแถว
    for (let j = 0; j < EGGS_PER_BLOCK; j++)
      for (const b of BLOCKS) {
        dummy.position.set(b.x + b.s * 0.47, b.y - 0.17, -CAGE_LEN / 2 + ((j + 0.5) * CAGE_LEN) / EGGS_PER_BLOCK + (j % 3) * 0.1);
        dummy.rotation.set(0, 0, Math.PI / 2.4);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        eggs.current.setMatrixAt(n++, dummy.matrix);
      }
    eggs.current.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const b of BLOCKS)
      for (let j = 0; j < CELLS; j++) {
        dummy.position.set(b.x - b.s * 0.15, b.y + 0.12, -CAGE_LEN / 2 + (j + 0.5) * CELL_STEP);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        nipples.current.setMatrixAt(n++, dummy.matrix);
      }
    nipples.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const { sim } = useSimStore.getState();
    const f = flockOf(sim, house);
    const hens = f?.hens ?? 0;
    const visible = Math.min(CHICKEN_SLOTS, hens, Math.round((CHICKEN_SLOTS * hens) / Math.max(1, house.capacity)));
    body.current.count = visible;
    head.current.count = visible;
    comb.current.count = visible;

    const level = feedLevel(house, sim.time);
    const eating = level > 0.15;
    const tt = clock.elapsedTime;
    for (let i = 0; i < visible; i++) {
      const { b, z } = slotInfo(SLOT_ORDER[i]);
      const peck = eating ? Math.max(0, Math.sin(tt * 5 + i * 1.7)) : 0;
      dummy.position.set(b.x + b.s * (0.15 + peck * 0.08), b.y + 0.05 - peck * 0.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      head.current.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.08;
      dummy.position.x -= b.s * 0.01;
      dummy.updateMatrix();
      comb.current.setMatrixAt(i, dummy.matrix);
    }
    head.current.instanceMatrix.needsUpdate = true;
    comb.current.instanceMatrix.needsUpdate = true;

    for (const m of feeds.current) if (m) m.scale.y = Math.max(0.05, level);

    const belt = beltEggFraction(sim.time);
    const eggFrac = (house.pendingEggs / Math.max(1, house.capacity * 0.95)) * belt;
    eggs.current.count = Math.min(Math.round(house.pendingEggs * belt), Math.round(Math.min(1, eggFrac) * BLOCKS.length * EGGS_PER_BLOCK));

    const manureFrac = house.manureKg / Math.max(1, house.capacity * sim.settings.manureKgPerHenDay * 2);
    manure.current.scale.y = 0.02 + Math.min(1.2, manureFrac) * 0.18;
  });

  return (
    <group>
      <lineSegments geometry={wireGeom} material={wireMat} />
      {BLOCKS.map((b, i) => (
        <group key={i}>
          <mesh geometry={floorGeom} material={floorMat} position={[b.x, b.y - 0.22, 0]} rotation={[0, 0, b.s * 0.12]} />
          <mesh geometry={troughGeom} material={troughMat} position={[b.x + b.s * 0.45, b.y - 0.02, 0]} castShadow />
          <mesh
            ref={(m) => {
              if (m) feeds.current[i] = m;
            }}
            geometry={feedGeom}
            material={feedMat}
            position={[b.x + b.s * 0.45, b.y - 0.06, 0]}
          />
          <mesh geometry={pipeGeom} material={pipeMat} position={[b.x - b.s * 0.15, b.y + 0.18, 0]} />
        </group>
      ))}
      <instancedMesh ref={nipples} args={[nippleGeom, nippleMat, BLOCKS.length * CELLS]} />
      <instancedMesh ref={body} args={[bodyGeom, bodyMat, CHICKEN_SLOTS]} castShadow />
      <instancedMesh ref={head} args={[headGeom, headMat, CHICKEN_SLOTS]} />
      <instancedMesh ref={comb} args={[combGeom, combMat, CHICKEN_SLOTS]} />
      <instancedMesh ref={eggs} args={[eggGeom, eggMat, BLOCKS.length * EGGS_PER_BLOCK]} />
      <group ref={manure}>
        {ROW_X.map((x) => (
          <mesh key={x} geometry={manureGeom} material={manureMat} position={[x, 0.11, 0]} receiveShadow />
        ))}
      </group>
      {/* ขาตั้งกรง */}
      {ROW_X.map((x) =>
        [-1, 0, 1].map((q) => (
          <mesh key={`${x}${q}`} position={[x, 1.0, (q * CAGE_LEN) / 2.1]}>
            <boxGeometry args={[0.06, 2, 0.06]} />
            <meshStandardMaterial color="#7d858c" />
          </mesh>
        )),
      )}
    </group>
  );
}

// ---------- ตัวโรงเรือน ----------

const POST_Z = Array.from({ length: 7 }, (_, i) => -HOUSE_L / 2 + (i * HOUSE_L) / 6);
const roofMat = new THREE.MeshStandardMaterial({ color: '#8fa3b5', flatShading: true, side: THREE.DoubleSide });
const postMat = new THREE.MeshStandardMaterial({ color: '#6f7a83' });
const curtainMat = new THREE.MeshStandardMaterial({ color: '#2f6fb3', flatShading: true });
const slabMat = new THREE.MeshStandardMaterial({ color: '#cfc8b8' });

export function House({ house, index }: { house: HouseT; index: number }) {
  const [x, z] = housePos(index);
  const showRoof = useSimStore((s) => s.showRoof);
  const select = () => {
    useSimStore.getState().set({ selected: { kind: 'house', id: house.id } });
    useSimStore.getState().focusOn(x, z, 30);
  };
  const roofPitch = 0.32;
  const halfSpan = HOUSE_W / 2 + 0.6;
  const roofLen = halfSpan / Math.cos(roofPitch);

  return (
    <group position={[x, 0, z]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
      >
        <mesh position={[0, 0.06, 0]} receiveShadow material={slabMat}>
          <boxGeometry args={[HOUSE_W + 0.6, 0.12, HOUSE_L + 0.6]} />
        </mesh>
        {POST_Z.flatMap((pz) =>
          [-1, 1].map((s) => (
            <mesh key={`${pz}${s}`} position={[(s * HOUSE_W) / 2, HOUSE_H / 2, pz]} material={postMat} castShadow>
              <boxGeometry args={[0.15, HOUSE_H, 0.15]} />
            </mesh>
          )),
        )}
        {/* ม่านข้าง */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * HOUSE_W) / 2, 0.55, 0]} material={curtainMat}>
            <boxGeometry args={[0.05, 0.9, HOUSE_L]} />
          </mesh>
        ))}
        {/* ผนังท้าย (cooling pad) */}
        <mesh position={[0, HOUSE_H / 2, -HOUSE_L / 2]}>
          <boxGeometry args={[HOUSE_W, HOUSE_H, 0.12]} />
          <meshStandardMaterial color="#7c9d6a" flatShading />
        </mesh>
        {/* ประตูหน้า */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.1, 1.1, HOUSE_L / 2]} material={postMat}>
            <boxGeometry args={[0.12, 2.2, 0.12]} />
          </mesh>
        ))}
        <mesh position={[0, 2.25, HOUSE_L / 2]} material={postMat}>
          <boxGeometry args={[2.4, 0.12, 0.12]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * (HOUSE_W / 2 + 1.1)) / 2 + s * 0.7, 1.4, HOUSE_L / 2]}>
            <boxGeometry args={[HOUSE_W / 2 - 1.2, 2.8, 0.08]} />
            <meshStandardMaterial color="#e6e1d6" flatShading />
          </mesh>
        ))}
        {showRoof && (
          <group position={[0, HOUSE_H, 0]}>
            {[-1, 1].map((s) => (
              <mesh
                key={s}
                position={[(s * halfSpan) / 2, Math.tan(roofPitch) * (halfSpan / 2), 0]}
                rotation={[0, 0, -s * roofPitch]}
                material={roofMat}
                castShadow
              >
                <boxGeometry args={[roofLen, 0.08, HOUSE_L + 1.4]} />
              </mesh>
            ))}
            <mesh position={[0, Math.tan(roofPitch) * halfSpan + 0.05, 0]}>
              <boxGeometry args={[0.5, 0.12, HOUSE_L + 1.4]} />
              <meshStandardMaterial color="#6b7f91" />
            </mesh>
          </group>
        )}
        {/* ไฟในโรงเรือน */}
        {[-HOUSE_L / 3, 0, HOUSE_L / 3].map((lz) => (
          <mesh key={lz} position={[0, HOUSE_H - 0.1, lz]} material={lampMaterial}>
            <boxGeometry args={[0.3, 0.08, 1.2]} />
          </mesh>
        ))}
        <Cages house={house} />
      </group>

      {/* ไซโลอาหาร + ถังน้ำ */}
      <group position={[HOUSE_W / 2 + 1.8, 0, -HOUSE_L / 2 + 3]}>
        <mesh position={[0, 2.6, 0]} castShadow>
          <cylinderGeometry args={[1, 1, 3, 10]} />
          <meshStandardMaterial color="#d6dde4" flatShading metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <coneGeometry args={[1, 1.1, 10]} />
          <meshStandardMaterial color="#c3cbd3" flatShading />
        </mesh>
        <mesh position={[0, 4.45, 0]}>
          <coneGeometry args={[1, 0.7, 10]} />
          <meshStandardMaterial color="#b9c3cc" flatShading />
        </mesh>
        <Label position={[0, 5.4, 0]} small>
          ไซโลอาหาร
        </Label>
      </group>
      <group position={[HOUSE_W / 2 + 1.6, 0, HOUSE_L / 2 - 3]}>
        {[-1, 1].flatMap((a) =>
          [-1, 1].map((b) => (
            <mesh key={`${a}${b}`} position={[a * 0.45, 0.9, b * 0.45]} material={postMat}>
              <boxGeometry args={[0.08, 1.8, 0.08]} />
            </mesh>
          )),
        )}
        <mesh position={[0, 2.35, 0]} castShadow>
          <cylinderGeometry args={[0.7, 0.7, 1.1, 12]} />
          <meshStandardMaterial color="#2f7fd6" flatShading />
        </mesh>
        <mesh position={[-1, 2.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 1.6, 6]} />
          <meshStandardMaterial color="#e9eef2" />
        </mesh>
        <Label position={[0, 3.4, 0]} small>
          ถังน้ำ nipple
        </Label>
      </group>

      <HouseLabel house={house} index={index} />
    </group>
  );
}

function HouseLabel({ house, index }: { house: HouseT; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useFrame(() => {
    const { sim } = useSimStore.getState();
    const f = flockOf(sim, house);
    const act = houseActivity(sim, index, sim.time);
    const txt = f
      ? `${f.name} · ${f.hens.toLocaleString()} ตัว · ${flockAge(sim, f).toFixed(0)} สัปดาห์ · ไข่ ${(layRate(flockAge(sim, f), sim.settings.layRate) * 100).toFixed(0)}%${act ? ' · ' + act : ''}`
      : 'ว่าง (ยังไม่มีไก่)';
    if (txt !== last.current && ref.current) {
      ref.current.textContent = txt;
      last.current = txt;
    }
  });
  return useMemo(
    () => (
      <Label position={[0, HOUSE_H + 2.6, HOUSE_L / 2]} title={house.name}>
        <span ref={ref} />
      </Label>
    ),
    [house.name],
  );
}
