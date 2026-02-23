/**
 * Tests that handler error paths return isError: true
 * All handlers are called with missing/invalid args — no real API calls made.
 */
import { describe, expect, test } from "bun:test";
import {
  handleArchiveEmail,
  handleDeleteEmail,
} from "@outlook/email/archive-delete";
import {
  handleGetMasterCategories,
  handleSetEmailCategories,
} from "@outlook/email/categories";
import { handleListEmails } from "@outlook/email/list";
import { handleMarkAsRead } from "@outlook/email/mark-as-read";
import { handleReadEmail } from "@outlook/email/read";
import { handleSendEmail } from "@outlook/email/send";
import handleCreateRule from "@outlook/rules/create";

describe("email handlers — missing mailbox returns isError: true", () => {
  test("list-emails: missing mailbox", async () => {
    const res = await handleListEmails({});
    expect(res.isError).toBe(true);
  });

  test("read-email: missing mailbox", async () => {
    const res = await handleReadEmail({});
    expect(res.isError).toBe(true);
  });

  test("send-email: missing mailbox", async () => {
    const res = await handleSendEmail({} as never);
    expect(res.isError).toBe(true);
  });

  test("mark-as-read: missing mailbox", async () => {
    const res = await handleMarkAsRead({});
    expect(res.isError).toBe(true);
  });

  test("archive-email: missing mailbox", async () => {
    const res = await handleArchiveEmail({});
    expect(res.isError).toBe(true);
  });

  test("delete-email: missing mailbox", async () => {
    const res = await handleDeleteEmail({});
    expect(res.isError).toBe(true);
  });

  test("get-master-categories: missing mailbox", async () => {
    const res = await handleGetMasterCategories({});
    expect(res.isError).toBe(true);
  });

  test("set-email-categories: missing mailbox", async () => {
    const res = await handleSetEmailCategories({});
    expect(res.isError).toBe(true);
  });
});

describe("email handlers — missing required args return isError: true", () => {
  test("read-email: missing id", async () => {
    const res = await handleReadEmail({ mailbox: "chi@desertservices.net" });
    expect(res.isError).toBe(true);
  });

  test("send-email: missing to", async () => {
    const res = await handleSendEmail({
      mailbox: "chi@desertservices.net",
      subject: "x",
      body: "y",
    } as never);
    expect(res.isError).toBe(true);
  });

  test("send-email: missing subject", async () => {
    const res = await handleSendEmail({
      mailbox: "chi@desertservices.net",
      to: "a@b.com",
      body: "y",
    } as never);
    expect(res.isError).toBe(true);
  });

  test("send-email: missing body", async () => {
    const res = await handleSendEmail({
      mailbox: "chi@desertservices.net",
      to: "a@b.com",
      subject: "x",
    } as never);
    expect(res.isError).toBe(true);
  });

  test("mark-as-read: missing id", async () => {
    const res = await handleMarkAsRead({ mailbox: "chi@desertservices.net" });
    expect(res.isError).toBe(true);
  });

  test("archive-email: missing id", async () => {
    const res = await handleArchiveEmail({ mailbox: "chi@desertservices.net" });
    expect(res.isError).toBe(true);
  });

  test("delete-email: missing id", async () => {
    const res = await handleDeleteEmail({ mailbox: "chi@desertservices.net" });
    expect(res.isError).toBe(true);
  });

  test("set-email-categories: missing id", async () => {
    const res = await handleSetEmailCategories({
      mailbox: "chi@desertservices.net",
    });
    expect(res.isError).toBe(true);
  });
});

describe("rules handlers — missing mailbox returns isError: true", () => {
  test("create-rule: missing mailbox", async () => {
    const res = await handleCreateRule({} as never);
    expect(res.isError).toBe(true);
  });
});

describe("rules handlers — missing required args return isError: true", () => {
  test("create-rule: missing name", async () => {
    const res = await handleCreateRule({
      mailbox: "chi@desertservices.net",
    } as never);
    expect(res.isError).toBe(true);
  });

  test("create-rule: missing condition", async () => {
    const res = await handleCreateRule({
      mailbox: "chi@desertservices.net",
      name: "Test",
      moveToFolder: "Inbox",
    } as never);
    expect(res.isError).toBe(true);
  });

  test("create-rule: missing action", async () => {
    const res = await handleCreateRule({
      mailbox: "chi@desertservices.net",
      name: "Test",
      fromAddresses: "x@y.com",
    } as never);
    expect(res.isError).toBe(true);
  });
});
