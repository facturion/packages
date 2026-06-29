/** Shared test fixtures. */

/** The minimal invoice that satisfies every `required` keyword in the schema
 *  (top level + buyer/seller/address + line/item/price/vat). */
export const minimalValid = {
  invoice_number: "INV-1",
  issue_date: "2026-01-15",
  invoice_type_code: "380",
  currency_code: "EUR",
  seller: { name: "Seller GmbH", address: { country_code: "DE" } },
  buyer: { name: "Buyer Ltd", address: { country_code: "FR" } },
  lines: [
    {
      id: "1",
      quantity: "2",
      unit_code: "C62",
      item: { name: "Widget" },
      price: { net_price: "10.00" },
      vat: { category_code: "S", rate: "19" },
    },
  ],
};
