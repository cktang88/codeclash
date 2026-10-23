// Trigonometry from + - * / only, so every JavaScript engine computes the same
// bits. Math.sin and Math.cos are not specified to the last bit across engines.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;

function reduce(a: number): number {
  let x = a - Math.floor(a / TAU) * TAU;
  if (x > PI) x -= TAU;
  return x;
}

export function dsin(a: number): number {
  let x = reduce(a);
  // Fold into [-pi/2, pi/2], where the series converges quickly.
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export function dcos(a: number): number {
  return dsin(a + PI / 2);
}
