/** Sync control vs. the Promise-returning path that an async .get() would use. */
function doGet(e) {
  if (e.parameter.mode === "async") return asyncHtml_();
  return HtmlService.createHtmlOutput("SYNC_ISSUE_66_OK");
}

async function asyncHtml_() {
  await Promise.resolve();
  return HtmlService.createHtmlOutput("ASYNC_ISSUE_66_OK");
}
