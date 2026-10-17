import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { storeStock } from '../sim/engine';
import { GRADE_LABEL, sumGrades, traysFor } from '../sim/grading';
import { GRADES, type GradeCounts } from '../sim/types';
import { useSim, useSimStore } from '../state/useSimStore';
import { Label } from './Label';
import {
  FARM_STALL,
  GRADING,
  GRADING_TABLE,
  STAFF_HOUSE,
  STORE,
  STORE_COUNTER,
  truckPose,
} from './layout';
import { GRADE_HEX, lampMaterial, windowMaterial } from './materials';

const trayGeom = new THREE.BoxGeometry(0.42, 0.07, 0.42);
const trayMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true });
const postMat = new THREE.MeshStandardMaterial({ color: '#6f7a83' });
const woodMat = new THREE.MeshStandardMaterial({ color: '#a8794b', flatShading: true });
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** กองแผงไข่ แยกสีตามเบอร์ — 1 แผงในฉาก แทน `unit` แผงจริง (ไม่ระบุ = ปรับอัตโนมัติให้พอดีที่วาง) */
function TrayStacks({
  counts,
  unit: unitProp,
  perStack = 10,
  maxPerGrade = 40,
  spacing = 0.5,
  rowGap = 0.55,
  vertical = false,
}: {
  counts: GradeCounts;
  unit?: number;
  perStack?: number;
  maxPerGrade?: number;
  spacing?: number;
  rowGap?: number;
  vertical?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const MAX = GRADES.length * maxPerGrade;
  useLayoutEffect(() => {
    const unit = unitProp ?? Math.max(1, Math.ceil(Math.max(...GRADES.map((g) => counts[g])) / maxPerGrade));
    let n = 0;
    GRADES.forEach((g, gi) => {
      const visual = Math.min(maxPerGrade, Math.ceil(counts[g] / unit));
      for (let i = 0; i < visual; i++) {
        const stack = Math.floor(i / perStack);
        const level = i % perStack;
        const a = gi * rowGap;
        const b = stack * spacing;
        dummy.position.set(vertical ? b : a, 0.04 + level * 0.075, vertical ? a : b);
        dummy.updateMatrix();
        ref.current.setMatrixAt(n, dummy.matrix);
        ref.current.setColorAt(n, tmpColor.set(GRADE_HEX[gi]).lerp(new THREE.Color('#efe6d6'), 0.45));
        n++;
      }
    });
    ref.current.count = n;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [counts, unitProp, perStack, maxPerGrade, spacing, rowGap, vertical]);
  return <instancedMesh ref={ref} args={[trayGeom, trayMat, MAX]} castShadow />;
}

function Shed({ w, d, h, color = '#c45a3c' }: { w: number; d: number; h: number; color?: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial color="#d9d3c6" />
      </mesh>
      {[-1, 1].flatMap((a) =>
        [-1, 1].map((b) => (
          <mesh key={`${a}${b}`} position={[(a * (w - 0.3)) / 2, h / 2, (b * (d - 0.3)) / 2]} material={postMat} castShadow>
            <boxGeometry args={[0.15, h, 0.15]} />
          </mesh>
        )),
      )}
      <mesh position={[0, h + 0.15, 0]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[w + 0.8, 0.1, d + 0.8]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, h - 0.05, 0]} material={lampMaterial}>
        <boxGeometry args={[0.6, 0.06, 0.6]} />
      </mesh>
    </group>
  );
}

// ---------- จุดคัดไข่ / แพ็กแผง ----------

export function GradingStation() {
  const sim = useSim();
  const basketEggs = sim.collected.reduce((a, l) => a + l.eggs, 0);
  const waitingEggs = sumGrades(sim.farmEggs);
  const waitingTrays = traysFor(sim.farmEggs, sim.settings.traySize);
  const focus = () => {
    useSimStore.getState().set({ selected: { kind: 'grading' } });
    useSimStore.getState().focusOn(GRADING[0], GRADING[1], 18);
  };
  return (
    <group>
      <group position={[GRADING[0], 0, GRADING[1]]} onClick={(e) => (e.stopPropagation(), focus())}>
        <Shed w={9} d={7} h={3} color="#d0703f" />
      </group>
      {/* โต๊ะคัดไข่ + ตาชั่ง */}
      <group position={[GRADING_TABLE[0], 0, GRADING_TABLE[1]]}>
        <mesh position={[0, 0.85, 0]} material={woodMat} castShadow>
          <boxGeometry args={[5, 0.1, 1.3]} />
        </mesh>
        {[-2.3, 2.3].flatMap((x) =>
          [-0.5, 0.5].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.42, z]} material={woodMat}>
              <boxGeometry args={[0.1, 0.85, 0.1]} />
            </mesh>
          )),
        )}
        <group position={[1.6, 0.9, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.6, 0.2, 0.5]} />
            <meshStandardMaterial color="#e8e8e8" flatShading />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.03, 12]} />
            <meshStandardMaterial color="#9aa3ab" metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.12, 0.26]}>
            <boxGeometry args={[0.3, 0.12, 0.02]} />
            <meshStandardMaterial color="#1e3a2b" emissive="#3cff8a" emissiveIntensity={0.6} />
          </mesh>
        </group>
        {basketEggs > 0 &&
          [-1.6, -0.8, 0].slice(0, Math.min(3, Math.ceil(basketEggs / 1500))).map((x) => (
            <group key={x} position={[x, 0.98, 0]}>
              <mesh>
                <cylinderGeometry args={[0.3, 0.22, 0.25, 8]} />
                <meshStandardMaterial color="#9b6a3c" flatShading />
              </mesh>
              <mesh position={[0, 0.12, 0]}>
                <sphereGeometry args={[0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#f1d9b8" flatShading />
              </mesh>
            </group>
          ))}
      </group>
      {/* แผงไข่ที่แพ็กแล้วรอรถ */}
      <group position={[GRADING[0] + 2.4, 0.12, GRADING[1] - 2.8]}>
        <TrayStacks counts={waitingTrays} perStack={10} maxPerGrade={30} spacing={0.5} />
      </group>
      <Label position={[GRADING[0], 5, GRADING[1]]} title="จุดคัดไข่ · แพ็กแผง">
        {basketEggs > 0
          ? `ไข่รอคัด ${basketEggs.toLocaleString()} ฟอง`
          : waitingEggs > 0
            ? `แพ็กแล้ว ${waitingEggs.toLocaleString()} ฟอง (${sumGrades(waitingTrays)} แผง) ${sim.settings.salesMode === 'farm' ? 'รอวางขาย' : 'รอรถ'}`
            : 'ว่าง'}
      </Label>
    </group>
  );
}

