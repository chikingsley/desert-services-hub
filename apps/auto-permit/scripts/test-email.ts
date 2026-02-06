import { sendEmailInternal } from "@/api/email";

async function test() {
  console.log("Testing email service...");
  try {
    const result = await sendEmailInternal({
      to: "chi@desertservices.net",
      subject: "Test from Auto-Dust-Permit",
      body: "This is a test email from the newly integrated email service in auto-dust-permit.",
    });
    console.log("Success:", result);
  } catch (error) {
    console.error("Failed to send test email:", error);
  }
}

test();
