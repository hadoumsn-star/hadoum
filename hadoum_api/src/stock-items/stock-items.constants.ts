export const STOCK_EXIT_LARGE_QUANTITY_THRESHOLD = Number(
  process.env.STOCK_EXIT_LARGE_QUANTITY_THRESHOLD ?? 50,
);

export const STOCK_EXIT_LARGE_VALUE_THRESHOLD_XOF = Number(
  process.env.STOCK_EXIT_LARGE_VALUE_THRESHOLD_XOF ?? 100_000,
);

// Negative adjustments (and inventory corrections) beyond this percentage of
// current stock require supervisor validation.
export const STOCK_NEGATIVE_ADJUSTMENT_SENSITIVE_PERCENT = Number(
  process.env.STOCK_NEGATIVE_ADJUSTMENT_SENSITIVE_PERCENT ?? 20,
);

export const STOCK_EXPIRATION_WARNING_DAYS = Number(
  process.env.STOCK_EXPIRATION_WARNING_DAYS ?? 30,
);
