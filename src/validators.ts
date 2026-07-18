import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const billNoRegex = /^[a-zA-Z0-9]{7}$/;
const barcodeRegex = /^[a-zA-Z0-9]{1,18}$/;
const statusSchema = z.enum(["PAID", "UNPAID"]);

const optionalBillNo = z
  .string()
  .trim()
  .refine((v) => v === "" || billNoRegex.test(v), {
    message: "Bill No must be exactly 7 alphanumeric characters"
  })
  .optional()
  .default("");

const optionalDate = z
  .string()
  .refine((v) => v === "" || dateRegex.test(v), {
    message: "Date must be in YYYY-MM-DD format"
  })
  .optional()
  .default("");

const optionalMp = z
  .number()
  .nullable()
  .refine((val) => val === null || (val >= 0 && val <= 1000 && val % 100 === 0), {
    message: "M P must be between 0 and 1000 in multiples of 100"
  })
  .optional()
  .default(null);

export const createSubmissionSchema = z.object({
  party_name: z.string().trim().optional().default(""),
  date: optionalDate,
  bill_no: optionalBillNo,
  barcode: z
    .string()
    .trim()
    .regex(barcodeRegex, "Barcode must be alphanumeric and at most 18 characters"),
  s_m: z.string().trim().optional().default(""),
  m_p: optionalMp,
  amount: z.number().nonnegative("Amount must be non-negative").optional().default(0),
  price: z.number().nonnegative("Price must be non-negative").nullable().optional().default(null),
  remark: z.string().trim().max(500, "Remark must be 500 characters or less").nullable().optional().default(null),
  status: statusSchema.optional().default("UNPAID")
});

export const updateSubmissionSchema = z.object({
  sr_no: z.number().int().positive("Sr No must be a positive integer"),
  party_name: z.string().trim().optional().default(""),
  date: optionalDate,
  bill_no: optionalBillNo,
  barcode: z
    .string()
    .trim()
    .regex(barcodeRegex, "Barcode must be alphanumeric and at most 18 characters"),
  s_m: z.string().trim().optional().default(""),
  m_p: optionalMp,
  amount: z.number().nonnegative("Amount must be non-negative").optional().default(0),
  price: z.number().nonnegative("Price must be non-negative").nullable().optional().default(null),
  remark: z.string().trim().max(500, "Remark must be 500 characters or less").nullable().optional().default(null),
  status: statusSchema.optional().default("UNPAID")
});
