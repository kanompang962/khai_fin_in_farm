import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useRef } from 'react';
import * as THREE from 'three';
import type { Employee } from '../sim/types';
import { useSim, useSimStore } from '../state/useSimStore';
import { customerPoses, employeePose, TASK_STYLE, type Carry } from './layout';

const skinMat = new THREE.MeshStandardMaterial({ color: '#d9a47c', flatShading: true });
const pantsMat = new THREE.MeshStandardMaterial({ color: '#3d4452', flatShading: true });
const hatMat = new THREE.MeshStandardMaterial({ color: '#e3c46e', flatShading: true });
const bucketMat = new THREE.MeshStandardMaterial({ color: '#f0b429', flatShading: true });
const basketMat = new THREE.MeshStandardMaterial({ color: '#9b6a3c', flatShading: true });
const eggMat = new THREE.MeshStandardMaterial({ color: '#f1d9b8' });
const barrowMat = new THREE.MeshStandardMaterial({ color: '#2f8f4e', flatShading: true });
const manureMat = new THREE.MeshStandardMaterial({ color: '#6b5236', flatShading: true });
const trayMat = new THREE.MeshStandardMaterial({ color: '#c9bba5', flatShading: true });
const bagMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', flatShading: true, transparent: true, opacity: 0.85 });

const shirtMats = new Map<string, THREE.MeshStandardMaterial>();
function shirt(color: string) {
  let m = shirtMats.get(color);
  if (!m) shirtMats.set(color, (m = new THREE.MeshStandardMaterial({ color, flatShading: true })));
  return m;
}

interface PersonProps {
  color: string;
  hat?: boolean;
  onClick?: () => void;
}

/** ตัวละคร low-poly: ลำตัว + หัว + หมวก + ของที่ถือ (ควบคุมจาก useFrame ผ่าน userData) */
export const Person = forwardRef<THREE.Group, PersonProps>(function Person({ color, hat, onClick }, ref) {
  return (
    <group
      ref={ref}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
    >
      <group name="bob">
        <mesh position={[0, 0.38, 0]} material={pantsMat} castShadow>
          <cylinderGeometry args={[0.17, 0.15, 0.76, 6]} />
        </mesh>
        <mesh position={[0, 1.0, 0]} material={shirt(color)} castShadow>
          <cylinderGeometry args={[0.2, 0.19, 0.55, 6]} />
        </mesh>
        <mesh position={[0, 1.42, 0]} material={skinMat} castShadow>
          <sphereGeometry args={[0.16, 7, 5]} />
        </mesh>
        {hat && (
          <mesh position={[0, 1.6, 0]} material={hatMat}>
            <coneGeometry args={[0.34, 0.2, 8]} />
          </mesh>
        )}
        <group name="carry-feed" visible={false} position={[0.28, 0.75, 0.1]}>
          <mesh material={bucketMat}>
            <cylinderGeometry args={[0.15, 0.12, 0.28, 8]} />
          </mesh>
        </group>
        <group name="carry-eggs" visible={false} position={[0, 0.95, 0.32]}>
          <mesh material={basketMat}>
            <cylinderGeometry args={[0.22, 0.17, 0.18, 8]} />
          </mesh>
          {[-0.08, 0, 0.08].map((x) => (
            <mesh key={x} position={[x, 0.11, (x * 3) % 0.1]} material={eggMat}>
              <sphereGeometry args={[0.055, 6, 4]} />
            </mesh>
          ))}
        </group>
        <group name="carry-trays" visible={false} position={[0, 1.0, 0.32]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, i * 0.07, 0]} material={trayMat}>
              <boxGeometry args={[0.36, 0.05, 0.36]} />
            </mesh>
          ))}
        </group>
      </group>
      <group name="carry-manure" visible={false} position={[0, 0, 0.75]}>
        <mesh position={[0, 0.4, 0]} material={barrowMat}>
          <boxGeometry args={[0.55, 0.25, 0.75]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={manureMat}>
          <sphereGeometry args={[0.25, 6, 4]} />
        </mesh>
        <mesh position={[0, 0.15, 0.35]} rotation={[0, 0, Math.PI / 2]} material={pantsMat}>
          <cylinderGeometry args={[0.15, 0.15, 0.08, 8]} />
        </mesh>
      </group>
    </group>
  );
});

