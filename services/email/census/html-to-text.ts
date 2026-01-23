/**
 * HTML to Text Conversion
 *
 * Uses Bun's built-in HTMLRewriter to extract clean text from HTML email bodies.
 */

/**
 * Extract plain text from HTML content.
 * Removes scripts, styles, and converts block elements to newlines.
 */
export async function htmlToText(html: string): Promise<string> {
  let text = "";
  let skipDepth = 0;

  const rewriter = new HTMLRewriter()
    // Track elements whose text we want to skip
    .on("style, script, head", {
      element(el) {
        skipDepth++;
        if (el.canHaveContent) {
          el.onEndTag(() => {
            skipDepth--;
          });
        }
      },
    })
    // Self-closing elements that should add newlines
    .on("br", {
      element(el) {
        if (skipDepth === 0) {
          el.after("\n");
        }
      },
    })
    // Block elements - add newline after end tag
    .on("p, div, tr, li, h1, h2, h3, h4, h5, h6, blockquote, pre", {
      element(el) {
        if (skipDepth === 0 && el.canHaveContent) {
          el.onEndTag(() => {
            text += "\n";
          });
        }
      },
    })
    // Capture text content (but skip if inside script/style/head)
    .onDocument({
      text(chunk) {
        if (skipDepth === 0) {
          text += chunk.text;
        }
      },
    });

  // HTMLRewriter works on Response objects
  const response = new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
  await rewriter.transform(response).text();

  // Clean up the extracted text
  return cleanText(text);
}

/**
 * Clean up extracted text - decode entities, normalize whitespace.
 */
function cleanText(text: string): string {
  return (
    text
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      // Decode numeric entities (&#123; or &#x7B;)
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
        String.fromCodePoint(Number.parseInt(hex, 16))
      )
      // Normalize whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n /g, "\n")
      .replace(/ \n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// CLI test
if (import.meta.main) {
  const testHtml = `<html><head><style>body{font-size:12pt}</style></head><body>
<div>Hello Jared,</div>
<div><br></div>
<div>Thanks for your patience with us on this. Attached is the revised subcontract with the updated dollar amount per our last conversation.</div>
<p>&nbsp;</p>
<p>Let me know if you have any questions.</p>
<p><b>Joe Bubar</b></p>
</body></html>`;

  const result = await htmlToText(testHtml);
  console.log("=== Extracted Text ===");
  console.log(result);
}
