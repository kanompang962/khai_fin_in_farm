import { Html } from '@react-three/drei';
import type { ReactNode } from 'react';
import { useSimStore } from '../state/useSimStore';

export function Label({
  position,
  title,
  children,
  small,
  always,
}: {
  position: [number, number, number];
  title?: string;
  children?: ReactNode;
  small?: boolean;
  always?: boolean;
}) {
  const show = useSimStore((s) => s.showLabels);
  if (!show && !always) return null;
  return (
    <Html position={position} center distanceFactor={small ? 40 : undefined} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={small ? 'label3d label3d-small' : 'label3d'}>
        {title && <div className="label3d-title">{title}</div>}
        {children && <div className="label3d-body">{children}</div>}
      </div>
    </Html>
  );
}
