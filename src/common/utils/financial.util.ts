export interface ComputeOrderFinancialsInput {
  subtotal: number | string | any;
  totalPrice?: number | string | any;
  discountAmount?: number | string | any;
  adminFeePercentage: number | string | any;
}

export interface OrderFinancials {
  subtotal: number;
  fee: number;
  netMitra: number;
  discount: number;
  customerPaid: number;
  adminNet: number;
}

/**
 * Helper tunggal kalkulasi keuangan order.
 * - Customer bayar totalPrice = subtotal - discount.
 * - Fee admin dan bagian mitra dihitung dari SUBTOTAL:
 *   fee = Math.round(subtotal * adminFeePercentage / 100);
 *   netMitra = subtotal - fee;
 *   adminNet = totalPrice - netMitra (bisa negatif jika subsidi diskon > fee).
 */
export function computeOrderFinancials(
  input: ComputeOrderFinancialsInput,
): OrderFinancials {
  const rawSubtotal = Number(input.subtotal) || 0;
  const rawTotalPrice =
    input.totalPrice !== undefined && input.totalPrice !== null
      ? Number(input.totalPrice)
      : undefined;
  const rawDiscount =
    input.discountAmount !== undefined && input.discountAmount !== null
      ? Number(input.discountAmount)
      : undefined;

  // Fallback untuk order lama yang belum memiliki subtotal (subtotal = totalPrice)
  const subtotal = rawSubtotal > 0 ? rawSubtotal : (rawTotalPrice || 0);

  let discount = 0;
  if (rawDiscount !== undefined) {
    discount = Math.max(0, rawDiscount);
  } else if (rawTotalPrice !== undefined) {
    discount = Math.max(0, subtotal - rawTotalPrice);
  }

  const customerPaid =
    rawTotalPrice !== undefined
      ? rawTotalPrice
      : Math.max(0, subtotal - discount);

  const adminFeePercentage = Number(input.adminFeePercentage) || 0;
  const fee = Math.round((subtotal * adminFeePercentage) / 100);
  const netMitra = subtotal - fee;
  const adminNet = customerPaid - netMitra;

  return {
    subtotal,
    fee,
    netMitra,
    discount,
    customerPaid,
    adminNet,
  };
}

