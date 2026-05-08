import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const billNoRegex = /^[a-zA-Z0-9]{7}$/;
const barcodeRegex = /^[a-zA-Z0-9]{1,18}$/;
const statusSchema = z.enum(["PAID", "UNPAID"]);

export const createSubmissionSchema = z.object({
  party_name: z.string().trim().min(1, "Party Name is required"),
  date: z.string().regex(dateRegex, "Date must be in YYYY-MM-DD format"),
  bill_no: z.string().trim().regex(billNoRegex, "Bill No must be exactly 7 alphanumeric characters"),
  barcode: z
    .string()
    .trim()
    .regex(barcodeRegex, "Barcode must be alphanumeric and at most 18 characters"),
  s_m: z.string().trim().min(1, "S M is required"),
  amount: z.number().nonnegative("Amount must be non-negative"),
  status: statusSchema
});

export const updateSubmissionSchema = z.object({
  sr_no: z.number().int().positive("Sr No must be a positive integer"),
  party_name: z.string().trim().min(1, "Party Name is required"),
  date: z.string().regex(dateRegex, "Date must be in YYYY-MM-DD format"),
  bill_no: z.string().trim().regex(billNoRegex, "Bill No must be exactly 7 alphanumeric characters"),
  barcode: z
    .string()
    .trim()
    .regex(barcodeRegex, "Barcode must be alphanumeric and at most 18 characters"),
  s_m: z.string().trim().min(1, "S M is required"),
  amount: z.number().nonnegative("Amount must be non-negative"),
  status: statusSchema
});

