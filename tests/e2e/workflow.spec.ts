import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("complete quotation, approval, follow-up and stock workflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Default product tax (%)").fill("0");
  await page.getByLabel("Delivery tax (%)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save business settings" }).click();
  await page.getByRole("link", { name: "Enquiries", exact: false }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Aarav Energy" })
    .getByRole("button", { name: "Review" })
    .click();
  await page.getByLabel("Catalogue product for item 1").selectOption("p0");
  await page.getByLabel("Catalogue product for item 2").selectOption("p2");
  await page.getByRole("button", { name: "Create draft quotation" }).click();
  await expect(
    page.getByRole("heading", { name: "Quotation builder" }),
  ).toBeVisible();
  await page
    .getByLabel("Approval reason (required to acknowledge warnings)")
    .fill("Synthetic test; technical evidence pending");
  await page.getByRole("button", { name: "Approve saved quotation" }).click();
  await expect(
    page.getByRole("button", { name: "Mark sent after sharing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark sent after sharing" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".customer-document")).toBeVisible();
  await expect(
    page.getByText("Internal cost:", { exact: false }),
  ).not.toBeVisible();
  await page.pdf({
    path: "docs/verified-customer-quotation.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Convert accepted quote to order" })
    .click();
  await expect(
    page.getByRole("button", { name: "Order already created" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await page
    .getByLabel("Cancellation reason")
    .fill("Synthetic pilot cancellation");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});
test("mobile, keyboard, dialog focus and accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "New enquiry" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "New enquiry" })).toBeFocused();
  for (const name of [
    "Dashboard",
    "Enquiries",
    "Quotations",
    "Customers",
    "Products & Stock",
    "Orders",
    "Settings",
  ]) {
    await page.getByRole("link", { name, exact: name !== "Enquiries" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
});
test("sales hides costs and admin actions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Demo role").selectOption("sales");
  await page
    .getByRole("link", { name: "Products & Stock", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Cost", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save business settings" }),
  ).toHaveCount(0);
});
