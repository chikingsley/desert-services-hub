/**
 * SharePoint upload via Microsoft Graph API.
 *
 * Uploads inspection PDFs to the DataDrive site's Shared Documents library.
 */

async function getGraphToken(credentials: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Graph token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Graph token response missing access_token");
  }
  return data.access_token;
}

export interface SharePointResult {
  error?: string;
  success: boolean;
  webUrl?: string;
}

export async function uploadToSharePoint(
  credentials: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  },
  folderPath: string,
  fileName: string,
  content: Uint8Array
): Promise<SharePointResult> {
  try {
    const token = await getGraphToken(credentials);

    const driveEndpoint =
      "https://graph.microsoft.com/v1.0/sites/desertservices.sharepoint.com:/sites/DataDrive:/drives";

    const drivesRes = await fetch(driveEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!drivesRes.ok) {
      return {
        success: false,
        error: `Failed to get drives: ${drivesRes.status}`,
      };
    }

    const drivesData = (await drivesRes.json()) as {
      value: Array<{ id: string; name: string }>;
    };
    const docDrive = drivesData.value.find(
      (d) => d.name === "Documents" || d.name === "Shared Documents"
    );

    if (!docDrive) {
      return { success: false, error: "Could not find Documents drive" };
    }

    const uploadPath = `${folderPath}/${fileName}`;
    const encodedPath = uploadPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${docDrive.id}/root:/${encodedPath}:/content`;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/pdf",
      },
      body: content as BodyInit,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return {
        success: false,
        error: `Upload failed: ${uploadRes.status} - ${errorText}`,
      };
    }

    const uploadData = (await uploadRes.json()) as { webUrl: string };
    // Return folder URL (strip filename) so user can verify file is there
    const folderUrl = uploadData.webUrl.substring(
      0,
      uploadData.webUrl.lastIndexOf("/")
    );
    return { success: true, webUrl: folderUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
