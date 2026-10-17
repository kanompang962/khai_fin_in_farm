import * as THREE from 'three';
import { GRADE_COLOR } from '../sim/grading';
import { GRADES } from '../sim/types';

/** วัสดุไฟส่องสว่าง — ความสว่างปรับตามเวลากลางวัน/กลางคืนใน DayLight */
export const lampMaterial = new THREE.MeshStandardMaterial({
  color: '#fff8e0',
  emissive: '#ffd27a',
  emissiveIntensity: 0,
});

export const windowMaterial = new THREE.MeshStandardMaterial({
  color: '#9cc3dc',
  emissive: '#ffcf7a',
  emissiveIntensity: 0,
  flatShading: true,
});

export const GRADE_HEX = GRADES.map((g) => GRADE_COLOR[g]);
