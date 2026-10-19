import {describe,it,expect} from 'vitest';
import {validateFirePeriods,precedingFirePeriod} from '../fire-periods';
describe('fire observation periods',()=>{
 it('rejects overlap before requesting GEE',()=>expect(validateFirePeriods('2025-02-01','2025-05-19','2025-01-01','2025-03-01')).toMatch(/sobrepõem/));
 it('allows the exclusive boundary to equal the post start',()=>expect(validateFirePeriods('2025-02-01','2025-05-19','2024-10-17','2025-02-01')).toBeNull());
 it('does not accept missing, reversed or impossible dates',()=>{
  expect(validateFirePeriods('2025-02-01','2025-05-19','','')).toBeTruthy();
  expect(validateFirePeriods('2025-05-19','2025-02-01','2024-01-01','2024-02-01')).toBeTruthy();
  expect(validateFirePeriods('2025-02-30','2025-05-19','2024-01-01','2024-02-01')).toBeTruthy();
 });
 it('suggests an equal-duration preceding interval across year boundaries',()=>{
  const p=precedingFirePeriod('2025-02-01','2025-05-19')!;
  expect(p.end).toBe('2025-02-01');
  expect(Date.parse(p.end)-Date.parse(p.start)).toBe(Date.parse('2025-05-19')-Date.parse('2025-02-01'));
  expect(validateFirePeriods('2025-02-01','2025-05-19',p.start,p.end)).toBeNull();
 });
});
