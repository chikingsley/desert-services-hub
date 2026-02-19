import { describe, expect, test } from "bun:test";
import { parseDustApplicationDetail } from "../../../apps/aqdata-worker/src/aqdata/parsers/dust-application-detail";

const SAMPLE_DETAIL_HTML = `
<html>
  <head><title>Dust Application Detail</title></head>
  <body>
    <table>
      <tr id="ThePage:_idJsp23__xc_"><td>Company Name:</td><td>Acme Builders</td></tr>
      <tr id="ThePage:_idJsp25__xc_"><td>Issue Date:</td><td><span id="ThePage:_idJsp25">2/1/2026</span></td></tr>
      <tr id="ThePage:_idJsp26__xc_"><td>Expiration Date:</td><td><span id="ThePage:_idJsp26">2/28/2026</span></td></tr>
    </table>

    <div id="ThePage:siTable:12:locations">
      <table>
        <tr>
          <th>Select</th>
          <th>Address</th>
          <th>City</th>
          <th>County</th>
          <th>State</th>
          <th>Zip</th>
          <th>Parcel</th>
          <th>Latitude</th>
          <th>Longitude</th>
          <th>MCR#</th>
          <th>Exclude</th>
        </tr>
        <tr>
          <td><img src="/adf/images/radiorn.gif" alt="not selected" /></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp188">100 N FIRST ST</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp190">Phoenix</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp192">Maricopa</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp194">Arizona</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp196">85001</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp198">111-11-111</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp200">33.20000</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp202">-111.80000</span></td>
          <td><span id="ThePage:siTable:12:locations:0:_idJsp204"></span></td>
          <td><img src="/adf/images/checkrn.gif" alt="exclude false" /></td>
        </tr>
        <tr>
          <td><img src="/adf/images/radiors.gif" alt="selected" /></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp188" class="selected">200 N SECOND ST</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp190" class="selected">Phoenix</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp192" class="selected">Maricopa</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp194" class="selected">Arizona</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp196" class="selected">85002</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp198" class="selected">222-22-222</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp200" class="selected">33.21000</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp202" class="selected">-111.79000</span></td>
          <td><span id="ThePage:siTable:12:locations:1:_idJsp204" class="selected"></span></td>
          <td><img src="/adf/images/checkrn.gif" alt="exclude false" /></td>
        </tr>
      </table>
    </div>

    <div id="ThePage:DocTab">
      <table class="x2d">
        <tbody>
          <tr>
            <td><img alt="Not Required Attachment" /></td>
            <td>11111</td>
            <td><a href="https://aqdata.maricopa.gov/filestore/DustApplications/123/900001.pdf">Soil Report</a></td>
            <td>Project Geotech</td>
            <td>2/1/2026</td>
          </tr>
          <tr>
            <td><img alt="Not Required Attachment" /></td>
            <td>11112</td>
            <td><a href="https://aqdata.maricopa.gov/filestore/DustApplications/123/900002.pdf">Permit Document</a></td>
            <td>Generated Dust Permit Document</td>
            <td>2/1/2026</td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>
`;

describe("dust application detail structured parsing", () => {
  test("extracts header fallback fields and selected location", () => {
    const detail = parseDustApplicationDetail(SAMPLE_DETAIL_HTML, "D1234567");

    expect(detail.structured.header.companyName).toBe("Acme Builders");
    expect(detail.structured.header.issueDate).toBe("2/1/2026");
    expect(detail.structured.header.expirationDate).toBe("2/28/2026");

    expect(detail.structured.siteLocation.locations).toHaveLength(2);
    expect(
      detail.structured.siteLocation.locations.some((row) => row.isSelected)
    ).toBeTrue();

    expect(detail.coordinates).toEqual({
      latitude: 33.21,
      longitude: -111.79,
    });

    expect(detail.attachments).toHaveLength(2);
    expect(detail.permitDocument?.attachmentId).toBe("11112");
    expect(detail.permitDocument?.url).toContain("900002.pdf");
  });
});
