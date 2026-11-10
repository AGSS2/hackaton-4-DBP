import type { BinCode, Rules } from './schemas'

export interface Cell {
  r: number
  c: number
}

export function binFor(digits: number[], rules: Rules): BinCode {
  const index =
    rules.binning.strategy === 'DIGIT_SUM_MOD'
      ? digits.reduce((sum, d) => sum + d, 0) % 4
      : Math.max(...digits) % 4
  return rules.binning.order[index]
}

export function isNoise(size: number, rules: Rules): boolean {
  return size < rules.minGroupSize || size > rules.maxGroupSize
}

export const BIN_CHAR: Record<BinCode, string> = { WO: 'W', FC: 'F', DR: 'D', MA: 'M' }

export function neighbors(cell: Cell, connectivity: 4 | 8): Cell[] {
  const out: Cell[] = [
    { r: cell.r - 1, c: cell.c },
    { r: cell.r + 1, c: cell.c },
    { r: cell.r, c: cell.c - 1 },
    { r: cell.r, c: cell.c + 1 },
  ]
  if (connectivity === 8) {
    out.push(
      { r: cell.r - 1, c: cell.c - 1 },
      { r: cell.r - 1, c: cell.c + 1 },
      { r: cell.r + 1, c: cell.c - 1 },
      { r: cell.r + 1, c: cell.c + 1 },
    )
  }
  return out
}
