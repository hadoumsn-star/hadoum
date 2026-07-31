export const XOF_PER_EUR = 655.957;

export function xofToEur(amountXof: number): number {
  return Math.round((amountXof / XOF_PER_EUR) * 100) / 100;
}
