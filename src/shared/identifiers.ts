import { z } from 'zod';
/** Entity keys accept positive decimal integers only, within JavaScript's exact range. */
export const idSchema = z
  .union([z.number(), z.string().regex(/^[1-9][0-9]*$/)])
  .pipe(z.coerce.number().int().positive().safe());
