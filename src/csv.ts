import Papa from "papaparse";
import {
  categories,
  minor,
  qty,
  productSchema,
  customerSchema,
  uid,
  type State,
  type Product,
  type Customer,
} from "./domain";
export type Preview = {
  rows: (Product | Customer)[];
  errors: { row: number; message: string }[];
};
export function previewCSV(
  text: string,
  kind: "products" | "customers",
  state: State,
): Preview {
  if (text.length > 1000000) throw Error("CSV exceeds 1 MB. Split the file.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const errors = parsed.errors.map((e) => ({
    row: (e.row || 0) + 2,
    message: e.message,
  }));
  const rows: (Product | Customer)[] = [];
  const required =
    kind === "products"
      ? ["sku", "name", "category", "unit", "selling_price", "stock"]
      : ["company", "contact", "email"];
  const fields = parsed.meta.fields || [];
  if (required.some((f) => !fields.includes(f)))
    return {
      rows: [],
      errors: [{ row: 1, message: `Required columns: ${required.join(", ")}` }],
    };
  if (parsed.data.length > 2000)
    return {
      rows: [],
      errors: [{ row: 1, message: "Maximum 2,000 rows per import." }],
    };
  const seen = new Set(
    kind === "products"
      ? state.products.map((p) => p.sku.toLowerCase())
      : state.customers.map((c) => c.company.toLowerCase()),
  );
  parsed.data.forEach((r, i) => {
    try {
      const key = (kind === "products" ? r.sku : r.company)
        ?.trim()
        .toLowerCase();
      if (!key || seen.has(key))
        throw Error(
          "Duplicate or empty identifier. Imports add new records only.",
        );
      seen.add(key);
      if (kind === "products") {
        const tax = r.tax_percent?.trim();
        const p = productSchema.parse({
          id: uid(),
          sku: r.sku.trim(),
          brand: r.brand || "",
          category: r.category,
          name: r.name,
          attributes: r.attributes || "",
          unit: r.unit,
          cost: r.cost_price?.trim() ? minor(r.cost_price) : null,
          price: minor(r.selling_price),
          physical: r.stock === "0" ? 0 : qty(r.stock),
          reserved: 0,
          taxBps: tax ? minor(tax) : null,
          active: r.active !== "false",
          stockAt: new Date().toISOString(),
        });
        rows.push(p);
      } else
        rows.push(
          customerSchema.parse({
            id: uid(),
            company: r.company,
            contact: r.contact || "",
            phone: r.phone || "",
            email: r.email || "",
            address: r.address || "",
            gstin: r.gstin || "",
            notes: r.notes || "",
            priceList: {},
          }),
        );
    } catch (e) {
      errors.push({ row: i + 2, message: (e as Error).message });
    }
  });
  return { rows, errors };
}
export function customerCSV(state: State) {
  return Papa.unparse(
    state.customers.map(({ id, priceList, ...c }) => c),
    { escapeFormulae: true },
  );
}
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give browsers time to begin the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
