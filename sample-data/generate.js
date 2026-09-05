const ExcelJS = require('../backend/node_modules/exceljs');
const path = require('path');

const categories = [
  ['Office', 'Desk', 1200, '1550.00'],
  ['Office', 'Ergonomic Chair', 850, '2450.00'],
  ['IT', 'Wireless Mouse', 2600, '450.00'],
  ['IT', 'Mechanical Keyboard', 1400, '980.00'],
  ['IT', '24" LED Monitor', 720, '5200.00'],
  ['IT', '10TB NAS Drive', 380, '8990.00'],
  ['Networking', 'Gigabit Router', 900, '3500.00'],
  ['Networking', 'Network Switch 24-Port', 150, '6200.00'],
  ['Accessories', 'USB-C Cable 2m', 5200, '199.00'],
  ['Accessories', 'Laptop Stand', 1100, '750.00'],
  ['Accessories', 'Webcam Full HD', 640, '2800.00'],
  ['Storage', '128GB USB Flash Drive', 3100, '320.00'],
  ['Storage', '1TB SSD', 1200, '6100.00'],
  ['Printing', 'A4 Laser Printer', 95, '12500.00'],
  ['Printing', 'Ink Cartridge Black', 780, '890.00'],
  ['Power', 'UPS 1000VA', 210, '7800.00'],
  ['Power', 'Power Strip 8-Outlet', 1350, '480.00'],
  ['Furniture', 'Office Desk Lamp', 500, '1200.00'],
  ['Furniture', 'Filing Cabinet', 70, '4300.00'],
  ['Software', 'Office Suite License', 200, '4500.00'],
];

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Inventory');

sheet.columns = [
  { header: 'SKU', key: 'sku', width: 14 },
  { header: 'Product Name', key: 'name', width: 32 },
  { header: 'Quantity', key: 'quantity', width: 12 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Barcode', key: 'barcode', width: 18 },
];

sheet.getRow(1).font = { bold: true };
sheet.getRow(1).alignment = { vertical: 'middle' };

let skuCounter = 0;
let barcodeCounter = 10000000000000; // 13-digit EAN-13 style

for (let i = 0; i < 100; i++) {
  const cat = categories[i % categories.length];
  const variant = Math.floor(i / categories.length) + 1;
  const sku = String((i + 10145) * 7).padStart(8, '0');
  const name = `${cat[1]} ${cat[0]} v${variant}`;
  const qty = Math.round(cat[2] + ((i * 17) % 400) - 200);
  const price = (parseFloat(cat[3]) + (i % 13) * 25).toFixed(2);
  const barcode = String(barcodeCounter + i);

  const row = {
    sku,
    name,
    quantity: Math.max(qty, 0),
    price,
    barcode,
  };

  sheet.addRow(row);
}

const outPath = path.resolve(__dirname, 'inventory_sample.xlsx');

workbook.xlsx.writeFile(outPath).then(() => {
  console.log('Written to', outPath);
}).catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});