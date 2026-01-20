/**
 *  Your browser automation script
 *  @see https://docs.stagehand.dev/v3/first-steps/introduction
 */

// Step 1: Navigate to URL
console.log(
  "Navigating to: https://legacy.azdeq.gov/databases/azpdessearch_drupal.html"
);
await page.goto("https://legacy.azdeq.gov/databases/azpdessearch_drupal.html");

// Step 2: User-recorded click action
console.log(
  "Performing recorded action: Click the Application Type dropdown menu."
);
await stagehand.act({
  selector: `//select[@id="App Type"]`,
  description: "Click the Application Type dropdown menu.",
  method: "click",
  arguments: [],
});

// Step 3: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //select[@id="App Type"]`
);
await stagehand.act({
  selector: `//select[@id="App Type"]`,
  description: `Click on element at //select[@id="App Type"]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1785));
// Step 4: User-recorded click action
console.log(
  `Performing recorded action: Click the "Waiver Construction" dropdown option.`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-NrYcc-panel"]/div[2]`,
  description: `Click the "Waiver Construction" dropdown option.`,
  method: "click",
  arguments: [],
});

// Step 5: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //div[@id="bb-customSelect-NrYcc-panel"]/div[2]`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-NrYcc-panel"]/div[2]`,
  description: `Click on element at //div[@id="bb-customSelect-NrYcc-panel"]/div[2]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1202));
// Step 6: User-recorded scroll action
console.log("Performing recorded action: Scroll down 169px");
await page.mouse.move(519, 445);
await page.mouse.wheel(0, 169);
await page.waitForTimeout(500);

// Step 7: User-recorded scroll action
console.log("Performing recorded action: Scroll down 169px");
await page.mouse.move(519, 445);
await page.mouse.wheel(0, 169);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 1618));
// Step 8: User-recorded scroll action
console.log("Performing recorded action: Scroll down 102px");
await page.mouse.move(471, 550);
await page.mouse.wheel(0, 102);
await page.waitForTimeout(500);

// Step 9: User-recorded scroll action
console.log("Performing recorded action: Scroll down 102px");
await page.mouse.move(471, 550);
await page.mouse.wheel(0, 102);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 831));
// Step 10: User-recorded click action
console.log(
  "Performing recorded action: Click the Facility County dropdown menu."
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[5]/td[2]",
  description: "Click the Facility County dropdown menu.",
  method: "click",
  arguments: [],
});

// Step 11: User-recorded click action
console.log(
  "Performing recorded action: Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[5]/td[2]"
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[5]/td[2]",
  description:
    "Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[5]/td[2]",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1537));
// Step 12: User-recorded scroll action
console.log("Performing recorded action: Scroll down 348px");
await page.mouse.move(522, 565);
await page.mouse.wheel(0, 348);
await page.waitForTimeout(500);

// Step 13: User-recorded scroll action
console.log("Performing recorded action: Scroll down 348px");
await page.mouse.move(522, 565);
await page.mouse.wheel(0, 348);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 827));
// Step 14: User-recorded scroll action
console.log("Performing recorded action: Scroll up 5px");
await page.mouse.move(522, 558);
await page.mouse.wheel(0, -5);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 3));
// Step 15: User-recorded scroll action
console.log("Performing recorded action: Scroll up 5px");
await page.mouse.move(522, 558);
await page.mouse.wheel(0, -5);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 2063));
// Step 16: User-recorded click action
console.log(
  `Performing recorded action: Click the "Maricopa" option in the county dropdown list.`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-ehO7y-panel"]/div[3]`,
  description: `Click the "Maricopa" option in the county dropdown list.`,
  method: "click",
  arguments: [],
});

