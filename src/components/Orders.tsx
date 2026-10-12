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
export default function Orders({
  state,
  orders,
  run,
  onInvoices,
}: {
  state: State;
  orders: State["orders"];
  run: Run;
  onInvoices?: () => void;
}) {
  const [cancel, setCancel] = useState("");
  const [reason, setReason] = useState("");
  return (
    <>
      <p className="muted">
        Confirmed orders reserve stock. Dispatch subtracts physical stock and
        releases reservations. Cancellation releases reservations before
        dispatch.
      </p>
      <Table
        headers={[
          "Order",
          "Customer",
          "Status",
          "Order value",
          "Created",
          "Next action",
        ]}
      >
        {orders.map((o) => (
          <tr key={o.id}>
            <td>
              <strong>{o.number}</strong>
              <small>
                {o.lines
                  .map((l) => `${l.quantity} ${l.unit} ${l.sku}`)
                  .join(", ")}
              </small>
            </td>
            <td>
              {state.customers.find((c) => c.id === o.customerId)?.company}
            </td>
            <td>
              <Tag text={o.status} />
            </td>
            <td>{money(o.total)}</td>
            <td>{localDay(o.createdAt, state.settings.timezone)}</td>
            <td>
              <div className="toolbar">
                {state.invoices?.some((i) => i.orderId === o.id) ? (
                  <Button variant="outline" onClick={onInvoices}>
                    View invoice
                  </Button>
                ) : o.status !== "Cancelled" ? (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (await run({ type: "invoice.create", orderId: o.id }))
                        onInvoices?.();
                    }}
                  >
                    Create invoice
                  </Button>
                ) : null}
                {["Confirmed", "Preparing", "Dispatched"].includes(o.status) ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      run({
                        type: "order.status",
                        id: o.id,
                        status:
                          o.status === "Confirmed"
                            ? "Preparing"
                            : o.status === "Preparing"
                              ? "Dispatched"
                              : "Delivered",
                      })
                    }
                  >
                    {o.status === "Confirmed"
                      ? "Start preparing"
                      : o.status === "Preparing"
                        ? "Mark dispatched"
                        : "Mark delivered"}
                  </Button>
                ) : null}
                {["Confirmed", "Preparing"].includes(o.status) ? (
                  <Button variant="outline" onClick={() => setCancel(o.id)}>
                    Cancel order
                  </Button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {!orders.length ? (
        <Empty text="No orders yet. Convert an accepted, approved quotation to reserve stock." />
      ) : null}
      <Dialog
        open={!!cancel}
        onOpenChange={(o) => {
          if (!o) setCancel("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order</DialogTitle>
            <DialogDescription>
              This releases the order's stock reservations. Dispatched orders
              cannot be cancelled here.
            </DialogDescription>
          </DialogHeader>
          <FieldInput
            label="Cancellation reason"
            value={reason}
            onChange={setReason}
          />
          <Button
            onClick={async () => {
              if (
                await run({
                  type: "order.status",
                  id: cancel,
                  status: "Cancelled",
                  reason,
                })
              ) {
                setCancel("");
                setReason("");
              }
            }}
          >
            Confirm cancellation
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
