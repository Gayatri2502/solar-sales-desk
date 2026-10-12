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
export type Run = (cmd: Command) => Promise<State | undefined>;
export function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  ...props
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  min?: number;
  step?: string;
}) {
  const id = label.replace(/\W/g, "-");
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...props}
      />
    </Field>
  );
}
export function Tag({ text }: { text: string }) {
  return <Badge variant="outline">{text}</Badge>;
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h || "Actions"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
export function safeTotal(q: Quote) {
  try {
    return totals(q.lines, q.delivery, q.deliveryTaxBps).total;
  } catch {
    return null;
  }
}
