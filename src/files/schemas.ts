import { z } from 'zod'

export const ProgressSchema = z.object({
  WO: z.number(),
  FC: z.number(),
  DR: z.number(),
  MA: z.number(),
  overall: z.number(),
})
export type Progress = z.infer<typeof ProgressSchema>

export const FileSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  rows: z.number(),
  cols: z.number(),
  tileSize: z.number().optional(),
  status: z.string(),
  progress: ProgressSchema.optional(),
  refinedGroups: z.number().optional(),
  totalGroups: z.number().optional(),
  mistakes: z.number().optional(),
  updatedAt: z.string().optional(),
})
export type FileSummary = z.infer<typeof FileSummarySchema>

export const FilePageSchema = z.object({
  content: z.array(FileSummarySchema),
  totalElements: z.number(),
  totalPages: z.number(),
  page: z.number(),
  size: z.number(),
})
export type FilePage = z.infer<typeof FilePageSchema>

export const FileDetailSchema = FileSummarySchema.extend({
  tileSize: z.number(),
  progress: ProgressSchema,
  refinedGroups: z.number(),
  totalGroups: z.number(),
  mistakes: z.number(),
})
export type FileDetail = z.infer<typeof FileDetailSchema>

export const BIN_CODES = ['WO', 'FC', 'DR', 'MA'] as const
export type BinCode = (typeof BIN_CODES)[number]

export const RulesSchema = z.object({
  tremorThreshold: z.number(),
  connectivity: z.union([z.literal(4), z.literal(8)]),
  minGroupSize: z.number(),
  maxGroupSize: z.number(),
  binning: z.object({
    strategy: z.enum(['DIGIT_SUM_MOD', 'MAX_DIGIT_MOD']),
    order: z.array(z.enum(BIN_CODES)).length(4),
  }),
})
export type Rules = z.infer<typeof RulesSchema>

export const TileSchema = z.object({
  tileRow: z.number(),
  tileCol: z.number(),
  originRow: z.number(),
  originCol: z.number(),
  rows: z.number(),
  cols: z.number(),
  values: z.string(),
  tremor: z.string(),
  bins: z.string(),
  version: z.number(),
})
export type TileDto = z.infer<typeof TileSchema>

export const RefineResultSchema = z.object({
  refinementId: z.union([z.string(), z.number()]).optional(),
  bin: z.string(),
  size: z.number().optional(),
  file: z.object({
    progress: ProgressSchema,
    refinedGroups: z.number(),
    totalGroups: z.number(),
    mistakes: z.number(),
    status: z.string(),
  }),
})
export type RefineResult = z.infer<typeof RefineResultSchema>