// Step 17: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //div[@id="bb-customSelect-ehO7y-panel"]/div[3]`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-ehO7y-panel"]/div[3]`,
  description: `Click on element at //div[@id="bb-customSelect-ehO7y-panel"]/div[3]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1689));
// Step 18: User-recorded scroll action
console.log("Performing recorded action: Scroll down 475px");
await page.mouse.move(589, 523);
await page.mouse.wheel(0, 475);
await page.waitForTimeout(500);

// Step 19: User-recorded scroll action
console.log("Performing recorded action: Scroll down 475px");
await page.mouse.move(589, 523);
await page.mouse.wheel(0, 475);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 1011));
// Step 20: User-recorded scroll action
console.log("Performing recorded action: Scroll down 509px");
await page.mouse.move(431, 620);
await page.mouse.wheel(0, 509);
await page.waitForTimeout(500);

// Step 21: User-recorded scroll action
console.log("Performing recorded action: Scroll down 509px");
await page.mouse.move(431, 620);
await page.mouse.wheel(0, 509);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 2068));
// Step 22: User-recorded click action
console.log(
  `Performing recorded action: Click the "Clear" button to reset form fields.`
);
await stagehand.act({
  selector: "/html",
  description: `Click the "Clear" button to reset form fields.`,
  method: "click",
  arguments: [],
});

// Step 23: User-recorded click action
console.log("Performing recorded action: Click on element at /html");
await stagehand.act({
  selector: "/html",
  description: "Click on element at /html",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1674));
// Step 24: User-recorded scroll action
console.log("Performing recorded action: Scroll down 485px");
await page.mouse.move(1113, 252);
await page.mouse.wheel(0, 485);
await page.waitForTimeout(500);

// Step 25: User-recorded scroll action
console.log("Performing recorded action: Scroll down 485px");
await page.mouse.move(1113, 252);
await page.mouse.wheel(0, 485);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 3128));
// Step 26: User-recorded click action
console.log(
  `Performing recorded action: Click the "Search" button to execute the database query.`
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  description: `Click the "Search" button to execute the database query.`,
  method: "click",
  arguments: [],
});

// Step 27: User-recorded click action
console.log(
  "Performing recorded action: Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table"
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  description:
    "Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 3384));
// Step 28: User-recorded scroll action
console.log("Performing recorded action: Scroll down 9216px");
await page.mouse.move(1022, 511);
await page.mouse.wheel(0, 9216);
await page.waitForTimeout(500);

// Step 29: User-recorded scroll action
console.log("Performing recorded action: Scroll down 9216px");
await page.mouse.move(1022, 511);
await page.mouse.wheel(0, 9216);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 5550));
// Step 30: User-recorded click action
console.log(`Performing recorded action: Click the page number "131" link.`);
await stagehand.act({
  selector: "",
  description: `Click the page number "131" link.`,
  method: "click",
  arguments: [],
});

// Step 31: User-recorded click action
console.log("Performing recorded action: Click on element at ");
await stagehand.act({
  selector: "",
  description: "Click on element at ",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1717));
// Step 32: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11088px");
await page.mouse.move(343, 506);
await page.mouse.wheel(0, 11_088);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 1));
// Step 33: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11088px");
await page.mouse.move(343, 506);
await page.mouse.wheel(0, 11_088);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 4364));
// Step 34: User-recorded click action
console.log(`Performing recorded action: Click the page number "130" link.`);
await stagehand.act({
  selector: "",
  description: `Click the page number "130" link.`,
  method: "click",
  arguments: [],
});

// Step 35: User-recorded click action
console.log("Performing recorded action: Click on element at ");
await stagehand.act({
  selector: "",
  description: "Click on element at ",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 2566));
// Step 36: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11904px");
await page.mouse.move(975, 545);
await page.mouse.wheel(0, 11_904);
await page.waitForTimeout(500);

// Step 37: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11904px");
await page.mouse.move(975, 545);
await page.mouse.wheel(0, 11_904);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 3984));
// Step 38: User-recorded click action
console.log(`Performing recorded action: Click the page number "132" link.`);
await stagehand.act({
  selector: "",
  description: `Click the page number "132" link.`,
  method: "click",
  arguments: [],
});

// Step 39: User-recorded click action
console.log("Performing recorded action: Click on element at ");
await stagehand.act({
  selector: "",
  description: "Click on element at ",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1637));
// Step 40: User-recorded scroll action
console.log("Performing recorded action: Scroll down 13433px");
await page.mouse.move(359, 494);
await page.mouse.wheel(0, 13_433);
await page.waitForTimeout(500);

// Step 41: User-recorded scroll action
console.log("Performing recorded action: Scroll down 13433px");
await page.mouse.move(359, 494);
await page.mouse.wheel(0, 13_433);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 3546));
// Step 42: User-recorded click action
console.log(`Performing recorded action: Click the page number "131" link.`);
await stagehand.act({
  selector: "",
  description: `Click the page number "131" link.`,
  method: "click",
  arguments: [],
});

// Step 43: User-recorded click action
console.log("Performing recorded action: Click on element at ");
await stagehand.act({
  selector: "",
  description: "Click on element at ",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1458));
// Step 44: User-recorded scroll action
console.log("Performing recorded action: Scroll down 12436px");
await page.mouse.move(250, 426);
await page.mouse.wheel(0, 12_436);
await page.waitForTimeout(500);

// Step 45: User-recorded scroll action
console.log("Performing recorded action: Scroll down 12436px");
await page.mouse.move(250, 426);
await page.mouse.wheel(0, 12_436);
await page.waitForTimeout(500);

// Step 46: Perform action
console.log("Performing action: click the Application Type dropdown");
await stagehand.act({
  selector: "xpath=/html[1]/body[1]/table[1]/tbody[1]/tr[2]/td[1]/b[1]",
  description: "click the Application Type dropdown",
  method: "click",
  arguments: [],
});

// Step 47: Navigate back
console.log("Navigating back to previous page");
await page.goBack();
await page.waitForTimeout(5000);

// Step 48: Navigate back
console.log("Navigating back to previous page");
await page.goBack();
await page.waitForTimeout(5000);

// Step 49: Navigate to URL
console.log(
  "Navigating to: https://legacy.azdeq.gov/databases/azpdessearch_drupal.html"
);
await page.goto("https://legacy.azdeq.gov/databases/azpdessearch_drupal.html");

// Step 50: Perform action
console.log("Performing action: click the Application Type dropdown menu");
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/table[1]/tbody[1]/tr[1]/td[2]/table[2]/tbody[1]/tr[1]/td[1]/form[1]/table[1]/tbody[1]/tr[1]/td[2]/div[1]/select[1]",
  description: "click the Application Type dropdown menu",
  method: "click",
  arguments: [],
});

// Step 51: Perform action
console.log(`Performing action: click on "General Construction" option`);
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/table[1]/tbody[1]/tr[1]/td[2]/table[2]/tbody[1]/tr[1]/td[1]/form[1]/table[1]/tbody[1]/tr[1]/td[2]/div[1]/select[1]",
  description: `click on "General Construction" option`,
  method: "click",
  arguments: [],
});

// Step 52: Perform action
console.log("Performing action: click the Facility County dropdown");
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/table[1]/tbody[1]/tr[1]/td[2]/table[2]/tbody[1]/tr[1]/td[1]/form[1]/table[1]/tbody[1]/tr[7]/td[2]/div[1]/select[1]",
  description: "click the Facility County dropdown",
  method: "click",
  arguments: [],
});

// Scroll: Scrolled to top of page
await page.evaluate(() => {
  window.scrollTo(0, 0);
});

// Step 54: Perform action
console.log(
  "Performing action: click directly on the Application Type select field"
);
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/table[1]/tbody[1]/tr[1]/td[2]/table[2]/tbody[1]/tr[1]/td[1]/form[1]/table[1]/tbody[1]/tr[1]/td[2]/div[1]/select[1]",
  description: "click directly on the Application Type select field",
  method: "click",
  arguments: [],
});

// Step 55: Perform action
console.log("Performing action: click on General Construction option");
await stagehand.act({
  selector:
    "xpath=/html[1]/body[1]/div[1]/table[1]/tbody[1]/tr[1]/td[2]/table[2]/tbody[1]/tr[1]/td[1]/form[1]/table[1]/tbody[1]/tr[1]/td[2]/div[1]/select[1]",
  description: "click on General Construction option",
  method: "click",
  arguments: [],
});

// Step 56: User-recorded click action
console.log(
  "Performing recorded action: Click the Application Type dropdown menu."
);
await stagehand.act({
  selector: `//select[@id="App Type"]`,
  description: "Click the Application Type dropdown menu.",
  method: "click",
  arguments: [],
});

