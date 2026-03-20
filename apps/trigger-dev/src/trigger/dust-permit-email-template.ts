function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function wrapDustPermitEmail(content: string): string {
  return `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>${content}</body>
</html>`;
}

export function dustPermitGreeting(): string {
  return "<div>Team,</div><div><br></div>";
}

export function dustPermitSignature(): string {
  return `<div><br></div>
<div>Best,</div>
<div><br></div>
<div>${escapeHtml("Chi Ejimofor")}</div>
<div>${escapeHtml("Project Coordinator")}</div>
<div>Desert Services LLC</div>
<div>E: ${escapeHtml("chi@desertservices.net")}</div>
<div>O: ${escapeHtml("(480) 513-8986")}</div>`;
}

export function dustPermitClosing(): string {
  return `<div><br></div><div>Let me know if you have any questions!</div>${dustPermitSignature()}`;
}
