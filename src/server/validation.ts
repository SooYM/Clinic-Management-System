import { idSchema } from '../shared/identifiers.js';
import { z } from 'zod';
import { queueStatuses } from '../domain/models.js';
import { parseMalaysianIc } from '../shared/patient-identity.js';
import { parseBloodPressure } from '../shared/blood-pressure.js';
const id = idSchema,
  text = z.string().trim().min(1).max(200),
  long = z.string().max(20000).default('');
export const integer = z.number().int().positive().max(1_000_000);
const cents = z.number().int().min(0).max(2_000_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use valid date YYYY-MM-DD.');
export const schemas = {
  login: z
    .object({
      email: z
        .string()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      password: z.string().min(1).max(256),
    })
    .strict(),
  patient: z
    .object({
      name: text.optional(),
      firstName: z.string().trim().min(1).max(150).optional(),
      lastName: z.string().trim().max(150).optional(),
      nationality: z.enum(['MALAYSIAN', 'NON_MALAYSIAN']).optional(),
      nationalId: text,
      dateOfBirth: date
        .refine((v) => v <= new Date().toISOString().slice(0, 10), 'Birth date cannot be future.')
        .optional(),
      sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
      addressLine1: z.string().trim().max(500).default(''),
      addressLine2: z.string().trim().max(500).default(''),
      postcode: z.string().trim().max(20).default(''),
      city: z.string().trim().max(100).default(''),
      state: z.string().trim().max(100).default(''),
      phone: z.string().max(50).default(''),
      email: z.union([z.string().email().max(254), z.literal('')]).default(''),
      bloodGroup: z.string().max(10).default(''),
      allergies: z.array(text).max(50).default([]),
      conditions: z.array(text).max(100).default([]),
      notificationConsent: z.boolean().default(false),
      version: integer.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (!value.firstName && !value.name)
        ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'First name is required.' });
      if (
        value.firstName &&
        [value.firstName, value.lastName].filter(Boolean).join(' ').length > 200
      )
        ctx.addIssue({
          code: 'custom',
          path: ['firstName'],
          message: 'Combined patient name must not exceed 200 characters.',
        });
      if (value.nationality === 'MALAYSIAN') {
        try {
          const identity = parseMalaysianIc(value.nationalId);
          if ((value.dateOfBirth || identity.dateOfBirth) > new Date().toISOString().slice(0, 10))
            ctx.addIssue({
              code: 'custom',
              path: ['nationalId'],
              message: 'IC birth date cannot be in the future.',
            });
          if (
            value.dateOfBirth &&
            value.dateOfBirth.slice(2).replace(/-/g, '') !==
              identity.dateOfBirth.slice(2).replace(/-/g, '')
          )
            ctx.addIssue({
              code: 'custom',
              path: ['dateOfBirth'],
              message:
                'Birth date must match IC date digits, including an alternate matching century.',
            });
          if (value.sex && value.sex !== identity.sex)
            ctx.addIssue({
              code: 'custom',
              path: ['sex'],
              message: 'Gender must match the final IC digit.',
            });
        } catch (error) {
          ctx.addIssue({ code: 'custom', path: ['nationalId'], message: (error as Error).message });
        }
      } else {
        if (!value.dateOfBirth)
          ctx.addIssue({
            code: 'custom',
            path: ['dateOfBirth'],
            message: 'Birth date is required.',
          });
        if (!value.sex)
          ctx.addIssue({ code: 'custom', path: ['sex'], message: 'Gender is required.' });
      }
      if (value.nationality === 'MALAYSIAN' && value.postcode && !/^\d{5}$/.test(value.postcode))
        ctx.addIssue({
          code: 'custom',
          path: ['postcode'],
          message: 'Clinic address postcode must contain five digits.',
        });
    })
    .transform((value) => {
      const identity =
        value.nationality === 'MALAYSIAN' ? parseMalaysianIc(value.nationalId) : undefined;
      return {
        ...value,
        name: value.firstName
          ? [value.firstName, value.lastName].filter(Boolean).join(' ')
          : value.name!,
        firstName: value.firstName || value.name!,
        lastName: value.lastName || '',
        nationalId: identity?.nationalId || value.nationalId,
        dateOfBirth: value.dateOfBirth || identity!.dateOfBirth,
        sex: identity?.sex || value.sex!,
      };
    }),
  appointment: z
    .object({
      patientId: id,
      practitionerId: id,
      roomId: id.optional(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }),
      reason: z.string().max(500).default(''),
    })
    .strict()
    .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), 'End must follow start.'),
  queue: z
    .object({ patientId: id, priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL') })
    .strict(),
  transition: z
    .object({
      status: z.enum(queueStatuses),
      roomId: id.optional(),
      practitionerId: id.optional(),
      version: integer,
    })
    .strict(),
  encounter: z
    .object({
      patientId: id,
      queueTicketId: id.optional(),
      specialty: z.enum(['GP', 'DENTAL', 'AESTHETIC']).default('GP'),
      subjective: long,
      objective: long,
      assessment: long,
      plan: long,
      vitals: z
        .record(z.string(), z.union([z.string().max(100), z.number()]))
        .default({})
        .superRefine((value, ctx) => {
          try {
            parseBloodPressure(value.bloodPressure);
          } catch (error) {
            ctx.addIssue({
              code: 'custom',
              path: ['bloodPressure'],
              message: (error as Error).message,
            });
          }
        }),
      procedureNotes: long,
      prescriptions: z
        .array(
          z
            .object({
              itemId: id,
              quantity: integer,
              dosage: text,
              durationDays: integer.max(365),
              frequencyPerDay: integer.max(24).default(1),
              mealTiming: z.enum(['BEFORE_MEAL', 'AFTER_MEAL', 'ANY_TIME']).default('ANY_TIME'),
              itemName: z.string().max(200).optional(),
              ingredient: z.string().max(2000).optional(),
              unit: z.string().max(50).optional(),
            })
            .strict(),
        )
        .max(50)
        .default([]),
      status: z.enum(['DRAFT', 'SIGNED']).default('DRAFT'),
      version: integer.optional(),
    })
    .strict()
    .refine(
      (v) => v.status !== 'SIGNED' || v.assessment.trim().length > 0,
      'Assessment required before signing.',
    ),
  item: z
    .object({
      name: text,
      sku: text,
      ingredient: z.string().max(500).default(''),
      category: z.enum(['MEDICATION', 'CONSUMABLE', 'RETAIL']).default('MEDICATION'),
      unit: z.string().trim().min(1).max(50).default('unit'),
      priceCents: cents,
      reorderLevel: z.number().int().min(0).max(100000).default(10),
    })
    .strict(),
  batch: z
    .object({
      itemId: id,
      batchNumber: text,
      expiresOn: date.nullable().optional().default(null),
      quantity: integer,
    })
    .strict(),
  dispense: z.object({ encounterId: id, idempotencyKey: z.string().min(8).max(100) }).strict(),
  medicationDose: z
    .object({
      itemId: id,
      outcome: z.enum(['TAKEN', 'MISSED']),
      source: z.enum(['PATIENT_REPORTED', 'STAFF_OBSERVED']),
      occurredAt: z
        .string()
        .datetime({ offset: true })
        .refine(
          (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
          'Medication occurrence cannot be more than five minutes in the future.',
        )
        .transform((value) => new Date(value).toISOString()),
      amount: z
        .number()
        .finite()
        .positive()
        .max(1000000)
        .refine((value) => Number(value.toFixed(3)) === value, 'Use at most three decimal places.')
        .nullable(),
      notes: z.string().trim().max(2000).default(''),
      idempotencyKey: z.string().min(8).max(100),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (
        (value.outcome === 'TAKEN' && value.amount === null) ||
        (value.outcome === 'MISSED' && value.amount !== null)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'TAKEN requires a positive amount; MISSED requires null amount.',
        });
    }),
  inventoryUsage: z
    .object({
      itemId: id,
      quantity: integer,
      reason: z.string().trim().min(1).max(500),
      idempotencyKey: z.string().min(8).max(100),
    })
    .strict(),
  package: z
    .object({
      patientId: id,
      name: text,
      totalSessions: integer.max(1000),
      priceCents: cents.refine((v) => v > 0),
      expiresOn: date,
      practitionerId: id,
      payments: z
        .array(
          z
            .object({
              method: z.enum(['CASH', 'CARD', 'QR', 'DEPOSIT']),
              amountCents: cents.refine((v) => v > 0),
              reference: z.string().max(200).default(''),
            })
            .strict(),
        )
        .min(1)
        .max(10),
      idempotencyKey: z.string().min(8).max(100),
    })
    .strict(),
  redemption: z
    .object({ encounterId: id, notes: z.string().trim().min(1).max(2000), version: integer })
    .strict(),
  invoice: z
    .object({
      patientId: id,
      practitionerId: id,
      lines: z
        .array(
          z
            .object({
              description: text,
              quantity: integer,
              unitPriceCents: cents,
              category: z.enum(['SERVICE', 'PRODUCT']),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      payments: z
        .array(
          z
            .object({
              method: z.enum(['CASH', 'CARD', 'QR', 'DEPOSIT']),
              amountCents: cents.refine((v) => v > 0),
              reference: z.string().max(200).default(''),
            })
            .strict(),
        )
        .min(1)
        .max(10),
      idempotencyKey: z.string().min(8).max(100),
    })
    .strict(),
  deposit: z
    .object({ patientId: id, amountCents: cents.refine((v) => v > 0), reference: text })
    .strict(),
  document: z
    .object({
      encounterId: id,
      kind: z.enum(['MC', 'REFERRAL', 'LAB']),
      startDate: date.optional(),
      days: integer.max(365).optional(),
      diagnosisRedacted: z.boolean().default(true),
      lightDuty: z.boolean().default(false),
      employer: z.string().trim().max(200).optional(),
      target: z.string().trim().max(200).optional(),
      urgency: z
        .enum(['ROUTINE', 'SEMI_URGENT', 'URGENT_SAME_DAY', 'EMERGENCY'])
        .default('ROUTINE'),
      reason: z.string().max(10000).optional(),
      panels: z.array(text).max(30).optional(),
      specimenType: z.string().max(100).default('BLOOD'),
      fastingRequired: z.boolean().default(false),
      clinicalNotes: long,
    })
    .strict(),
};