/** ป้ายราคา: ต่อแผง และต่อฟอง */
function PriceBoard() {
  const sim = useSim();
  const { pricePerTray, pricePerEgg } = sim.settings;
  return (
    <div className="price-board">
      <div className="price-row price-board-title">
        <span>ราคา</span>
        <span>แผง · ฟอง</span>
      </div>
      {GRADES.map((g) => (
        <div key={g} className="price-row">
          <span>{GRADE_LABEL[g]}</span>
          <b>
            {pricePerTray[g]} · {pricePerEgg[g]}
          </b>
        </div>
      ))}
    </div>
  );
}

// ---------- หน้าร้าน ----------

export function Storefront() {
  const sim = useSim();
  const stock = {} as GradeCounts;
  for (const g of GRADES) stock[g] = storeStock(sim, g);
  const total = sumGrades(stock);
  const stockTrays = traysFor(stock, sim.settings.traySize);
  const focus = () => {
    useSimStore.getState().set({ selected: { kind: 'store' } });
    useSimStore.getState().focusOn(STORE[0], STORE[1] + 3, 22);
  };
  const W = 11;
  const D = 6;
  return (
    <group>
      <group position={[STORE[0], 0, STORE[1]]} onClick={(e) => (e.stopPropagation(), focus())}>
        <mesh position={[0, 0.08, 1]} receiveShadow>
          <boxGeometry args={[W + 4, 0.16, D + 6]} />
          <meshStandardMaterial color="#e4ddd0" />
        </mesh>
        {/* ผนัง */}
        <mesh position={[0, 1.8, -D / 2]} castShadow>
          <boxGeometry args={[W, 3.6, 0.2]} />
          <meshStandardMaterial color="#f6efe2" flatShading />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * W) / 2, 1.8, 0]} castShadow>
            <boxGeometry args={[0.2, 3.6, D]} />
            <meshStandardMaterial color="#f6efe2" flatShading />
          </mesh>
        ))}
        <mesh position={[0, 3.7, 0]} castShadow>
          <boxGeometry args={[W + 0.6, 0.2, D + 0.4]} />
          <meshStandardMaterial color="#c45a3c" flatShading />
        </mesh>
        {/* กันสาดลายทาง */}
        {Array.from({ length: 11 }, (_, i) => (
          <mesh key={i} position={[-W / 2 + 0.5 + i, 3.1, D / 2 + 0.9]} rotation={[0.45, 0, 0]}>
            <boxGeometry args={[1, 0.06, 2]} />
            <meshStandardMaterial color={i % 2 ? '#ffffff' : '#e8a33d'} flatShading />
          </mesh>
        ))}
        {/* เคาน์เตอร์ */}
        <mesh position={[0, 0.55, STORE_COUNTER[1] - STORE[1] - 0.6]} material={woodMat} castShadow>
          <boxGeometry args={[W - 2, 1.1, 0.8]} />
        </mesh>
        <mesh position={[3.5, 1.22, STORE_COUNTER[1] - STORE[1] - 0.6]}>
          <boxGeometry args={[0.6, 0.25, 0.45]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
        {/* ชั้นวาง */}
        <mesh position={[0, 0.9, -D / 2 + 0.7]} material={woodMat}>
          <boxGeometry args={[W - 1, 1.8, 0.9]} />
        </mesh>
        <group position={[-3.3, 1.82, -D / 2 + 0.45]}>
          <TrayStacks counts={stockTrays} perStack={8} maxPerGrade={16} spacing={0.5} rowGap={1.0} />
        </group>
        <mesh position={[0, 3.0, -D / 2 + 0.12]} material={windowMaterial}>
          <boxGeometry args={[W - 1, 0.6, 0.02]} />
        </mesh>
        <Html position={[0, 4.3, D / 2 + 0.2]} center transform distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="store-sign">🥚 ร้าน{sim.settings.farmName}</div>
        </Html>
        {/* ป้ายราคา */}
        <group position={[W / 2 + 1.2, 0, D / 2 + 1]}>
          <mesh position={[0, 0.9, 0]} material={postMat}>
            <boxGeometry args={[0.1, 1.8, 0.1]} />
          </mesh>
          <Html position={[0, 2.3, 0]} center transform distanceFactor={7} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <PriceBoard />
          </Html>
        </group>
      </group>
      <Label position={[STORE[0], 6, STORE[1]]} title="หน้าร้านขายไข่">
        สต็อก {total.toLocaleString()} ฟอง · ขายวันนี้ {sim.today.eggsSold.toLocaleString()} ฟอง
      </Label>
    </group>
  );
}

