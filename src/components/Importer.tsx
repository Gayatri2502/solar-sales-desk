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
export default function Importer({
  kind,
  state,
  run,
}: {
  kind: "products" | "customers";
  state: State;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>Import {kind}</DialogTitle>
            <DialogDescription>
              Preview up to 2,000 rows before saving. Duplicate identifiers are
              rejected. Stock imports are snapshots.
            </DialogDescription>
          </DialogHeader>
          <a href={"/templates/" + kind + ".csv"} download>
            Download CSV template
          </a>
          <Field>
            <FieldLabel htmlFor={"csv-" + kind}>
              CSV file (maximum 1 MB)
            </FieldLabel>
            <input
              id={"csv-" + kind}
              aria-label="Import CSV file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 1000000) throw Error("CSV exceeds 1 MB.");
                  setPreview(previewCSV(await f.text(), kind, state));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </Field>
          {error ? <p role="alert">{error}</p> : null}
          {preview ? (
            <>
              <p>
                {preview.rows.length} valid rows · {preview.errors.length}{" "}
                errors
              </p>
              {preview.errors.length ? (
                <Table headers={["CSV row", "Error"]}>
                  {preview.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </Table>
              ) : null}
              <Table headers={["Identifier", "Name"]}>
                {preview.rows.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{"sku" in r ? r.sku : r.company}</td>
                    <td>{"name" in r ? r.name : r.contact}</td>
                  </tr>
                ))}
              </Table>
              <p className="muted">
                Preview shows the first 20 valid rows. Fix all errors before
                committing; no partial import.
              </p>
              <Button
                disabled={!preview.rows.length || !!preview.errors.length}
                onClick={async () => {
                  if (await run({ type: "import", kind, rows: preview.rows })) {
                    setOpen(false);
                    setPreview(null);
                  }
                }}
              >
                Commit validated import
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
