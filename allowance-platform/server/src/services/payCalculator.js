function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function calculatePay(details, productsById) {
  const rows = details.map((row) => {
    const product = productsById.get(row.product_id);
    const quantity = Number(row.quantity_kg);
    const amount = round2(quantity * Number(product.price_per_kg));
    return {
      product_id: row.product_id,
      quantity_kg: quantity,
      amount,
    };
  });

  const total_amount = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const withholding_tax = round2(total_amount * 0.033);
  const net_amount = round2(total_amount - withholding_tax);

  return {
    total_amount,
    withholding_tax,
    net_amount,
    rows,
  };
}

module.exports = { calculatePay, round2 };

