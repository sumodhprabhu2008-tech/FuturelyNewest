export const ASSIGNMENT_SOURCE = {
  SEED: 'SEED',
  CANVAS: 'CANVAS',
  GOOGLE_CLASSROOM: 'GOOGLE_CLASSROOM',
} as const

export type AssignmentSource = (typeof ASSIGNMENT_SOURCE)[keyof typeof ASSIGNMENT_SOURCE]
