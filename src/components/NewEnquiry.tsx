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
export default function NewEnquiry({
  state,
  run,
  onDone,
}: {
  state: State;
  run: Run;
  onDone: (id: string) => void;
}) {
  const [customerId, setCustomer] = useState(state.customers[0]?.id || "");
  const [text, setText] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function extract() {
    setLoading(true);
    setError("");
    try {
      setExtraction(
        live
          ? (await request("/extract", { text })).extraction
          : mockExtract(text),
      );
    } catch (e) {
      setError((e as Error).message + " You can enter items manually.");
    } finally {
      setLoading(false);
    }
  }
  async function pdf(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024)
        throw Error("Choose a PDF under 5 MB.");
      const buffer = await file.arrayBuffer();
      if (new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-")
        throw Error("This file is not a PDF.");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const doc = await pdfjs.getDocument({ data: buffer }).promise;
      if (doc.numPages > 25) {
        await doc.destroy();
        throw Error("PDF exceeds 25 pages. Enter the requirements manually.");
      }
      let extracted = "";
      try {
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          extracted +=
            content.items.map((x) => ("str" in x ? x.str : "")).join(" ") +
            "\n";
          if (extracted.length > 12000)
            throw Error(
              "PDF text exceeds 12,000 characters. Use selected requirements only.",
            );
        }
      } finally {
        await doc.destroy();
      }
      if (extracted.trim().length < 10)
        throw Error(
          "No usable text found. Scanned PDFs need manual entry; OCR is not included.",
        );
      setText(extracted);
      setError(
        "PDF text extracted locally. Review the text before extraction.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div aria-busy={loading}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-customer">Customer</FieldLabel>
          <select
            aria-label="Customer"
            id="new-customer"
            value={customerId}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Select customer</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="pdf">
            Text-based PDF (optional, maximum 5 MB)
          </FieldLabel>
          <input
            aria-label="Text-based PDF (optional, maximum 5 MB)"
            id="pdf"
            type="file"
            accept="application/pdf"
            onChange={(e) => void pdf(e.target.files?.[0])}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="enquiry-text">
            Enquiry text (maximum 12,000 characters)
          </FieldLabel>
          <textarea
            id="enquiry-text"
            value={text}
            maxLength={12000}
            onChange={(e) => setText(e.target.value)}
            placeholder="20 pcs 540 W panels; 1 pcs 5 kW inverter"
            rows={5}
          />
        </Field>
        <div className="toolbar">
          <Button
            type="button"
            disabled={loading || !text.trim()}
            onClick={extract}
          >
            {loading
              ? "Extracting…"
              : live
                ? "Extract with configured provider"
                : "Extract with demo parser"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setExtraction({
                items: [
                  {
                    description: "",
                    quantity: null,
                    unit: null,
                    specifications: "",
                  },
                ],
                destination: "",
                requestedDate: "",
                missing: [],
              })
            }
          >
            Enter items manually
          </Button>
        </div>
        <p className="muted">
          {live
            ? "Text is sent to the configured server-side provider on demand. Review the output."
            : "The demo parser only recognizes quantities followed by pcs, units, sets or nos. It does not infer technical compatibility."}
        </p>
        {extraction ? (
          <>
            <h3>Review extracted requirements</h3>
            {extraction.items.map((item, i) => (
              <fieldset key={i}>
                <legend>Item {i + 1}</legend>
                <FieldInput
                  label={`Description ${i + 1}`}
                  value={item.description}
                  onChange={(v) =>
                    setExtraction({
                      ...extraction,
                      items: extraction.items.map((x, n) =>
                        n === i ? { ...x, description: v } : x,
                      ),
                    })
                  }
                  required
                />
                <div className="form-grid">
                  <FieldInput
                    label={`Quantity ${i + 1}`}
                    value={item.quantity || ""}
                    onChange={(v) =>
                      setExtraction({
                        ...extraction,
                        items: extraction.items.map((x, n) =>
                          n === i ? { ...x, quantity: v || null } : x,
                        ),
                      })
                    }
                  />
                  <FieldInput
                    label={`Unit ${i + 1}`}
                    value={item.unit || ""}
                    onChange={(v) =>
                      setExtraction({
                        ...extraction,
                        items: extraction.items.map((x, n) =>
                          n === i ? { ...x, unit: v || null } : x,
                        ),
                      })
                    }
                  />
                </div>
                <FieldInput
                  label={`Specifications ${i + 1}`}
                  value={item.specifications}
                  onChange={(v) =>
                    setExtraction({
                      ...extraction,
                      items: extraction.items.map((x, n) =>
                        n === i ? { ...x, specifications: v } : x,
                      ),
                    })
                  }
                />
              </fieldset>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setExtraction({
                  ...extraction,
                  items: [
                    ...extraction.items,
                    {
                      description: "",
                      quantity: null,
                      unit: null,
                      specifications: "",
                    },
                  ],
                })
              }
            >
              Add requested item
            </Button>
            <FieldInput
              label="Delivery destination"
              value={extraction.destination}
              onChange={(v) => setExtraction({ ...extraction, destination: v })}
            />
            <FieldInput
              label="Requested delivery date"
              value={extraction.requestedDate}
              onChange={(v) =>
                setExtraction({ ...extraction, requestedDate: v })
              }
            />
            {extraction.missing.map((m) => (
              <p key={m} className="warning">
                {m}
              </p>
            ))}
            <Button
              onClick={async () => {
                const n = await run({
                  type: "enquiry.create",
                  customerId,
                  text,
                  extraction,
                });
                if (n) onDone(n.enquiries[0].id);
              }}
            >
              Save enquiry
            </Button>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </FieldGroup>
    </div>
  );
}
