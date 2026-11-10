import { z } from 'zod'

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
})
export type TokenPair = z.infer<typeof TokenPairSchema>

export const MeSchema = z.object({
  id: z.number(),
  email: z.string(),
  displayName: z.string(),
  team: z.object({ code: z.string(), name: z.string() }),
  role: z.object({ code: z.string(), name: z.string() }),
  permissions: z.array(z.string()),
  clearance: z.object({ granted: z.boolean(), grantedAt: z.string().nullable() }),
})
export type Me = z.infer<typeof MeSchema>

export const CheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.unknown().optional(),
})
export type Check = z.infer<typeof CheckSchema>

export const IntegrationsSchema = z.object({
  deploy: z
    .object({
      origin: z.string().nullable().optional(),
      verifiedAt: z.string().nullable().optional(),
      lastBuildSeen: z.string().nullable().optional(),
      lastBuildSeenAt: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  storage: z
    .object({
      provider: z.string().nullable().optional(),
      verifiedAt: z.string().nullable().optional(),
      checks: z.array(CheckSchema).nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type Integrations = z.infer<typeof IntegrationsSchema>

export const ClearanceSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.string().nullable().optional(),
  checks: z.array(CheckSchema).nullable().optional(),
  checkedAt: z.string().nullable().optional(),
})
export type Clearance = z.infer<typeof ClearanceSchema>