// ---------- จุดขายไข่หน้าฟาร์ม (ลูกค้ามาซื้อที่ฟาร์ม) ----------

export function FarmStall() {
  const sim = useSim();
  const stock = {} as GradeCounts;
  for (const g of GRADES) stock[g] = storeStock(sim, g);
  const total = sumGrades(stock);
  const stockTrays = traysFor(stock, sim.settings.traySize);
  const focus = () => {
    useSimStore.getState().set({ selected: { kind: 'store' } });
    useSimStore.getState().focusOn(FARM_STALL[0], FARM_STALL[1] + 2, 16);
  };
  return (
    <group>
      <group position={[FARM_STALL[0], 0, FARM_STALL[1]]} onClick={(e) => (e.stopPropagation(), focus())}>
        <mesh position={[0, 0.06, 0.6]} receiveShadow>
          <boxGeometry args={[6, 0.12, 5]} />
          <meshStandardMaterial color="#e4ddd0" />
        </mesh>
        {/* เสาและหลังคาเพิง */}
        {[-1, 1].flatMap((a) =>
          [-1, 1].map((b) => (
            <mesh key={`${a}${b}`} position={[a * 2.3, 1.3, b * 1.2 - 0.3]} material={woodMat} castShadow>
              <boxGeometry args={[0.14, 2.6, 0.14]} />
            </mesh>
          )),
        )}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[-2.5 + i, 2.75, 0]} rotation={[0.18, 0, 0]} castShadow>
            <boxGeometry args={[1, 0.08, 3.4]} />
            <meshStandardMaterial color={i % 2 ? '#ffffff' : '#3f9b5a'} flatShading />
          </mesh>
        ))}
        {/* โต๊ะวางไข่ */}
        <mesh position={[0, 0.45, 0.9]} material={woodMat} castShadow>
          <boxGeometry args={[4.4, 0.9, 0.9]} />
        </mesh>
        <group position={[-1.6, 0.92, 0.65]}>
          <TrayStacks counts={stockTrays} perStack={5} maxPerGrade={10} spacing={0.6} rowGap={0.6} />
        </group>
        <mesh position={[1.7, 1.02, 0.9]}>
          <boxGeometry args={[0.45, 0.15, 0.35]} />
          <meshStandardMaterial color="#e8e8e8" flatShading />
        </mesh>
        <Html position={[0, 3.3, 1.6]} center transform distanceFactor={7} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="store-sign">🥚 ขายไข่สด {sim.settings.farmName}</div>
        </Html>
        <group position={[3.4, 0, 1.8]}>
          <mesh position={[0, 0.8, 0]} material={postMat}>
            <boxGeometry args={[0.1, 1.6, 0.1]} />
          </mesh>
          <Html position={[0, 2.1, 0]} center transform distanceFactor={6} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <PriceBoard />
          </Html>
        </group>
      </group>
      <Label position={[FARM_STALL[0], 4.6, FARM_STALL[1]]} title="จุดขายไข่หน้าฟาร์ม">
        วางขาย {total.toLocaleString()} ฟอง · ขายวันนี้ {sim.today.eggsSold.toLocaleString()} ฟอง
      </Label>
    </group>
  );
}

