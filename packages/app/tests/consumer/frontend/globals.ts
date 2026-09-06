// GAS固有のglobalはfrontendから参照できてはいけない

// @ts-expect-error SpreadsheetApp must not be available in frontend
SpreadsheetApp.getActiveSpreadsheet();

// @ts-expect-error Utilities must not be available in frontend
Utilities.getUuid();
