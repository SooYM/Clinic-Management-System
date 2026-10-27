import { z } from 'zod';
import { schemas } from './validation.js';
import { registrationPatientFields } from '../shared/public-registration.js';
const demographicFields = Object.fromEntries(
  registrationPatientFields.map((field) => [field, z.unknown().optional()]),
);
/** Public input cannot set clinical data, record IDs, versions or staff-only queue fields. */
export const publicRegistrationInput = z
  .object({
    submissionKey: z.string().uuid(),
    consent: z.literal(true),
    patient: z
      .object(demographicFields)
      .strict()
      .transform((value, ctx) => {
        const parsed = schemas.patient.safeParse(value);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
          return z.NEVER;
        }
        if (!parsed.data.nationality) {
          ctx.addIssue({ code: 'custom', path: ['nationality'], message: 'Choose nationality.' });
          return z.NEVER;
        }
        if (parsed.data.nationality === 'NON_MALAYSIAN' && !parsed.data.countryCode) {
          ctx.addIssue({
            code: 'custom',
            path: ['countryCode'],
            message: 'Choose country of nationality.',
          });
          return z.NEVER;
        }
        return Object.fromEntries(
          registrationPatientFields.map((field) => [field, parsed.data[field]]),
        );
      }),
  })
  .strict();