const CARRIES: Exclude<Carry, null>[] = ['feed', 'eggs', 'trays', 'manure'];

function applyPose(g: THREE.Group, x: number, z: number, heading: number, moving: boolean, carry: Carry, t: number) {
  g.position.set(x, 0.12, z);
  g.rotation.y = heading;
  const bob = g.getObjectByName('bob');
  if (bob) bob.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.08 : 0;
  for (const c of CARRIES) {
    const o = g.getObjectByName('carry-' + c);
    if (o) o.visible = carry === c;
  }
}

const ROLE_COLOR: Record<Employee['role'], string> = { farm: '#3f9b5a', driver: '#2f6fb3', store: '#e36a9a' };

interface BadgeRefs {
  box: HTMLDivElement | null;
  icon: HTMLSpanElement | null;
  task: HTMLSpanElement | null;
  detail: HTMLDivElement | null;
  bar: HTMLDivElement | null;
}

function EmployeeFigure({ emp }: { emp: Employee }) {
  const g = useRef<THREE.Group>(null!);
  const holder = useRef<THREE.Group>(null!);
  const ui = useRef<BadgeRefs>({ box: null, icon: null, task: null, detail: null, bar: null });
  const last = useRef('');
  const showLabels = useSimStore((s) => s.showLabels);

  useFrame(({ clock }) => {
    const { sim } = useSimStore.getState();
    const pose = employeePose(sim, emp, sim.time);
    g.current.visible = pose.visible;
    applyPose(g.current, pose.p[0], pose.p[1], pose.heading, pose.moving, pose.carry, clock.elapsedTime);
    if (holder.current) holder.current.position.copy(g.current.position);

    // ป้ายสถานะ: Html ไม่สนใจ visible ของ group จึงต้องอัปเดต DOM เอง
    const r = ui.current;
    if (!r.box) return;
    r.box.style.display = pose.visible ? '' : 'none';
    const style = TASK_STYLE[pose.kind];
    const key = pose.kind + pose.task + (pose.detail ?? '');
    if (key !== last.current) {
      last.current = key;
      r.box.style.borderColor = style.color;
      r.box.style.setProperty('--task', style.color);
      if (r.icon) r.icon.textContent = style.icon;
      if (r.task) r.task.textContent = pose.task;
      if (r.detail) {
        r.detail.textContent = pose.detail ?? '';
        r.detail.style.display = pose.detail ? '' : 'none';
      }
    }
    if (r.bar) {
      r.bar.style.display = pose.progress === null ? 'none' : '';
      (r.bar.firstChild as HTMLDivElement).style.width = `${Math.round((pose.progress ?? 0) * 100)}%`;
    }
  });

  return (
    <group>
      <Person
        ref={g}
        color={ROLE_COLOR[emp.role]}
        hat={emp.role === 'farm'}
        onClick={() => useSimStore.getState().set({ selected: { kind: 'employee', id: emp.id } })}
      />
      {showLabels && (
        <group ref={holder}>
          <Html position={[0, 2.3, 0]} center distanceFactor={24} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={(d) => (ui.current.box = d)} className="task-badge">
              <div className="task-badge-name">{emp.name}</div>
              <div className="task-badge-task">
                <span ref={(d) => (ui.current.icon = d)} />
                <span ref={(d) => (ui.current.task = d)} />
              </div>
              <div ref={(d) => (ui.current.detail = d)} className="task-badge-detail" />
              <div ref={(d) => (ui.current.bar = d)} className="task-badge-bar">
                <div />
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export function Employees() {
  const sim = useSim();
  return (
    <>
      {sim.employees.map((e) => (
        <EmployeeFigure key={e.id} emp={e} />
      ))}
    </>
  );
}

// ---------- ลูกค้า ----------

const POOL = 24;
const CUSTOMER_COLORS = ['#f2a65a', '#6c9bd2', '#c96b9b', '#7cc08b', '#e5d35b', '#9d7fd8', '#e07a5f', '#4fb3bf'];

export function Customers() {
  const refs = useRef<THREE.Group[]>([]);
  const bubbles = useRef<(HTMLDivElement | null)[]>([]);
  const holders = useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    const { sim } = useSimStore.getState();
    const poses = customerPoses(sim, sim.time);
    for (let i = 0; i < POOL; i++) {
      const g = refs.current[i];
      const h = holders.current[i];
      const b = bubbles.current[i];
      if (!g || !h) continue;
      const pose = poses[i];
      g.visible = !!pose;
      h.visible = !!pose?.bubble;
      if (!pose) {
        if (b) b.style.display = 'none';
        continue;
      }
      applyPose(g, pose.p[0], pose.p[1], pose.heading, pose.moving, pose.c.done && pose.c.boughtQty > 0 ? (pose.c.unit === 'tray' ? 'trays' : 'eggs') : null, clock.elapsedTime);
      const mat = (g.getObjectByName('bob')?.children[1] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
      if (mat) mat.color.set(CUSTOMER_COLORS[pose.c.id % CUSTOMER_COLORS.length]);
      h.position.set(pose.p[0], 0, pose.p[1]);
      if (b) {
        b.style.display = pose.bubble ? 'block' : 'none';
        if (pose.bubble && b.textContent !== pose.bubble) {
          b.textContent = pose.bubble;
          b.className = pose.c.boughtQty > 0 ? 'bubble3d' : 'bubble3d bubble3d-warn';
        }
      }
    }
  });
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i}>
          <group ref={(g) => g && (refs.current[i] = g)} visible={false}>
            <CustomerBody />
          </group>
          <group ref={(g) => g && (holders.current[i] = g)} visible={false}>
            <Html position={[0, 2.4, 0]} center distanceFactor={30} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div ref={(d) => (bubbles.current[i] = d)} className="bubble3d" style={{ display: 'none' }} />
            </Html>
          </group>
        </group>
      ))}
    </>
  );
}

