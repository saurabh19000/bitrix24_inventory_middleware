const ExcelJS = require('../backend/node_modules/exceljs');
const path = require('path');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(__dirname, 'inventory_sample.xlsx'));
  const ws = wb.worksheets[0];
  console.log('Headers:', ws.getRow(1).values.slice(1).join(' | '));
  console.log('Total data rows:', ws.rowCount - 1);
  console.log('First data row:', JSON.stringify(ws.getRow(2).values.slice(1)));
  console.log('Row 20:', JSON.stringify(ws.getRow(20).values.slice(1)));
  console.log('Last data row:', JSON.stringify(ws.getRow(ws.rowCount).values.slice(1)));
})();