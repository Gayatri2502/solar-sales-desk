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
export default function Customers({
  state,
  customers,
  admin,
  run,
}: {
  state: State;
  customers: Customer[];
  admin: boolean;
  run: Run;
}) {
  const [edit, setEdit] = useState<Customer | null>(null);
  return (
    <>
      <div className="toolbar">
        <Button
          onClick={() =>
            setEdit({
              id: uid(),
              company: "",
              contact: "",
              phone: "",
              email: "",
              address: "",
              gstin: "",
              notes: "",
              priceList: {},
            })
          }
        >
          Add customer
        </Button>
        {admin ? <Importer kind="customers" state={state} run={run} /> : null}
        <Button
          variant="outline"
          onClick={() =>
            download("customers.csv", customerCSV(state), "text/csv")
          }
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>
      <Table headers={["Company", "Contact", "Email / phone", "Address", ""]}>
        {customers.map((c) => (
          <tr key={c.id}>
            <td>
              <strong>{c.company}</strong>
            </td>
            <td>{c.contact}</td>
            <td>
              {c.email}
              <small>{c.phone}</small>
            </td>
            <td>{c.address}</td>
            <td>
              <Button variant="outline" onClick={() => setEdit(c)}>
                Edit customer
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      {!customers.length ? (
        <Empty text="No customers match. Add a customer before capturing their enquiry." />
      ) : null}
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>Customer details</DialogTitle>
            <DialogDescription>
              Use only the contact details needed for this sale.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run({ type: "customer.save", customer: edit }))
                  setEdit(null);
              }}
            >
              <FieldGroup>
                <div className="form-grid">
                  {(
                    [
                      "company",
                      "contact",
                      "phone",
                      "email",
                      "address",
                      "gstin",
                      "notes",
                    ] as const
                  ).map((k) => (
                    <FieldInput
                      key={k}
                      label={
                        k === "gstin"
                          ? "GSTIN (optional)"
                          : k.charAt(0).toUpperCase() + k.slice(1)
                      }
                      value={edit[k]}
                      type={k === "email" ? "email" : "text"}
                      required={k === "company"}
                      onChange={(v) => setEdit({ ...edit, [k]: v })}
                    />
                  ))}
                </div>
                {admin ? (
                  <details>
                    <summary>Approved customer price list (optional)</summary>
                    <p>
                      Blank uses the catalogue selling price. Admin changes are
                      audited.
                    </p>
                    {state.products
                      .filter((p) => p.active)
                      .map((p) => (
                        <FieldInput
                          key={p.id}
                          label={`${p.sku} customer price (₹)`}
                          value={
                            edit.priceList[p.id] === undefined
                              ? ""
                              : edit.priceList[p.id] / 100
                          }
                          type="number"
                          min={0}
                          step="0.01"
                          onChange={(v) => {
                            const priceList = { ...edit.priceList };
                            if (v === "") delete priceList[p.id];
                            else {
                              try {
                                priceList[p.id] = minor(v);
                              } catch {
                                return;
                              }
                            }
                            setEdit({ ...edit, priceList });
                          }}
                        />
                      ))}
                  </details>
                ) : null}
                <Button>Save customer</Button>
              </FieldGroup>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