/** ลูกค้าแต่ละคนต้องมีวัสดุเสื้อของตัวเองเพื่อเปลี่ยนสีได้ */
function CustomerBody() {
  const mat = useRef(new THREE.MeshStandardMaterial({ color: '#f2a65a', flatShading: true }));
  return (
    <group name="bob">
      <mesh position={[0, 0.38, 0]} material={pantsMat} castShadow>
        <cylinderGeometry args={[0.17, 0.15, 0.76, 6]} />
      </mesh>
      <mesh position={[0, 1.0, 0]} material={mat.current} castShadow>
        <cylinderGeometry args={[0.2, 0.19, 0.55, 6]} />
      </mesh>
      <mesh position={[0, 1.42, 0]} material={skinMat}>
        <sphereGeometry args={[0.16, 7, 5]} />
      </mesh>
      {/* ถุงไข่ (ซื้อเป็นฟอง) */}
      <group name="carry-eggs" visible={false} position={[0.27, 0.78, 0.08]}>
        <mesh material={bagMat}>
          <boxGeometry args={[0.24, 0.3, 0.16]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} material={eggMat}>
          <sphereGeometry args={[0.07, 6, 4]} />
        </mesh>
      </group>
      <group name="carry-trays" visible={false} position={[0, 1.0, 0.32]}>
        {[0, 1].map((i) => (
          <mesh key={i} position={[0, i * 0.07, 0]} material={trayMat}>
            <boxGeometry args={[0.36, 0.05, 0.36]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
