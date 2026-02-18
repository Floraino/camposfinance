/**
 * Transaction Sanitizer
 * 
 * Ensures that transaction objects only contain valid schema fields before insertion.
 * This prevents schema cache errors when columns are removed from the database.
 */

/**
 * Whitelist of valid columns in the transactions table schema.
 * Update this list if the schema changes.
 */
const VALID_TRANSACTION_FIELDS = new Set([
  "user_id",
  "household_id",
  "description",
  "amount",
  "category",
  "status",
  "transaction_date",
  "notes",
  "is_recurring",
  "account_id",
  "credit_card_id",
  "member_id",
  "due_date",
  "installment_group_id",
  "installment_number",
  "attachments",
  "created_at",
  "updated_at",
  // Explicitly excluded: payment_method (removed from schema)
]);

/**
 * Sanitizes a transaction object to include only valid schema fields.
 * Removes any fields not in the whitelist (e.g., payment_method).
 * 
 * @param tx - Transaction object (may contain extra fields)
 * @returns Sanitized transaction object with only valid fields
 */
export function sanitizeTransactionForInsert(tx: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(tx)) {
    // Skip payment_method explicitly (even if it somehow got into the object)
    if (key === 'payment_method' || key === 'paymentMethod') {
      continue;
    }
    if (VALID_TRANSACTION_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  
  // Final safety check: explicitly delete payment_method if it somehow exists
  delete sanitized.payment_method;
  delete sanitized.paymentMethod;
  
  return sanitized;
}

/**
 * Sanitizes an array of transaction objects.
 * Useful for batch inserts.
 */
export function sanitizeTransactionsBatch(transactions: Array<Record<string, any>>): Array<Record<string, any>> {
  return transactions.map(tx => sanitizeTransactionForInsert(tx));
}
