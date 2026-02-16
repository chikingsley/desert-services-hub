declare module "postal-mime" {
  interface Address {
    name: string;
    address: string;
  }

  interface Attachment {
    filename: string;
    mimeType: string;
    disposition: string;
    content: ArrayBuffer;
  }

  interface ParsedEmail {
    from: Address;
    to: Address[];
    cc: Address[];
    bcc: Address[];
    subject: string;
    text: string;
    html: string;
    date: string;
    messageId: string;
    attachments: Attachment[];
  }

  export default class PostalMime {
    parse(input: string | ArrayBuffer | Uint8Array): Promise<ParsedEmail>;
  }
}
