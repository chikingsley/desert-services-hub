/**
 * HTML to Text Conversion
 *
 * Uses Bun's built-in HTMLRewriter to extract clean text from HTML email bodies.
 */

const EMAIL_IN_ANGLES_REGEX =
  /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g;

function escapeEmailAngles(html: string): string {
  return html.replace(EMAIL_IN_ANGLES_REGEX, "&lt;$1&gt;");
}

export async function htmlToText(html: string): Promise<string> {
  const escapedHtml = escapeEmailAngles(html);

  let text = "";
  let skipDepth = 0;

  const rewriter = new HTMLRewriter()
    .on("style, script, head", {
      element(el) {
        skipDepth++;
        if ((el as unknown as { canHaveContent?: boolean }).canHaveContent) {
          el.onEndTag(() => {
            skipDepth--;
          });
        }
      },
    })
    .on("br", {
      element(el) {
        if (skipDepth === 0) {
          el.after("\n");
        }
      },
    })
    .on("p, div, tr, li, h1, h2, h3, h4, h5, h6, blockquote, pre", {
      element(el) {
        if (
          skipDepth === 0 &&
          (el as unknown as { canHaveContent?: boolean }).canHaveContent
        ) {
          el.onEndTag(() => {
            text += "\n";
          });
        }
      },
    })
    .onDocument({
      text(chunk) {
        if (skipDepth === 0) {
          text += chunk.text;
        }
      },
    });

  const response = new Response(escapedHtml, {
    headers: { "Content-Type": "text/html" },
  });
  await rewriter.transform(response).text();

  return cleanText(text);
}

function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/ \n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
