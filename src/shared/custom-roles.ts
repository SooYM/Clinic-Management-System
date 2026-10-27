import { z } from 'zod';
import { moduleIds } from './module-permissions';

export const customRoleInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    modules: z
      .array(
        z.enum([
          'queue',
          'patients',
          'appointments',
          'clinical',
          'inventory',
          'billing',
          'reports',
        ]),
      )
      .max(moduleIds.length),
  })
  .strict();
export interface CustomRole {
  id: number;
  name: string;
  modules: string[];
  version: number;
}