// ---------- บ้านพักพนักงาน ----------

export function StaffHouse() {
  return (
    <group position={[STAFF_HOUSE[0], 0, STAFF_HOUSE[1]]}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[4, 2.4, 3]} />
        <meshStandardMaterial color="#efe3c8" flatShading />
      </mesh>
      <mesh position={[0, 2.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.3, 1.4, 4]} />
        <meshStandardMaterial color="#8a4b35" flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.1, 1.4, 1.51]} material={windowMaterial}>
          <boxGeometry args={[0.7, 0.6, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 1.51]}>
        <boxGeometry args={[0.8, 1.6, 0.02]} />
        <meshStandardMaterial color="#6b4630" />
      </mesh>
      <Label position={[0, 4.4, 0]} small>
        บ้านพักพนักงาน
      </Label>
    </group>
  );
}

// ---------- รถขนไข่ ----------

const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
wheelGeom.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: '#222', flatShading: true });

export function Truck() {
  const g = useRef<THREE.Group>(null!);
  const cargo = useRef<THREE.Group>(null!);
  const status = useRef<HTMLDivElement>(null);
  const showLabels = useSimStore((s) => s.showLabels);
  const sim = useSim();
  const byGrade = sim.truck ? traysFor(sim.truck.byGrade, sim.settings.traySize) : undefined;

  useFrame(() => {
    const { sim } = useSimStore.getState();
    const pose = truckPose(sim, sim.time);
    g.current.position.set(pose.p[0], 0.1, pose.p[1]);
    g.current.rotation.y = pose.heading;
    cargo.current.scale.y = Math.max(0.001, pose.load);
    cargo.current.visible = pose.load > 0.02;
    if (status.current && status.current.textContent !== pose.status) status.current.textContent = pose.status;
  });

  return (
    <group
      ref={g}
      onClick={(e) => {
        e.stopPropagation();
        useSimStore.getState().set({ selected: { kind: 'truck' } });
      }}
    >
      {/* แชสซี */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.9, 0.35, 4.6]} />
        <meshStandardMaterial color="#d8dde2" flatShading />
      </mesh>
      {/* ห้องคนขับ (หันไป +z) */}
      <mesh position={[0, 1.35, 1.35]} castShadow>
        <boxGeometry args={[1.9, 1.3, 1.6]} />
        <meshStandardMaterial color="#f7f7f5" flatShading />
      </mesh>
      <mesh position={[0, 1.55, 2.16]}>
        <boxGeometry args={[1.7, 0.6, 0.02]} />
        <meshStandardMaterial color="#2c3e50" metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[1.95, 0.12, 4.62]} />
        <meshStandardMaterial color="#2f6fb3" />
      </mesh>
      {/* กระบะ */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.92, 1.05, -0.95]}>
          <boxGeometry args={[0.08, 0.6, 2.6]} />
          <meshStandardMaterial color="#c9ced3" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.05, -2.22]}>
        <boxGeometry args={[1.9, 0.6, 0.08]} />
        <meshStandardMaterial color="#c9ced3" flatShading />
      </mesh>
      <group ref={cargo} position={[-0.6, 0.8, -2]}>{byGrade && <TrayStacks counts={byGrade} perStack={4} maxPerGrade={12} spacing={0.45} rowGap={0.36} vertical />}</group>
      {[
        [-0.95, 1.4],
        [0.95, 1.4],
        [-0.95, -1.4],
        [0.95, -1.4],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.38, z]} geometry={wheelGeom} material={wheelMat} castShadow />
      ))}
      {showLabels && (
        <Html position={[0, 3.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="label3d">
            <div className="label3d-title">🚚 รถขนไข่{sim.truck ? ` · ${sim.truck.trays.toLocaleString()} แผง` : ''}</div>
            <div className="label3d-body" ref={status} />
          </div>
        </Html>
      )}
    </group>
  );
}

