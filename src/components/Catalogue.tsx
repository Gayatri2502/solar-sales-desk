import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Users,
  Package,
  Truck,
  Settings,
  Sun,
  Plus,
  ArrowUpRight,
  Search,
  Download,
  LogOut,
} from "lucide-react";
import {
  type State,
  type Quote,
  type Enquiry,
  type Line,
  type Extraction,
  type Product,
  type Customer,
  type Command,
  uid,
  minor,
  qty,
  totals,
  money,
  localDay,
  match,
  mockExtract,
  warnings,
  categories,
  stages,
} from "../domain";
import {
  loadDemo,
  command,
  live,
  auth,
  request,
  demoVisible,
  resetDemo,
  type Session,
} from "../api";
import { seed } from "../seed";
import { previewCSV, customerCSV, download, type Preview } from "../csv";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { FieldInput, Tag, Table, Empty, safeTotal, type Run } from "./shared";
import Importer from "./Importer";
export default function Catalogue({
  state,
  products,
  admin,
  run,
}: {
  state: State;
  products: Product[];
  admin: boolean;
  run: Run;
}) {
  const [edit, setEdit] = useState<Product | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const newProduct = (): Product => ({
    id: uid(),
    sku: "",
    brand: "",
    category: "Panel",
    name: "",
    attributes: "",
    unit: "pcs",
    cost: null,
    price: 0,
    physical: 0,
    reserved: 0,
    taxBps: null,
    active: true,
    stockAt: new Date().toISOString(),
  });
  return (
    <>
      {admin ? (
        <div className="toolbar">
          <Button onClick={() => setEdit(newProduct())}>Add product</Button>
          <Importer kind="products" state={state} run={run} />
        </div>
      ) : (
        <p>
          Business admin manages products and stock. Cost prices are restricted.
        </p>
      )}
      <Table
        headers={[
          "SKU / product",
          "Category",
          "Selling price",
          ...(admin ? ["Cost"] : []),
          "Physical",
          "Reserved",
          "Available",
          "Snapshot",
          "",
        ]}
      >
        {products.map((p) => (
          <tr key={p.id}>
            <td>
              <strong>{p.sku}</strong>
              <small>
                {p.name} · {p.active ? "Active" : "Inactive"}
              </small>
            </td>
            <td>{p.category}</td>
            <td>
              {money(p.price)}
              <small>
                {p.taxBps === null ? "Tax unset" : p.taxBps / 100 + "% tax"}
              </small>
            </td>
            {admin ? (
              <td>{p.cost === null ? "Missing" : money(p.cost)}</td>
            ) : null}
            <td>
              {p.physical / 1000} {p.unit}
            </td>
            <td>{p.reserved / 1000}</td>
            <td>{(p.physical - p.reserved) / 1000}</td>
            <td>{localDay(p.stockAt, state.settings.timezone)}</td>
            <td>
              {admin ? (
                <div className="toolbar">
                  <Button variant="outline" onClick={() => setEdit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAdjust(p);
                      setPhysical(String(p.physical / 1000));
                    }}
                  >
                    Adjust stock
                  </Button>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </Table>
      {!products.length ? (
        <Empty text="No products match. Clear your search or add catalogue products." />
      ) : null}
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>
              {state.products.some((p) => p.id === edit?.id)
                ? "Edit product"
                : "Add product"}
            </DialogTitle>
            <DialogDescription>
              Enter verified specifications. Stock quantities use up to three
              decimals.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run({ type: "product.save", product: edit }))
                  setEdit(null);
              }}
            >
              <FieldGroup>
                <div className="form-grid">
                  <FieldInput
                    label="SKU"
                    value={edit.sku}
                    onChange={(v) => setEdit({ ...edit, sku: v })}
                    required
                  />
                  <FieldInput
                    label="Product name"
                    value={edit.name}
                    onChange={(v) => setEdit({ ...edit, name: v })}
                    required
                  />
                  <FieldInput
                    label="Brand"
                    value={edit.brand}
                    onChange={(v) => setEdit({ ...edit, brand: v })}
                  />
                  <Field>
                    <FieldLabel htmlFor="category">Category</FieldLabel>
                    <select
                      aria-label="Category"
                      id="category"
                      value={edit.category}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          category: e.target.value as Product["category"],
                        })
                      }
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <FieldInput
                    label="Unit"
                    value={edit.unit}
                    onChange={(v) => setEdit({ ...edit, unit: v })}
                    required
                  />
                  <FieldInput
                    label="Selling price (₹)"
                    value={edit.price / 100}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) => {
                      try {
                        setEdit({ ...edit, price: minor(v) });
                      } catch {
                        setError("Enter a valid selling price.");
                      }
                    }}
                  />
                  <FieldInput
                    label="Cost price (₹, optional)"
                    value={edit.cost === null ? "" : edit.cost / 100}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) => {
                      try {
                        setEdit({ ...edit, cost: v ? minor(v) : null });
                      } catch {
                        setError("Enter a valid cost price.");
                      }
                    }}
                  />
                  <FieldInput
                    label="Product tax (%, optional override)"
                    value={edit.taxBps === null ? "" : edit.taxBps / 100}
                    type="number"
                    min={0}
                    step="0.01"
                    onChange={(v) => {
                      try {
                        setEdit({ ...edit, taxBps: v ? minor(v) : null });
                      } catch {
                        setError("Enter a valid tax percentage.");
                      }
                    }}
                  />
                </div>
                <FieldInput
                  label="Verified technical attributes"
                  value={edit.attributes}
                  onChange={(v) => setEdit({ ...edit, attributes: v })}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={edit.active}
                    onChange={(e) =>
                      setEdit({ ...edit, active: e.target.checked })
                    }
                  />{" "}
                  Active product
                </label>
                <p>
                  New products start with zero stock. Record a stock adjustment
                  with a reason after saving.
                </p>
                {error ? <p role="alert">{error}</p> : null}
                <Button>Save product</Button>
              </FieldGroup>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!adjust}
        onOpenChange={(o) => {
          if (!o) setAdjust(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock · {adjust?.sku}</DialogTitle>
            <DialogDescription>
              Set verified physical stock. Reservations remain in place. Every
              change is audited.
            </DialogDescription>
          </DialogHeader>
          <FieldInput
            label="Physical stock quantity"
            value={physical}
            onChange={setPhysical}
          />
          <FieldInput
            label="Adjustment reason"
            value={reason}
            onChange={setReason}
          />
          <Button
            onClick={async () => {
              try {
                if (
                  await run({
                    type: "stock.adjust",
                    id: adjust?.id,
                    physical: physical === "0" ? 0 : qty(physical),
                    reason,
                  })
                ) {
                  setAdjust(null);
                  setReason("");
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save stock adjustment
          </Button>
          {error ? <p role="alert">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
