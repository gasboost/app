const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
const BACKEND_ONLY_MARKER = "__GASBOOST_BACKEND_ONLY__";
console.log(BACKEND_ONLY_MARKER, spreadsheet.getName());
Utilities.getUuid();