// Step 57: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //select[@id="App Type"]`
);
await stagehand.act({
  selector: `//select[@id="App Type"]`,
  description: `Click on element at //select[@id="App Type"]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1685));
// Step 58: User-recorded click action
console.log(
  `Performing recorded action: Click the "General Construction" dropdown option.`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-MvQqX-panel"]/div[2]`,
  description: `Click the "General Construction" dropdown option.`,
  method: "click",
  arguments: [],
});

// Step 59: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //div[@id="bb-customSelect-MvQqX-panel"]/div[2]`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-MvQqX-panel"]/div[2]`,
  description: `Click on element at //div[@id="bb-customSelect-MvQqX-panel"]/div[2]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 932));
// Step 60: User-recorded scroll action
console.log("Performing recorded action: Scroll down 173px");
await page.mouse.move(579, 501);
await page.mouse.wheel(0, 173);
await page.waitForTimeout(500);

// Step 61: User-recorded scroll action
console.log("Performing recorded action: Scroll down 173px");
await page.mouse.move(579, 501);
await page.mouse.wheel(0, 173);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 1017));
// Step 62: User-recorded click action
console.log("Performing recorded action: Click the Start Date input field.");
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[6]/td[2]",
  description: "Click the Start Date input field.",
  method: "click",
  arguments: [],
});

// Step 63: User-recorded click action
console.log(
  "Performing recorded action: Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[6]/td[2]"
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[6]/td[2]",
  description:
    "Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table/tbody/tr[6]/td[2]",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1767));
// Step 64: User-recorded scroll action
console.log("Performing recorded action: Scroll down 185px");
await page.mouse.move(339, 669);
await page.mouse.wheel(0, 185);
await page.waitForTimeout(500);

// Step 65: User-recorded scroll action
console.log("Performing recorded action: Scroll down 185px");
await page.mouse.move(339, 669);
await page.mouse.wheel(0, 185);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 298));
// Step 66: User-recorded scroll action
console.log("Performing recorded action: Scroll up 1px");
await page.mouse.move(339, 669);
await page.mouse.wheel(0, -1);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 6));
// Step 67: User-recorded scroll action
console.log("Performing recorded action: Scroll up 1px");
await page.mouse.move(339, 669);
await page.mouse.wheel(0, -1);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 1295));
// Step 68: User-recorded click action
console.log(
  `Performing recorded action: Click the "Maricopa" option in the Facility County dropdown.`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-BsQkU-panel"]/div[7]`,
  description: `Click the "Maricopa" option in the Facility County dropdown.`,
  method: "click",
  arguments: [],
});

// Step 69: User-recorded click action
console.log(
  `Performing recorded action: Click on element at //div[@id="bb-customSelect-BsQkU-panel"]/div[7]`
);
await stagehand.act({
  selector: `//div[@id="bb-customSelect-BsQkU-panel"]/div[7]`,
  description: `Click on element at //div[@id="bb-customSelect-BsQkU-panel"]/div[7]`,
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 1242));
// Step 70: User-recorded scroll action
console.log("Performing recorded action: Scroll down 55px");
await page.mouse.move(519, 636);
await page.mouse.wheel(0, 55);
await page.waitForTimeout(500);

// Step 71: User-recorded scroll action
console.log("Performing recorded action: Scroll down 55px");
await page.mouse.move(519, 636);
await page.mouse.wheel(0, 55);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 708));
// Step 72: User-recorded click action
console.log(
  `Performing recorded action: Click the "Search" button to execute the database query.`
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  description: `Click the "Search" button to execute the database query.`,
  method: "click",
  arguments: [],
});

// Step 73: User-recorded click action
console.log(
  "Performing recorded action: Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table"
);
await stagehand.act({
  selector:
    "/html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  description:
    "Click on element at /html/body/div/table/tbody/tr/td[2]/table[2]/tbody/tr/td/form/table",
  method: "click",
  arguments: [],
});

await new Promise((resolve) => setTimeout(resolve, 10_000));
// Step 74: User-recorded scroll action
console.log("Performing recorded action: Scroll down 115px");
await page.mouse.move(1078, 621);
await page.mouse.wheel(0, 115);
await page.waitForTimeout(500);

// Step 75: User-recorded scroll action
console.log("Performing recorded action: Scroll down 115px");
await page.mouse.move(1078, 621);
await page.mouse.wheel(0, 115);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 672));
// Step 76: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11883px");
await page.mouse.move(1078, 621);
await page.mouse.wheel(0, 11_883);
await page.waitForTimeout(500);

// Step 77: User-recorded scroll action
console.log("Performing recorded action: Scroll down 11883px");
await page.mouse.move(1078, 621);
await page.mouse.wheel(0, 11_883);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 3091));
// Step 78: User-recorded scroll action
console.log("Performing recorded action: Scroll up 5px");
await page.mouse.move(613, 559);
await page.mouse.wheel(0, -5);
await page.waitForTimeout(500);

// Step 79: User-recorded scroll action
console.log("Performing recorded action: Scroll up 5px");
await page.mouse.move(613, 559);
await page.mouse.wheel(0, -5);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 27));
// Step 80: User-recorded scroll action
console.log("Performing recorded action: Scroll down 282px");
await page.mouse.move(613, 559);
await page.mouse.wheel(0, 282);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 5));
// Step 81: User-recorded scroll action
console.log("Performing recorded action: Scroll down 282px");
await page.mouse.move(613, 559);
await page.mouse.wheel(0, 282);
await page.waitForTimeout(500);

await new Promise((resolve) => setTimeout(resolve, 2144));
// Step 82: User-recorded click action
console.log(`Performing recorded action: Click the page number "131" link.`);
await stagehand.act({
  selector: "",
  description: `Click the page number "131" link.`,
  method: "click",
  arguments: [],
});

// Step 83: User-recorded click action
console.log("Performing recorded action: Click on element at ");
await stagehand.act({
  selector: "",
  description: "Click on element at ",
  method: "click",
  arguments: [],
});

// Step 84: Extract data
console.log(
  "Extracting: Extract all AZPDES permit records visible on this page. For each record, extract the AZPDES Number, Operator Business Name, Project/Site Name, Application Status, and Received Date."
);
const extractedData84 = await stagehand.extract(
  "Extract all AZPDES permit records visible on this page. For each record, extract the AZPDES Number, Operator Business Name, Project/Site Name, Application Status, and Received Date.",
  z.array(
    z.object({
      azpdesNumber: z.string().optional(),
      operatorBusinessName: z.string().optional(),
      projectSiteName: z.string().optional(),
      applicationStatus: z.string().optional(),
      receivedDate: z.string().optional(),
    })
  )
);
console.log("Extracted:", extractedData84);

// Step 85: Perform action
console.log("Performing action: click on page 1 link");
await stagehand.act({
  selector: "xpath=/html[1]/body[1]/font[1]/font[1]/a[1]",
  description: "click on page 1 link",
  method: "click",
  arguments: [],
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Step 88: Extract data
console.log(
  "Extracting: Extract all AZPDES permit records visible on this page. For each record, extract the AZPDES Number, Operator Business Name, Project/Site Name, Application Status, and Received Date."
);
const extractedData88 = await stagehand.extract(
  "Extract all AZPDES permit records visible on this page. For each record, extract the AZPDES Number, Operator Business Name, Project/Site Name, Application Status, and Received Date.",
  z.array(
    z.object({
      azpdesNumber: z.string().optional(),
      operatorBusinessName: z.string().optional(),
      projectSiteName: z.string().optional(),
      applicationStatus: z.string().optional(),
      receivedDate: z.string().optional(),
    })
  )
);
console.log("Extracted:", extractedData88);

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down xl (150%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 150) / 100;
  window.scrollBy(0, scrollAmount);
});

// Step 96: Perform action
console.log("Performing action: click on page 3 link");
await stagehand.act({
  selector: "not-supported",
  description: "click on page 3 link",
  method: "not-supported",
  arguments: [],
});

// Step 97: Perform action
console.log("Performing action: click on the number 3 in the pagination");
await stagehand.act({
  selector: "xpath=/html[1]/body[1]/font[1]/font[2]/a[1]",
  description: "click on the number 3 in the pagination",
  method: "click",
  arguments: [],
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});

// Scroll: Scrolled down lg (100%) of viewport
await page.evaluate(() => {
  const viewportHeight = window.innerHeight;
  const scrollAmount = (viewportHeight * 100) / 100;
  window.scrollBy(0, scrollAmount);
});
